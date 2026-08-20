'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  CalendarHeart,
  HeartPulse,
  Wallet,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  PawPrint,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: '总览', icon: LayoutDashboard },
  { href: '/procurement', label: '采购总览', icon: ShoppingCart },
  { href: '/feeding', label: '喂食日历', icon: CalendarHeart },
  { href: '/health', label: '健康管理', icon: HeartPulse },
  { href: '/expenses', label: '支出记账', icon: Wallet },
];

interface SidebarProps {
  onOpenChat: () => void;
}

export default function Sidebar({ onOpenChat }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        'sticky top-0 z-40 h-screen shrink-0 bg-sidebar border-r border-border flex flex-col transition-all duration-300',
        collapsed ? 'w-[68px]' : 'w-[220px]'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <PawPrint className="w-4.5 h-4.5 text-primary" />
        </div>
        {!collapsed && (
          <span className="font-semibold text-[15px] text-foreground whitespace-nowrap">
            钟福中控台
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2.5 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 btn-press',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
              )}
            >
              <item.icon className={cn('w-[18px] h-[18px] shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Chat Button */}
      <div className="px-2.5 pb-2">
        <button
          onClick={onOpenChat}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full text-accent hover:bg-accent/10 transition-all duration-150 btn-press"
        >
          <MessageCircle className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="whitespace-nowrap">对话助手</span>}
        </button>
      </div>

      {/* Collapse Toggle */}
      <div className="px-2.5 pb-3 border-t border-border pt-2">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full py-2 rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
