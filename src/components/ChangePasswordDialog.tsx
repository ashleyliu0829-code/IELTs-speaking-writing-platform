"use client";

import { useEffect, useRef, useState } from "react";
import { tr, useLanguage } from "@/lib/i18n";

/**
 * "Change my password", for any signed-in account. Opened from the rail
 * footer on both portals. A native <dialog>, like the student editor, so the
 * browser handles Escape, the backdrop and focus.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit() {
    if (next.length < 6) return setStatus(tr("新密码至少需要 6 位。", "The new password needs at least 6 characters."));
    if (next !== again) return setStatus(tr("两次输入的新密码不一致。", "The two new passwords do not match."));
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || tr("修改失败。", "Could not change the password."));
      setDone(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : tr("修改失败。", "Could not change the password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog className="student-dialog" ref={ref} onCancel={onClose} onClose={onClose}>
      <form
        method="dialog"
        className="student-dialog-body"
        onSubmit={(event) => {
          event.preventDefault();
          if (!done) void submit();
        }}
      >
        <div className="section-head compact">
          <div>
            <h3>{t("修改密码", "Change password")}</h3>
          </div>
          <button className="btn link" type="button" onClick={onClose}>
            {t("关闭", "Close")}
          </button>
        </div>

        {done ? (
          <>
            <p className="hint">{t("密码已修改，下次登录请用新密码。", "Password changed. Use the new one next time you sign in.")}</p>
            <div className="student-dialog-actions">
              <button className="btn" type="button" onClick={onClose}>
                {t("好的", "Done")}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="student-dialog-field">
              <label>{t("当前密码", "Current password")}</label>
              <input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" />
            </div>
            <div className="student-dialog-field">
              <label>{t("新密码", "New password")}</label>
              <input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" placeholder={t("至少 6 位", "At least 6 characters")} />
            </div>
            <div className="student-dialog-field">
              <label>{t("再输一次新密码", "New password again")}</label>
              <input type="password" value={again} onChange={(event) => setAgain(event.target.value)} autoComplete="new-password" />
            </div>
            {status && <p className="error">{status}</p>}
            <div className="student-dialog-actions">
              <button className="btn secondary" type="button" onClick={onClose} disabled={saving}>
                {t("取消", "Cancel")}
              </button>
              <button className="btn" type="submit" disabled={saving || !current || !next || !again}>
                {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
              </button>
            </div>
          </>
        )}
      </form>
    </dialog>
  );
}
