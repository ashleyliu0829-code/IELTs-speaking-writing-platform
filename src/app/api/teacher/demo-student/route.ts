import { requireTeacher } from "@/lib/auth";
import { hasDemoStudent, removeDemoStudent, seedDemoStudent } from "@/lib/demoStudent";

/** The example student: add it (idempotent) or take it away. */
export async function POST() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  try {
    const result = await seedDemoStudent(auth.account.id);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the example student." }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  return Response.json({ present: await hasDemoStudent(auth.account.id) });
}

export async function DELETE() {
  const auth = await requireTeacher();
  if (auth instanceof Response) return auth;
  try {
    return Response.json(await removeDemoStudent(auth.account.id));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove the example student." }, { status: 500 });
  }
}
