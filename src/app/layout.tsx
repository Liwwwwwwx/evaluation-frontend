import "katex/dist/katex.min.css";
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "评测工作台",
  description: "AI 科学服务评测平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
