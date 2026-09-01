'use client';

import React from 'react';
import { Cat } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CatRecordSelect({ value, onChange, label = '记录给谁' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const { state } = useAppContext();
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-primary/5"><Cat className="size-4 text-primary-foreground" /><SelectValue placeholder="选择猫咪" /></SelectTrigger>
        <SelectContent>
          {state.cats.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CatNameBadge({ catId }: { catId?: string }) {
  const { state } = useAppContext();
  const cat = state.cats.find(item => item.id === catId) || state.cats[0];
  return <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary-foreground">{cat?.name || '未指定'}</span>;
}
