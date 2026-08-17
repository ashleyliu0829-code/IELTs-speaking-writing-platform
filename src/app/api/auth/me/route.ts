import { getCurrentAccount } from "@/lib/accountAuth";

export async function GET() {
  const account = await getCurrentAccount();
  return Response.json({ account });
}
