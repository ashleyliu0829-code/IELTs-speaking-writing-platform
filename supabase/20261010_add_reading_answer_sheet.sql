-- Reading as three papers and an answer sheet, rather than one PDF.
--
-- The sitting already took a reading PDF, but nothing could mark it: the
-- platform saw a file and the teacher saw a score only if the student told
-- them. So the paper is now uploaded a part at a time, the teacher types the
-- answer key in when they set the exam, and the student fills in numbered
-- boxes beside the PDF — which the platform can mark on its own, the way it
-- already marks the listening.
--
-- `reading_papers` is one entry per part: [{part, name, path, count}]. The
-- count is how many questions that part carries, so the boxes can be numbered
-- straight through 1..40 without the teacher saying where each part starts.
--
-- `reading_key` is the answers in question order, as the teacher typed them —
-- "TRUE", "20/twenty", "(the) police station". Marking normalises them; the
-- raw text is kept so the teacher sees their own wording when they go back,
-- and so a mistyped key can be corrected without re-entering the rest.
--
-- The key never reaches the student's browser. Marking happens on the server
-- and only the verdict comes back, because an answer sheet on screen beside
-- the key would be no exam at all.

alter table mock_exams
add column if not exists reading_papers jsonb not null default '[]'::jsonb;

alter table mock_exams
add column if not exists reading_key jsonb not null default '[]'::jsonb;

-- The clock, which starts when the student opens the first paper rather than
-- when the exam is set: a sitting they open on Tuesday and sit on Thursday
-- must not already be over. `reading_started_at` is written once, by the
-- server, and never reset — a reload, a second tab or a closed laptop cannot
-- hand time back. Sixty-five minutes rather than sixty because the papers
-- have to be downloaded and the answers typed.
alter table mock_exams
add column if not exists reading_started_at timestamptz;

alter table mock_exams
add column if not exists reading_minutes integer not null default 65
check (reading_minutes >= 0 and reading_minutes <= 240);

-- What the student has typed so far. Saved as they go, so that when the
-- clock runs out there is something to hand in even if the page is gone —
-- the same lesson the writing timer taught: an exam that depends on the
-- student remembering to press a button loses work.
alter table mock_exams
add column if not exists reading_draft jsonb not null default '[]'::jsonb;

-- The student's own reading answers live in mock_exam_results with
-- part = 'reading', beside the listening row that is already there. The
-- unique (exam_id, part) constraint from the original migration gives one row
-- per part on its own, so a retake replaces rather than piles up.
