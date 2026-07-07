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
- Teacher listens to recordings, generates AI draft transcript and feedback, edits the feedback, then publishes it.
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
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_RECORDINGS_BUCKET=speaking-recordings
TEACHER_ACCESS_TOKEN=choose-a-private-teacher-token
OPENAI_API_KEY=your-openai-key
OPENAI_TRANSCRIBE_MODEL=whisper-1
OPENAI_FEEDBACK_MODEL=gpt-4.1-mini
```

4. In Supabase SQL Editor, run `supabase/schema.sql`.

5. In Supabase Storage, create a private bucket named `speaking-recordings`.

6. Start locally:

```bash
npm run dev
```

Open:

- Teacher dashboard: `http://localhost:3000/teacher`
- Student links are generated after saving an assignment.

## Notes

- The teacher token is a simple MVP access gate. Use a private value in `.env.local`.
- AI feedback is saved as a draft first. Students only see feedback after the teacher publishes it.
- The app uses the Supabase service role key only on the server side. Do not expose it in browser code.
