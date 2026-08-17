import { NextRequest } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getSupabaseAdmin, homeworkImagesBucket } from "@/lib/supabase";
import { checkQuota, estimateStorageCostMicros, maxImageBytes, recordUsage } from "@/lib/usage";

export async function POST(request: NextRequest) {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  const teacher = auth.account;

  const formData = await request.formData();
  const file = formData.get("image");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing image file." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Please upload an image file." }, { status: 400 });
  }

  if (file.size > maxImageBytes) {
    return Response.json({ error: `图片不能超过 ${maxImageBytes / 1024 / 1024} MB。` }, { status: 413 });
  }

  const quotaError = await checkQuota(teacher.id, "storage_upload", file.size);
  if (quotaError) return Response.json({ error: quotaError }, { status: 429 });

  const supabase = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = imageExtension(file.type);
  const path = `writing-task-1/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(homeworkImagesBucket).upload(path, buffer, {
    contentType: file.type,
    upsert: false
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  await recordUsage({
    teacherId: teacher.id,
    accountId: teacher.id,
    eventType: "storage_upload",
    quantity: file.size,
    unit: "bytes",
    costMicros: estimateStorageCostMicros(file.size),
    metadata: { bucket: homeworkImagesBucket, path }
  });

  const { data } = supabase.storage.from(homeworkImagesBucket).getPublicUrl(path);
  return Response.json({ imageUrl: data.publicUrl, storagePath: path });
}

function imageExtension(mimeType: string) {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}
