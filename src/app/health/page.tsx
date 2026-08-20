'use client';

import React, { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HeartPulse, Plus, Stethoscope, Pill, Scale, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HealthRecord } from '@/lib/store';

export default function HealthPage() {
  const { state, addHealthRecord } = useAppContext();
  const [showAdd, setShowAdd] = useState(false);

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

  const latestWeight = weightRecords.length > 0 ? weightRecords[weightRecords.length - 1].weight : 0;
  const weightChange = weightRecords.length >= 2
    ? (weightRecords[weightRecords.length - 1].weight! - weightRecords[weightRecords.length - 2].weight!)
    : 0;

  return (
    <div className="space-y-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">健康管理</h1>
          <p className="text-sm text-muted-foreground mt-1">就医记录、用药管理与体重趋势</p>
        </div>
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogTrigger asChild>
            <Button className="btn-press bg-primary hover:bg-primary/90 text-primary-foreground">
              <Plus className="w-4 h-4 mr-1.5" /> 新增记录
            </Button>
          </DialogTrigger>
          <AddHealthDialog onClose={() => setShowAdd(false)} onAdd={addHealthRecord} />
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-destructive/8 flex items-center justify-center">
              <Stethoscope className="w-4 h-4 text-destructive" />
            </div>
            <span className="text-xs text-muted-foreground">就医次数</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{visitRecords.length}</p>
        </div>
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#7BA3C9]/8 flex items-center justify-center">
              <Pill className="w-4 h-4 text-[#7BA3C9]" />
            </div>
            <span className="text-xs text-muted-foreground">用药记录</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{medicationRecords.length}</p>
        </div>
        <div className="card-warm p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary" />
            </div>
            <span className="text-xs text-muted-foreground">最新体重</span>
          </div>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold text-foreground">{latestWeight || '--'}kg</p>
            {weightChange !== 0 && (
              <span className={cn('text-xs font-medium', weightChange > 0 ? 'text-accent' : 'text-primary')}>
                {weightChange > 0 ? '+' : ''}{weightChange.toFixed(1)}kg
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="visits" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="visits">就医记录</TabsTrigger>
          <TabsTrigger value="medications">用药管理</TabsTrigger>
          <TabsTrigger value="weight">体重曲线</TabsTrigger>
        </TabsList>

        <TabsContent value="visits" className="space-y-3">
          {visitRecords.map(record => (
            <div key={record.id} className="card-warm p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
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
                <span className="text-xs text-muted-foreground shrink-0">{record.date}</span>
              </div>
            </div>
          ))}
          {visitRecords.length === 0 && <EmptyState text="暂无就医记录" />}
        </TabsContent>

        <TabsContent value="medications" className="space-y-3">
          {medicationRecords.map(record => (
            <div key={record.id} className="card-warm p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#7BA3C9]/8 flex items-center justify-center shrink-0">
                    <Pill className="w-4 h-4 text-[#7BA3C9]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{record.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{record.detail}</p>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{record.date}</span>
              </div>
            </div>
          ))}
          {medicationRecords.length === 0 && <EmptyState text="暂无用药记录" />}
        </TabsContent>

        <TabsContent value="weight">
          <WeightChart records={weightRecords} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function WeightChart({ records }: { records: HealthRecord[] }) {
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
    <div className="card-warm p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">体重趋势</h3>
      </div>
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full max-w-[500px] mx-auto">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(ratio => {
            const y = padY + plotH * (1 - ratio);
            const val = (minW + range * ratio).toFixed(1);
            return (
              <g key={ratio}>
                <line x1={padX} y1={y} x2={chartW - padX} y2={y} stroke="#EDEDEB" strokeWidth="1" />
                <text x={padX - 8} y={y + 4} textAnchor="end" className="text-[10px] fill-muted-foreground">{val}</text>
              </g>
            );
          })}
          {/* Area */}
          <path d={areaD} fill="url(#weightGradient)" opacity="0.3" />
          {/* Line */}
          <path d={pathD} fill="none" stroke="#6B9F7B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Points */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="4" fill="#6B9F7B" stroke="white" strokeWidth="2" />
              <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[9px] fill-foreground font-medium">{p.weight}kg</text>
              <text x={p.x} y={padY + plotH + 16} textAnchor="middle" className="text-[9px] fill-muted-foreground">{p.date.slice(5)}</text>
            </g>
          ))}
          <defs>
            <linearGradient id="weightGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6B9F7B" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6B9F7B" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground text-sm">{text}</div>
  );
}

function AddHealthDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (record: Omit<HealthRecord, 'id'>) => void }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'visit' as HealthRecord['type'],
    title: '',
    detail: '',
    weight: '',
    hospital: '',
    doctor: '',
  });

  const handleSubmit = () => {
    if (!form.title) return;
    onAdd({
      date: form.date,
      type: form.type,
      title: form.title,
      detail: form.detail,
      weight: form.type === 'weight' ? Number(form.weight) || undefined : undefined,
      hospital: form.hospital || undefined,
      doctor: form.doctor || undefined,
    });
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
            <Label>日期</Label>
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
        <div className="space-y-1.5">
          <Label>标题</Label>
          <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="如：年度体检" />
        </div>
        <div className="space-y-1.5">
          <Label>详情</Label>
          <Input value={form.detail} onChange={e => setForm(p => ({ ...p, detail: e.target.value }))} placeholder="详细描述" />
        </div>
        {form.type === 'weight' && (
          <div className="space-y-1.5">
            <Label>体重(kg)</Label>
            <Input type="number" step="0.1" value={form.weight} onChange={e => setForm(p => ({ ...p, weight: e.target.value }))} placeholder="如：4.5" />
          </div>
        )}
        {form.type === 'visit' && (
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
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit} className="bg-primary hover:bg-primary/90 text-primary-foreground">确认</Button>
        </div>
      </div>
    </DialogContent>
  );
}
