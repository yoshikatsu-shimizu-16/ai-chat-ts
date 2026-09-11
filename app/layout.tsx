import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIチャット",
  description: "Next.jsとLangGraphで作る小さなAIチャット",
};

// 以下のコードと同義
// type Props = {
//   children: React.ReactNode;
// }
// function RootLayout({ children } : Props)

export default function RootLayout({children,}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
