import { ReadingExam } from "@/components/ReadingExam";

/**
 * The reading paper on its own page.
 *
 * It takes the whole window because that is what it is: a timed exam, not a
 * panel inside a dashboard. Everything it needs it fetches for itself, so the
 * student can open it directly, come back to it, or reload mid-paper without
 * going through the mock exam list again.
 */

export const metadata = { title: "Reading" };

export default async function ReadingExamPage({ params }: { params: Promise<{ examId: string }> }) {
  const { examId } = await params;
  return <ReadingExam examId={examId} />;
}
