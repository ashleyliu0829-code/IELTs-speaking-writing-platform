-- The reading paper is one file again.
--
-- 20261010 split it into P1/P2/P3 because that is how the parts are handed
-- out, but a sitting is set from a single export in practice, and three
-- uploads for one paper is three chances to upload the wrong thing. The
-- paper goes back to reading_name/reading_path, which never went away, and
-- the answer sheet simply runs 1..40 — the key's own length says how many
-- questions there are, so nothing has to record where a part ends.
--
-- Optional: the column is unused either way. Dropping it only keeps the
-- table honest about what the app reads.

alter table mock_exams
drop column if exists reading_papers;
