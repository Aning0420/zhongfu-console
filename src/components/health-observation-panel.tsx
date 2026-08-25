'use client';

import React, { useState } from 'react';
import { Activity, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { DailyObservation, HealthRecord } from '@/lib/store';

const observationFields = [
  { key: 'appetite', label: '食欲', options: [['great', '旺盛'], ['normal', '正常'], ['low', '下降'], ['none', '不吃']] },
  { key: 'energy', label: '精神', options: [['active', '活跃'], ['normal', '正常'], ['quiet', '安静'], ['poor', '精神差']] },
  { key: 'stool', label: '便便', options: [['normal', '正常'], ['soft', '偏软'], ['diarrhea', '腹泻'], ['constipation', '便秘'], ['unseen', '未观察']] },
  { key: 'urine', label: '排尿', options: [['normal', '正常'], ['less', '减少'], ['frequent', '频繁'], ['abnormal', '异常'], ['unseen', '未观察']] },
  { key: 'vomiting', label: '呕吐', options: [['none', '无'], ['hairball', '毛球'], ['food', '食物'], ['yellow', '黄水'], ['other', '其他']] },
] as const;

function isNormalObservation(field: typeof observationFields[number]['key'], value: string) {
  if (field === 'appetite') return value === 'great' || value === 'normal';
  if (field === 'energy') return value === 'active' || value === 'normal';
  if (field === 'stool' || field === 'urine') return value === 'normal' || value === 'unseen';
  return value === 'none';
}

function observationLabel(field: typeof observationFields[number], value: string) {
  return field.options.find(option => option[0] === value)?.[1] || value;
}

export function HealthObservationPanel({ records }: { records: HealthRecord[] }) {
  const { today, addHealthRecord, updateHealthRecord, deleteHealthRecord } = useAppContext();
  const [open, setOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | undefined>();
  const todayRecord = records.find(record => record.date === today);

  return (
    <div className="card-warm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">每日健康观察</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {todayRecord ? '今天已经记录，可以再次打开修改。' : '今天还没有观察记录。'}
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingRecord(todayRecord); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />{todayRecord ? '修改今日观察' : '记录今日观察'}
        </Button>
      </div>

      {records.length > 0 ? (
        <div className="divide-y divide-border/60">
          {records.map(record => (
            <div key={record.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{record.date}</span>
                    {record.date === today && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-foreground">今天</span>}
                  </div>
                  {record.observation && (
                    <div className="flex flex-wrap gap-1.5">
                      {observationFields.map(field => {
                        const value = record.observation?.[field.key] || '';
                        const normal = isNormalObservation(field.key, value);
                        return (
                          <span key={field.key} className={cn('rounded-md px-2 py-1 text-xs', normal ? 'bg-primary/8 text-primary-foreground' : 'bg-destructive/8 text-destructive')}>
                            {field.label} · {observationLabel(field, value)}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {record.detail && <p className="mt-2 text-xs text-muted-foreground">{record.detail}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setEditingRecord(record); setOpen(true); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary-foreground"
                    aria-label={`编辑 ${record.date} 的观察记录`}
                    title="编辑观察记录"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm(`确定删除 ${record.date} 的观察记录吗？`)) deleteHealthRecord(record.id); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`删除 ${record.date} 的观察记录`}
                    title="删除观察记录"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">暂无每日观察记录</p>
      )}

      <ObservationDialog
        key={`${editingRecord?.id || 'new'}-${open}`}
        open={open}
        initialRecord={editingRecord}
        onClose={() => { setOpen(false); setEditingRecord(undefined); }}
        onSave={(date, observation, detail) => {
          const existing = editingRecord || records.find(record => record.date === date);
          if (existing) {
            updateHealthRecord(existing.id, { date, observation, detail });
          } else {
            addHealthRecord({ date, type: 'observation', title: '每日健康观察', detail, observation });
          }
          setOpen(false);
          setEditingRecord(undefined);
        }}
      />
    </div>
  );
}

function ObservationDialog({ open, initialRecord, onClose, onSave }: {
  open: boolean;
  initialRecord?: HealthRecord;
  onClose: () => void;
  onSave: (date: string, observation: DailyObservation, detail: string) => void;
}) {
  const { today } = useAppContext();
  const [date, setDate] = useState(initialRecord?.date || today);
  const [detail, setDetail] = useState(initialRecord?.detail || '');
  const [observation, setObservation] = useState<DailyObservation>(initialRecord?.observation || {
    appetite: 'normal', energy: 'normal', stool: 'normal', urine: 'normal', vomiting: 'none',
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader><DialogTitle>每日健康观察</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>日期</Label>
            <Input type="date" value={date} onChange={event => setDate(event.target.value)} />
          </div>
          {observationFields.map(field => (
            <div key={field.key} className="space-y-2">
              <Label>{field.label}</Label>
              <div className={cn('grid gap-2', field.options.length === 5 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-4')}>
                {field.options.map(option => (
                  <button
                    key={option[0]}
                    type="button"
                    onClick={() => setObservation(previous => ({ ...previous, [field.key]: option[0] }))}
                    className={cn(
                      'min-h-9 rounded-md border px-2 text-sm transition-colors',
                      observation[field.key] === option[0]
                        ? 'border-primary bg-primary/15 font-medium text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                    )}
                  >{option[1]}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>补充说明（可选）</Label>
            <Input value={detail} onChange={event => setDetail(event.target.value)} placeholder="如：喝水较少、刚换粮" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={() => onSave(date, observation, detail.trim())} className="bg-primary text-primary-foreground hover:bg-primary/90">保存观察</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
