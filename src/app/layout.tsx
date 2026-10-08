import type { Metadata } from "next";
import "./globals.css";
import { BrandTitle, LanguageProvider, LanguageSwitch } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Graderley",
  description: "Graderley — 雅思口语、写作作业布置、批改与课程管理平台。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <LanguageProvider>
          {/* The wordmark, the language switch, and a slot beside the
              wordmark that a signed-in dashboard fills with its mock exam
              button — the one thing both sides need to reach from anywhere. */}
          <header className="topbar">
            <div className="topbar-brand">
              <BrandTitle />
              <div id="topbar-slot" className="topbar-slot" />
            </div>
            <div className="topbar-tools">
              <LanguageSwitch />
            </div>
          </header>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
