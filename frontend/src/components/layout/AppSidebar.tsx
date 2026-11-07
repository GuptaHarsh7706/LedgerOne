import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  CheckCheck, 
  GitMerge, 
  Bot, 
  BarChart3, 
  Settings, 
  ArrowLeft,
  Shield,
  Layers
} from 'lucide-react';

interface SidebarItem {
  index: string;
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
}

const NAV_ITEMS: SidebarItem[] = [
  { index: '01', label: 'Dashboard', path: '/workspace', icon: LayoutDashboard },
  { index: '02', label: 'Documents', path: '/workspace/documents', icon: FileText },
  { index: '03', label: 'Review Queue', path: '/workspace/review', icon: CheckCheck },
  { index: '04', label: '3-Way Match', path: '/workspace/matching', icon: GitMerge },
  { index: '05', label: 'AI Copilot', path: '/workspace/assistant', icon: Bot },
  { index: '06', label: 'Analytics', path: '/workspace/analytics', icon: BarChart3 },
  { index: '07', label: 'RBAC & Config', path: '/workspace/settings', icon: Settings },
];

export const AppSidebar: React.FC = () => {
  const navigate = useNavigate();

  return (
    <aside className="w-64 border-r border-white/[0.08] bg-[#0A0B14] flex flex-col justify-between shrink-0 h-screen sticky top-0 overflow-y-auto">
      <div>
        {/* Brand Header */}
        <div className="h-16 border-b border-white/[0.08] px-6 flex items-center justify-between">
          <button 
            onClick={() => navigate('/workspace')} 
            className="flex items-center gap-3 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-ops-blue via-ops-cyan to-ops-yellow p-[1px] group-hover:shadow-[0_0_15px_rgba(0,255,204,0.4)] transition-shadow">
              <div className="w-full h-full bg-[#0B0C15] rounded-lg flex items-center justify-center">
                <span className="font-mono font-black text-sm text-white">L1</span>
              </div>
            </div>
            <div>
              <span className="font-bold text-sm tracking-tight text-white block">LedgerOne</span>
              <span className="text-[10px] font-mono text-ops-cyan uppercase tracking-widest block">WORKSPACE</span>
            </div>
          </button>
        </div>

        {/* Navigation Items */}
        <div className="px-3 py-6 space-y-1.5">
          <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-widest text-white/40">
            SYSTEM MODULES
          </div>

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/workspace'}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-mono transition-all duration-200 border ${
                    isActive
                      ? 'bg-[#18192A] text-white border-ops-cyan/40 shadow-[0_0_20px_rgba(0,255,204,0.08)]'
                      : 'text-white/60 border-transparent hover:text-white hover:bg-white/[0.03]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <div className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-ops-cyan' : 'text-white/40'}`} />
                      <span className="font-sans font-medium">{item.label}</span>
                    </div>
                    <span className={`text-[10px] font-mono ${isActive ? 'text-ops-cyan' : 'text-white/30'}`}>
                      [ {item.index} ]
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      </div>

      {/* Footer Area: Back to Landing & System Status */}
      <div className="p-4 border-t border-white/[0.08] space-y-3">
        <div className="p-3 rounded-lg bg-[#121320] border border-white/[0.06] text-[11px] font-mono">
          <div className="flex items-center justify-between mb-1.5 text-white/50">
            <span>INVARIANT INTEGRITY</span>
            <span className="text-ops-cyan font-bold">100.0%</span>
          </div>
          <div className="w-full h-1.5 bg-black/60 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-ops-blue to-ops-cyan w-full" />
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-white/[0.08] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.05] text-xs font-mono text-white/60 hover:text-white transition-all group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
          <span>Exit To Public Site</span>
        </button>
      </div>
    </aside>
  );
};
