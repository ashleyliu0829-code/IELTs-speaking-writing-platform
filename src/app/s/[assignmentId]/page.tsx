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
  const { submissionId } = await searchParams;
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
