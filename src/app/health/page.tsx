'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Activity, Bell, Plus, Stethoscope, Pill, Scale, TrendingUp, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthRecord, Expense } from '@/lib/store';
import { HealthObservationPanel } from '@/components/health-observation-panel';
import { CareReminderPanel } from '@/components/care-reminder-panel';

function inclusiveDays(startDate: string, endDate?: string) {
  if (!endDate) return 1;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function durationLabel(record: HealthRecord) {
  const days = inclusiveDays(record.date, record.endDate);
  const prefix = /住院/.test(`${record.title}${record.detail}`) ? '住院' : '持续';
  return `${prefix} ${days} 天`;
}

export default function HealthPage() {
  const { state, addHealthRecord, deleteHealthRecord, addExpense } = useAppContext();
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState('observations');

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab && ['observations', 'reminders', 'visits', 'medications', 'weight'].includes(requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, []);

  const visitRecords = useMemo(() =>
    state.healthRecords.filter(r => r.type === 'visit').sort((a, b) => b.date.localeCompare(a.date)),
    [state.healthRecords]
  );

  const medicationRecords = useMemo(() =>
    state.healthRecords.filter(r => r.type === 'medication').sort((a, b) => b.date.localeCompare(a.date)),
    [state.healthRecords]
  );

  const weightRecords = useMemo(() =>
    state.healthRecords.filter(r => r.type === 'weight' && r.weight).sort((a, b) => a.date.localeCompare(b.date)),
    [state.healthRecords]
  );

  const observationRecords = useMemo(() =>
    state.healthRecords.filter(r => r.type === 'observation').sort((a, b) => b.date.localeCompare(a.date)),
    [state.healthRecords]
  );

  const reminderRecords = useMemo(() =>
    state.healthRecords.filter(r => r.type === 'reminder'),
    [state.healthRecords]
  );

  const today = new Date().toISOString().split('T')[0];
  const todayObserved = observationRecords.some(record => record.date === today);
  const dueReminders = reminderRecords.filter(record => !record.reminder?.completed && record.date <= today).length;

  const latestWeight = weightRecords.length > 0 ? weightRecords[weightRecords.length - 1].weight : 0;
  const weightChange = weightRecords.length >= 2
    ? (weightRecords[weightRecords.length - 1].weight! - weightRecords[weightRecords.length - 2].weight!)
    : 0;

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">健康管理</h1>
          <p className="text-sm text-muted-foreground mt-1">日常观察、照护提醒、就医用药与体重趋势</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 新增记录
            </Button>
          </DialogTrigger>
          <AddHealthDialog onClose={() => setShowAdd(false)} onAdd={addHealthRecord} addExpense={addExpense} />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button type="button" onClick={() => setActiveTab('observations')} aria-pressed={activeTab === 'observations'} className={cn('card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', activeTab === 'observations' && 'border-primary/45 bg-primary/5')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">今日观察</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{todayObserved ? '已记录' : '待记录'}</p>
        </button>
        <button type="button" onClick={() => setActiveTab('reminders')} aria-pressed={activeTab === 'reminders'} className={cn('card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', activeTab === 'reminders' && 'border-primary/45 bg-primary/5')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent/8 flex items-center justify-center">
              <Bell className="w-4 h-4 text-accent" />
            </div>
            <span className="text-xs text-muted-foreground">到期提醒</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{dueReminders}</p>
        </button>
        <button type="button" onClick={() => setActiveTab('weight')} aria-pressed={activeTab === 'weight'} className={cn('card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', activeTab === 'weight' && 'border-primary/45 bg-primary/5')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">最新体重</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-xl sm:text-2xl font-bold text-foreground">{latestWeight || '--'}kg</p>
            {weightChange !== 0 && (
              <span className={cn('text-xs font-medium', weightChange > 0 ? 'text-accent' : 'text-primary')}>
                {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}kg
              </span>
            )}
          </div>
        </button>
        <button type="button" onClick={() => setActiveTab('visits')} aria-pressed={activeTab === 'visits'} className={cn('card-warm p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40', activeTab === 'visits' && 'border-primary/45 bg-primary/5')}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-destructive/8 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">就医记录</span>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-foreground">{visitRecords.length}</p>
        </button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto bg-muted/50">
          <TabsTrigger value="observations">每日观察</TabsTrigger>
          <TabsTrigger value="reminders">照护提醒</TabsTrigger>
          <TabsTrigger value="visits">就医记录</TabsTrigger>
          <TabsTrigger value="medications">用药管理</TabsTrigger>
          <TabsTrigger value="weight">体重曲线</TabsTrigger>
        </TabsList>

        <TabsContent value="observations">
          <HealthObservationPanel records={observationRecords} />
        </TabsContent>

        <TabsContent value="reminders">
          <CareReminderPanel records={reminderRecords} />
        </TabsContent>

        <TabsContent value="visits" className="space-y-3">
          {visitRecords.map(record => (
            <div key={record.id} className="card-warm p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-destructive/8 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-4 h-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{record.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{record.detail}</p>
                    {record.hospital && (
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {record.hospital}{record.doctor ? ` · ${record.doctor}` : ''}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                  <div className="text-left sm:text-right">
                    <p className="text-xs text-muted-foreground">
                      {record.endDate ? `${record.date} 至 ${record.endDate}` : record.date}
                    </p>
                    {record.endDate && (
                      <span className="mt-1 inline-flex rounded-full bg-destructive/8 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        {durationLabel(record)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => { if (confirm('确定删除该记录？')) deleteHealthRecord(record.id); }}
                    className="w-6 h-6 rounded-full border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-all"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {visitRecords.length === 0 && <EmptyState text="暂无就医记录" />}
        </TabsContent>

        <TabsContent value="medications" className="space-y-3">
          {medicationRecords.map(record => (
            <div key={record.id} className="card-warm p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#87CEEB]/8 flex items-center justify-center shrink-0">
                    <Pill className="w-4 h-4 text-[#87CEEB]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{record.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{record.detail}</p>
                  </div>
                </div>
                <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
                  <span className="text-xs text-muted-foreground">{record.date}</span>
                  <button
                    onClick={() => { if (confirm('确定删除该记录？')) deleteHealthRecord(record.id); }}
                    className="w-6 h-6 rounded-full border border-destructive/30 text-destructive flex items-center justify-center hover:bg-destructive/10 transition-all"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {medicationRecords.length === 0 && <EmptyState text="暂无用药记录" />}
        </TabsContent>

        <TabsContent value="weight">
          <WeightChart records={weightRecords} onDelete={deleteHealthRecord} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WeightChart({ records, onDelete }: { records: HealthRecord[]; onDelete: (id: string) => void }) {
  if (records.length === 0) return <EmptyState text="暂无体重记录" />;

  const weights = records.map(r => r.weight!);
  const minW = Math.floor(Math.min(...weights) - 0.5);
  const maxW = Math.ceil(Math.max(...weights) + 0.5);
  const range = maxW - minW || 1;

  const chartW = 500;
  const chartH = 200;
  const padX = 50;
  const padY = 30;
  const plotW = chartW - padX * 2;
  const plotH = chartH - padY * 2;

  const points = records.map((r, i) => ({
    x: padX + (records.length === 1 ? plotW / 2 : (i / (records.length - 1)) * plotW),
    y: padY + plotH - ((r.weight! - minW) / range) * plotH,
    weight: r.weight!,
    date: r.date,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${padY + plotH} L ${points[0].x} ${padY + plotH} Z`;

  return (
    <div className="card-warm overflow-hidden">
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">体重趋势</h3>
        </div>
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full min-w-[420px] max-w-[500px] mx-auto">
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
              const y = padY + plotH * (1 - ratio);
              const val = (minW + range * ratio).toFixed(1);
              return (
                <g key={ratio}>
                  <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#F0E8E6" strokeWidth="1" />
                  <text x={padX - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-muted-foreground">{val}</text>
                </g>
              );
            })}
            {/* Area */}
            <path d={areaD} fill="url(#weightGradient)" opacity="0.3" />
            {/* Line */}
            <path d={pathD} fill="none" stroke="#87CEEB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Points */}
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r="4" fill="#87CEEB" stroke="white" strokeWidth="2" />
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-foreground font-medium">{p.weight}kg</text>
                <text x={p.x} y={padY + plotH + 16} textAnchor="middle" className="text-[9px] fill-muted-foreground">{p.date.slice(5)}</text>
              </g>
            ))}
            <defs>
              <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#87CEEB" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#87CEEB" stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>

      <div className="border-t border-border/60">
        <div className="px-5 py-3">
          <h3 className="text-sm font-semibold text-foreground">体重记录</h3>
        </div>
        <div className="divide-y divide-border/60">
          {[...records].reverse().map(record => (
            <div key={record.id} className="flex min-h-14 items-center gap-3 px-5 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8">
                  <Scale className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold text-foreground">{record.weight}kg</span>
                    <span className="text-xs text-muted-foreground">{record.date}</span>
                  </div>
                  {record.detail && <p className="truncate text-xs text-muted-foreground mt-0.5">{record.detail}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { if (confirm(`确定删除 ${record.date} 的体重记录吗？`)) onDelete(record.id); }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                title="删除体重记录"
                aria-label={`删除 ${record.date} 的体重记录`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground text-sm">{text}</div>
  );
}

function AddHealthDialog({ onClose, onAdd, addExpense }: { onClose: () => void; onAdd: (record: Omit<HealthRecord, 'id'>) => void; addExpense?: (expense: Omit<Expense, 'id'>) => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    endDate: '',
    type: 'visit' as HealthRecord['type'],
    title: '',
    detail: '',
    weight: '',
    hospital: '',
    doctor: '',
    amount: '',
    syncExpense: true,
  });

  const handleSubmit = () => {
    const isWeight = form.type === 'weight';
    const weight = Number(form.weight);
    const invalidWeight = isWeight && (!Number.isFinite(weight) || weight <= 0);
    if ((!isWeight && !form.title.trim()) || invalidWeight || (form.type === 'visit' && form.endDate && form.endDate < form.date)) return;

    const title = isWeight ? '体重记录' : form.title.trim();
    onAdd({
      date: form.date,
      endDate: form.type === 'visit' && form.endDate ? form.endDate : undefined,
      type: form.type,
      title,
      detail: isWeight ? '' : form.detail.trim(),
      weight: isWeight ? weight : undefined,
      hospital: form.type === 'visit' ? form.hospital || undefined : undefined,
      doctor: form.type === 'visit' ? form.doctor || undefined : undefined,
    });
    if (form.type === 'visit' && form.syncExpense && form.amount && Number(form.amount) > 0 && addExpense) {
      addExpense({
        date: form.date,
        category: 'medical',
        amount: Number(form.amount),
        description: `${title}${form.detail ? ' - ' + form.detail : ''}`,
        relatedModule: 'health',
      });
    }
    onClose();
  };

  return (
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <DialogTitle>新增健康记录</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 pt-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>{form.type === 'visit' ? '开始日期' : '日期'}</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>类型</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as HealthRecord['type'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visit">就医记录</SelectItem>
                <SelectItem value="medication">用药记录</SelectItem>
                <SelectItem value="weight">体重记录</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {form.type === 'visit' && (
          <div className="space-y-1.5">
            <Label>结束日期（可选）</Label>
            <Input
              type="date"
              min={form.date}
              value={form.endDate}
              onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))}
            />
            {form.endDate && form.endDate < form.date && (
              <p className="text-xs text-destructive">结束日期不能早于开始日期</p>
            )}
            <p className="text-xs text-muted-foreground">住院或连续治疗时填写；单次就诊可以留空。</p>
          </div>
        )}
        {form.type !== 'weight' && (
          <>
            <div className="space-y-1.5">
              <Label>标题</Label>
              <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="如：年度体检" />
            </div>
            <div className="space-y-1.5">
              <Label>详情（可选）</Label>
              <Input value={form.detail} onChange={e => setForm(p => ({ ...p, detail: e.target.value }))} placeholder="详细描述" />
            </div>
          </>
        )}
        {form.type === 'weight' && (
          <div className="space-y-1.5">
            <Label>体重（kg）</Label>
            <Input
              type="number"
              inputMode="decimal"
              min="0.1"
              step="0.1"
              value={form.weight}
              onChange={e => setForm(p => ({ ...p, weight: e.target.value }))}
              placeholder="如：4.5"
            />
          </div>
        )}
        {form.type === 'visit' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>医院</Label>
                <Input value={form.hospital} onChange={e => setForm(p => ({ ...p, hospital: e.target.value }))} placeholder="医院名称" />
              </div>
              <div className="space-y-1.5">
                <Label>医生</Label>
                <Input value={form.doctor} onChange={e => setForm(p => ({ ...p, doctor: e.target.value }))} placeholder="医生姓名" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>金额 (¥)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="如：500" />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="sync-expense" checked={form.syncExpense} onCheckedChange={checked => setForm(p => ({ ...p, syncExpense: checked === true }))} />
              <Label htmlFor="sync-expense" className="text-sm cursor-pointer">同步记录到支出记账</Label>
            </div>
          </>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button
            onClick={handleSubmit}
            disabled={
              (form.type !== 'weight' && !form.title.trim())
              || (form.type === 'weight' && (!Number.isFinite(Number(form.weight)) || Number(form.weight) <= 0))
              || (form.type === 'visit' && !!form.endDate && form.endDate < form.date)
            }
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >确认</Button>
        </div>
      </div>
    </DialogContent>
  );
}
