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
          {/* Just the wordmark and the language switch every page shares. */}
          <header className="topbar">
            <BrandTitle />
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
