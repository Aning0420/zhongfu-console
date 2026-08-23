'use client';

import React, { useState } from 'react';
import { Bell, Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { nextReminderDate } from '@/lib/health-record-meta';
import { cn } from '@/lib/utils';
import type { CareReminder, HealthRecord } from '@/lib/store';

const kindLabels: Record<CareReminder['kind'], string> = {
  medication: '用药', deworming: '驱虫', vaccine: '疫苗', followup: '复查', care: '护理', other: '其他',
};

const repeatLabels: Record<CareReminder['repeat'], string> = {
  none: '仅一次', daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年',
};

export function CareReminderPanel({ records }: { records: HealthRecord[] }) {
  const { addHealthRecord, updateHealthRecord, deleteHealthRecord } = useAppContext();
  const [open, setOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<HealthRecord | undefined>();
  const today = new Date().toISOString().split('T')[0];
  const sortedRecords = [...records].sort((a, b) => {
    const completedDiff = Number(a.reminder?.completed) - Number(b.reminder?.completed);
    return completedDiff || a.date.localeCompare(b.date);
  });

  const completeReminder = (record: HealthRecord) => {
    if (!record.reminder) return;
    if (record.reminder.repeat === 'none') {
      updateHealthRecord(record.id, { reminder: { ...record.reminder, completed: !record.reminder.completed } });
      return;
    }
    updateHealthRecord(record.id, {
      date: nextReminderDate(record.date, record.reminder.repeat, today),
      reminder: { ...record.reminder, completed: false },
    });
  };

  return (
    <div className="card-warm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-accent" />
            <h3 className="text-sm font-semibold text-foreground">照护提醒</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">完成循环提醒后会自动生成下一次日期。</p>
        </div>
        <Button size="sm" onClick={() => { setEditingRecord(undefined); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" />新增提醒
        </Button>
      </div>

      {sortedRecords.length > 0 ? (
        <div className="divide-y divide-border/60">
          {sortedRecords.map(record => {
            const completed = record.reminder?.completed === true;
            const overdue = !completed && record.date < today;
            const dueToday = !completed && record.date === today;
            return (
              <div key={record.id} className={cn('flex items-center gap-3 px-5 py-3.5', completed && 'opacity-55')}>
                <button
                  type="button"
                  onClick={() => completeReminder(record)}
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-colors',
                    completed ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-primary'
                  )}
                  aria-label={completed ? `恢复提醒：${record.title}` : `完成提醒：${record.title}`}
                >
                  {completed && <Check className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn('text-sm font-medium text-foreground', completed && 'line-through')}>{record.title}</p>
                    {record.reminder && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{kindLabels[record.reminder.kind]}</span>}
                    {overdue && <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">已逾期</span>}
                    {dueToday && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent-foreground">今天</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {record.date}{record.reminder?.time ? ` ${record.reminder.time}` : ''}
                    {record.reminder ? ` · ${repeatLabels[record.reminder.repeat]}` : ''}
                    {record.detail ? ` · ${record.detail}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => { setEditingRecord(record); setOpen(true); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary-foreground"
                    aria-label={`编辑提醒：${record.title}`}
                    title="编辑提醒"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (confirm('确定删除该提醒吗？')) deleteHealthRecord(record.id); }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`删除提醒：${record.title}`}
                    title="删除提醒"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-5 py-12 text-center text-sm text-muted-foreground">暂无照护提醒</p>
      )}

      <ReminderDialog
        key={`${editingRecord?.id || 'new'}-${open}`}
        open={open}
        initialRecord={editingRecord}
        onClose={() => { setOpen(false); setEditingRecord(undefined); }}
        onSave={(date, title, detail, reminder) => {
          if (editingRecord) {
            updateHealthRecord(editingRecord.id, { date, title, detail, reminder });
          } else {
            addHealthRecord({ date, type: 'reminder', title, detail, reminder });
          }
          setOpen(false);
          setEditingRecord(undefined);
        }}
      />
    </div>
  );
}

function ReminderDialog({ open, initialRecord, onClose, onSave }: {
  open: boolean;
  initialRecord?: HealthRecord;
  onClose: () => void;
  onSave: (date: string, title: string, detail: string, reminder: CareReminder) => void;
}) {
  const [form, setForm] = useState({
    title: initialRecord?.title || '', detail: initialRecord?.detail || '', date: initialRecord?.date || new Date().toISOString().split('T')[0], time: initialRecord?.reminder?.time || '09:00',
    kind: initialRecord?.reminder?.kind || 'care' as CareReminder['kind'], repeat: initialRecord?.reminder?.repeat || 'none' as CareReminder['repeat'],
  });

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader><DialogTitle>{initialRecord ? '编辑照护提醒' : '新增照护提醒'}</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>提醒事项</Label>
            <Input value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} placeholder="如：体内驱虫" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>日期</Label>
              <Input type="date" value={form.date} onChange={event => setForm(previous => ({ ...previous, date: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>时间</Label>
              <Input type="time" value={form.time} onChange={event => setForm(previous => ({ ...previous, time: event.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>类型</Label>
              <Select value={form.kind} onValueChange={value => setForm(previous => ({ ...previous, kind: value as CareReminder['kind'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(kindLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>重复</Label>
              <Select value={form.repeat} onValueChange={value => setForm(previous => ({ ...previous, repeat: value as CareReminder['repeat'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(repeatLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>备注（可选）</Label>
            <Input value={form.detail} onChange={event => setForm(previous => ({ ...previous, detail: event.target.value }))} placeholder="剂量、注意事项或医院信息" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button
              disabled={!form.title.trim() || !form.date}
              onClick={() => onSave(form.date, form.title.trim(), form.detail.trim(), { kind: form.kind, time: form.time || undefined, repeat: form.repeat, completed: initialRecord?.reminder?.completed || false })}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >{initialRecord ? '保存修改' : '保存提醒'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
