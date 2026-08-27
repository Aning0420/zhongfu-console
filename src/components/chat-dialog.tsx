'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { normalizeInventoryCategory } from '@/lib/inventory-categories';
import { X, Send, ImagePlus, Trash2, Sparkles } from 'lucide-react';
import { useAppContext } from './providers';
import { cn } from '@/lib/utils';
import type { AppState, CareReminder, DailyObservation } from '@/lib/store';
import { localDateKey } from '@/lib/local-date';

interface DisplayMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  synced?: boolean;
  timestamp: Date;
}

const QUICK_REPLIES = [
  '本月统计',
  '库存不足的物资',
  '今天喂食了吗',
];
const STATIC_MODE = process.env.NEXT_PUBLIC_STATIC_MODE === '1';
const CHAT_API_URL = process.env.NEXT_PUBLIC_CHAT_API_URL || '/api/chat';
const AI_ENABLED = !STATIC_MODE || Boolean(process.env.NEXT_PUBLIC_CHAT_API_URL);

let _msgId = 5000;
function genMsgId(): string {
  _msgId += 1;
  return `msg_${_msgId}_${Date.now()}`;
}

const CONSUMABLE_AMOUNT = /(?:\d+(?:\.\d+)?\s*(?:g|克|mg|毫克|ml|毫升|袋|包|片|粒|胶囊)|半\s*(?:袋|包|片|粒|胶囊))/i;
const NON_STOCK_LIQUID = /(温水|凉白开|清水|饮用水|纯净水)/;

interface ConsumableEntry {
  item: string;
  raw: string;
}

/**
 * Split a plan fragment into stock-consuming items. A time or meal label on
 * the group is inherited by every item after a plus sign, so
 * "13:00乳铁蛋白0.225g＋益生菌1g" stays one timed supplement group.
 */
function extractConsumableEntries(value: string): ConsumableEntry[] {
  return value
    .split(/[；;\n|｜]/)
    .flatMap(group => {
      const rawGroup = group.trim();
      if (!rawGroup) return [];
      const prefix = rawGroup.match(/^\s*(?:(?:营养补充|补充剂|补充)\s*[:：]?\s*)?(?:(?:\d{1,2}:\d{2})|早餐|午餐|晚餐|早上|中午|晚上)?\s*/i)?.[0] || '';
      return rawGroup.split(/[＋+、，,]/).map((raw, index) => ({
        raw: raw.trim(),
        source: index === 0 ? raw.trim() : `${prefix}${raw.trim()}`,
      }));
    })
    .map(({ source }) => {
      let item = source
        .replace(/^\s*\d{1,2}:\d{2}\s*/, '')
        .replace(/^\s*(?:早餐|午餐|晚餐|早上|中午|晚上|每餐|营养补充|补充剂|补充|添加)\s*[:：]?\s*/i, '')
        .replace(/^\s*\d{1,2}:\d{2}\s*/, '')
        .trim();
      const amountMatch = item.match(CONSUMABLE_AMOUNT);
      if (!amountMatch || NON_STOCK_LIQUID.test(item)) return null;
      if (amountMatch?.index !== undefined) item = item.slice(0, amountMatch.index + amountMatch[0].length).trim();
      return item ? { item, raw: source } : null;
    })
    .filter((entry): entry is ConsumableEntry => Boolean(entry));
}

function consumableIdentity(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s＋+、，,；;:：]/g, '');
}

function appendConsumables(food: string, entries: string[]): string {
  const result = food.trim();
  let existing = consumableIdentity(result);
  const additions = entries.filter(item => {
    const normalized = consumableIdentity(item);
    if (!normalized || existing.includes(normalized)) return false;
    existing += normalized;
    return true;
  });
  return [result, ...additions].filter(Boolean).join('＋');
}

function mealMatchesSupplement(entry: ConsumableEntry, mealTime: string): boolean {
  const raw = entry.raw;
  const timed = raw.match(/\b(\d{1,2}:\d{2})\b/);
  if (timed) return timed[1] === mealTime;
  const hour = Number(mealTime.slice(0, 2));
  if (/早晚/.test(raw)) return hour < 11 || hour >= 18;
  if (/早餐|早上/.test(raw)) return hour < 11;
  if (/午餐|中午/.test(raw)) return hour >= 11 && hour < 18;
  if (/晚餐|晚上/.test(raw)) return hour >= 18;
  return false;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = String(value || '');
  return allowed.includes(candidate as T) ? candidate as T : fallback;
}

function buildAssistantContext(state: AppState): string {
  const today = localDateKey();
  const month = today.slice(0, 7);
  const latestWeight = state.healthRecords
    .filter(record => record.type === 'weight' && typeof record.weight === 'number')
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const activePlan = state.feedingPlans.find(plan => plan.active);
  const activeStage = activePlan?.stages.find(stage => stage.startDate <= today && stage.endDate >= today);
  const inventory = state.orders
    .filter(order => order.status !== 'cancelled' && order.status !== 'finished' && order.quantity - order.consumed > 0)
    .slice(-20)
    .map(order => ({ item: order.itemName, category: order.category, remaining: order.quantity - order.consumed, unit: order.unit }));
  const recentHealth = [...state.healthRecords]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)
    .map(record => ({ date: record.date, type: record.type, title: record.title, detail: record.detail, weight: record.weight }));
  const todayFeeding = state.feedingRecords
    .filter(record => record.date === today)
    .map(record => ({ meal: record.mealType, food: record.foodName, amount: record.amount, remaining: record.remainingAmount, completed: record.completed, note: record.note }));
  const monthExpense = state.expenses
    .filter(expense => expense.date.startsWith(month))
    .reduce((total, expense) => total + expense.amount, 0);

  return JSON.stringify({
    today,
    latestWeight: latestWeight ? { date: latestWeight.date, kg: latestWeight.weight } : null,
    activeFeedingPlan: activePlan ? {
      name: activePlan.name,
      currentStage: activeStage ? {
        name: activeStage.name,
        dates: `${activeStage.startDate}至${activeStage.endDate}`,
        meals: activeStage.mealSchedule,
        supplements: activeStage.supplements,
        description: activeStage.description.slice(0, 2_000),
      } : null,
    } : null,
    todayFeeding,
    inventory,
    recentHealth,
    monthExpense,
  });
}

export function ChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    state, addOrder, addFeedingRecord, addFeedingPlan, updateFeedingPlan,
    addHealthRecord, updateHealthRecord, addExpense, addChatMessages, clearChatMessages,
  } = useAppContext();

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || historyLoaded) return;
    if (!AI_ENABLED) {
      setMessages([]);
      setHistoryLoaded(true);
      return;
    }
    setMessages(state.chatMessages.map(message => ({
      ...message,
      timestamp: new Date(message.timestamp),
    })));
    setHistoryLoaded(true);
  }, [open, historyLoaded, state.chatMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Handle image file selection
  const handleImageSelect = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      setPendingImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle paste event for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) handleImageSelect(file);
        break;
      }
    }
  }, [handleImageSelect]);

  // Sync data to app modules
  const syncData = useCallback((syncData: { type: string; data: Record<string, unknown> }) => {
    const today = localDateKey();

    switch (syncData.type) {
      case 'procurement': {
        const d = syncData.data;
        const quantity = Number(d.quantity) || 1;
        const totalPrice = d.total_price === undefined || d.total_price === null
          ? (Number(d.price) || 0) * quantity
          : Number(d.total_price) || 0;
        addOrder({
          itemName: String(d.item_name || '未知物品'),
          category: normalizeInventoryCategory(d.category),
          quantity,
          unit: String(d.unit || '个'),
          unitPrice: totalPrice / quantity,
          totalPrice,
          packageSize: Number(d.package_size) > 0 ? Number(d.package_size) : undefined,
          packageUnit: Number(d.package_size) > 0 ? String(d.package_unit || '').trim() || undefined : undefined,
          supplier: String(d.supplier || '线上'),
          purchaseDate: today,
          status: 'delivered',
          consumed: 0,
        });
        if (totalPrice > 0) {
          addExpense({
            category: normalizeInventoryCategory(d.category),
            amount: totalPrice,
            description: `采购${String(d.item_name || '未知物品')}`,
            date: today,
            relatedModule: 'procurement',
          });
        }
        break;
      }
      case 'expense': {
        const d = syncData.data;
        addExpense({
          category: String(d.category || '日常'),
          amount: Number(d.amount) || 0,
          description: String(d.description || '支出'),
          date: today,
          relatedModule: 'other',
        });
        break;
      }
      case 'feeding': {
        const d = syncData.data;
        addFeedingRecord({
          date: today,
          mealType: (String(d.meal_type) || 'snack') as 'breakfast' | 'lunch' | 'dinner' | 'snack',
          foodName: String(d.food_name || '猫粮'),
          amount: String(d.amount || ''),
          medication: String(d.medication || '').trim() || undefined,
          remainingAmount: d.remaining_amount === undefined || d.remaining_amount === null
            ? undefined
            : String(d.remaining_amount),
          completed: true,
          note: String(d.note || ''),
        });
        break;
      }
      case 'feeding_plan': {
        const d = syncData.data;
        const rawStages = Array.isArray(d.stages) ? d.stages : [];
        const stages = rawStages.map((rawStage, stageIndex) => {
          const stage = rawStage as Record<string, unknown>;
          const rawMeals = Array.isArray(stage.meals) ? stage.meals : [];
          const parsedMeals = rawMeals.map(rawMeal => {
            const meal = rawMeal as Record<string, unknown>;
            return {
              time: String(meal.time || '08:00'),
              food: String(meal.food || '待确认食物'),
              medication: String(meal.medication || ''),
              note: String(meal.note || ''),
            };
          });
          // Keep a stage-level summary for display, but put every measured
          // consumable into the meal food text so inventory deduction can see
          // milk powder and supplements as separate stock items.
          const supplementPattern = /(乳铁蛋白|益生菌|补充剂|营养补充)/;
          const sourceSupplements = [
            String(stage.supplements || ''),
            String(stage.description || ''),
            ...parsedMeals.map(meal => meal.note),
          ]
            .flatMap(value => value.split(/[；;\n]/))
            .map(value => value.trim())
            .filter(value => value && value !== '无' && supplementPattern.test(value));
          const supplements = Array.from(new Set(sourceSupplements)).join('；');
          const stageSupplementEntries = extractConsumableEntries(String(stage.supplements || ''));
          const medicationPattern = /(?:用药|药物|服药|口服)/;
          const stageMedicationEntries = String(stage.description || '')
            .split(/[；;\n]/)
            .filter(value => medicationPattern.test(value))
            .flatMap(value => extractConsumableEntries(value));
          const meals = parsedMeals.map(meal => {
            const noteParts = meal.note.split(/[；;\n]/).map(value => value.trim()).filter(Boolean);
            const noteMedicationParts = noteParts.filter(part => medicationPattern.test(part));
            const noteEntries = noteParts.filter(part => !medicationPattern.test(part)).flatMap(part => extractConsumableEntries(part));
            const noteMedicationEntries = noteMedicationParts.flatMap(part => extractConsumableEntries(part));
            const timedStageEntries = stageSupplementEntries
              .filter(entry => mealMatchesSupplement(entry, meal.time))
              .map(entry => entry.item);
            // An untimed supplement is recorded once, on the first meal. This
            // avoids multiplying a daily dose across all three meals.
            const untimedStageEntries = stageSupplementEntries
              .filter(entry => !/\b\d{1,2}:\d{2}\b/.test(entry.raw) && !/(早餐|午餐|晚餐|早上|中午|晚上)/.test(entry.raw))
              .filter(() => parsedMeals[0]?.time === meal.time)
              .map(entry => entry.item);
            const timedMedicationEntries = stageMedicationEntries
              .filter(entry => mealMatchesSupplement(entry, meal.time))
              .map(entry => entry.item);
            const untimedMedicationEntries = stageMedicationEntries
              .filter(entry => !/\b\d{1,2}:\d{2}\b/.test(entry.raw) && !/(早餐|午餐|晚餐|早上|中午|晚上|早晚)/.test(entry.raw))
              .filter(() => parsedMeals[0]?.time === meal.time)
              .map(entry => entry.item);
            const explicitMedication = meal.medication.trim() === '无' ? '' : meal.medication.trim();
            return {
              ...meal,
              food: appendConsumables(meal.food, [
                ...noteEntries.map(entry => entry.item),
                ...timedStageEntries,
                ...untimedStageEntries,
              ]),
              medication: appendConsumables(explicitMedication, [
                ...noteMedicationEntries.map(entry => entry.item),
                ...timedMedicationEntries,
                ...untimedMedicationEntries,
              ]),
              note: noteParts
                .flatMap(part => part.split(/[＋+、，,]/).map(value => value.trim()))
                .filter(part => part && extractConsumableEntries(part).length === 0)
                .join('；'),
            };
          });
          return {
            id: `stage_${Date.now()}_${stageIndex}`,
            name: String(stage.name || `阶段 ${stageIndex + 1}`),
            startDate: String(stage.start_date || today),
            endDate: String(stage.end_date || stage.start_date || today),
            description: String(stage.description || ''),
            mealsPerDay: Math.max(1, meals.length),
            mealSchedule: meals.length > 0 ? meals : [{ time: '08:00', food: '待确认食物', medication: '', note: '' }],
            supplements,
          };
        });
        const active = d.active !== false;
        if (active) {
          state.feedingPlans.forEach(plan => {
            if (plan.active) updateFeedingPlan(plan.id, { active: false });
          });
        }
        addFeedingPlan({
          name: String(d.name || '助手创建的喂食计划'),
          active,
          stages: stages.length > 0 ? stages : [{
            id: `stage_${Date.now()}_0`,
            name: '日常喂养',
            startDate: today,
            endDate: today,
            description: '请在喂食计划中补充安排',
            mealsPerDay: 1,
            mealSchedule: [{ time: '08:00', food: '待确认食物', medication: '', note: '' }],
            supplements: '',
          }],
        });
        break;
      }
      case 'weight': {
        const d = syncData.data;
        addHealthRecord({
          type: 'weight',
          date: today,
          title: '体重记录',
          detail: '对话助手录入',
          weight: Number(d.weight) || 0,
        });
        break;
      }
      case 'daily_observation': {
        const d = syncData.data;
        const observationDate = String(d.date || today);
        const observation: DailyObservation = {
          appetite: enumValue(d.appetite, ['great', 'normal', 'low', 'none'] as const, 'normal'),
          energy: enumValue(d.energy, ['active', 'normal', 'quiet', 'poor'] as const, 'normal'),
          stool: enumValue(d.stool, ['normal', 'soft', 'diarrhea', 'constipation', 'unseen'] as const, 'unseen'),
          urine: enumValue(d.urine, ['normal', 'less', 'frequent', 'abnormal', 'unseen'] as const, 'unseen'),
          vomiting: enumValue(d.vomiting, ['none', 'hairball', 'food', 'yellow', 'other'] as const, 'none'),
        };
        const existing = state.healthRecords.find(record => record.type === 'observation' && record.date === observationDate);
        if (existing) {
          updateHealthRecord(existing.id, { detail: String(d.note || ''), observation });
        } else {
          addHealthRecord({ type: 'observation', date: observationDate, title: '每日健康观察', detail: String(d.note || ''), observation });
        }
        break;
      }
      case 'care_reminder': {
        const d = syncData.data;
        const reminder: CareReminder = {
          kind: enumValue(d.kind, ['medication', 'deworming', 'vaccine', 'followup', 'care', 'other'] as const, 'care'),
          time: d.time ? String(d.time) : undefined,
          repeat: enumValue(d.repeat, ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const, 'none'),
          completed: false,
        };
        addHealthRecord({
          type: 'reminder',
          date: String(d.date || today),
          title: String(d.title || '照护提醒'),
          detail: String(d.note || ''),
          reminder,
        });
        break;
      }
      case 'health_visit': {
        const d = syncData.data;
        const startDate = String(d.start_date || today);
        const endDate = d.end_date ? String(d.end_date) : undefined;
        const cost = Number(d.cost) || 0;
        const reason = String(d.reason || '常规检查');
        addHealthRecord({
          type: 'visit',
          date: startDate,
          endDate,
          title: reason,
          detail: String(d.description || ''),
          hospital: String(d.hospital || '宠物医院'),
          doctor: d.doctor ? String(d.doctor) : undefined,
        });
        if (cost > 0) {
          addExpense({
            date: startDate,
            category: 'medical',
            amount: cost,
            description: `${reason} - 就医费用`,
            relatedModule: 'health',
          });
        }
        break;
      }
    }
  }, [state.feedingPlans, state.healthRecords, addOrder, addFeedingRecord, addFeedingPlan, updateFeedingPlan, addHealthRecord, updateHealthRecord, addExpense]);

  // Send message with streaming
  const sendMessage = useCallback(async (content: string, image?: string) => {
    if (!AI_ENABLED) return;
    if (!content.trim() && !image) return;
    setLoading(true);

    const userMsgId = genMsgId();
    const userMsg: DisplayMessage = {
      id: userMsgId,
      role: 'user',
      content: content.trim(),
      imageUrl: image,
      timestamp: new Date(),
    };

    const assistantMsgId = genMsgId();
    const assistantMsg: DisplayMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setPendingImage(null);

    let savedAssistantContent = '';
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 45_000);
    try {
      // Build message history for API
      const apiMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user' as const, content: content.trim() });

      const res = await fetch(CHAT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, image, context: buildAssistantContext(state) }),
        signal: controller.signal,
      });

      if (!res.ok) {
        let message = `助手服务暂时不可用（${res.status}）`;
        try {
          const body = await res.json() as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // Keep the readable status message when the server did not return JSON.
        }
        throw new Error(message);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullText = '';
      let lineBuffer = '';
      let receivedPayload = false;

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') return;

        try {
          const data = JSON.parse(payload);
          receivedPayload = true;
          if (data.text) {
            fullText += data.text;
            const displayText = fullText
              .replace(/---SYNC_DATA_START---[\s\S]*?---SYNC_DATA_END---/g, '')
              .trim();
            savedAssistantContent = displayText;
            setMessages(prev =>
              prev.map(m => m.id === assistantMsgId ? { ...m, content: displayText } : m)
            );
          }
          if (data.syncData) {
            syncData(data.syncData);
            setMessages(prev =>
              prev.map(m => m.id === assistantMsgId ? { ...m, synced: true } : m)
            );
          }
        } catch {
          // A complete SSE line should always contain valid JSON.
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || '';
        lines.forEach(processLine);
      }

      lineBuffer += decoder.decode();
      if (lineBuffer) processLine(lineBuffer);
      if (!receivedPayload) throw new Error('助手返回内容不完整，请重试');
    } catch (err) {
      const errMsg = err instanceof DOMException && err.name === 'AbortError'
        ? '处理时间过长，请缩短计划或分阶段发送'
        : err instanceof Error ? err.message : '网络错误';
      savedAssistantContent = `抱歉，出了点问题：${errMsg}`;
      setMessages(prev =>
        prev.map(m => m.id === assistantMsgId
          ? { ...m, content: savedAssistantContent }
          : m
        )
      );
    } finally {
      addChatMessages([
        { role: 'user', content: content.trim() || '[图片消息]', timestamp: userMsg.timestamp.toISOString() },
        { role: 'assistant', content: savedAssistantContent, timestamp: assistantMsg.timestamp.toISOString() },
      ]);
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [messages, state, syncData, addChatMessages]);

  const handleSubmit = useCallback(() => {
    sendMessage(input, pendingImage || undefined);
  }, [input, pendingImage, sendMessage]);

  const handleClear = useCallback(() => {
    setMessages([]);
    clearChatMessages();
  }, [clearChatMessages]);

  return (
    <>
      {/* Dialog */}
      {open && (
        <div className="fixed inset-x-3 bottom-3 z-50 flex h-[min(600px,calc(100dvh-24px))] w-auto flex-col rounded-lg border border-[#D6E8F5] bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#D6E8F5]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#5CB8E4] flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-[#2D3E50]">智能助手</span>
              <span className="text-[10px] text-[#6B8A9E] bg-[#E8F4FD] px-1.5 py-0.5 rounded-full">AI</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  className="w-8 h-8 rounded-full hover:bg-red-50 text-[#6B8A9E] hover:text-[#E88888] transition-colors flex items-center justify-center"
                  title="清空记录"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full hover:bg-[#E8F4FD] text-[#6B8A9E] transition-colors flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-[#89CFF0]/20 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-[#5CB8E4]" />
                </div>
                {!AI_ENABLED ? (
                  <>
                    <p className="mb-1 text-sm text-[#6B8A9E]">AI 助手暂不可用</p>
                    <p className="mx-auto max-w-[260px] text-xs leading-5 text-[#6B8A9E]/70">当前入口优先保证手机能打开和本机记录。采购、喂食、健康、体重与支出仍可正常手动添加。</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-[#6B8A9E] mb-1">你好！我是你的智能助手</p>
                    <p className="text-xs text-[#6B8A9E]/70 mb-4">可以帮你录入数据、查询信息</p>
                    <div className="text-[11px] text-[#6B8A9E]/60 space-y-1">
                      <p>试试说：</p>
                      <p>“买了猫粮200块”</p>
                      <p>“制定一周喂食计划”</p>
                      <p>“猫瘟住院了7天”</p>
                      <p>或者直接发图片给我识别</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-full bg-[#89CFF0] flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[280px] rounded-2xl px-3.5 py-2.5 text-sm',
                    msg.role === 'user'
                      ? 'bg-[#5CB8E4] text-white rounded-br-md'
                      : 'bg-[#E8F4FD] text-[#2D3E50] rounded-bl-md'
                  )}
                >
                  {msg.imageUrl && (
                    <div className="mb-2 rounded-lg overflow-hidden">
                      <img src={msg.imageUrl} alt="uploaded" className="max-w-full max-h-40 object-cover" />
                    </div>
                  )}
                  {msg.content ? (
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6B8A9E]/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6B8A9E]/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6B8A9E]/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )}
                  {msg.synced && (
                    <div className="mt-1.5 flex items-center gap-1 text-[10px] opacity-60">
                      <span className="w-1 h-1 rounded-full bg-green-400" />
                      已保存到本机数据
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Quick replies */}
          {messages.length === 0 && AI_ENABLED && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {QUICK_REPLIES.map((text) => (
                <button
                  key={text}
                  onClick={() => sendMessage(text)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#D6E8F5] text-[#6B8A9E] hover:border-[#5CB8E4] hover:text-[#5CB8E4] transition-colors"
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {/* Image preview */}
          {pendingImage && (
            <div className="px-4 pb-2">
              <div className="relative inline-block">
                <img src={pendingImage} alt="preview" className="w-16 h-16 object-cover rounded-lg border border-[#D6E8F5]" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#E88888] text-white flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Input */}
          <div className="px-4 pb-4 pt-2 border-t border-[#D6E8F5]">
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageSelect(file);
                  e.target.value = '';
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!AI_ENABLED}
                className="w-9 h-9 rounded-full hover:bg-[#E8F4FD] text-[#6B8A9E] hover:text-[#5CB8E4] transition-colors flex items-center justify-center shrink-0"
                title="上传图片"
              >
                <ImagePlus className="w-4.5 h-4.5" />
              </button>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading) handleSubmit();
                  }
                }}
                onPaste={handlePaste}
                placeholder={AI_ENABLED ? '说点什么...（可粘贴图片）' : '请使用各页面或“记录”按钮添加数据'}
                className="flex-1 bg-[#E8F4FD] rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#89CFF0] transition-shadow"
                disabled={loading || !AI_ENABLED}
              />
              <button
                onClick={handleSubmit}
                disabled={!AI_ENABLED || loading || (!input.trim() && !pendingImage)}
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all',
                  input.trim() || pendingImage
                    ? 'bg-[#5CB8E4] text-white hover:bg-[#4AA8D4]'
                    : 'bg-[#E8F4FD] text-[#6B8A9E]/50'
                )}
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
