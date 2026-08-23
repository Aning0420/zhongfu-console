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
  ArrowRight,
  Scale,
  Utensils,
  Activity,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { calcDailyUsage } from '@/lib/store';

export default function DashboardPage() {
  const { state, toggleFeedingComplete } = useAppContext();

  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = today.slice(0, 7);

    const todayFeedings = state.feedingRecords.filter(r => r.date === today);
    const completedFeedings = todayFeedings.filter(r => r.completed).length;
    const totalFeedings = todayFeedings.length;

    const monthExpenses = state.expenses
      .filter(e => e.date.startsWith(thisMonth))
      .reduce((sum, e) => sum + e.amount, 0);

    const todayObserved = state.healthRecords.some(record => record.type === 'observation' && record.date === today);
    const dueReminders = state.healthRecords
      .filter(record => record.type === 'reminder' && !record.reminder?.completed && record.date <= today)
      .sort((a, b) => a.date.localeCompare(b.date));

    // Expiring items (within 7 days)
    const expiringItems = state.orders
      .map(order => {
        if (!order.productionDate || !order.shelfLife || order.status !== 'delivered') return null;
        const prod = new Date(`${order.productionDate}T00:00:00Z`);
        const expiry = new Date(prod.getTime() + order.shelfLife * 24 * 60 * 60 * 1000);
        const daysLeft = Math.round((expiry.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
        if (daysLeft > 7) return null;
        return { itemName: order.itemName, daysLeft, expiryDate: expiry.toISOString().split('T')[0] };
      })
      .filter((item): item is { itemName: string; daysLeft: number; expiryDate: string } => item !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    // Repurchase items (depletion within 7 days)
    const repurchaseItems = state.orders
      .filter(o => o.status === 'delivered')
      .map(order => {
        const remaining = order.quantity - order.consumed;
        const dailyUsage = order.dailyUsage && order.dailyUsage > 0
          ? order.dailyUsage
          : calcDailyUsage(order.itemName, state.feedingRecords);
        if (remaining <= 0) {
          return { itemName: order.itemName, daysLeft: 0, depletionDate: new Date().toISOString().split('T')[0], dailyUsage: dailyUsage || 0, remaining: 0 };
        }
        if (remaining > 0 && (!dailyUsage || dailyUsage <= 0)) return null;
        const daysLeft = Math.floor(remaining / dailyUsage);
        if (daysLeft < 0 || daysLeft > 7) return null;
        const depletionDate = new Date(new Date().getTime() + daysLeft * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        return { itemName: order.itemName, daysLeft, depletionDate, dailyUsage, remaining };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return { completedFeedings, totalFeedings, monthExpenses, expiringItems, repurchaseItems, todayObserved, dueReminders };
  }, [state]);

  const todayCare = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const mealOrder = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
    return state.feedingRecords
      .filter(record => record.date === today)
      .sort((a, b) => mealOrder[a.mealType] - mealOrder[b.mealType]);
  }, [state.feedingRecords]);

  const latestWeight = useMemo(() => {
    return state.healthRecords
      .filter(record => record.type === 'weight' && record.weight)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [state.healthRecords]);

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
        text: `${r.type === 'visit' ? '就医' : r.type === 'medication' ? '用药' : r.type === 'weight' ? '体重' : r.type === 'observation' ? '健康观察' : '照护提醒'}：${r.title}`,
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
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">你好，欢迎回来</h1>
          <p className="text-sm text-muted-foreground mt-1">这是钟福今天的状态概览</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/15">
          <CalendarHeart className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-primary-foreground">照护数据已保存</span>
        </div>
      </div>

      {/* Daily care comes first: this is the primary repeat workflow. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)] gap-4">
        <section className="card-warm p-5">
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <Utensils className="w-4 h-4 text-primary-foreground" />
                <h2 className="text-base font-semibold text-foreground">今日照护</h2>
              </div>
              <p className="text-xs text-muted-foreground mt-1">先完成今天的记录，统计会自动更新</p>
            </div>
            <span className="text-sm font-semibold text-primary-foreground whitespace-nowrap">
              {stats.completedFeedings}/{stats.totalFeedings || 0} 已完成
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-4">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${stats.totalFeedings ? (stats.completedFeedings / stats.totalFeedings) * 100 : 0}%` }}
            />
          </div>

          {todayCare.length > 0 ? (
            <div className="divide-y divide-border/60">
              {todayCare.map(record => (
                <div key={record.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <button
                    type="button"
                    onClick={() => toggleFeedingComplete(record.id)}
                    className={cn(
                      'w-7 h-7 rounded-full border flex items-center justify-center transition-colors shrink-0',
                      record.completed
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-primary'
                    )}
                    title={record.completed ? '标记为未完成' : '完成打卡'}
                  >
                    {record.completed ? <CheckCircle2 className="w-4 h-4" /> : <span className="w-2 h-2 rounded-full bg-muted-foreground/35" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm font-medium', record.completed ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      {record.mealType === 'breakfast' ? '早餐' : record.mealType === 'lunch' ? '午餐' : record.mealType === 'dinner' ? '晚餐' : '零食'} · {record.foodName}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{record.amount}{record.note ? ` · ${record.note}` : ''}</p>
                  </div>
                  {record.eatingSpeed && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {record.eatingSpeed === 'fast' ? '爱吃' : record.eatingSpeed === 'slow' ? '挑食' : '正常'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-lg bg-muted/35 px-4 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">今天还没有喂食记录</p>
                <p className="text-xs text-muted-foreground mt-1">使用左侧“记录”可直接完成一次喂食打卡</p>
              </div>
              <a href="/feeding" className="text-xs font-medium text-primary-foreground hover:underline shrink-0">查看日历</a>
            </div>
          )}

          <a href="/feeding" className="inline-flex items-center gap-1 text-xs font-medium text-primary-foreground mt-4 hover:underline">
            管理今天的喂食 <ArrowRight className="w-3 h-3" />
          </a>
        </section>

        <section className="card-warm p-5">
          <h2 className="text-base font-semibold text-foreground mb-4">需要关注</h2>
          <div className="space-y-1">
            <AttentionRow
              icon={RefreshCw}
              label="需要补货"
              value={stats.repurchaseItems.length ? `${stats.repurchaseItems.length} 项` : '暂无'}
              tone={stats.repurchaseItems.length ? 'text-[#D4915E]' : 'text-primary-foreground'}
              href="/procurement"
            />
            <AttentionRow
              icon={Timer}
              label="7 天内到期"
              value={stats.expiringItems.length ? `${stats.expiringItems.length} 项` : '暂无'}
              tone={stats.expiringItems.length ? 'text-destructive' : 'text-primary-foreground'}
              href="/procurement"
            />
            <AttentionRow
              icon={Scale}
              label="最近体重"
              value={latestWeight?.weight ? `${latestWeight.weight} kg` : '未记录'}
              tone="text-accent-foreground"
              href="/health?tab=weight"
            />
            <AttentionRow
              icon={Activity}
              label="今日健康观察"
              value={stats.todayObserved ? '已记录' : '待记录'}
              tone={stats.todayObserved ? 'text-primary-foreground' : 'text-[#D4915E]'}
              href="/health"
            />
            <AttentionRow
              icon={Bell}
              label="到期照护提醒"
              value={stats.dueReminders.length ? `${stats.dueReminders.length} 项` : '暂无'}
              tone={stats.dueReminders.length ? 'text-destructive' : 'text-primary-foreground'}
              href="/health?tab=reminders"
            />
          </div>
        </section>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={CalendarHeart}
          label="今日喂食"
          value={`${stats.completedFeedings}/${stats.totalFeedings}`}
          sub={stats.totalFeedings === 0 ? '尚未记录' : stats.completedFeedings === stats.totalFeedings ? '已全部完成' : '待完成'}
          color={stats.totalFeedings > 0 && stats.completedFeedings === stats.totalFeedings ? 'text-primary-foreground' : 'text-accent'}
          bgColor={stats.totalFeedings > 0 && stats.completedFeedings === stats.totalFeedings ? 'bg-primary/8' : 'bg-accent/8'}
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
                  {item.daysLeft < 0 ? `已过期${Math.abs(item.daysLeft)}天` : item.daysLeft === 0 ? '今天到期' : `还剩${item.daysLeft}天`}
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

function AttentionRow({ icon: Icon, label, value, tone, href }: { icon: React.ElementType; label: string; value: string; tone: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/40 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
        <Icon className={cn('w-4 h-4', tone)} />
      </div>
      <span className="text-sm text-muted-foreground flex-1">{label}</span>
      <span className={cn('text-sm font-semibold', tone)}>{value}</span>
      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
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
