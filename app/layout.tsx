import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIチャット学習デモ",
  description: "Next.jsとLangGraphで作る小さなAIチャット",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
