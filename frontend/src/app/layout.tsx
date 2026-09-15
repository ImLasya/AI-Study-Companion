import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "AI Study Companion - Learning & Growth Workspace",
  description:
    "A persistent, contextual, measurable AI learning workspace to understand, practice, and master knowledge.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090d16] text-slate-100 antialiased min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-gray-900 py-6 text-center text-xs text-gray-500">
          AI Study Companion &bull; Architectural Prototype &bull; Phase 0 Foundation
        </footer>
      </body>
    </html>
  );
}
