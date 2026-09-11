"use client";

import { currentP1Bank, currentP2P3Bank, p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { getSpeakingTopicProgress } from "@/lib/speakingProgress";
import type { Submission } from "@/lib/types";
import { useLanguage } from "@/lib/i18n";

type SpeakingPracticePart = "p1" | "p2";

export function SpeakingTopicProgressPanel({
  submissions,
  completedP1TopicIds = [],
  completedP2TopicIds = [],
  onPracticeTopic,
  practiceLoadingId,
  practiceMessage
}: {
  submissions: Submission[];
  completedP1TopicIds?: string[];
  completedP2TopicIds?: string[];
  onPracticeTopic?: (part: SpeakingPracticePart, topicId: string) => void;
  practiceLoadingId?: string;
  practiceMessage?: string;
}) {
  const { t } = useLanguage();
  const progress = getSpeakingTopicProgress(submissions);
  const p1Completed = new Set([...progress.p1Completed, ...completedP1TopicIds]);
  const p2Completed = new Set([...progress.p2Completed, ...completedP2TopicIds]);
  // Topics from an earlier season the student already did: still shown, so
  // nothing they finished disappears, but outside the current-season count.
  const retiredP1Done = p1QuestionBank.filter((set) => set.retired && p1Completed.has(set.id));
  const retiredP2Done = p2P3QuestionBank.filter((set) => set.retired && p2Completed.has(set.id));
  const currentP1Done = currentP1Bank.filter((set) => p1Completed.has(set.id)).length;
  const currentP2Done = currentP2P3Bank.filter((set) => p2Completed.has(set.id)).length;

  return (
    <section className="topic-progress-panel">
      <div className="section-head compact">
        <div>
          <h3>{t("口语过题情况", "Speaking topics covered")}</h3>
          <div className="hint">
            {onPracticeTopic
              ? t("点击话题可进入自主练习。", "Click a topic to start a practice.")
              : t("统计正式作业覆盖、已提交录音和自主练习完成的 Part 1 / Part 2 话题。", "Part 1 / Part 2 topics covered by homework, recordings and practice.")}
          </div>
        </div>
      </div>
      <div className="topic-progress-summary">
        <div className="metric-card">
          <span>Part 1</span>
          <strong>
            {currentP1Done}/{progress.p1Total}
          </strong>
          {retiredP1Done.length > 0 && <small>{t(`另有往期 ${retiredP1Done.length} 个`, `+${retiredP1Done.length} from earlier seasons`)}</small>}
        </div>
        <div className="metric-card">
          <span>Part 2</span>
          <strong>
            {currentP2Done}/{progress.p2Total}
          </strong>
          {retiredP2Done.length > 0 && <small>{t(`另有往期 ${retiredP2Done.length} 个`, `+${retiredP2Done.length} from earlier seasons`)}</small>}
        </div>
      </div>
      {practiceMessage && <div className={`practice-inline-status ${/失败|无法|错误|fail|could not|error/i.test(practiceMessage) ? "error" : ""}`}>{practiceMessage}</div>}
      <div className="topic-progress-grid">
        <TopicList
          title={t("Part 1 话题", "Part 1 topics")}
          part="p1"
          onPracticeTopic={onPracticeTopic}
          practiceLoadingId={practiceLoadingId}
          items={currentP1Bank.map((set) => ({
            id: set.id,
            label: set.topic,
            completed: p1Completed.has(set.id)
          }))}
          retired={retiredP1Done.map((set) => ({ id: set.id, label: set.topic, completed: true }))}
        />
        <TopicList
          title={t("Part 2 话题", "Part 2 topics")}
          part="p2"
          onPracticeTopic={onPracticeTopic}
          practiceLoadingId={practiceLoadingId}
          items={currentP2P3Bank.map((set) => ({
            id: set.id,
            label: set.topic,
            completed: p2Completed.has(set.id)
          }))}
          retired={retiredP2Done.map((set) => ({ id: set.id, label: set.topic, completed: true }))}
        />
      </div>
    </section>
  );
}

function TopicList({
  title,
  part,
  onPracticeTopic,
  practiceLoadingId,
  items,
  retired = []
}: {
  title: string;
  part: SpeakingPracticePart;
  onPracticeTopic?: (part: SpeakingPracticePart, topicId: string) => void;
  practiceLoadingId?: string;
  items: { id: string; label: string; completed: boolean }[];
  /** Earlier-season topics the student completed; listed after the current ones. */
  retired?: { id: string; label: string; completed: boolean }[];
}) {
  const { t } = useLanguage();
  const row = (item: { id: string; label: string; completed: boolean }) => {
    const isLoading = practiceLoadingId === `${part}:${item.id}`;
    const content = (
      <>
        <span>{item.label}</span>
        {isLoading ? <strong>{t("打开中...", "Opening...")}</strong> : item.completed ? <strong>{t("✓ 已完成", "✓ Done")}</strong> : onPracticeTopic ? <strong>{t("练习", "Practise")}</strong> : null}
      </>
    );
    if (onPracticeTopic) {
      return (
        <button
          className={`topic-progress-row topic-progress-button ${item.completed ? "completed" : ""}`}
          disabled={Boolean(practiceLoadingId)}
          key={item.id}
          onClick={() => onPracticeTopic(part, item.id)}
          type="button"
        >
          {content}
        </button>
      );
    }
    return (
      <div className={`topic-progress-row ${item.completed ? "completed" : ""}`} key={item.id}>
        {content}
      </div>
    );
  };
  return (
    <div className="topic-list-card">
      <div className="section-head compact">
        <h4>{title}</h4>
        <span className="pill">{items.filter((item) => item.completed).length}/{items.length}</span>
      </div>
      <div className="topic-list">
        {items.map(row)}
        {retired.length > 0 && (
          <>
            <div className="topic-list-divider">{t("往期话题（已练过）", "Earlier seasons (done)")}</div>
            {retired.map(row)}
          </>
        )}
      </div>
    </div>
  );
}
