'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppProvider } from '@/components/providers';
import Sidebar, { FloatingPawButton } from '@/components/sidebar';
import { ChatDialog } from '@/components/chat-dialog';
import { QuickEntryDialog } from '@/components/quick-entry-dialog';
import { PwaRegister } from '@/components/pwa-register';
import { LocalDataDialog } from '@/components/local-data-dialog';
import { CatProfileDialog } from '@/components/cat-profile-dialog';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [chatOpen, setChatOpen] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [localDataOpen, setLocalDataOpen] = useState(false);
  const [catProfileOpen, setCatProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('zhongfu-sidebar-collapsed');
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true');
      return;
    }
    setSidebarCollapsed(window.matchMedia('(max-width: 640px)').matches);
  }, []);

  useEffect(() => {
    const openChatDraft = () => setChatOpen(true);
    window.addEventListener('zhongfu-chat-draft', openChatDraft);
    return () => window.removeEventListener('zhongfu-chat-draft', openChatDraft);
  }, []);

  const setSidebarVisibility = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem('zhongfu-sidebar-collapsed', String(collapsed));
  };

  return (
    <AppProvider>
      <PwaRegister />
      <div className="app-shell flex min-h-screen bg-background">
        {!sidebarCollapsed && (
          <Sidebar
            onToggle={() => setSidebarVisibility(true)}
            onOpenQuickEntry={() => setQuickEntryOpen(true)}
            onOpenChat={() => setChatOpen(true)}
            onOpenLocalData={() => setLocalDataOpen(true)}
            onOpenCats={() => setCatProfileOpen(true)}
          />
        )}
        {sidebarCollapsed && (
          <FloatingPawButton onClick={() => setSidebarVisibility(false)} />
        )}
        <main className="app-main flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 transition-all duration-300">
          <div className={pathname === '/procurement' ? 'mx-auto w-full max-w-[1800px]' : 'mx-auto max-w-[1200px]'}>
            {children}
          </div>
        </main>
        <ChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
        <QuickEntryDialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen} />
        <LocalDataDialog open={localDataOpen} onClose={() => setLocalDataOpen(false)} />
        <CatProfileDialog open={catProfileOpen} onOpenChange={setCatProfileOpen} />
      </div>
    </AppProvider>
  );
}
