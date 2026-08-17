# IELTS Speaking Homework Platform

Formal web app for IELTS speaking homework.

## What it does

- Teacher creates and edits a speaking assignment.
- Teacher sets the deadline and training note.
- Student opens a shared link and enters their own name.
- Student records Part 1 and Part 3 question by question, and Part 2 as one cue-card answer.
- Student can delete and re-record before submitting.
- Recordings upload to Supabase Storage.
- Submissions are saved in Supabase Database.
- Teacher listens to recordings, edits comments and scores, optionally generates AI draft scores, then publishes feedback.
- Student refreshes the same submission link to view published feedback.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local`.

3. Fill:

```bash
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
SUPABASE_RECORDINGS_BUCKET=speaking-recordings
TEACHER_ACCESS_TOKEN=choose-a-private-teacher-token
OPENAI_API_KEY=your-openai-key
OPENAI_FEEDBACK_MODEL=gpt-4.1-mini
TENCENT_SECRET_ID=your-tencent-secret-id
TENCENT_SECRET_KEY=your-tencent-secret-key
TENCENT_ASR_REGION=ap-shanghai
TENCENT_ASR_ENGINE_MODEL_TYPE=16k_en
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_JWT_SECRET` are both under Settings
-> API in the Supabase dashboard. Without them every tenant-scoped query fails,
because that path authenticates with a signed JWT rather than the service role.

4. In Supabase SQL Editor, run `supabase/schema.sql`, then the migrations in
`supabase/` in filename order. On an existing database the backfills must run
before the RLS migration, and before this code is deployed: a row with a null
`teacher_id` matches no policy and becomes invisible.

5. In Supabase Storage, create a private bucket named `speaking-recordings`.

6. Start locally:

```bash
npm run dev
```

Open:

- Teacher dashboard: `http://localhost:3000/teacher`
- Student links are generated after saving an assignment.

## Data access

Each teacher is a workspace. Every tenant table carries a `teacher_id`, and
Row Level Security decides what a request can reach. There are two clients, and
picking the wrong one is the way tenant data leaks:

- `getSupabaseForAccount(account)` signs a short-lived JWT carrying the account's
  role and workspace, and runs as the `authenticated` Postgres role. **All
  tenant reads and writes go through this.** A forgotten `.eq("teacher_id")` no
  longer leaks another teacher's rows, because the policies still apply.
- `getSupabaseAdmin()` uses the service role and **bypasses RLS entirely**. It is
  only for work with no single tenant to scope to: registration, session lookup,
  storage signing and uploads, and usage metering.

Route handlers get the scoped client from `requireTeacher()` / `requireStaff()` /
`requireStudent()` in `src/lib/auth.ts`, which return either a `Response` to
return as-is or `{ account, supabase }`.

## Usage metering

Tencent ASR seconds, OpenAI tokens and uploaded bytes are recorded per teacher in
`usage_events`, with monthly caps in `teacher_usage_limits` (trial defaults apply
when a teacher has no row). Over-quota calls return 429. `GET /api/teacher/usage`
returns the current month's totals and an estimated spend.

Metering never blocks the operation it measures: a failed write is logged, not
thrown.

## Notes

- The teacher token is a simple MVP access gate. Use a private value in `.env.local`.
- AI feedback is saved as a draft first. Students only see feedback after the teacher publishes it.
- Teacher-side transcripts are generated per recording with Tencent Cloud ASR. Teacher edits are saved separately so students can see tracked changes after feedback is published.
- The Tencent server needs `ffmpeg` installed so browser audio can be converted before ASR. This route also polls Tencent for up to ~90s, so it needs a long-running Node host rather than a short-timeout serverless platform.
- The service role key and the JWT secret are server-side only. Do not expose either in browser code.
- `/s/[assignmentId]` is the legacy anonymous share link. It predates accounts and cannot satisfy RLS, so it is effectively read-only now that every student signs in.
