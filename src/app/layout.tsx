import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS 作业平台",
  description: "面向雅思口语和写作作业提交、批改与反馈的平台。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* Just the wordmark: every page below opens with a heading that says
            where you are, and the strapline only repeated it. */}
        <header className="topbar">
          <a className="brand-title" href="/">IELTS 作业平台</a>
        </header>
        {children}
      </body>
    </html>
  );
}
