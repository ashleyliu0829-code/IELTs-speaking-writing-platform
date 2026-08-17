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
        <header className="topbar">
          <div>
            <div className="brand-title">IELTS 作业平台</div>
            <div className="brand-subtitle">口语与写作作业、批改和反馈</div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
