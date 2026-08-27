'use client';

import { useState } from 'react';
import { Minus, Snail, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { FeedingRecord } from '@/lib/store';

const mealLabels: Record<FeedingRecord['mealType'], string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

const preferences = {
  fast: { label: '爱吃', emoji: '😋', icon: Zap, className: 'border-primary bg-primary/10 text-primary-foreground' },
  normal: { label: '正常', emoji: '😐', icon: Minus, className: 'border-accent bg-accent/10 text-accent-foreground' },
  slow: { label: '挑食', emoji: '😒', icon: Snail, className: 'border-[#E88888] bg-[#E88888]/10 text-[#C56C5C]' },
} as const;

export function CompleteFeedingDialog({ record, onClose, onComplete }: {
  record: FeedingRecord;
  onClose: () => void;
  onComplete: (updates: Pick<FeedingRecord, 'completed' | 'eatingSpeed' | 'remainingAmount'>) => void;
}) {
  const [eatingSpeed, setEatingSpeed] = useState<NonNullable<FeedingRecord['eatingSpeed']>>(record.eatingSpeed || 'normal');
  const [remainingAmount, setRemainingAmount] = useState(record.remainingAmount || '');

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>完成{mealLabels[record.mealType]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="rounded-md bg-muted/45 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">{record.foodName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">计划用量：{record.amount}</p>
            {record.medication && <p className="mt-1 text-xs text-[#C56C5C]">用药：{record.medication}</p>}
          </div>
          <div className="space-y-2">
            <Label>喜好程度</Label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(preferences) as [NonNullable<FeedingRecord['eatingSpeed']>, (typeof preferences)[keyof typeof preferences]][]).map(([value, preference]) => {
                const Icon = preference.icon;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setEatingSpeed(value)}
                    className={cn(
                      'flex h-11 items-center justify-center gap-1 rounded-md border text-sm transition-colors',
                      eatingSpeed === value ? preference.className : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                    )}
                    aria-pressed={eatingSpeed === value}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{preference.emoji} {preference.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>剩余量（可选）</Label>
            <Input value={remainingAmount} onChange={event => setRemainingAmount(event.target.value)} placeholder="如：2g、半包或无" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button onClick={() => onComplete({ completed: true, eatingSpeed, remainingAmount: remainingAmount.trim() || undefined })}>确认完成</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
