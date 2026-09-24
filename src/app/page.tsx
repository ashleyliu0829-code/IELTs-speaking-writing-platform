"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type PointerEvent } from "react";
import { useLanguage } from "@/lib/i18n";

export default function Home() {
  const { t } = useLanguage();

  return (
    <main className="landing">
      <div className="landing-columns">
        <div className="landing-pitch">
          <h1 className="landing-title">
            {t("专为雅思老师打造的", "Built for IELTS teachers:")}
            <br />
            {t("口语作业批改一体化平台", "speaking homework, marked end to end")}
          </h1>

          <p className="landing-lede">
            {t(
              "布置作业、学生录音、自动转写、逐句批改、发布反馈，在一个平台里走完。",
              "Set the homework, collect the recordings, transcribe them, mark them line by line, publish the feedback — all in one place."
            )}
          </p>

          <nav className="landing-entry">
            <Link className="btn accent" href="/teacher">
              {t("老师登录", "Teacher login")}
            </Link>
            <Link className="btn secondary" href="/student">
              {t("学生登录", "Student login")}
            </Link>
            <Link className="btn link landing-assistant" href="/assistant">
              {t("助教入口", "Assistant")}
            </Link>
          </nav>

          <p className="landing-foot">
            {t(
              "网页操作，手机号注册，无需下载APP",
              "Works in the browser. Sign up with a phone number, no app to download."
            )}
          </p>
        </div>

        <TrialColumn />
      </div>
    </main>
  );
}

/**
 * The way in for someone who has never seen the platform: no phone number, no
 * password, no activation code.
 *
 * The two sides are a deck rather than a list — the one on offer sits in
 * front and the other waits behind it, smaller and dimmer, so the column
 * stays about the height of one card and the choice reads as a choice. The
 * dots below swap them; the deck leans towards the cursor, which is what
 * makes the pair feel like objects rather than a slideshow.
 */
function TrialColumn() {
  const { t } = useLanguage();
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [starting, setStarting] = useState<"teacher" | "student" | "">("");
  const [error, setError] = useState("");
  const deck = useRef<HTMLDivElement | null>(null);

  async function start(role: "teacher" | "student") {
    setError("");
    setStarting(role);
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || t("体验开通失败，请稍后重试。", "Could not open the trial."));
      router.push(role === "teacher" ? "/teacher" : "/student");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : t("体验开通失败，请稍后重试。", "Could not open the trial."));
      setStarting("");
    }
  }

  // The lean is written straight to custom properties rather than through
  // state: this runs on every pointer move, and a re-render per frame would
  // fight the transition it rides on.
  function lean(event: PointerEvent<HTMLDivElement>) {
    const node = deck.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    node.style.setProperty("--lean-x", ((event.clientX - box.left) / box.width - 0.5).toFixed(3));
    node.style.setProperty("--lean-y", ((event.clientY - box.top) / box.height - 0.5).toFixed(3));
  }

  function level() {
    const node = deck.current;
    if (!node) return;
    node.style.setProperty("--lean-x", "0");
    node.style.setProperty("--lean-y", "0");
  }

  const cards = [
    {
      role: "teacher" as const,
      title: t("老师体验", "Try as a teacher"),
      lead: t("看看批改一份作业是什么流程", "See what marking a submission is like"),
      sample: <MarkingSample />,
      points: [
        t("3 位示例学生，学习阶段各不相同", "Three example students at different stages"),
        t("一份待批改的口语作业，录音和转写都在", "A speaking submission waiting to be marked, audio and transcript included"),
        t("课程安排、学习计划、每日任务都已铺好", "Schedule, study plan and daily tasks already set up")
      ],
      cta: t("开始老师体验", "Start the teacher trial")
    },
    {
      role: "student" as const,
      title: t("学生体验", "Try as a student"),
      lead: t("看看学生收到的是什么", "See what a student receives"),
      sample: <ProgressSample />,
      points: [
        t("待完成的作业，可以直接录音提交", "Homework waiting, recordable and submittable"),
        t("老师批好的反馈：分数、逐句批注", "Marked feedback: scores and line-by-line notes"),
        t("学习计划进度和成绩曲线", "Study plan progress and the score curve")
      ],
      cta: t("开始学生体验", "Start the student trial")
    }
  ];

  return (
    <aside className="landing-trial" aria-label={t("免费体验", "Free trial")}>
      <div className="landing-trial-head">
        <h2>First timer here? Try it for free!</h2>
        <p>
          {t(
            "不用注册，不用授权码，点一下就进到一个装好数据的工作区。",
            "No sign-up, no activation code — one click opens a workspace with the data already in it."
          )}
        </p>
      </div>

      <div className="landing-deck" ref={deck} onPointerMove={lean} onPointerLeave={level}>
        {cards.map((card, index) => {
          const front = index === active;
          return (
            <div
              className={front ? "landing-deck-card front" : "landing-deck-card back"}
              key={card.role}
              id={"trial-panel-" + card.role}
              role="tabpanel"
              aria-labelledby={"trial-tab-" + card.role}
              inert={!front}
            >
              <div className="landing-trial-card-head">
                <strong>{card.title}</strong>
                <span>{card.lead}</span>
              </div>

              {card.sample}

              <ul>
                {card.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              <button
                className={card.role === "teacher" ? "btn accent" : "btn secondary"}
                type="button"
                disabled={Boolean(starting)}
                onClick={() => void start(card.role)}
              >
                {starting === card.role ? t("准备中...", "Preparing...") : card.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Hover, focus or tap a dot to bring that card forward. They are tabs,
          not decoration, so a keyboard reaches them the same way. */}
      <div className="landing-deck-dots" role="tablist" aria-label={t("选择体验身份", "Choose a trial")}>
        {cards.map((card, index) => (
          <button
            key={card.role}
            id={"trial-tab-" + card.role}
            className={index === active ? "landing-deck-dot active" : "landing-deck-dot"}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-controls={"trial-panel-" + card.role}
            tabIndex={index === active ? 0 : -1}
            onMouseEnter={() => setActive(index)}
            onFocus={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <span className="landing-deck-dot-name">{card.title}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      <p className="landing-trial-foot">
        {t("体验数据 7 天后自动清除，和正式账号完全隔离。", "Trial data is cleared after 7 days and is kept entirely separate from real accounts.")}
      </p>
    </aside>
  );
}

/**
 * One question as the teacher sees it while marking, built from the same
 * pieces as the real card: the prompt, the recording, the transcript and the
 * note. A still — the player is not wired to anything.
 */
function MarkingSample() {
  const { t } = useLanguage();
  return (
    <figure className="landing-sample" aria-label={t("批改一道口语题时的界面", "Marking one speaking question")}>
      <div className="landing-sample-block">
        <p className="landing-sample-meta">Part 2 · 1:47</p>
        <p className="landing-sample-question">
          Describe a journey you remember well. You should say where you went, how you travelled, and
          explain why you remember it.
        </p>
      </div>

      <div className="landing-player" aria-hidden="true">
        <span className="landing-player-play">
          <svg viewBox="0 0 12 14" width="11" height="13" focusable="false">
            <path d="M1 1l10 6-10 6z" fill="currentColor" />
          </svg>
        </span>
        <span className="landing-player-track">
          <span />
        </span>
        <span className="landing-player-time">0:34 / 1:47</span>
      </div>

      <div className="landing-sample-block">
        <div className="landing-sample-bar">
          <span className="landing-sample-label">{t("录音转写", "Transcript")}</span>
          <span className="landing-sample-btn">{t("重新生成转写", "Transcribe again")}</span>
        </div>
        <p className="tracked-text">
          I went to Suzhou last spring, and I <del>take</del>
          <ins>took</ins> the high-speed train, because it <del>take</del>
          <ins>takes</ins> only half an hour from Shanghai. The seats <del>was</del>
          <ins>were</ins> comfortable, so I <del>feel</del>
          <ins>felt</ins> quite relaxed.
        </p>
        <p className="landing-annotation">
          <span>{t("批注", "Note")}</span>
          {t(
            "讲过去的经历统一用一般过去时；只有「车程半小时」是现在依然成立的事实，所以留在现在时。",
            "A past experience stays in the past simple throughout. Only the half-hour journey time is still true today, which is why it keeps the present."
          )}
        </p>
      </div>
    </figure>
  );
}

// One series over five submissions, so the y-axis is banded in the halves the
// marking scale actually uses and only the latest score is labelled — the
// gridlines carry the rest. Plot 46–386 wide, 4.5–7.0 tall.
const bands = [5, 5.5, 5.5, 6, 6.5];
const plot = { left: 46, right: 386, top: 32, bottom: 112, min: 4.5, max: 7 };
const pointX = (index: number) => plot.left + ((plot.right - plot.left) / (bands.length - 1)) * index;
const pointY = (band: number) => plot.bottom - ((band - plot.min) / (plot.max - plot.min)) * (plot.bottom - 12);
const dayLabels = ["9/02", "9/09", "9/16", "9/23", "9/30"];

/**
 * The student's speaking score across their last five submissions, drawn the
 * way the real progress panel draws it. A still, like the marking card.
 */
function ProgressSample() {
  const { t } = useLanguage();
  const line = bands.map((band, index) => `${index ? "L" : "M"} ${pointX(index)} ${pointY(band)}`).join(" ");
  const area = `${line} L ${plot.right} ${plot.bottom} L ${plot.left} ${plot.bottom} Z`;
  const lastX = pointX(bands.length - 1);
  const lastY = pointY(bands[bands.length - 1]);

  return (
    <figure className="landing-curve" aria-label={t("学生口语成绩的进步曲线：5.0 到 6.5", "A student's speaking score rising from 5.0 to 6.5")}>
      <figcaption>
        <span className="landing-curve-title">{t("口语总分", "Speaking band")}</span>
        <span className="landing-curve-delta">{t("近 5 次作业 +1.5", "+1.5 over five submissions")}</span>
      </figcaption>

      <svg viewBox="0 0 420 148" role="img" aria-hidden="true">
        {[5, 5.5, 6, 6.5].map((band) => (
          <g key={band}>
            <line x1={plot.left} y1={pointY(band)} x2={plot.right + 8} y2={pointY(band)} className="landing-curve-grid" />
            <text x={plot.left - 10} y={pointY(band) + 4} className="landing-curve-tick" textAnchor="end">
              {band.toFixed(1)}
            </text>
          </g>
        ))}

        <path d={area} className="landing-curve-area" />
        <path d={line} className="landing-curve-line" />

        {bands.map((band, index) => (
          <circle key={index} cx={pointX(index)} cy={pointY(band)} r={4} className="landing-curve-dot" />
        ))}
        <circle cx={lastX} cy={lastY} r={5.5} className="landing-curve-dot last" />
        <text x={lastX} y={lastY - 14} className="landing-curve-value" textAnchor="middle">
          6.5
        </text>

        {dayLabels.map((label, index) => (
          <text key={label} x={pointX(index)} y={136} className="landing-curve-tick" textAnchor="middle">
            {label}
          </text>
        ))}
      </svg>
    </figure>
  );
}
