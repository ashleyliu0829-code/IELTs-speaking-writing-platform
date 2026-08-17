import { notFound } from "next/navigation";
import { StudentAssignment } from "@/components/StudentAssignment";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { Assignment, Feedback } from "@/lib/types";

export default async function StudentPage({
  params,
  searchParams
}: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ submissionId?: string }>;
}) {
  const { assignmentId } = await params;
  const { submissionId: rawSubmissionId } = await searchParams;
  const submissionId = isUuid(rawSubmissionId) ? rawSubmissionId : "";
  const supabase = getSupabaseAdmin();

  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .single<Assignment>();

  if (!assignment) notFound();

  let feedback: Feedback | null = null;
  if (submissionId) {
    const { data } = await supabase
      .from("feedback")
      .select("*")
      .eq("submission_id", submissionId)
      .not("published_at", "is", null)
      .single<Feedback>();
    feedback = data || null;
  }

  return <StudentAssignment assignment={assignment} publishedFeedback={feedback} />;
}

function isUuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
