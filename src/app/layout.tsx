import type { Metadata } from "next";
import "./globals.css";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { BrandTitle, LanguageProvider, LanguageSwitch } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "IELTS 作业平台",
  description: "面向雅思口语和写作作业提交、批改与反馈的平台。"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <LanguageProvider>
          {/* Just the wordmark, and the two switches every page shares. */}
          <header className="topbar">
            <BrandTitle />
            <div className="topbar-tools">
              <LanguageSwitch />
              <ThemeSwitch />
            </div>
          </header>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
