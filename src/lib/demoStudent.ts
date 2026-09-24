import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSupabaseAdmin, recordingsBucket } from "@/lib/supabase";
import { currentP1Bank, currentP2P3Bank } from "@/lib/questionBank";
import { stringifyReviewComment } from "@/lib/reviewComments";
import { phasePresetsEn, suggestPhases } from "@/lib/studyPlan";

/**
 * The example student every new teacher starts with.
 *
 * A fresh workspace is fifteen empty pages, and eleven of the first seventeen
 * teachers never came back after their first login. So a new teacher finds
 * one student already there, with a speaking homework waiting to be marked
 * (three recordings, transcripts in place), a writing homework already marked
 * so the finished result can be seen, a lesson on the progress table, one
 * coming up, and a daily task. Everything is labelled 示例 and can be removed
 * in one go.
 *
 * Seeding is idempotent: a teacher who already has the student gets nothing
 * added. The audio is spoken by a TTS voice, with the kind of slips a 6.0
 * student makes, so there is something real to correct.
 */

export const demoStudentName = "Jack";
export const demoTag = "【示例】";
/** The extra students a trial workspace gets on top of the one above. */
export const demoPeerNames = ["Lucy", "Peter"];
/** What the names were before they were English; still seeded in older workspaces. */
const retiredDemoNames = ["示例学生", "示例学生·小周", "示例学生·小陈"];
export const allDemoStudentNames = [demoStudentName, ...demoPeerNames, ...retiredDemoNames];

const p1Transcript =
  "Yes, I'm a student. I'm study business management in my third year at university. I choose this major because my parents think it is useful, and also I'm interested in how company works. In the future, I hope I can work in a international company.";
const p2Transcript =
  "I'd like to talk about a sportsperson I really admire, which is Su Bingtian, the Chinese sprinter. I first know about him when I watched the Tokyo Olympics on TV with my family. He is not very tall compare with other sprinters, but he still run into the final of the 100 metres, which no Asian athlete have done before. What I know about him is that he changed his running technique when he was almost thirty, which is very risky, because most athletes retire in that age. In real life, people say he is very humble and he always thank his coach and his team. I admire him because he show that with hard work and the right method, you can break the limit that everyone think is impossible. He inspire me a lot when I feel tired of studying.";
const p3Transcript =
  "I think physical education is very important in school, because students sit in the classroom for a long time every day and they need to move their body. Also, doing sports can teach children about teamwork and how to deal with losing. In my country, there is a lot of pressure on academic results, so sometimes PE class is cancelled, which I think is not good for the students health.";

const essay = `Nowadays, more and more people choose to work from home instead of going to the office. Some people think this is a positive development, while others believe it has more disadvantages. In my opinion, working from home has both benefits and drawbacks, but the advantages are more.

Firstly, working at home can save a lot of time. People do not need to spend one or two hours on the road every day, so they can use this time to rest or study. For example, my cousin works for a IT company and he said that he feel less tired since he start to work at home. Secondly, it is more flexible. Workers can arrange their own time and take care of their family at the same time.

However, there are also some problems. The most important one is that people may feel lonely because they can not communicate with their colleagues face to face. Besides, some people can not concentrate at home because there are many distractions, such as television and children.

In conclusion, although working from home has some disadvantages, I believe it is a positive trend because it saves time and gives people more freedom. Companies should allow employees to choose the way which is suitable for them.`;

const essayRevision = essay
  .replace("the advantages are more", "the advantages outweigh the drawbacks")
  .replace("a IT company", "an IT company")
  .replace("he feel less tired since he start to work at home", "he has felt less tired since he started working from home")
  .replace("can not communicate", "cannot communicate")
  .replace("can not concentrate", "cannot concentrate")
  .replace("the way which is suitable for them", "whichever arrangement suits them");

export async function hasDemoStudent(teacherId: string) {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.from("students").select("id").eq("teacher_id", teacherId).in("name", allDemoStudentNames).limit(1);
  return Boolean(data?.length);
}

export async function seedDemoStudent(teacherId: string) {
  if (await hasDemoStudent(teacherId)) return { seeded: false };
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const daysAgo = (days: number, hour = 20) => {
    const date = new Date(now - days * 86400000);
    date.setUTCMinutes(0, 0, 0);
    date.setUTCHours(hour - 8); // 20:00 Beijing time
    return date;
  };

  // The student.
  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      teacher_id: teacherId,
      name: demoStudentName,
      normalized_name: demoStudentName.toLowerCase(),
      first_seen_at: daysAgo(14).toISOString(),
      course_plan: "全科",
      exam_date: new Date(now + 60 * 86400000).toISOString().slice(0, 10),
      exam_date_confirmed: false,
      study_plan: suggestPhases(new Date(now - 14 * 86400000), new Date(now + 60 * 86400000).toISOString().slice(0, 10), phasePresetsEn),
      is_active: true
    })
    .select("id")
    .single();
  if (studentError) throw studentError;

  // Speaking homework from the current bank, submitted and waiting to be marked.
  const p1 = currentP1Bank[0];
  const p2 = currentP2P3Bank[0];
  const p1Questions = p1.questions.slice(0, 3);
  const p3Questions = p2.p3Questions.slice(0, 2);
  const { data: speaking, error: speakingError } = await supabase
    .from("assignments")
    .insert({
      teacher_id: teacherId,
      assignment_type: "speaking",
      title: `${demoTag}口语 · ${p1.topic} / ${p2.topic}`,
      deadline_text: "",
      due_date: new Date(now + 3 * 86400000).toISOString().slice(0, 10),
      p1_questions: p1Questions,
      p2_prompt: p2.p2Prompt,
      p3_questions: p3Questions,
      writing_tasks: [],
      training_note: "先浏览全部题目，想好自己的例子，再逐题录音。这是一份示例作业，可以随意批改。",
      assigned_students: [demoStudentName],
      is_active: true,
      created_at: daysAgo(4).toISOString()
    })
    .select("id")
    .single();
  if (speakingError) throw speakingError;

  const { data: speakingSubmission, error: subError } = await supabase
    .from("submissions")
    .insert({
      assignment_id: speaking.id,
      teacher_id: teacherId,
      student_name: demoStudentName,
      submission_title: `${demoTag}口语 · ${p1.topic} / ${p2.topic}`,
      submission_status: "submitted",
      submitted_at: daysAgo(2).toISOString()
    })
    .select("id")
    .single();
  if (subError) throw subError;

  const clips: Array<{ key: string; label: string; question: string; file: string; transcript: string; seconds: number }> = [
    { key: "p1q1", label: "Part 1 Question 1", question: p1Questions[0], file: "p1.wav", transcript: p1Transcript, seconds: 19 },
    { key: "p2", label: "Part 2 Cue Card", question: p2.p2Prompt, file: "p2.wav", transcript: p2Transcript, seconds: 52 },
    { key: "p3q1", label: "Part 3 Question 1", question: p3Questions[0], file: "p3.wav", transcript: p3Transcript, seconds: 26 }
  ];
  for (const clip of clips) {
    const buffer = await readFile(path.join(process.cwd(), "public", "demo", clip.file));
    const storagePath = `${speaking.id}/${speakingSubmission.id}/${clip.key}.wav`;
    const { error: uploadError } = await supabase.storage.from(recordingsBucket).upload(storagePath, buffer, { contentType: "audio/wav", upsert: true });
    if (uploadError) throw uploadError;
    const { error: recordingError } = await supabase.from("recordings").insert({
      submission_id: speakingSubmission.id,
      question_key: clip.key,
      question_label: clip.label,
      question_text: clip.question,
      transcript_text: clip.transcript,
      corrected_transcript_text: "",
      storage_path: storagePath,
      duration_seconds: clip.seconds
    });
    if (recordingError) throw recordingError;
  }

  // Writing homework, already marked, so the finished result is visible.
  const task = {
    key: "writing_task_2",
    label: "Writing Task 2",
    title: "Writing Task 2",
    prompt:
      "Nowadays many people choose to work from home rather than in an office. Do you think this is a positive or negative development? Give reasons for your answer and include any relevant examples from your own knowledge or experience. Write at least 250 words.",
    word_limit: "250+ words",
    task2_type: "单边观点",
    task2_topic: "工作",
    image_urls: []
  };
  const { data: writing, error: writingError } = await supabase
    .from("assignments")
    .insert({
      teacher_id: teacherId,
      assignment_type: "writing",
      title: `${demoTag}写作 · Working from home`,
      deadline_text: "",
      due_date: daysAgo(5).toISOString().slice(0, 10),
      p1_questions: [],
      p2_prompt: "",
      p3_questions: [],
      writing_tasks: [task],
      training_note: "先列提纲再动笔。这是一份示例作业，反馈已经发布，可以看看学生会收到什么。",
      assigned_students: [demoStudentName],
      is_active: true,
      created_at: daysAgo(9).toISOString()
    })
    .select("id")
    .single();
  if (writingError) throw writingError;

  const { data: writingSubmission, error: wsError } = await supabase
    .from("submissions")
    .insert({
      assignment_id: writing.id,
      teacher_id: teacherId,
      student_name: demoStudentName,
      submission_title: `${demoTag}写作 · Working from home`,
      submission_status: "reviewed",
      submitted_at: daysAgo(6).toISOString()
    })
    .select("id")
    .single();
  if (wsError) throw wsError;

  const { error: responseError } = await supabase.from("writing_responses").insert({
    submission_id: writingSubmission.id,
    task_key: task.key,
    task_label: task.label,
    task_title: task.title,
    task_prompt: task.prompt,
    response_text: essay,
    teacher_revision_text: essayRevision
  });
  if (responseError) throw responseError;

  const { error: feedbackError } = await supabase.from("feedback").insert({
    submission_id: writingSubmission.id,
    overall_score: 6.0,
    overall_comment:
      "结构完整，观点清楚，四段式很标准。主要丢分在语法准确性：主谓一致（he feel / he start）、冠词（a IT company）、以及 can not 应写作 cannot。词汇上 \"the advantages are more\" 这类中式表达可以换成 outweigh。下一篇重点：写完后花 3 分钟专门检查动词时态和第三人称单数。",
    transcript: "",
    details: [
      {
        part: "writing_task_2",
        label: "Writing Task 2",
        question: task.prompt,
        score: 6.0,
        comment: stringifyReviewComment({
          general: "任务回应完整，两段主体各有一个例子。语法错误集中在时态和单复数，见批注。",
          inlineComments: [
            { id: "demo-1", quote: "the advantages are more", comment: "中式表达。改成 the advantages outweigh the drawbacks。" },
            { id: "demo-2", quote: "a IT company", comment: "IT 以元音音素开头，用 an。" },
            { id: "demo-3", quote: "he feel less tired since he start to work at home", comment: "since 引导的句子用现在完成时：he has felt less tired since he started working from home。" }
          ]
        })
      }
    ],
    published_at: daysAgo(5).toISOString()
  });
  if (feedbackError) throw feedbackError;

  // One lesson taught (on the progress table), one coming up (pending).
  const lessons = [
    { start: daysAgo(3), status: "confirmed", topic: "口语 Part 1 答题结构：直接回答 + 一个原因 + 一个例子\n作业回顾：上周写作 Task 2 的语法点", material: "Speaking 1", sections: ["Speaking"], note: "完成【示例】口语作业", completed: true },
    { start: daysAgo(-2), status: "pending", topic: "", material: "", sections: ["Writing"], note: "", completed: false }
  ];
  for (const lesson of lessons) {
    const end = new Date(lesson.start.getTime() + 90 * 60000);
    const { data: slot, error: slotError } = await supabase
      .from("lesson_slots")
      .insert({ teacher_id: teacherId, lesson_type: "regular", start_at: lesson.start.toISOString(), end_at: end.toISOString(), timezone: "Asia/Shanghai", note: "" })
      .select("id")
      .single();
    if (slotError) throw slotError;
    const { error: bookingError } = await supabase.from("lesson_bookings").insert({
      slot_id: slot.id,
      student_account_id: null,
      student_name: demoStudentName,
      course_minutes: 60,
      reserved_minutes: 90,
      booking_type: "regular",
      start_at: lesson.start.toISOString(),
      end_at: end.toISOString(),
      status: lesson.status,
      student_timezone: "Asia/Shanghai",
      lesson_topic: lesson.topic,
      lesson_material: lesson.material,
      lesson_sections: lesson.sections,
      lesson_note: lesson.note,
      completed_at: lesson.completed ? lesson.start.toISOString() : null
    });
    if (bookingError) throw bookingError;
  }

  // A daily task running this week.
  const { error: taskError } = await supabase.from("daily_tasks").insert({
    teacher_id: teacherId,
    title: `${demoTag}每天背 30 个雅思核心词`,
    description: "用单词书或 App 都可以，背完在这里打卡。",
    task_type: "词汇",
    assigned_students: [demoStudentName],
    start_date: daysAgo(2).toISOString().slice(0, 10),
    end_date: daysAgo(-5).toISOString().slice(0, 10),
    is_active: true
  });
  if (taskError) throw taskError;

  return { seeded: true, studentId: student.id };
}

/** Everything the seed created, gone: the student, both homeworks (their
 *  submissions cascade), the two lessons and the daily task. */
export async function removeDemoStudent(teacherId: string) {
  const supabase = getSupabaseAdmin();
  const { data: assignments } = await supabase.from("assignments").select("id").eq("teacher_id", teacherId).like("title", `${demoTag}%`);
  for (const assignment of assignments || []) {
    const { data: subs } = await supabase.from("submissions").select("id").eq("assignment_id", assignment.id);
    for (const sub of subs || []) {
      const { data: recs } = await supabase.from("recordings").select("storage_path").eq("submission_id", sub.id);
      const paths = (recs || []).map((rec) => rec.storage_path).filter(Boolean);
      if (paths.length) await supabase.storage.from(recordingsBucket).remove(paths);
    }
    await supabase.from("assignments").delete().eq("id", assignment.id);
  }
  const { data: bookings } = await supabase
    .from("lesson_bookings")
    .select("id, slot_id, lesson_slots!inner(teacher_id)")
    .eq("lesson_slots.teacher_id", teacherId)
    .in("student_name", allDemoStudentNames);
  for (const booking of bookings || []) {
    await supabase.from("lesson_bookings").delete().eq("id", booking.id);
    await supabase.from("lesson_slots").delete().eq("id", booking.slot_id);
  }
  await supabase.from("daily_tasks").delete().eq("teacher_id", teacherId).like("title", `${demoTag}%`);
  await supabase.from("students").delete().eq("teacher_id", teacherId).in("name", allDemoStudentNames);
  return { removed: true };
}
