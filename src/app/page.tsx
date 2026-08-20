'use client';

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import {
  ShoppingCart,
  CalendarHeart,
  HeartPulse,
  Wallet,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  PawPrint,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DashboardPage() {
  const { state } = useAppContext();

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.slice(0, 7);

    const todayFeedings = state.feedingRecords.filter(r => r.date === today);
    const completedFeedings = todayFeedings.filter(r => r.completed).length;
    const totalFeedings = todayFeedings.length;

    const monthExpenses = state.expenses
      .filter(e => e.date.startsWith(thisMonth))
      .reduce((sum, e) => sum + e.amount, 0);

    const pendingOrders = state.orders.filter(o => o.status === 'pending' || o.status === 'shipped').length;

    const lowStockItems = state.orders.filter(o => {
      const remaining = o.quantity - o.consumed;
      const ratio = remaining / o.quantity;
      return ratio < 0.3 && o.status === 'delivered';
    });

    const latestWeight = [...state.healthRecords]
      .filter(r => r.type === 'weight' && r.weight)
      .sort((a, b) => b.date.localeCompare(a.date))[0];

    return { completedFeedings, totalFeedings, monthExpenses, pendingOrders, lowStockItems, latestWeight };
  }, [state]);

  const recentActivities = useMemo(() => {
    const activities: { id: string; icon: React.ElementType; color: string; text: string; time: string }[] = [];

    state.feedingRecords
      .filter(r => r.completed)
      .slice(-3)
      .forEach(r => {
        activities.push({
          id: r.id,
          icon: CheckCircle2,
          color: 'text-primary',
          text: `完成${r.mealType === 'breakfast' ? '早餐' : r.mealType === 'lunch' ? '午餐' : r.mealType === 'dinner' ? '晚餐' : '零食'}喂食：${r.foodName}`,
          time: r.date,
        });
      });

    state.healthRecords.slice(-2).forEach(r => {
      activities.push({
        id: r.id,
        icon: HeartPulse,
        color: 'text-destructive',
        text: `${r.type === 'visit' ? '就医' : r.type === 'medication' ? '用药' : '体检'}：${r.title}`,
        time: r.date,
      });
    });

    state.orders.slice(-2).forEach(o => {
      activities.push({
        id: o.id,
        icon: ShoppingCart,
        color: 'text-accent',
        text: `采购${o.itemName} ${o.status === 'delivered' ? '已到货' : o.status === 'shipped' ? '运输中' : '待发货'}`,
        time: o.purchaseDate,
      });
    });

    return activities.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6);
  }, [state]);

  return (
    <div className="space-y-6 fade-in">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">你好，欢迎回来</h1>
          <p className="text-sm text-muted-foreground mt-1">这是钟福今天的状态概览</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/15">
          <PawPrint className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary">钟福状态良好</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarHeart}
          label="今日喂食"
          value={`${stats.completedFeedings}/${stats.totalFeedings}`}
          sub={stats.completedFeedings === stats.totalFeedings ? '已全部完成' : '待完成'}
          color={stats.completedFeedings === stats.totalFeedings ? 'text-primary' : 'text-accent'}
          bgColor={stats.completedFeedings === stats.totalFeedings ? 'bg-primary/8' : 'bg-accent/8'}
        />
        <StatCard
          icon={Wallet}
          label="本月支出"
          value={`¥${stats.monthExpenses.toLocaleString()}`}
          sub="较上月"
          trend="down"
          color="text-[#87CEEB]"
          bgColor="bg-[#87CEEB]/8"
        />
        <StatCard
          icon={ShoppingCart}
          label="待处理订单"
          value={String(stats.pendingOrders)}
          sub="件进行中"
          color="text-accent"
          bgColor="bg-accent/8"
        />
        <StatCard
          icon={HeartPulse}
          label="最新体重"
          value={stats.latestWeight ? `${stats.latestWeight.weight}kg` : '--'}
          sub={stats.latestWeight?.date || '暂无记录'}
          color="text-destructive"
          bgColor="bg-destructive/8"
        />
      </div>

      {/* Alerts */}
      {stats.lowStockItems.length > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-accent shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">物资库存预警</p>
            <p className="text-sm text-muted-foreground mt-1">
              {stats.lowStockItems.map(i => i.itemName).join('、')} 库存不足，建议及时补货
            </p>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="card-warm p-5">
        <h2 className="text-base font-semibold text-foreground mb-4">最近动态</h2>
        <div className="space-y-3">
          {recentActivities.map(activity => (
            <div key={activity.id} className="flex items-center gap-3 py-1.5">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-muted/60', activity.color)}>
                <activity.icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{activity.text}</p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{activity.time}</span>
            </div>
          ))}
          {recentActivities.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">暂无动态记录</p>
          )}
        </div>
      </div>

      {/* Recent Chat History */}
      <RecentChatSection />

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QuickAction icon={ShoppingCart} label="新建采购" href="/procurement" color="text-accent" bg="bg-accent/8" />
        <QuickAction icon={CalendarHeart} label="记录喂食" href="/feeding" color="text-primary" bg="bg-primary/8" />
        <QuickAction icon={HeartPulse} label="健康记录" href="/health" color="text-destructive" bg="bg-destructive/8" />
        <QuickAction icon={Wallet} label="记一笔支出" href="/expenses" color="text-[#87CEEB]" bg="bg-[#87CEEB]/8" />
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bgColor,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
  bgColor: string;
  trend?: 'up' | 'down';
}) {
  return (
    <div className="card-warm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bgColor)}>
          <Icon className={cn('w-4 h-4', color)} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <div className="flex items-center gap-1 mt-1">
        {trend === 'down' && <TrendingDown className="w-3 h-3 text-primary" />}
        {trend === 'up' && <TrendingUp className="w-3 h-3 text-destructive" />}
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
  color,
  bg,
}: {
  icon: React.ElementType;
  label: string;
  href: string;
  color: string;
  bg: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        'flex items-center gap-3 p-3.5 rounded-xl border border-border bg-card hover:shadow-md transition-all duration-200 btn-press'
      )}
    >
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', bg)}>
        <Icon className={cn('w-4.5 h-4.5', color)} />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </a>
  );
}

function RecentChatSection() {
  const { state } = useAppContext();

  // Get user messages (questions) with their assistant replies, most recent first
  const conversations = useMemo(() => {
    const msgs = state.chatMessages.filter(m => m.role === 'user');
    const allMsgs = state.chatMessages;
    return msgs
      .map((userMsg, idx) => {
        // Find the assistant reply that follows this user message
        const userIndex = allMsgs.findIndex(m => m.id === userMsg.id);
        const reply = userIndex >= 0 && userIndex < allMsgs.length - 1 && allMsgs[userIndex + 1].role === 'assistant'
          ? allMsgs[userIndex + 1]
          : null;
        return { user: userMsg, reply };
      })
      .reverse()
      .slice(0, 5);
  }, [state.chatMessages]);

  if (conversations.length === 0) return null;

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return '';
    }
  };

  return (
    <div className="card-warm p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="w-4 h-4 text-accent" />
        <h2 className="text-base font-semibold text-foreground">最近对话</h2>
        <span className="text-xs text-muted-foreground ml-auto">{state.chatMessages.filter(m => m.role === 'user').length} 条对话</span>
      </div>
      <div className="space-y-3">
        {conversations.map(({ user, reply }) => (
          <div key={user.id} className="flex items-start gap-3 py-1.5">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
              <MessageCircle className="w-4 h-4 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground truncate">{user.content}</p>
              </div>
              {reply && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{reply.content.split('\n')[0]}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{formatTime(user.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
