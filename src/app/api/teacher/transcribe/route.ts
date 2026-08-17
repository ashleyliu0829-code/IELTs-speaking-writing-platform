import { execFile } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { checkQuota, estimateAsrCostMicros, recordUsage } from "@/lib/usage";
import type { Recording } from "@/lib/types";

export const runtime = "nodejs";

const runFile = promisify(execFile);
const tencentHost = "asr.tencentcloudapi.com";
const tencentVersion = "2019-06-14";

const transcribeSchema = z.object({
  recordingId: z.string().uuid()
});

const updateSchema = z.object({
  recordingId: z.string().uuid(),
  correctedTranscript: z.string()
});

type TencentResponse<T> = {
  Response: T & {
    Error?: {
      Code: string;
      Message: string;
    };
    RequestId?: string;
  };
};

type CreateTaskResponse = {
  Data: {
    TaskId: number;
  };
};

type DescribeTaskResponse = {
  Data: {
    Status: number;
    StatusStr: "waiting" | "doing" | "success" | "failed" | string;
    Result?: string;
    ErrorMsg?: string;
    ResultDetail?: Array<{ FinalSentence?: string }>;
  };
};

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { account: teacher, supabase } = auth;
  const storage = getSupabaseAdmin();

  if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
    return Response.json({ error: "Missing TENCENT_SECRET_ID or TENCENT_SECRET_KEY." }, { status: 500 });
  }

  const { recordingId } = transcribeSchema.parse(await request.json());

  const { data: recording, error } = await loadTeacherRecording(supabase, recordingId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!recording) return Response.json({ error: "Recording not found." }, { status: 404 });

  const durationSeconds = (recording as Recording).duration_seconds || 0;
  const quotaError = await checkQuota(teacher.id, "asr_transcribe", durationSeconds);
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  const { data: audio, error: downloadError } = await storage.storage
    .from(recordingsBucket)
    .download((recording as Recording).storage_path);

  if (downloadError) return Response.json({ error: downloadError.message }, { status: 500 });
  if (!audio) return Response.json({ error: "Recording audio could not be downloaded." }, { status: 404 });

  const sourceBuffer = Buffer.from(await audio.arrayBuffer());
  const wavBuffer = await convertToWav(sourceBuffer);

  if (wavBuffer.byteLength > 5 * 1024 * 1024) {
    return Response.json(
      { error: "Converted audio is larger than Tencent ASR's 5 MB local-audio limit. Please shorten this recording." },
      { status: 413 }
    );
  }

  const createTask = await callTencentAsr<CreateTaskResponse>("CreateRecTask", {
    ChannelNum: 1,
    EngineModelType: process.env.TENCENT_ASR_ENGINE_MODEL_TYPE || "16k_en",
    ResTextFormat: 0,
    SourceType: 1,
    Data: wavBuffer.toString("base64")
  });

  const taskId = createTask.Data.TaskId;
  const result = await waitForTencentTask(taskId);
  const transcript = normalizeTencentResult(result).trim();
  const correctedTranscript = ((recording as Recording).corrected_transcript_text || "").trim();
  const patch = correctedTranscript
    ? { transcript_text: transcript }
    : { transcript_text: transcript, corrected_transcript_text: transcript };

  const { data: updated, error: updateError } = await supabase
    .from("recordings")
    .update(patch)
    .eq("id", recordingId)
    .select("*")
    .single();

  if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

  await recordUsage({
    teacherId: teacher.id,
    accountId: teacher.id,
    eventType: "asr_transcribe",
    quantity: durationSeconds,
    unit: "seconds",
    costMicros: estimateAsrCostMicros(durationSeconds),
    metadata: { recordingId }
  });

  return Response.json({ recording: updated });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const { supabase } = auth;

  const { recordingId, correctedTranscript } = updateSchema.parse(await request.json());
  const { data: recording, error: loadError } = await loadTeacherRecording(supabase, recordingId);
  if (loadError) return Response.json({ error: loadError.message }, { status: 500 });
  if (!recording) return Response.json({ error: "Recording not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("recordings")
    .update({ corrected_transcript_text: correctedTranscript })
    .eq("id", recordingId)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ recording: data });
}

// RLS reaches recordings through their submission, so a miss means "not yours".
function loadTeacherRecording(supabase: SupabaseClient, recordingId: string) {
  return supabase.from("recordings").select("*").eq("id", recordingId).maybeSingle();
}

async function convertToWav(input: Buffer) {
  const workdir = join(tmpdir(), `ielts-asr-${randomUUID()}`);
  const inputPath = join(workdir, "input.audio");
  const outputPath = join(workdir, "output.wav");

  await mkdir(workdir, { recursive: true });
  await writeFile(inputPath, input);

  try {
    await runFile("ffmpeg", ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-f", "wav", outputPath]);
    return await readFile(outputPath);
  } catch (error) {
    throw new Error(
      "Audio conversion failed. Please install ffmpeg on the Tencent server with: sudo apt update && sudo apt install -y ffmpeg"
    );
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(outputPath)]);
  }
}

async function waitForTencentTask(taskId: number) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await sleep(attempt < 3 ? 1000 : 2000);
    const status = await callTencentAsr<DescribeTaskResponse>("DescribeTaskStatus", { TaskId: taskId });
    const data = status.Data;

    if (data.StatusStr === "success" || data.Status === 2) return data;
    if (data.StatusStr === "failed" || data.Status === 3) {
      throw new Error(data.ErrorMsg || "Tencent ASR task failed.");
    }
  }

  throw new Error("Tencent ASR is still processing. Please try generating the transcript again in a minute.");
}

function normalizeTencentResult(data: DescribeTaskResponse["Data"]) {
  const sentences = (data.ResultDetail || []).map((item) => item.FinalSentence).filter(Boolean);
  if (sentences.length) return sentences.join("\n");
  return (data.Result || "").replace(/\[[^\]]+\]\s*/g, "").trim();
}

async function callTencentAsr<T>(action: string, payload: Record<string, unknown>) {
  const secretId = process.env.TENCENT_SECRET_ID || "";
  const secretKey = process.env.TENCENT_SECRET_KEY || "";
  const region = process.env.TENCENT_ASR_REGION || "ap-shanghai";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify(payload);
  const authorization = signTencentRequest({
    action,
    body,
    secretId,
    secretKey,
    timestamp
  });

  const response = await fetch(`https://${tencentHost}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json; charset=utf-8",
      Host: tencentHost,
      "X-TC-Action": action,
      "X-TC-Region": region,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": tencentVersion
    },
    body
  });

  const data = (await response.json()) as TencentResponse<T>;
  if (!response.ok || data.Response.Error) {
    const error = data.Response.Error;
    throw new Error(error ? `${error.Code}: ${error.Message}` : `Tencent ASR request failed with ${response.status}.`);
  }

  return data.Response as T;
}

function signTencentRequest({
  action,
  body,
  secretId,
  secretKey,
  timestamp
}: {
  action: string;
  body: string;
  secretId: string;
  secretKey: string;
  timestamp: number;
}) {
  const algorithm = "TC3-HMAC-SHA256";
  const service = "asr";
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${tencentHost}\n`;
  const signedHeaders = "content-type;host";
  const hashedPayload = sha256(body);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
  const credentialScope = `${date}/${service}/tc3_request`;
  const hashedCanonicalRequest = sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, "tc3_request");
  const signature = hmacHex(secretSigning, stringToSign);

  return `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest("hex");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
