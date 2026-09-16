"use client";

import { useEffect, useState } from "react";
import type { AiAssessment, AiCriterion } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The AI preliminary assessment, shown to the teacher beside a speaking
 * submission. Four IELTS criteria as cards — three scored from the
 * transcripts, pronunciation left to the teacher's ear — then the summary,
 * strengths, priorities and a note per answer.
 *
 * It is a second opinion, not the mark: nothing here reaches the student.
 * "采用分数" copies the three scores into the teacher's own score editor so
 * they can be adjusted before publishing.
 */

const criteriaOrder: Array<{ key: keyof AiAssessment["criteria"]; zh: string; en: string; short: string }> = [
  { key: "fluency_coherence", zh: "流利与连贯", en: "Fluency & Coherence", short: "FC" },
  { key: "lexical_resource", zh: "词汇资源", en: "Lexical Resource", short: "LR" },
  { key: "grammar", zh: "语法广度与准确性", en: "Grammatical Range & Accuracy", short: "GRA" },
  { key: "pronunciation", zh: "发音", en: "Pronunciation", short: "P" }
];

export function AiAssessmentPanel({
  submissionId,
  enabled,
  onAdoptScores
}: {
  submissionId: string;
  enabled: boolean;
  /** Called with the three text-based scores when the teacher adopts them. */
  onAdoptScores: (scores: { fluency_coherence: number | null; lexical_resource: number | null; grammar: number | null }) => void;
}) {
  const { t } = useLanguage();
  const [assessment, setAssessment] = useState<AiAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setStatus("");
    setAssessment(null);
    (async () => {
      try {
        const response = await fetch(`/api/teacher/ai-assessment?submissionId=${submissionId}`);
        const data = await response.json().catch(() => ({}));
        if (!cancelled && response.ok) setAssessment(data.assessment || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [submissionId, enabled]);

  if (!enabled) return null;

  async function run() {
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch("/api/teacher/ai-assessment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("AI 初评失败。", "The AI assessment failed."));
      setAssessment(data.assessment);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("AI 初评失败。", "The AI assessment failed."));
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="ai-panel">
      <div className="section-head compact">
        <div>
          <h3>
            {t("AI 初评", "AI preliminary assessment")}
            <span className="pill ai">{t("仅老师可见", "Teacher only")}</span>
          </h3>
          <div className="hint">
            {t("基于转写文字按雅思口语四项评分标准给出的参考意见；发音需要你听录音判断。", "A second opinion from the transcripts on the four IELTS Speaking criteria; pronunciation is yours to judge by ear.")}
          </div>
        </div>
        <button className="btn ai" type="button" onClick={() => void run()} disabled={running}>
          {running ? t("评估中...", "Assessing...") : assessment ? t("重新评估", "Assess again") : t("生成 AI 初评", "Run AI assessment")}
        </button>
      </div>

      {status && <p className="error">{status}</p>}
      {loading && !assessment && <p className="hint">{t("加载中...", "Loading...")}</p>}
      {!loading && !assessment && !status && (
        <p className="hint">{t("还没有评估。生成转写后点右上角按钮。", "No assessment yet. Generate the transcripts, then run it.")}</p>
      )}

      {assessment && (
        <>
          <div className="ai-criteria">
            {criteriaOrder.map((item) => (
              <CriterionCard key={item.key} label={t(item.zh, item.en)} short={item.short} criterion={assessment.criteria[item.key]} />
            ))}
          </div>

          <div className="ai-summary">
            <div className="ai-band">
              <span>{t("整体估分", "Band estimate")}</span>
              <strong>{assessment.band_estimate == null ? "—" : assessment.band_estimate.toFixed(1)}</strong>
            </div>
            <p>{assessment.summary}</p>
          </div>

          <div className="ai-lists">
            <div>
              <label>{t("做得好的", "Strengths")}</label>
              <ul>
                {assessment.strengths.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <label>{t("优先改进", "Fix first")}</label>
              <ul>
                {assessment.priorities.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="ai-foot">
            <small>
              {t("模型", "Model")} {assessment.model} · {new Date(assessment.created_at).toLocaleString()}
            </small>
            <button
              className="btn secondary"
              type="button"
              onClick={() =>
                onAdoptScores({
                  fluency_coherence: assessment.criteria.fluency_coherence.score,
                  lexical_resource: assessment.criteria.lexical_resource.score,
                  grammar: assessment.criteria.grammar.score
                })
              }
            >
              {t("采用分数到评分区", "Copy scores to the editor")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function CriterionCard({ label, short, criterion }: { label: string; short: string; criterion: AiCriterion }) {
  const { t } = useLanguage();
  return (
    <div className={`ai-criterion ${criterion.score == null ? "unscored" : ""}`}>
      <div className="ai-criterion-head">
        <span className="ai-criterion-short">{short}</span>
        <strong>{criterion.score == null ? t("听后评定", "By ear") : criterion.score.toFixed(1)}</strong>
      </div>
      <div className="ai-criterion-label">{label}</div>
      <p>{criterion.comment}</p>
      {criterion.evidence.length > 0 && (
        <ul>
          {criterion.evidence.map((quote, index) => (
            <li key={index}>“{quote}”</li>
          ))}
        </ul>
      )}
    </div>
  );
}
