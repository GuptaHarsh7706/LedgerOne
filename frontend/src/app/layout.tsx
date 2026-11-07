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
      <body className="bg-canvas text-ink-primary font-sans antialiased overflow-hidden">
        <div className="flex h-screen w-screen overflow-hidden">
          {/* Collapsible Left Navigation Shell */}
          <Sidebar />

          {/* Main Viewport Shell */}
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto bg-canvas">
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
