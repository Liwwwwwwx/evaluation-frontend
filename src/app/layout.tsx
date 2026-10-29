import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "评测工作台",
  description: "AI 科学服务评测平台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
