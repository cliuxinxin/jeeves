import type { Metadata, Viewport } from "next";

import { QueryProvider } from "@/components/providers/query-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Jeeves AI Assistant",
  description: "A minimal full-stack LangGraph assistant with FastAPI and Next.js.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Jeeves",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  viewportFit: "cover",
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
