import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { upsertStudentProfile } from "@/lib/students";

const payloadSchema = z.object({
  studentName: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const auth = await requireStudent();
  if (auth instanceof Response) return auth;
  const { account } = auth;

  const payload = payloadSchema.parse(await request.json());
  const student = await upsertStudentProfile(payload.studentName, {
    accountId: account.id,
    phone: account.phone,
    teacherId: account.teacher_id
  });
  return Response.json({ student });
}
