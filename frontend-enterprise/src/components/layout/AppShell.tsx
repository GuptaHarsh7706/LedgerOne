import React, { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "./CommandPalette";
import { api } from "../../services/api";

export const AppShell: React.FC = () => {
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleLogout = async () => {
    await api.logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink-primary font-sans relative">
      {/* Ambient Atmospheric Lighting (Linear/Vercel Aesthetic) */}
      <div
        className="pointer-events-none fixed top-[-10%] left-[30%] w-[600px] h-[350px] rounded-full bg-brand/10 blur-[140px] z-0 animate-pulse-slow"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none fixed bottom-[-15%] right-[10%] w-[500px] h-[300px] rounded-full bg-status-success/5 blur-[130px] z-0"
        aria-hidden="true"
      />

      {/* Primary Sidebar */}
      <Sidebar onLogout={handleLogout} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">
        <Header onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />

        <main className="flex-1 overflow-y-auto bg-canvas/60">
          <Outlet />
        </main>
      </div>

      {/* Global Command Palette */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
      />
    </div>
  );
};
