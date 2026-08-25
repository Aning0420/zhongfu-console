import type { FeedingPlan, FeedingPlanStage, FeedingRecord } from '@/lib/store';

export function mealTypeForTime(time: string): FeedingRecord['mealType'] {
  const hour = Number(time.slice(0, 2));
  if (hour < 11) return 'breakfast';
  if (hour < 18) return 'lunch';
  return 'dinner';
}

export function stageForDate(stages: FeedingPlanStage[], date: string) {
  return stages.find(stage => stage.startDate <= date && stage.endDate >= date);
}

export function planMealAmount(food: string): string {
  const amounts = food.match(/\d+(?:\.\d+)?\s*(?:g|克|mg|毫克|ml|毫升|罐|包|袋|盒|支|条|片|粒|份|个)/gi);
  return amounts?.join(' + ') || '按计划';
}

function daysBetween(startDate: string, date: string): number {
  const start = new Date(`${startDate}T12:00:00`).getTime();
  const current = new Date(`${date}T12:00:00`).getTime();
  return Math.round((current - start) / 86_400_000) + 1;
}

export function mealFoodForDate(stage: FeedingPlanStage, date: string, fallback: string): string {
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

export function plannedFeedingRecordsForDate(plan: FeedingPlan, date: string): Omit<FeedingRecord, 'id'>[] {
  const stage = stageForDate(plan.stages, date);
  if (!stage) return [];
  return stage.mealSchedule.map(meal => {
    const foodName = mealFoodForDate(stage, date, meal.food);
    return {
      date,
      mealType: mealTypeForTime(meal.time),
      foodName,
      amount: planMealAmount(foodName),
      completed: false,
      note: meal.note.trim(),
      plannedTime: meal.time,
      planId: plan.id,
      planStageId: stage.id,
    };
  });
}
