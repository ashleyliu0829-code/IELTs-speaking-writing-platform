import { getSupabaseAdmin } from "@/lib/supabase";
import { defaultWritingScoreDetails } from "@/lib/feedback";
import { allDemoStudentNames, demoPeerNames, demoTag, seedDemoStudent } from "@/lib/demoStudent";
import { suggestPhases } from "@/lib/studyPlan";

/**
 * The workspace a visitor gets when they open a trial without an activation
 * code: the example student the seeder already builds, plus two more, so the
 * roster looks like a small real one rather than a single row.
 *
 * The three are deliberately at different stages, because that is what the
 * pages are for: one with a speaking homework waiting to be marked (the rich
 * one, with audio and transcripts), one mid-course with two marked essays so
 * the progress curve has a trend and the study plan is under way, and one
 * just added with nothing yet. Everything carries the 示例 tag and is removed
 * by the same cleanup as the single example student.
 */

const essayOne = `Some people believe that university students should be required to attend classes, while others think attendance should be optional. In my opinion, although compulsory attendance has some benefits, students should be allowed to decide by themselves.

On the one hand, requiring students to attend class can make sure that they follow the progress of the course. Many first year students do not have good self-discipline, so without a rule they may stay in the dormitory and play games all day. Besides, discussion in class is useful, because students can hear different opinions and the teacher can correct their mistake immediately.

On the other hand, university students are adults and they should learn how to manage their own time. Some students study better by reading books in the library, and forcing them to sit in a big lecture hall is waste of time. Moreover, some students have part time job or internship, which is also important for their future career.

In conclusion, I think universities should not make attendance compulsory, but they should record the attendance and remind the students who is often absent.`;

const essayTwo = `The chart shows the percentage of households in three different countries that owned a computer between 1995 and 2015.

Overall, computer ownership increased significantly in all three countries over the period, and Country A remained the highest throughout. The most dramatic growth happened in Country C, which started from a very low level.

In 1995, about 20 per cent of households in Country A owned a computer, compared with only 5 per cent in Country C. Over the following decade, the figure for Country A rose steadily and reached approximately 60 per cent by 2005, while Country B followed a similar pattern at a slightly lower level.

Between 2005 and 2015, Country C experienced the sharpest increase, climbing from around 15 per cent to just over 50 per cent. By the end of the period, the gap between the three countries had narrowed considerably, with Country A at roughly 80 per cent and Country B close behind at 70 per cent.`;

type PeerSpec = {
  name: string;
  /** Days before today the student first appeared. */
  seenDaysAgo: number;
  examInDays: number | null;
  coursePlan: string;
  essays: { title: string; prompt: string; text: string; score: number; comment: string; daysAgo: number }[];
  lessons: { daysAgo: number; status: string; topic: string; material: string; sections: string[]; completed: boolean }[];
};

const peers: PeerSpec[] = [
  {
    name: demoPeerNames[0],
    seenDaysAgo: 96,
    examInDays: 24,
    coursePlan: "写作",
    essays: [
      {
        title: "Compulsory attendance",
        prompt:
          "Some people think university students should be required to attend classes. Others believe going to classes should be optional. Discuss both views and give your own opinion. Write at least 250 words.",
        text: essayOne,
        score: 6.0,
        comment:
          "双边讨论结构完整，两边各有两个理由，立场在结尾明确。丢分主要在语法：单复数（their mistake / part time job）、缺冠词（is waste of time）、定语从句主谓一致（the students who is often absent）。下一篇重点：写完后专门检查可数名词的单复数。",
        daysAgo: 31
      },
      {
        title: "Computer ownership chart",
        prompt:
          "The chart below shows the percentage of households with a computer in three countries between 1995 and 2015. Summarise the information by selecting and reporting the main features. Write at least 150 words.",
        text: essayTwo,
        score: 6.5,
        comment:
          "比上一篇进步明显：overview 单独成段并点出了最大趋势，数据描述用了 rose steadily / climbing from…to 等变化动词，语法错误显著减少。再上一档需要更多的比较句式（compared with / whereas）和更精确的数据近似词。",
        daysAgo: 6
      }
    ],
    lessons: [
      { daysAgo: 12, status: "confirmed", topic: "Task 2 双边讨论结构：让步段怎么写\n作业回顾：单复数与冠词", material: "Writing 3", sections: ["Writing"], completed: true },
      { daysAgo: 5, status: "confirmed", topic: "Task 1 图表作文：overview 的写法与数据分组", material: "Writing 4", sections: ["Writing"], completed: true },
      { daysAgo: -3, status: "confirmed", topic: "", material: "", sections: ["Writing"], completed: false }
    ]
  },
  {
    name: demoPeerNames[1],
    seenDaysAgo: 3,
    examInDays: null,
    coursePlan: "口语",
    essays: [],
    lessons: [{ daysAgo: -1, status: "pending", topic: "", material: "", sections: ["Speaking"], completed: false }]
  }
];

/** The trial workspace: the example student plus the two peers above. */
export async function seedDemoWorkspace(teacherId: string) {
  await seedDemoStudent(teacherId);
  const supabase = getSupabaseAdmin();
  const now = Date.now();
  const at = (days: number, hour = 20) => {
    const date = new Date(now - days * 86400000);
    date.setUTCMinutes(0, 0, 0);
    date.setUTCHours(hour - 8); // Beijing time
    return date;
  };

  for (const peer of peers) {
    const examDate = peer.examInDays == null ? null : new Date(now + peer.examInDays * 86400000).toISOString().slice(0, 10);
    const { data: student, error: studentError } = await supabase
      .from("students")
      .insert({
        teacher_id: teacherId,
        name: peer.name,
        normalized_name: peer.name.toLowerCase(),
        first_seen_at: at(peer.seenDaysAgo).toISOString(),
        course_plan: peer.coursePlan,
        exam_date: examDate,
        exam_date_confirmed: Boolean(examDate),
        study_plan: examDate ? suggestPhases(at(peer.seenDaysAgo), examDate) : [],
        is_active: true
      })
      .select("id")
      .single();
    if (studentError) throw studentError;

    for (const essay of peer.essays) {
      const task = {
        key: "writing_task_2",
        label: "Writing Task 2",
        title: essay.title,
        prompt: essay.prompt,
        word_limit: "250+ words",
        task2_type: "双边讨论",
        task2_topic: "教育",
        image_urls: []
      };
      const title = `${demoTag}写作 · ${essay.title}`;
      const { data: assignment, error: assignmentError } = await supabase
        .from("assignments")
        .insert({
          teacher_id: teacherId,
          assignment_type: "writing",
          title,
          deadline_text: "",
          due_date: at(essay.daysAgo + 2).toISOString().slice(0, 10),
          p1_questions: [],
          p2_prompt: "",
          p3_questions: [],
          writing_tasks: [task],
          training_note: "限时 40 分钟，写完先自己检查一遍再提交。",
          assigned_students: [peer.name],
          is_active: true,
          created_at: at(essay.daysAgo + 4).toISOString()
        })
        .select("id")
        .single();
      if (assignmentError) throw assignmentError;

      const { data: submission, error: submissionError } = await supabase
        .from("submissions")
        .insert({
          assignment_id: assignment.id,
          teacher_id: teacherId,
          student_name: peer.name,
          submission_title: title,
          submission_status: "reviewed",
          submitted_at: at(essay.daysAgo).toISOString()
        })
        .select("id")
        .single();
      if (submissionError) throw submissionError;

      const { error: responseError } = await supabase.from("writing_responses").insert({
        submission_id: submission.id,
        task_key: task.key,
        task_label: task.label,
        task_title: task.title,
        task_prompt: task.prompt,
        response_text: essay.text,
        teacher_revision_text: ""
      });
      if (responseError) throw responseError;

      // The four criteria sit around the overall score, so the score breakdown
      // on the student's page is not four identical numbers.
      const spread = [0, 0.5, -0.5, 0];
      const details = defaultWritingScoreDetails().map((detail, index) => ({
        ...detail,
        score: Math.max(4, Math.min(9, essay.score + spread[index % spread.length])),
        comment: ""
      }));
      const { error: feedbackError } = await supabase.from("feedback").insert({
        submission_id: submission.id,
        overall_score: essay.score,
        overall_comment: essay.comment,
        transcript: "",
        details,
        published_at: at(essay.daysAgo - 1).toISOString()
      });
      if (feedbackError) throw feedbackError;
    }

    for (const lesson of peer.lessons) {
      const start = at(lesson.daysAgo);
      const end = new Date(start.getTime() + 90 * 60000);
      const { data: slot, error: slotError } = await supabase
        .from("lesson_slots")
        .insert({ teacher_id: teacherId, lesson_type: "regular", start_at: start.toISOString(), end_at: end.toISOString(), timezone: "Asia/Shanghai", note: "" })
        .select("id")
        .single();
      if (slotError) throw slotError;
      const { error: bookingError } = await supabase.from("lesson_bookings").insert({
        slot_id: slot.id,
        student_account_id: null,
        student_name: peer.name,
        course_minutes: 60,
        reserved_minutes: 90,
        booking_type: "regular",
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        status: lesson.status,
        student_timezone: "Asia/Shanghai",
        lesson_topic: lesson.topic,
        lesson_material: lesson.material,
        lesson_sections: lesson.sections,
        lesson_note: "",
        completed_at: lesson.completed ? start.toISOString() : null
      });
      if (bookingError) throw bookingError;
    }

    void student;
  }

  return { seeded: true, students: allDemoStudentNames.length };
}
