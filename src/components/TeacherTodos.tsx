"use client";

import { useEffect, useState } from "react";
import type { TeacherTodo } from "@/lib/types";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * The teacher's to-do list on the home page: add a task, give it a time, tick
 * it off, change it, drop it.
 *
 * Edits go straight to the server and the row is replaced with what comes
 * back, so what is on screen is always what is saved. One item is editable at
 * a time; opening another closes the first without saving.
 */

export function TeacherTodoPanel() {
  const { t, language } = useLanguage();
  const [todos, setTodos] = useState<TeacherTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await request("/api/teacher/todos");
        if (!cancelled) setTodos(data.todos || []);
      } catch (error) {
        if (!cancelled) setStatus(error instanceof Error ? error.message : tr("待办加载失败。", "Could not load the to-do list."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function add() {
    const trimmed = title.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const data = await request("/api/teacher/todos", {
        method: "POST",
        body: JSON.stringify({ title: trimmed, dueAt: toIso(dueAt) })
      });
      setTodos(sortTodos([data.todo, ...todos]));
      setTitle("");
      setDueAt("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("添加失败。", "Could not add."));
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, patch: { title?: string; dueAt?: string | null; done?: boolean }) {
    setStatus("");
    try {
      const data = await request("/api/teacher/todos", { method: "PATCH", body: JSON.stringify({ id, ...patch }) });
      setTodos(sortTodos(todos.map((todo) => (todo.id === id ? data.todo : todo))));
      setEditingId(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("保存失败。", "Could not save."));
    }
  }

  async function remove(id: string) {
    setStatus("");
    try {
      await request(`/api/teacher/todos?id=${id}`, { method: "DELETE" });
      setTodos(todos.filter((todo) => todo.id !== id));
      if (editingId === id) setEditingId(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("删除失败。", "Could not delete."));
    }
  }

  const open = todos.filter((todo) => !todo.done).length;

  return (
    <article className="card stack todo-panel">
      <div className="section-head compact">
        <div>
          <h2>{t("待办事项", "To-do list")}</h2>
        </div>
        {todos.length > 0 && <span className="pill">{t(`${open} 项待办`, `${open} open`)}</span>}
      </div>

      <form
        className="todo-add"
        onSubmit={(event) => {
          event.preventDefault();
          void add();
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("要做的事...", "Something to do...")}
          maxLength={300}
        />
        <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label={t("时间", "Time")} />
        <button className="btn" type="submit" disabled={busy || !title.trim()}>
          {t("添加", "Add")}
        </button>
      </form>

      {status && <p className="error">{status}</p>}
      {loading && !todos.length && <p className="hint">{t("正在加载...", "Loading...")}</p>}
      {!loading && !todos.length && !status && <p className="hint">{t("还没有待办。", "Nothing to do yet.")}</p>}

      <div className="todo-list">
        {todos.map((todo) =>
          editingId === todo.id ? (
            <TodoEditor
              key={todo.id}
              todo={todo}
              onSave={(patch) => update(todo.id, patch)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div className={`todo-row ${todo.done ? "done" : ""}`} key={todo.id}>
              <input
                type="checkbox"
                checked={todo.done}
                onChange={(event) => update(todo.id, { done: event.target.checked })}
                aria-label={t("完成", "Done")}
              />
              <div className="todo-body">
                <span className="todo-title">{todo.title}</span>
                {todo.due_at && <small className={dueClass(todo)}>{formatDue(todo.due_at, language)}</small>}
              </div>
              <div className="todo-actions">
                <button className="btn link" type="button" onClick={() => setEditingId(todo.id)}>
                  {t("编辑", "Edit")}
                </button>
                <button className="btn link danger" type="button" onClick={() => remove(todo.id)}>
                  {t("删除", "Delete")}
                </button>
              </div>
            </div>
          )
        )}
      </div>
    </article>
  );
}

function TodoEditor({
  todo,
  onSave,
  onCancel
}: {
  todo: TeacherTodo;
  onSave: (patch: { title: string; dueAt: string | null }) => void;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(todo.title);
  const [dueAt, setDueAt] = useState(toLocalInput(todo.due_at));

  return (
    <form
      className="todo-row editing"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onSave({ title: title.trim(), dueAt: toIso(dueAt) });
      }}
    >
      <div className="todo-body">
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} autoFocus />
        <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-label={t("时间", "Time")} />
      </div>
      <div className="todo-actions">
        <button className="btn link" type="submit" disabled={!title.trim()}>
          {t("保存", "Save")}
        </button>
        <button className="btn link" type="button" onClick={onCancel}>
          {t("取消", "Cancel")}
        </button>
      </div>
    </form>
  );
}

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init.headers || {}) } : init?.headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || tr("请求失败。", "Request failed."));
  return data;
}

// Same order the server returns: open before done, timed before untimed,
// then newest first — so an added or edited row lands where a reload would
// put it.
function sortTodos(todos: TeacherTodo[]) {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due_at && b.due_at && a.due_at !== b.due_at) return a.due_at < b.due_at ? -1 : 1;
    if (Boolean(a.due_at) !== Boolean(b.due_at)) return a.due_at ? -1 : 1;
    return a.created_at < b.created_at ? 1 : -1;
  });
}

// datetime-local gives local wall time with no zone; the server stores UTC.
function toIso(local: string) {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDue(iso: string, language: "zh" | "en") {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return language === "zh" ? `${date.getMonth() + 1}月${date.getDate()}日 ${clock}` : `${date.getDate()}/${date.getMonth() + 1} ${clock}`;
}

// Past-due open items are flagged; finished ones are not, whenever they were due.
function dueClass(todo: TeacherTodo) {
  if (todo.done || !todo.due_at) return "todo-due";
  return new Date(todo.due_at).getTime() < Date.now() ? "todo-due overdue" : "todo-due";
}
