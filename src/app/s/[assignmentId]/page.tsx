import { notFound } from "next/navigation";
import { StudentAssignment } from "@/components/StudentAssignment";
import { getCurrentAccount } from "@/lib/accountAuth";
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

  // The admin client is what lets a logged-out visitor reach the login screen
  // instead of a 404, so every read below has to be gated by hand — RLS is not
  // watching this page.
  const { data: assignment } = await supabase
    .from("assignments")
    .select("*")
    .eq("id", assignmentId)
    .eq("is_active", true)
    .single<Assignment>();

  if (!assignment) notFound();

  const account = await getCurrentAccount();
  const viewer = account?.role === "student" ? account : null;

  // A student from another teacher's workspace has no business reading this
  // link, even though they could only ever view it: RLS already refuses their
  // submissions. They still get told what happened rather than a bare 404,
  // since a teacher forwarding a link to the wrong group chat is the likely
  // cause and a dead end would just come back as a support question.
  const wrongWorkspace = Boolean(
    viewer && assignment.teacher_id && viewer.teacher_id !== assignment.teacher_id
  );
  if (wrongWorkspace) {
    return <StudentAssignment assignment={withoutContent(assignment)} accessDenied />;
  }

  // Until someone entitled is looking, the questions, the training note and
  // the assigned students' names stay on the server. They used to ship in the
  // page payload to anyone holding the URL, signed in or not.
  if (!viewer) {
    return <StudentAssignment assignment={withoutContent(assignment)} needsSignIn />;
  }

  let feedback: Feedback | null = null;
  if (submissionId) {
    // Published feedback is only this student's to read. Confirming the
    // submission is theirs matches how the rest of the app resolves ownership,
    // by teacher plus student name.
    const { data: submission } = await supabase
      .from("submissions")
      .select("id, teacher_id, student_name")
      .eq("id", submissionId)
      .maybeSingle<{ id: string; teacher_id: string | null; student_name: string }>();

    const ownsSubmission =
      submission &&
      submission.teacher_id === viewer.teacher_id &&
      normalizeName(submission.student_name) === normalizeName(viewer.display_name);

    if (ownsSubmission) {
      const { data } = await supabase
        .from("feedback")
        .select("*")
        .eq("submission_id", submissionId)
        .not("published_at", "is", null)
        .single<Feedback>();
      feedback = data || null;
    }
  }

  return <StudentAssignment assignment={assignment} publishedFeedback={feedback} />;
}

/** Everything a signed-out visitor must not see, stripped but still typed. */
function withoutContent(assignment: Assignment): Assignment {
  return {
    ...assignment,
    title: "",
    deadline_text: "",
    due_date: null,
    p1_questions: [],
    p2_prompt: "",
    p3_questions: [],
    writing_tasks: [],
    training_note: "",
    assigned_students: []
  };
}

function normalizeName(value: string) {
  return (value || "").trim().toLowerCase();
}

function isUuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
