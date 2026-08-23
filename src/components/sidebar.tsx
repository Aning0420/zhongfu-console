'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { CirclePlus, Database } from 'lucide-react';

const navItems = [
  { href: '/', emoji: '🏠', label: '总览' },
  { href: '/procurement', emoji: '📦', label: '采购' },
  { href: '/feeding', emoji: '🍽️', label: '喂食' },
  { href: '/health', emoji: '🏥', label: '健康' },
  { href: '/expenses', emoji: '💰', label: '支出' },
];

interface SidebarProps {
  onToggle: () => void;
  onOpenQuickEntry: () => void;
  onOpenChat: () => void;
  onOpenLocalData: () => void;
}

export default function Sidebar({ onToggle, onOpenQuickEntry, onOpenChat, onOpenLocalData }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="app-sidebar sticky top-0 z-40 h-screen w-[74px] shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col items-center">
      {/* Sidebar visibility */}
      <div className="flex items-center justify-center h-14 w-full border-b border-sidebar-border shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-10 h-10 rounded-xl hover:bg-sidebar-accent transition-colors"
          title="收起侧边栏"
          aria-label="收起侧边栏"
        >
          <span className="text-xl leading-none" aria-hidden="true">🐾</span>
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

      <button
        onClick={onOpenLocalData}
        className="flex h-[48px] w-[58px] flex-col items-center justify-center rounded-xl transition-all duration-150 btn-press hover:bg-sidebar-accent"
        title="本机数据与备份"
      >
        <Database className="h-5 w-5 text-muted-foreground" />
        <span className="mt-1 text-[10px] font-medium leading-none text-muted-foreground">数据</span>
      </button>

      <button
        onClick={onOpenQuickEntry}
        className="flex flex-col items-center justify-center w-[58px] h-[48px] rounded-xl bg-primary/15 hover:bg-primary/25 transition-all duration-150 btn-press mb-1"
        title="快速记录"
      >
        <CirclePlus className="w-5 h-5 text-primary-foreground" />
        <span className="text-[10px] mt-1 leading-none font-medium text-primary-foreground">记录</span>
      </button>

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

/* Floating expand button - shown when sidebar is collapsed */
export function FloatingPawButton({ onClick }: { onClick: () => void }) {
  const buttonSize = 44;
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0 });
  const [position, setPosition] = useState({ x: 16, y: 160 });

  useEffect(() => {
    const clamp = (x: number, y: number) => ({
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - buttonSize - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - buttonSize - 8)),
    });
    const saved = localStorage.getItem('zhongfu-sidebar-paw-position');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { x?: number; y?: number };
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          setPosition(clamp(parsed.x, parsed.y));
          return;
        }
      } catch {
        // Ignore an invalid saved position.
      }
    }
    setPosition(clamp(16, window.innerHeight / 2 - buttonSize / 2));
  }, []);

  const updatePosition = (clientX: number, clientY: number) => {
    const x = Math.min(Math.max(8, clientX - dragRef.current.offsetX), Math.max(8, window.innerWidth - buttonSize - 8));
    const y = Math.min(Math.max(8, clientY - dragRef.current.offsetY), Math.max(8, window.innerHeight - buttonSize - 8));
    const nextPosition = { x, y };
    setPosition(nextPosition);
    return nextPosition;
  };

  return (
    <button
      onPointerDown={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        dragRef.current = {
          active: true,
          moved: false,
          startX: event.clientX,
          startY: event.clientY,
          offsetX: event.clientX - rect.left,
          offsetY: event.clientY - rect.top,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (!dragRef.current.active) return;
        if (!dragRef.current.moved && Math.hypot(event.clientX - dragRef.current.startX, event.clientY - dragRef.current.startY) < 4) return;
        dragRef.current.moved = true;
        updatePosition(event.clientX, event.clientY);
      }}
      onPointerUp={event => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (dragRef.current.moved) {
          const finalPosition = updatePosition(event.clientX, event.clientY);
          localStorage.setItem('zhongfu-sidebar-paw-position', JSON.stringify(finalPosition));
        }
      }}
      onClick={() => {
        if (!dragRef.current.moved) onClick();
      }}
      className="fixed z-50 w-11 h-11 touch-none select-none rounded-full bg-accent/90 text-white shadow-[0_4px_16px_rgba(92,184,228,0.35)] flex items-center justify-center hover:scale-105 active:scale-95 transition-[transform,box-shadow] duration-200 hover:shadow-[0_6px_20px_rgba(92,184,228,0.45)] cursor-grab active:cursor-grabbing"
      style={{ left: position.x, top: position.y }}
      title="拖动猫爪调整位置，点击展开侧边栏"
      aria-label="展开侧边栏，可拖动调整位置"
    >
      <span className="text-xl leading-none" aria-hidden="true">🐾</span>
    </button>
  );
}
