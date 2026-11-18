import type { Metadata, Viewport } from "next";

import { APP_NAME } from "@/lib/config";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://really.sinyu1012.cn"),
  title: `${APP_NAME} · 图片元数据与 C2PA 来源检查`,
  description:
    "在浏览器本地检查图片 EXIF、XMP 和 C2PA 来源凭证，查看 AI 处理线索并导出图片报告。原图不上传，结果是证据提示，不是真伪保证。",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: APP_NAME,
    locale: "zh_CN",
    title: `${APP_NAME} · 图片元数据与 C2PA 来源检查`,
    description: "本地读取图片元信息与来源凭证，整理可核对的证据线索。原图不上传。",
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} · 图片元数据与 C2PA 来源检查`,
    description: "检查 EXIF、XMP 和 C2PA 来源凭证。原图留在浏览器内，结果不是真伪保证。",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
