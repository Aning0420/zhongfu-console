'use client';

import React, { useEffect, useState } from 'react';
import { AppProvider } from '@/components/providers';
import Sidebar, { FloatingPawButton } from '@/components/sidebar';
import { ChatDialog } from '@/components/chat-dialog';
import { QuickEntryDialog } from '@/components/quick-entry-dialog';
import { PwaRegister } from '@/components/pwa-register';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('zhongfu-sidebar-collapsed');
    if (saved !== null) {
      setSidebarCollapsed(saved === 'true');
      return;
    }
    setSidebarCollapsed(window.matchMedia('(max-width: 640px)').matches);
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
          />
        )}
        {sidebarCollapsed && (
          <FloatingPawButton onClick={() => setSidebarVisibility(false)} />
        )}
        <main className="app-main flex-1 min-w-0 overflow-x-hidden p-4 sm:p-6 transition-all duration-300">
          <div className="max-w-[1200px] mx-auto">
            {children}
          </div>
        </main>
        <ChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
        <QuickEntryDialog open={quickEntryOpen} onOpenChange={setQuickEntryOpen} />
      </div>
    </AppProvider>
  );
}
