-- What the student drew on the reading paper.
--
-- The computer-based test lets a candidate highlight the passage and attach a
-- note to what they highlighted, and both survive leaving the page — so these
-- have to live on the sitting rather than in the browser, or a reload in the
-- middle of an exam would wipe the work.
--
-- Each mark is {id, page, rects, color, note}. The rectangles are stored as
-- fractions of the page rather than pixels, so a highlight drawn on a laptop
-- is still over the same words on a phone, at any zoom.

alter table mock_exams
add column if not exists reading_marks jsonb not null default '[]'::jsonb;

-- Which questions the student flagged to come back to.
alter table mock_exams
add column if not exists reading_flags jsonb not null default '[]'::jsonb;
