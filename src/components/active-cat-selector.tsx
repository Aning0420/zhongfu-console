'use client';

import React from 'react';
import { Cat, Settings2 } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ActiveCatSelector({ onManage }: { onManage: () => void }) {
  const { state, setActiveCat } = useAppContext();
  const activeCatId = state.activeCatId || state.cats[0]?.id || '';
  const activeCat = state.cats.find(cat => cat.id === activeCatId);

  if (state.cats.length === 0) return null;

  return (
    <div className="mb-4 flex items-center justify-end gap-2">
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-primary/20 bg-card/90 px-2.5 py-1.5 shadow-sm">
        <Cat className="size-4 shrink-0 text-primary-foreground" aria-hidden="true" />
        <span className="hidden text-xs text-muted-foreground sm:inline">当前猫咪</span>
        <Select value={activeCatId} onValueChange={setActiveCat}>
          <SelectTrigger className="h-7 w-[92px] border-0 bg-transparent px-1.5 text-sm font-medium shadow-none focus:ring-0">
            <SelectValue placeholder={activeCat?.name || '选择猫咪'} />
          </SelectTrigger>
          <SelectContent>
            {state.cats.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" variant="ghost" size="icon-sm" onClick={onManage} title="管理猫咪档案" aria-label="管理猫咪档案">
        <Settings2 className="size-4" />
      </Button>
    </div>
  );
}
