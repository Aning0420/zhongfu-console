'use client';

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import {
  ShoppingCart,
  CalendarHeart,
  HeartPulse,
  Wallet,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcDailyUsage } from '@/lib/store';

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

    // Expiring items (within 7 days)
    const expiringItems = state.orders
      .map(order => {
        if (!order.productionDate || !order.shelfLife || order.status !== 'delivered') return null;
        const prod = new Date(order.productionDate);
        const expiry = new Date(prod.getTime() + order.shelfLife * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        if (daysLeft < 0 || daysLeft > 7) return null;
        return { itemName: order.itemName, daysLeft, expiryDate: expiry.toISOString().split('T')[0] };
      })
      .filter((item): item is { itemName: string; daysLeft: number; expiryDate: string } => item !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Repurchase items (depletion within 7 days)
    const repurchaseItems = state.orders
      .filter(o => o.status === 'delivered')
      .map(order => {
        const dailyUsage = calcDailyUsage(order.itemName, state.feedingRecords);
        if (!dailyUsage || dailyUsage <= 0) return null;
        const remaining = order.quantity - order.consumed;
        const daysLeft = Math.floor(remaining / dailyUsage);
        if (daysLeft < 0 || daysLeft > 7) return null;
        const depletionDate = new Date(new Date().getTime() + daysLeft * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return { itemName: order.itemName, daysLeft, depletionDate, dailyUsage, remaining };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return { completedFeedings, totalFeedings, monthExpenses, expiringItems, repurchaseItems };
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
          <CalendarHeart className="w-4 h-4 text-primary" />
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
          icon={RefreshCw}
          label="回购提醒"
          value={String(stats.repurchaseItems.length)}
          sub="项即将耗尽"
          color="text-[#D4915E]"
          bgColor="bg-[#D4915E]/8"
        />
        <StatCard
          icon={Timer}
          label="到期提醒"
          value={String(stats.expiringItems.length)}
          sub="项即将过期"
          color="text-[#E88888]"
          bgColor="bg-[#E88888]/8"
        />
      </div>

      {/* Repurchase Reminder */}
      {stats.repurchaseItems.length > 0 && (
        <div className="bg-[#D4915E]/5 border border-[#D4915E]/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw className="w-5 h-5 text-[#D4915E] shrink-0" />
            <p className="text-sm font-semibold text-foreground">回购提醒</p>
            <span className="text-xs text-muted-foreground">基于喂食记录自动计算消耗</span>
          </div>
          <div className="space-y-2">
            {stats.repurchaseItems.map(item => (
              <div key={item.itemName} className="flex items-center justify-between py-1.5 px-3 bg-white/60 rounded-lg">
                <span className="text-sm font-medium text-foreground">{item.itemName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    剩余 {item.remaining} · 日均 {item.dailyUsage.toFixed(1)}
                  </span>
                  <span className={cn(
                    'text-xs font-medium px-2 py-0.5 rounded-full',
                    item.daysLeft <= 3
                      ? 'bg-[#E88888]/10 text-[#E88888]'
                      : 'bg-[#D4915E]/10 text-[#D4915E]'
                  )}>
                    {item.daysLeft === 0 ? '今天耗尽' : `${item.daysLeft}天后耗尽`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expiry Reminder */}
      {stats.expiringItems.length > 0 && (
        <div className="bg-[#E88888]/5 border border-[#E88888]/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-[#E88888] shrink-0" />
            <p className="text-sm font-semibold text-foreground">保质期到期提醒</p>
          </div>
          <div className="space-y-2">
            {stats.expiringItems.map(item => (
              <div key={item.itemName} className="flex items-center justify-between py-1.5 px-3 bg-white/60 rounded-lg">
                <span className="text-sm font-medium text-foreground">{item.itemName}</span>
                <span className={cn(
                  'text-xs font-medium px-2 py-0.5 rounded-full',
                  item.daysLeft <= 3
                    ? 'bg-[#E88888]/10 text-[#E88888]'
                    : 'bg-[#E88888]/10 text-[#E88888]'
                )}>
                  {item.daysLeft === 0 ? '今天到期' : `还剩${item.daysLeft}天`}
                </span>
              </div>
            ))}
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
        'flex items-center gap-2 p-3 rounded-xl border transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]',
        'border-border bg-card'
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', bg)}>
        <Icon className={cn('w-4 h-4', color)} />
      </div>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </a>
  );
}

function RecentChatSection() {
  const { state } = useAppContext();
  const [showAll, setShowAll] = useState(false);

  const recentMessages = useMemo(() => {
    const userMessages = state.chatMessages.filter((m: { role: string }) => m.role === 'user');
    return userMessages.slice(-5).reverse();
  }, [state.chatMessages]);

  if (recentMessages.length === 0) return null;

  return (
    <div className="card-warm p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-primary" />
          最近对话
        </h2>
        {recentMessages.length > 3 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary hover:underline"
          >
            {showAll ? '收起' : '展开'}
          </button>
        )}
      </div>
      <div className="space-y-2">
        {(showAll ? recentMessages : recentMessages.slice(0, 3)).map((msg: { id: string; content: string; timestamp: string; synced_data?: unknown }) => (
          <div key={msg.id} className="flex items-start gap-2 py-1.5 px-3 bg-muted/30 rounded-lg">
            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
              {new Date(msg.timestamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
            </span>
            <p className="text-sm text-foreground truncate flex-1">{msg.content}</p>
            {msg.synced_data != null && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">已同步</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
