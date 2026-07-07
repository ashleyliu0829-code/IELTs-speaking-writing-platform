import { NextRequest } from "next/server";

export function requireTeacher(request: NextRequest) {
  const expected = process.env.TEACHER_ACCESS_TOKEN;
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");

  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
