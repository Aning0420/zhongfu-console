'use client';

import React, { useState } from 'react';
import { CalendarDays, Check, Clock3, Edit3, Plus, Trash2, Utensils } from 'lucide-react';
import { useAppContext } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { FeedingPlan, FeedingPlanStage } from '@/lib/store';
import { localDateKey } from '@/lib/local-date';
import { InventoryFoodInput } from '@/components/inventory-food-input';
import { CatNameBadge, CatRecordSelect } from '@/components/cat-record-select';

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function createStage(index = 0): FeedingPlanStage {
  return {
    id: `stage_${Date.now()}_${index}`,
    name: index === 0 ? '日常喂养' : `阶段 ${index + 1}`,
    startDate: dateAfter(index * 7),
    endDate: dateAfter(index * 7 + 6),
    description: '',
    mealsPerDay: 2,
    mealSchedule: [
      { time: '08:00', food: '', medication: '', note: '' },
      { time: '19:00', food: '', medication: '', note: '' },
    ],
    supplements: '',
  };
}

function clonePlan(plan: FeedingPlan): FeedingPlan {
  return {
    ...plan,
    stages: plan.stages.map(stage => ({
      ...stage,
      mealSchedule: stage.mealSchedule.map(meal => ({ ...meal })),
    })),
  };
}

export function FeedingPlanManager({ foodSuggestions = [] }: { foodSuggestions?: string[] }) {
  const { state, addFeedingPlan, updateFeedingPlan, deleteFeedingPlan } = useAppContext();
  const catPlans = state.feedingPlans;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<FeedingPlan | null>(null);

  const openNew = () => {
    setEditingPlan(null);
    setEditorOpen(true);
  };

  const openEdit = (plan: FeedingPlan) => {
    setEditingPlan(clonePlan(plan));
    setEditorOpen(true);
  };

  const activatePlan = (id: string) => {
    const target = catPlans.find(plan => plan.id === id);
    catPlans.forEach(plan => {
      if (plan.active && plan.id !== id && plan.catId === target?.catId) updateFeedingPlan(plan.id, { active: false });
    });
    updateFeedingPlan(id, { active: true });
  };

  const savePlan = (draft: Omit<FeedingPlan, 'id' | 'createdAt'>) => {
    if (draft.active) {
      catPlans.forEach(plan => {
        if (plan.active && plan.id !== editingPlan?.id && plan.catId === draft.catId) updateFeedingPlan(plan.id, { active: false });
      });
    }

    if (editingPlan) {
      updateFeedingPlan(editingPlan.id, draft);
    } else {
      addFeedingPlan(draft);
    }
    setEditorOpen(false);
  };

  const sortedPlans = [...catPlans].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">喂食计划</h2>
          <p className="text-sm text-muted-foreground mt-1">安排阶段、餐次和食物，当前计划会优先显示。</p>
        </div>
        <Button onClick={openNew} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1.5" />新建计划
        </Button>
      </div>

      {sortedPlans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
          <Utensils className="w-8 h-8 text-primary mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">还没有喂食计划</p>
          <p className="text-xs text-muted-foreground mt-1">创建日常计划，或让助手根据你的描述添加。</p>
          <Button variant="outline" onClick={openNew} className="mt-4"><Plus className="w-4 h-4 mr-1.5" />创建第一个计划</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {sortedPlans.map(plan => (
            <div key={plan.id} className="card-warm p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold text-foreground">{plan.name}</h3>
                    <CatNameBadge catId={plan.catId} />
                    {plan.active && <Badge className="bg-primary/20 text-primary-foreground border-0">当前启用</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{plan.stages.length} 个阶段</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(plan)} title="编辑计划"><Edit3 className="w-4 h-4" /></Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => { if (confirm(`确定删除“${plan.name}”？`)) deleteFeedingPlan(plan.id); }}
                    className="text-destructive"
                    title="删除计划"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 divide-y divide-border/60">
                {plan.stages.map(stage => (
                  <div key={stage.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{stage.name}</p>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{stage.mealsPerDay} 餐/天</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {stage.startDate} 至 {stage.endDate}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {stage.mealSchedule.map((meal, index) => (
                        <span key={`${stage.id}-${index}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock3 className="w-3 h-3" />{meal.time} {meal.food || '待填写'}{meal.medication ? ` · 用药：${meal.medication}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {!plan.active && (
                <Button variant="outline" size="sm" onClick={() => activatePlan(plan.id)} className="mt-4">
                  <Check className="w-3.5 h-3.5 mr-1.5" />设为当前计划
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {editorOpen && (
        <PlanEditorDialog
          key={editingPlan?.id || 'new-plan'}
          plan={editingPlan}
          foodSuggestions={foodSuggestions}
          onClose={() => setEditorOpen(false)}
          onSave={savePlan}
        />
      )}
    </div>
  );
}

function PlanEditorDialog({ plan, foodSuggestions, onClose, onSave }: {
  plan: FeedingPlan | null;
  foodSuggestions: string[];
  onClose: () => void;
  onSave: (plan: Omit<FeedingPlan, 'id' | 'createdAt'>) => void;
}) {
  const { state } = useAppContext();
  const [catId, setCatId] = useState(plan?.catId || state.cats[0]?.id || '');
  const catName = state.cats.find(cat => cat.id === catId)?.name || '猫咪';
  const [name, setName] = useState(plan?.name || `${catName}日常喂食计划`);
  const [active, setActive] = useState(plan?.active ?? true);
  const [stages, setStages] = useState<FeedingPlanStage[]>(plan?.stages || [createStage()]);

  const updateStage = (stageIndex: number, updates: Partial<FeedingPlanStage>) => {
    setStages(current => current.map((stage, index) => index === stageIndex ? { ...stage, ...updates } : stage));
  };

  const updateMeal = (stageIndex: number, mealIndex: number, field: 'time' | 'food' | 'medication' | 'note', value: string) => {
    setStages(current => current.map((stage, index) => {
      if (index !== stageIndex) return stage;
      const mealSchedule = stage.mealSchedule.map((meal, indexInStage) => indexInStage === mealIndex ? { ...meal, [field]: value } : meal);
      return { ...stage, mealSchedule, mealsPerDay: mealSchedule.length };
    }));
  };

  const addMeal = (stageIndex: number) => {
    setStages(current => current.map((stage, index) => {
      if (index !== stageIndex) return stage;
      const mealSchedule = [...stage.mealSchedule, { time: '12:00', food: '', medication: '', note: '' }];
      return { ...stage, mealSchedule, mealsPerDay: mealSchedule.length };
    }));
  };

  const removeMeal = (stageIndex: number, mealIndex: number) => {
    setStages(current => current.map((stage, index) => {
      if (index !== stageIndex || stage.mealSchedule.length <= 1) return stage;
      const mealSchedule = stage.mealSchedule.filter((_, indexInStage) => indexInStage !== mealIndex);
      return { ...stage, mealSchedule, mealsPerDay: mealSchedule.length };
    }));
  };

  const valid = name.trim() && stages.length > 0 && stages.every(stage =>
    stage.name.trim() && stage.startDate && stage.endDate && stage.startDate <= stage.endDate &&
    stage.mealSchedule.length > 0 && stage.mealSchedule.every(meal => meal.time && meal.food.trim())
  );

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle>{plan ? '编辑喂食计划' : '新建喂食计划'}</DialogTitle>
          <DialogDescription>每个阶段至少保留一餐；食物和日期填写完整后才能保存。</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <CatRecordSelect value={catId} onChange={setCatId} label="这是谁的计划" />
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end">
            <div className="space-y-1.5">
              <Label>计划名称</Label>
              <Input value={name} onChange={event => setName(event.target.value)} autoFocus />
            </div>
            <label className="flex items-center gap-2 h-9 text-sm text-muted-foreground">
              <Switch checked={active} onCheckedChange={setActive} />
              保存后设为当前计划
            </label>
          </div>

          <div className="space-y-4">
            {stages.map((stage, stageIndex) => (
              <section key={stage.id} className="rounded-lg border border-border bg-card p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-foreground">阶段 {stageIndex + 1}</h3>
                  {stages.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => setStages(current => current.filter((_, index) => index !== stageIndex))} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-1" />删除阶段
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="阶段名称"><Input value={stage.name} onChange={event => updateStage(stageIndex, { name: event.target.value })} placeholder="如：换粮过渡" /></Field>
                  <Field label="开始日期"><Input type="date" value={stage.startDate} onChange={event => updateStage(stageIndex, { startDate: event.target.value })} /></Field>
                  <Field label="结束日期"><Input type="date" value={stage.endDate} onChange={event => updateStage(stageIndex, { endDate: event.target.value })} /></Field>
                </div>
                <Field label="阶段说明"><Textarea value={stage.description} onChange={event => updateStage(stageIndex, { description: event.target.value })} placeholder="目标、过渡比例或需要观察的情况" className="min-h-20" /></Field>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>每日餐次</Label>
                    <Button variant="outline" size="sm" onClick={() => addMeal(stageIndex)}><Plus className="w-3.5 h-3.5 mr-1" />加一餐</Button>
                  </div>
                  {stage.mealSchedule.map((meal, mealIndex) => (
                    <div key={`${stage.id}-meal-${mealIndex}`} className="rounded-md border border-border/70 p-3">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[100px_minmax(0,1fr)_32px]">
                        <Input type="time" value={meal.time} onChange={event => updateMeal(stageIndex, mealIndex, 'time', event.target.value)} aria-label={`第 ${mealIndex + 1} 餐时间`} />
                        <InventoryFoodInput value={meal.food} onChange={value => updateMeal(stageIndex, mealIndex, 'food', value)} suggestions={foodSuggestions} placeholder="输入名称或系列，选择库存物资" ariaLabel={`第 ${mealIndex + 1} 餐食物`} />
                        <Button variant="ghost" size="icon" disabled={stage.mealSchedule.length <= 1} onClick={() => removeMeal(stageIndex, mealIndex)} className="text-destructive" title="删除餐次"><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input value={meal.medication || ''} onChange={event => updateMeal(stageIndex, mealIndex, 'medication', event.target.value)} placeholder="用药（可选），如：速诺0.5片" aria-label={`第 ${mealIndex + 1} 餐用药`} />
                        <Input value={meal.note} onChange={event => updateMeal(stageIndex, mealIndex, 'note', event.target.value)} placeholder="备注，如：饭后服用" aria-label={`第 ${mealIndex + 1} 餐备注`} />
                      </div>
                    </div>
                  ))}
                </div>

                <Field label="营养补充"><Input value={stage.supplements || ''} onChange={event => updateStage(stageIndex, { supplements: event.target.value })} placeholder="如：益生菌每日一次，可选" /></Field>
              </section>
            ))}
          </div>

          <Button variant="outline" onClick={() => setStages(current => [...current, createStage(current.length)])}>
            <Plus className="w-4 h-4 mr-1.5" />增加阶段
          </Button>

          {!valid && <p className="text-xs text-destructive">请填写计划名称，并检查每个阶段的日期、名称、餐次时间和食物。</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>取消</Button>
            <Button disabled={!valid} onClick={() => onSave({ catId, name: name.trim(), active, stages })} className="bg-primary text-primary-foreground hover:bg-primary/90">保存计划</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
