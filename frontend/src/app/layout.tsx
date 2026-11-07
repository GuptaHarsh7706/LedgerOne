import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/shell/Sidebar";
import { Header } from "@/components/shell/Header";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { GlobalUploadModal } from "@/components/documents/GlobalUploadModal";

export const metadata: Metadata = {
  title: "LedgerOne — Enterprise Document Intelligence Ecosystem",
  description:
    "Zero-false-acceptance document intelligence, layout-aware OCR, accounting invariants, 3-way matching, and evidence-grounded AI assistance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-canvas text-ink-primary font-sans antialiased overflow-hidden selection:bg-brand/30 selection:text-white">
        {/* Ambient Atmospheric Lighting Mesh (Linear/Vercel Aesthetic) */}
        <div className="fixed top-0 left-1/3 -translate-x-1/2 w-[650px] h-[320px] bg-gradient-to-tr from-brand/12 via-indigo-600/8 to-transparent blur-[140px] pointer-events-none z-0 rounded-full" />
        <div className="fixed -bottom-24 right-1/4 w-[500px] h-[300px] bg-gradient-to-tl from-emerald-500/6 via-teal-500/4 to-transparent blur-[130px] pointer-events-none z-0 rounded-full" />

        <div className="flex h-screen w-screen overflow-hidden relative z-10">
          {/* Collapsible Left Navigation Shell */}
          <Sidebar />

          {/* Main Viewport Shell */}
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-transparent scrollbar-thin scrollbar-thumb-white/10">
              {children}
            </main>
          </div>
        </div>

        {/* Global Keyboard Quick Launcher */}
        <CommandPalette />

        {/* Global Upload Trigger Bridge */}
        <GlobalUploadModal />
      </body>
    </html>
  );
}
