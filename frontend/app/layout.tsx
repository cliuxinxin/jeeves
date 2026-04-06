import type { Metadata } from "next";

import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jeeves AI Assistant",
  description: "A minimal full-stack LangGraph assistant with FastAPI and Next.js.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
