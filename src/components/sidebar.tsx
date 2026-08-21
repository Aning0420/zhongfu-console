'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', emoji: '🏠', label: '总览' },
  { href: '/procurement', emoji: '📦', label: '采购' },
  { href: '/feeding', emoji: '🍽️', label: '喂食' },
  { href: '/health', emoji: '🏥', label: '健康' },
  { href: '/expenses', emoji: '💰', label: '支出' },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenChat: () => void;
}

export default function Sidebar({ collapsed, onToggle, onOpenChat }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 z-40 h-screen w-[74px] shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col items-center">
      {/* Toggle Button (top) */}
      <div className="flex items-center justify-center h-14 w-full border-b border-sidebar-border shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-sidebar-accent transition-colors"
          title="收起侧边栏"
        >
          <span className="text-xl">🐾</span>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-1 py-4 w-full px-2">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center w-[58px] h-[54px] rounded-xl text-center transition-all duration-150 btn-press group',
                isActive
                  ? 'bg-accent/15 shadow-[0_1px_4px_rgba(92,184,228,0.15)]'
                  : 'hover:bg-sidebar-accent'
              )}
              title={item.label}
            >
              <span className="text-lg leading-none">{item.emoji}</span>
              <span className={cn(
                'text-[10px] mt-1 leading-none font-medium transition-colors',
                isActive ? 'text-accent-foreground' : 'text-muted-foreground group-hover:text-foreground'
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Chat Button */}
      <button
        onClick={onOpenChat}
        className="flex flex-col items-center justify-center w-[58px] h-[48px] rounded-xl hover:bg-secondary transition-all duration-150 btn-press mb-1"
        title="对话助手"
      >
        <span className="text-lg leading-none">💬</span>
        <span className="text-[10px] mt-1 leading-none font-medium text-muted-foreground">助手</span>
      </button>

    </aside>
  );
}

/* Floating Paw Button - shown when sidebar is collapsed */
export function FloatingPawButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed top-4 left-4 z-50 w-12 h-12 rounded-full bg-accent/90 text-white shadow-[0_4px_16px_rgba(92,184,228,0.4)] flex items-center justify-center text-xl hover:scale-105 active:scale-95 transition-all duration-200 hover:shadow-[0_6px_20px_rgba(92,184,228,0.5)]"
      title="展开侧边栏"
    >
      🐾
    </button>
  );
}
