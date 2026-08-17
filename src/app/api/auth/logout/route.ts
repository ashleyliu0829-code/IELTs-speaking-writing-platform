import { cookies } from "next/headers";
import { clearCurrentSession, sessionCookieName } from "@/lib/accountAuth";

export async function POST() {
  await clearCurrentSession();
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookieName);
  return Response.json({ ok: true });
}
