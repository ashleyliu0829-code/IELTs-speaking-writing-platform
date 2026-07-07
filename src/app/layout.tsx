import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IELTS Speaking Homework Platform",
  description: "Student recording submission and teacher feedback platform for IELTS speaking homework."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <header className="topbar">
          <div>
            <div className="brand-title">IELTS Speaking Homework</div>
            <div className="brand-subtitle">P1 / P2 / P3 recording, review, and feedback</div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
