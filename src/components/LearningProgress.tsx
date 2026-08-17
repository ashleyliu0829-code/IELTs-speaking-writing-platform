"use client";

import type { Feedback, Submission } from "@/lib/types";
import { scoreDetails } from "@/lib/feedback";
import { averageScore } from "@/lib/questions";

type ProgressPoint = {
  id: string;
  title: string;
  date: string;
  overall: number;
  fluency: number;
  grammar: number;
  vocabulary: number;
};

export function LearningProgressPanel({ submissions }: { submissions: Submission[] }) {
  const points = submissions
    .map(toProgressPoint)
    .filter((point): point is ProgressPoint => Boolean(point))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <article className="card stack">
      <div className="section-head">
        <div>
          <h2>学习情况</h2>
          <div className="hint">每次作业发布反馈后的分数变化</div>
        </div>
        <span className="pill">{points.length} 条记录</span>
      </div>
      {points.length ? (
        <>
          <ScoreChart points={points} />
          <div className="progress-table">
            <div className="progress-row progress-head">
              <span>作业</span>
              <span>日期</span>
              <span>平均分</span>
              <span>流利度</span>
              <span>语法</span>
              <span>词汇</span>
            </div>
            {points.map((point) => (
              <div className="progress-row" key={point.id}>
                <span>{point.title}</span>
                <span>{new Date(point.date).toLocaleDateString("zh-CN")}</span>
                <strong>{point.overall.toFixed(1)}</strong>
                <span>{point.fluency.toFixed(1)}</span>
                <span>{point.grammar.toFixed(1)}</span>
                <span>{point.vocabulary.toFixed(1)}</span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">还没有可展示的评分。老师发布反馈后，这里会显示分数曲线。</p>
      )}
    </article>
  );
}

function ScoreChart({ points }: { points: ProgressPoint[] }) {
  const width = 640;
  const height = 180;
  const pad = 28;
  const minScore = 0;
  const maxScore = 9;
  const xStep = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;

  const coords = points.map((point, index) => {
    const x = points.length > 1 ? pad + index * xStep : width / 2;
    const y = height - pad - ((point.overall - minScore) / (maxScore - minScore)) * (height - pad * 2);
    return { x, y, point };
  });
  const polyline = coords.map((coord) => `${coord.x},${coord.y}`).join(" ");

  return (
    <div className="score-chart" aria-label="分数变化图">
      <svg viewBox={`0 0 ${width} ${height}`} role="img">
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} />
        <line x1={pad} y1={pad} x2={pad} y2={height - pad} />
        {[0, 3, 6, 9].map((score) => {
          const y = height - pad - (score / 9) * (height - pad * 2);
          return (
            <g key={score}>
              <line className="grid-line" x1={pad} y1={y} x2={width - pad} y2={y} />
              <text x={6} y={y + 4}>
                {score}
              </text>
            </g>
          );
        })}
        {points.length > 1 && <polyline points={polyline} />}
        {coords.map(({ x, y, point }) => (
          <g key={point.id}>
            <circle cx={x} cy={y} r="5" />
            <text className="point-label" x={x} y={y - 10}>
              {point.overall.toFixed(1)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function toProgressPoint(submission: Submission): ProgressPoint | null {
  const feedback = normalizeFeedback(submission.feedback);
  if (!feedback) return null;

  const scores = scoreDetails(feedback.details || []);
  if (!scores.length) return null;

  const fluency = Number(scores.find((score) => score.part === "fluency")?.score || 0);
  const grammar = Number(scores.find((score) => score.part === "grammar")?.score || 0);
  const vocabulary = Number(scores.find((score) => score.part === "vocabulary")?.score || 0);
  const assignment = Array.isArray(submission.assignments) ? submission.assignments[0] : submission.assignments;

  return {
    id: submission.id,
    title: submission.submission_title || assignment?.title || "口语作业",
    date: feedback.published_at || submission.submitted_at,
    overall: Number(feedback.overall_score || averageScore(scores)),
    fluency,
    grammar,
    vocabulary
  };
}

function normalizeFeedback(feedback: Submission["feedback"]): Feedback | null {
  return Array.isArray(feedback) ? feedback[0] || null : feedback || null;
}
