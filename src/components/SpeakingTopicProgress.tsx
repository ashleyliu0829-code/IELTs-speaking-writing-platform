"use client";

import { p1QuestionBank, p2P3QuestionBank } from "@/lib/questionBank";
import { getSpeakingTopicProgress } from "@/lib/speakingProgress";
import type { Submission } from "@/lib/types";

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
  const progress = getSpeakingTopicProgress(submissions);
  const p1Completed = new Set([...progress.p1Completed, ...completedP1TopicIds]);
  const p2Completed = new Set([...progress.p2Completed, ...completedP2TopicIds]);

  return (
    <section className="topic-progress-panel">
      <div className="section-head compact">
        <div>
          <h3>口语过题情况</h3>
          <div className="hint">
            {onPracticeTopic
              ? "统计正式作业覆盖和自主练习完成的话题。点击话题可进入自主练习。"
              : "统计正式作业覆盖、已提交录音和自主练习完成的 Part 1 / Part 2 话题。"}
          </div>
        </div>
      </div>
      <div className="topic-progress-summary">
        <div className="metric-card">
          <span>Part 1</span>
          <strong>
            {p1Completed.size}/{progress.p1Total}
          </strong>
        </div>
        <div className="metric-card">
          <span>Part 2</span>
          <strong>
            {p2Completed.size}/{progress.p2Total}
          </strong>
        </div>
      </div>
      {practiceMessage && <div className={`practice-inline-status ${practiceMessage.includes("失败") || practiceMessage.includes("无法") || practiceMessage.includes("错误") ? "error" : ""}`}>{practiceMessage}</div>}
      <div className="topic-progress-grid">
        <TopicList
          title="Part 1 话题"
          part="p1"
          onPracticeTopic={onPracticeTopic}
          practiceLoadingId={practiceLoadingId}
          items={p1QuestionBank.map((set) => ({
            id: set.id,
            label: set.topic,
            completed: p1Completed.has(set.id)
          }))}
        />
        <TopicList
          title="Part 2 话题"
          part="p2"
          onPracticeTopic={onPracticeTopic}
          practiceLoadingId={practiceLoadingId}
          items={p2P3QuestionBank.map((set) => ({
            id: set.id,
            label: set.topic,
            completed: p2Completed.has(set.id)
          }))}
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
  items
}: {
  title: string;
  part: SpeakingPracticePart;
  onPracticeTopic?: (part: SpeakingPracticePart, topicId: string) => void;
  practiceLoadingId?: string;
  items: { id: string; label: string; completed: boolean }[];
}) {
  return (
    <div className="topic-list-card">
      <div className="section-head compact">
        <h4>{title}</h4>
        <span className="pill">{items.filter((item) => item.completed).length}/{items.length}</span>
      </div>
      <div className="topic-list">
        {items.map((item) => {
          const isLoading = practiceLoadingId === `${part}:${item.id}`;
          const content = (
            <>
              <span>{item.label}</span>
              {isLoading ? <strong>打开中...</strong> : item.completed ? <strong>✓ 已完成</strong> : onPracticeTopic ? <strong>练习</strong> : null}
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
        })}
      </div>
    </div>
  );
}
