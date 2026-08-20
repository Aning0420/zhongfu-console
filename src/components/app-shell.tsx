'use client';

import React, { useState } from 'react';
import { AppProvider } from '@/components/providers';
import Sidebar, { FloatingPawButton } from '@/components/sidebar';
import ChatDialog from '@/components/chat-dialog';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <AppProvider>
      <div className="flex min-h-screen bg-background">
        {!sidebarCollapsed && (
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(true)}
            onOpenChat={() => setChatOpen(true)}
          />
        )}
        {sidebarCollapsed && (
          <FloatingPawButton onClick={() => setSidebarCollapsed(false)} />
        )}
        <main className="flex-1 p-6 transition-all duration-300 min-w-0">
          <div className="max-w-[1200px] mx-auto">
            {children}
          </div>
        </main>
        <ChatDialog open={chatOpen} onClose={() => setChatOpen(false)} />
      </div>
    </AppProvider>
  );
}
