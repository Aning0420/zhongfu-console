'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Check, Coffee, Sun, Moon, Candy, Zap, Minus, Snail, Heart, Trash2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { conciseFeedingNote, type FeedingPlanStage, type FeedingRecord } from '@/lib/store';
import { FeedingPlanManager } from '@/components/feeding-plan-manager';

const mealIcons = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Candy,
};

const mealLabels = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '零食',
};

const eatingSpeedConfig = {
  fast: { label: '爱吃', icon: Zap, color: 'text-primary', bg: 'bg-primary/10', emoji: '😋' },
  normal: { label: '正常', icon: Minus, color: 'text-accent', bg: 'bg-accent/10', emoji: '😐' },
  slow: { label: '挑食', icon: Snail, color: 'text-[#E88888]', bg: 'bg-[#E88888]/10', emoji: '😒' },
};

function mealTypeForTime(time: string): FeedingRecord['mealType'] {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'breakfast';
  if (hour < 18) return 'lunch';
  return 'dinner';
}

function stageForDate(stages: FeedingPlanStage[], date: string) {
  return stages.find(stage => stage.startDate <= date && stage.endDate >= date);
}

function planMealAmount(food: string): string {
  const amounts = food.match(/\d+(?:\.\d+)?\s*(?:g|克|ml|毫升)/gi);
  return amounts?.join(' + ') || '按计划';
}

function daysBetween(startDate: string, date: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const current = new Date(`${date}T00:00:00Z`).getTime();
  return Math.floor((current - start) / 86_400_000) + 1;
}

function mealFoodForDate(stage: FeedingPlanStage, date: string, fallback: string): string {
  if (fallback !== '按本阶段说明执行') return fallback;
  const stageDay = daysBetween(stage.startDate, date);
  const rules = [...stage.description.matchAll(/第\s*(\d+)\s*(?:[～~\-至]\s*(\d+))?\s*天(?:起)?\s*[｜|]\s*([^\n]+)/g)];
  const matchingRule = rules.find(rule => {
    const start = Number(rule[1]);
    const end = Number(rule[2] || rule[1]);
    return stageDay >= start && stageDay <= end;
  });
  if (!matchingRule) return fallback;
  const dailyFood = matchingRule[3].trim().replace(/^每餐/, '');
  const fixedMilk = stage.description.match(/每餐奶液固定为\s*([^\n]+)/)?.[1]?.trim();
  return [dailyFood, fixedMilk].filter(Boolean).join('；');
}

export default function FeedingPage() {
  const { state, addFeedingRecord, syncPlannedFeedingRecords, toggleFeedingComplete, deleteFeedingRecord } = useAppContext();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showAdd, setShowAdd] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [view, setView] = useState<'records' | 'plans'>('records');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const days: (Date | null)[] = [];

    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d));

    return days;
  }, [year, month]);

  const recordsByDate = useMemo(() => {
    const map: Record<string, FeedingRecord[]> = {};
    state.feedingRecords.forEach(r => {
      if (!map[r.date]) map[r.date] = [];
      map[r.date].push(r);
    });
    return map;
  }, [state.feedingRecords]);

  const todayRecords = recordsByDate[selectedDate] || [];
  const activePlan = state.feedingPlans.find(plan => plan.active);
  const activeStage = activePlan ? stageForDate(activePlan.stages, selectedDate) : undefined;

  useEffect(() => {
    if (!activePlan || !activeStage) return;
    const plannedRecords = activeStage.mealSchedule.map(meal => {
      const mealType = mealTypeForTime(meal.time);
      const foodName = mealFoodForDate(activeStage, selectedDate, meal.food);
      const note = meal.note.trim();
      return {
        date: selectedDate,
        mealType,
        foodName,
        amount: planMealAmount(`${foodName} ${meal.note}`),
        completed: false,
        note,
        plannedTime: meal.time,
        planId: activePlan.id,
        planStageId: activeStage.id,
      };
    });
    syncPlannedFeedingRecords(selectedDate, activePlan.id, plannedRecords);
  }, [activePlan, activeStage, selectedDate, syncPlannedFeedingRecords]);
  const previousDate = useMemo(() => {
    const date = new Date(`${selectedDate}T12:00:00`);
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
  }, [selectedDate]);
  const previousDayRecords = recordsByDate[previousDate] || [];

  const copyPreviousDay = () => {
    if (todayRecords.length > 0) return;
    previousDayRecords.forEach(record => {
      addFeedingRecord({
        date: selectedDate,
        mealType: record.mealType,
        foodName: record.foodName,
        amount: record.amount,
        completed: false,
        note: '',
      });
    });
  };

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
  };

  const formatDateStr = (d: Date) => d.toISOString().split('T')[0];

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">喂食管理</h1>
          <p className="text-sm text-muted-foreground mt-1">安排喂食计划，记录每天的完成情况</p>
        </div>
        {view === 'records' && <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 记录喂食
            </Button>
          </DialogTrigger>
          <AddFeedingDialog key={selectedDate} defaultDate={selectedDate} onClose={() => setShowAdd(false)} onAdd={addFeedingRecord} />
        </Dialog>}
      </div>

      <div className="inline-flex rounded-lg bg-muted/50 p-1" role="tablist" aria-label="喂食管理视图">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'records'}
          onClick={() => setView('records')}
          className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', view === 'records' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >每日记录</button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'plans'}
          onClick={() => setView('plans')}
          className={cn('rounded-md px-4 py-2 text-sm font-medium transition-colors', view === 'plans' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >喂食计划</button>
      </div>

      {view === 'records' ? <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 card-warm p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-foreground">
              {year}年{month + 1}月
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="w-8 h-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToday} className="text-xs px-2 h-8">
                今天
              </Button>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="w-8 h-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Week Headers */}
          <div className="grid grid-cols-7 mb-2">
            {['日', '一', '二', '三', '四', '五', '六'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} />;
              const dateStr = formatDateStr(day);
              const records = recordsByDate[dateStr] || [];
              const hasPlan = Boolean(activePlan && stageForDate(activePlan.stages, dateStr));
              const allDone = records.length > 0 && records.every(r => r.completed);
              const someDone = records.some(r => r.completed);
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={dateStr}
                  onClick={() => { setSelectedDate(dateStr); }}
                  className={cn(
                    'relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all cursor-pointer select-none',
                    isSelected
                      ? 'bg-primary/20 border-2 border-primary font-bold'
                      : isToday
                        ? 'bg-secondary/45 border border-primary/40'
                        : 'hover:bg-primary/10 border border-transparent',
                  )}
                >
                  <span className={cn(
                    'text-sm',
                    isSelected ? 'font-bold text-primary-foreground' : 'text-foreground',
                  )}>
                    {day.getDate()}
                  </span>
                  {(records.length > 0 || hasPlan) && (
                    <div className="flex items-center gap-0.5 mt-0.5">
                      {allDone ? (
                        <span className="text-[10px] bounce-check">✅</span>
                      ) : someDone ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                      ) : records.length > 0 ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full border border-primary" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>✅</span> 全部完成
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" /> 部分完成
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" /> 未完成
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full border border-primary" /> 有计划
            </div>
          </div>
        </div>

        {/* Today's Records */}
        <div className="card-warm p-5">
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {selectedDate === new Date().toISOString().split('T')[0] ? '今日喂食记录' : `${selectedDate.slice(5).replace('-', '月')}日喂食记录`}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">{selectedDate}</p>
              {activePlan && activeStage && (
                <p className="mt-1 text-xs text-primary-foreground">{activePlan.name} · {activeStage.name}</p>
              )}
            </div>
            {todayRecords.length === 0 && previousDayRecords.length > 0 && (
              <Button variant="outline" size="sm" onClick={copyPreviousDay} className="h-8 shrink-0 px-2.5 text-xs">
                <Copy className="mr-1.5 h-3.5 w-3.5" />沿用前一天
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mealType => {
              const mealRecords = todayRecords.filter(r => r.mealType === mealType);
              const Icon = mealIcons[mealType];
              return (
                <div key={mealType} className="flex items-start gap-3 p-3 rounded-lg bg-muted/20">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    mealRecords.some(r => r.completed) ? 'bg-primary/10' : 'bg-muted'
                  )}>
                    <Icon className={cn('w-4 h-4', mealRecords.some(r => r.completed) ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{mealLabels[mealType]}</span>
                      {mealRecords.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleFeedingComplete(mealRecords[0].id)}
                            className={cn(
                              'w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all',
                              mealRecords[0].completed
                                ? 'bg-primary border-primary text-white'
                                : 'border-border hover:border-primary'
                            )}
                          >
                            {mealRecords[0].completed && <Check className="w-3 h-3" />}
                          </button>
                          <button
                            onClick={() => { if (confirm('确定删除该记录？')) deleteFeedingRecord(mealRecords[0].id); }}
                            className="w-5 h-5 rounded-full border-2 border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-all"
                            title="删除"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {mealRecords.length > 0 ? (
                      <div className="mt-1 space-y-2">
                        {mealRecords.map((record, recordIndex) => (
                          <div key={record.id} className={cn(recordIndex > 0 && 'border-t border-border/50 pt-2')}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="text-xs text-muted-foreground">
                                    {record.plannedTime ? `${record.plannedTime} · ` : ''}{record.foodName}{record.planId ? '' : ` · ${record.amount}`}
                                  </p>
                                  {record.planId && !record.completed && (
                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary-foreground">计划</span>
                                  )}
                                  {record.eatingSpeed && (
                                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', eatingSpeedConfig[record.eatingSpeed].bg, eatingSpeedConfig[record.eatingSpeed].color)}>
                                      {eatingSpeedConfig[record.eatingSpeed].emoji} {eatingSpeedConfig[record.eatingSpeed].label}
                                    </span>
                                  )}
                                </div>
                                {conciseFeedingNote(record) && (
                                  <p className="text-xs text-muted-foreground/70 mt-0.5">{conciseFeedingNote(record)}</p>
                                )}
                                {record.remainingAmount && (
                                  <p className="mt-0.5 text-xs text-muted-foreground/70">剩余：{record.remainingAmount}</p>
                                )}
                              </div>
                              {recordIndex > 0 && (
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    onClick={() => toggleFeedingComplete(record.id)}
                                    className={cn(
                                      'flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all',
                                      record.completed ? 'border-primary bg-primary text-white' : 'border-border hover:border-primary'
                                    )}
                                    title={record.completed ? '标记为未完成' : '标记为已完成'}
                                  >
                                    {record.completed && <Check className="h-3 w-3" />}
                                  </button>
                                  <button
                                    onClick={() => { if (confirm('确定删除该记录？')) deleteFeedingRecord(record.id); }}
                                    className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-destructive/30 text-destructive transition-all hover:bg-destructive/10"
                                    title="删除"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground/50 mt-1">未记录</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Monthly Stats */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-3">本月统计</h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-center p-2.5 rounded-lg bg-primary/5">
                <p className="text-lg font-bold text-primary">
                  {state.feedingRecords.filter(r => r.date.startsWith(selectedDate.slice(0, 7)) && r.completed).length}
                </p>
                <p className="text-xs text-muted-foreground">已完成</p>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-accent/5">
                <p className="text-lg font-bold text-accent">
                  {state.feedingRecords.filter(r => r.date.startsWith(selectedDate.slice(0, 7)) && !r.completed).length}
                </p>
                <p className="text-xs text-muted-foreground">待完成</p>
              </div>
            </div>
          </div>

          {/* Food Preference Ranking */}
          <div className="mt-5 pt-4 border-t border-border/50">
            <h3 className="text-sm font-medium text-foreground mb-3 flex items-center gap-1.5">
              <Heart className="w-3.5 h-3.5 text-primary" /> 食物喜好排行
            </h3>
            {(() => {
              const foodMap: Record<string, { fast: number; normal: number; slow: number }> = {};
              state.feedingRecords.forEach(r => {
                if (!r.eatingSpeed) return;
                if (!foodMap[r.foodName]) foodMap[r.foodName] = { fast: 0, normal: 0, slow: 0 };
                foodMap[r.foodName][r.eatingSpeed]++;
              });
              const foodList = Object.entries(foodMap).map(([name, counts]) => {
                const total = counts.fast + counts.normal + counts.slow;
                const score = (counts.fast * 2 + counts.normal * 1) / (total * 2);
                const preference: 'fast' | 'normal' | 'slow' = counts.fast > counts.slow ? 'fast' : counts.slow > counts.fast ? 'slow' : 'normal';
                return { name, ...counts, total, score, preference };
              }).sort((a, b) => b.score - a.score);

              if (foodList.length === 0) return <p className="text-xs text-muted-foreground/60">暂无数据</p>;

              return (
                <div className="space-y-2">
                  {foodList.map(food => {
                    const config = eatingSpeedConfig[food.preference];
                    return (
                      <div key={food.name} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                        <span className="text-sm">{config.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground truncate">{food.name}</span>
                            <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', config.bg, config.color)}>
                              {config.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                              <div className="h-full flex">
                                <div className="bg-primary" style={{ width: `${(food.fast / food.total) * 100}%` }} />
                                <div className="bg-accent" style={{ width: `${(food.normal / food.total) * 100}%` }} />
                                <div className="bg-[#E88888]" style={{ width: `${(food.slow / food.total) * 100}%` }} />
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{food.total}次</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-3 pt-2 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />爱吃</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent" />正常</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#E88888]" />挑食</span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div> : <FeedingPlanManager />}
    </div>
  );
}

function AddFeedingDialog({ defaultDate, onClose, onAdd }: { defaultDate: string; onClose: () => void; onAdd: (record: Omit<FeedingRecord, 'id'>) => void }) {
  const [form, setForm] = useState({
    date: defaultDate,
    mealType: 'breakfast' as FeedingRecord['mealType'],
    foodName: '',
    amount: '',
    remainingAmount: '',
    note: '',
    eatingSpeed: 'normal' as FeedingRecord['eatingSpeed'],
    completed: true,
  });

  const handleSubmit = () => {
    if (!form.foodName || !form.amount) return;
    onAdd({
      ...form,
      foodName: form.foodName.trim(),
      amount: form.amount.trim(),
      remainingAmount: form.remainingAmount.trim() || undefined,
      note: form.note.trim(),
    });
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[400px]">
      <DialogHeader>
        <DialogTitle>记录喂食</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>日期</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>餐次</Label>
            <Select value={form.mealType} onValueChange={v => setForm(p => ({ ...p, mealType: v as FeedingRecord['mealType'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="breakfast">早餐</SelectItem>
                <SelectItem value="lunch">午餐</SelectItem>
                <SelectItem value="dinner">晚餐</SelectItem>
                <SelectItem value="snack">零食</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>食物名称</Label>
            <Input value={form.foodName} onChange={e => setForm(p => ({ ...p, foodName: e.target.value }))} placeholder="如：皇家猫粮" />
          </div>
          <div className="space-y-1.5">
            <Label>用量</Label>
            <Input value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="如：50g" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>剩余量（可选）</Label>
          <Input value={form.remainingAmount} onChange={e => setForm(p => ({ ...p, remainingAmount: e.target.value }))} placeholder="如：2g、半碗或无" />
        </div>
        <div className="space-y-2">
          <Label>进食速度 / 喜好程度</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['fast', 'normal', 'slow'] as const).map(speed => {
              const config = eatingSpeedConfig[speed];
              const Icon = config.icon;
              return (
                <button
                  key={speed}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, eatingSpeed: speed }))}
                  className={cn(
                    'flex items-center justify-center gap-1.5 p-2.5 rounded-lg border-2 transition-all text-sm',
                    form.eatingSpeed === speed
                      ? `${config.bg} border-current ${config.color}`
                      : 'border-border/50 hover:border-border text-muted-foreground'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span>{config.emoji} {config.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>备注</Label>
          <Input value={form.note} onChange={e => setForm(p => ({ ...p, note: e.target.value }))} placeholder="可选" />
        </div>
        <label className="flex items-center gap-2 rounded-lg bg-muted/45 px-3 py-2.5 text-sm text-muted-foreground">
          <Checkbox checked={form.completed} onCheckedChange={checked => setForm(p => ({ ...p, completed: checked === true }))} />
          已经吃完，直接完成本次打卡
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90 text-primary-foreground">确认</Button>
        </div>
      </div>
    </DialogContent>
  );
}
