'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Cat, Check, Plus, Trash2 } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CatProfile } from '@/lib/store';

type CatForm = {
  name: string;
  sex: NonNullable<CatProfile['sex']>;
  birthday: string;
  ageNote: string;
  weight: string;
  color: string;
  origin: string;
  notes: string;
};

const emptyForm: CatForm = {
  name: '',
  sex: 'unknown',
  birthday: '',
  ageNote: '',
  weight: '',
  color: '',
  origin: '',
  notes: '',
};

function formFromProfile(profile?: CatProfile): CatForm {
  if (!profile) return emptyForm;
  return {
    name: profile.name,
    sex: profile.sex || 'unknown',
    birthday: profile.birthday || '',
    ageNote: profile.ageNote || '',
    weight: profile.weight ? String(profile.weight) : '',
    color: profile.color || '',
    origin: profile.origin || '',
    notes: profile.notes || '',
  };
}

function profileLabel(profile: CatProfile): string {
  return profile.ageNote || (profile.birthday ? `生日 ${profile.birthday}` : '年龄待补充');
}

export function CatProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, addCat, updateCat, deleteCat, setActiveCat } = useAppContext();
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CatForm>(emptyForm);

  const selectedCat = useMemo(
    () => state.cats.find(cat => cat.id === selectedId),
    [state.cats, selectedId],
  );

  useEffect(() => {
    if (!open) return;
    const nextId = state.activeCatId && state.cats.some(cat => cat.id === state.activeCatId)
      ? state.activeCatId
      : state.cats[0]?.id || '';
    setSelectedId(nextId);
    setCreating(false);
    setForm(formFromProfile(state.cats.find(cat => cat.id === nextId)));
  }, [open, state.activeCatId, state.cats]);

  const selectProfile = (profile: CatProfile) => {
    setSelectedId(profile.id);
    setCreating(false);
    setForm(formFromProfile(profile));
    setActiveCat(profile.id);
  };

  const startCreating = () => {
    setSelectedId('');
    setCreating(true);
    setForm(emptyForm);
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) return;
    const weight = Number(form.weight);
    const values = {
      name,
      sex: form.sex,
      birthday: form.birthday || undefined,
      ageNote: form.ageNote.trim() || undefined,
      weight: Number.isFinite(weight) && weight > 0 ? weight : undefined,
      color: form.color.trim() || undefined,
      origin: form.origin.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };
    if (creating) {
      const id = addCat(values);
      setSelectedId(id);
      setCreating(false);
      setActiveCat(id);
    } else if (selectedCat) {
      updateCat(selectedCat.id, values);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Cat className="size-5 text-primary-foreground" />猫咪档案</DialogTitle>
          <DialogDescription>保存每只猫咪的基本资料；点选名字可以切换当前关注的猫咪。</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {state.cats.map(cat => {
            const active = cat.id === state.activeCatId;
            const selected = !creating && cat.id === selectedId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectProfile(cat)}
                className={cn(
                  'min-w-[138px] rounded-md border px-3 py-2.5 text-left transition-colors',
                  selected ? 'border-primary bg-primary/10' : 'border-border bg-background hover:bg-muted/40',
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{cat.name}</span>
                  {active && <Check className="size-4 shrink-0 text-primary-foreground" />}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">{profileLabel(cat)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={startCreating}
            className={cn(
              'flex min-w-[110px] items-center justify-center gap-1.5 rounded-md border border-dashed px-3 py-2.5 text-sm font-medium transition-colors',
              creating ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-muted/40',
            )}
          >
            <Plus className="size-4" />新增
          </button>
        </div>

        <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Field label="名字" required>
            <Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder="如：七遇" />
          </Field>
          <Field label="性别">
            <Select value={form.sex} onValueChange={value => setForm(current => ({ ...current, sex: value as CatForm['sex'] }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unknown">暂不确定</SelectItem>
                <SelectItem value="male">弟弟</SelectItem>
                <SelectItem value="female">妹妹</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="生日 / 估算生日">
            <Input type="date" value={form.birthday} onChange={event => setForm(current => ({ ...current, birthday: event.target.value }))} />
          </Field>
          <Field label="年龄说明">
            <Input value={form.ageNote} onChange={event => setForm(current => ({ ...current, ageNote: event.target.value }))} placeholder="如：约3个月，年龄待确认" />
          </Field>
          <Field label="当前体重（kg）">
            <Input type="number" min="0" step="0.01" inputMode="decimal" value={form.weight} onChange={event => setForm(current => ({ ...current, weight: event.target.value }))} placeholder="如：1.20" />
          </Field>
          <Field label="毛色 / 特征">
            <Input value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} placeholder="如：橘白、左耳有缺口" />
          </Field>
          <Field label="来源" className="sm:col-span-2">
            <Input value={form.origin} onChange={event => setForm(current => ({ ...current, origin: event.target.value }))} placeholder="如：2026-09-01 在小区救助" />
          </Field>
          <Field label="备注" className="sm:col-span-2">
            <Textarea value={form.notes} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="健康情况、性格、待办事项等" rows={3} />
          </Field>
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <div>
            {!creating && selectedCat && state.cats.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  if (!window.confirm(`确定删除“${selectedCat.name}”的档案吗？现有生活记录不会被删除。`)) return;
                  deleteCat(selectedCat.id);
                  const next = state.cats.find(cat => cat.id !== selectedCat.id);
                  setSelectedId(next?.id || '');
                  setForm(formFromProfile(next));
                }}
              >
                <Trash2 className="size-4" />删除档案
              </Button>
            )}
          </div>
          <Button type="button" onClick={save} disabled={!form.name.trim()}>{creating ? '创建档案' : '保存修改'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}{required ? ' *' : ''}</Label>
      {children}
    </div>
  );
}
