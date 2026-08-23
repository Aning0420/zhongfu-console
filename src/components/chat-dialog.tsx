'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { normalizeInventoryCategory } from '@/lib/inventory-categories';
import { X, Send, ImagePlus, Trash2, Sparkles } from 'lucide-react';
import { useAppContext } from './providers';
import { cn } from '@/lib/utils';
import type { CareReminder, DailyObservation } from '@/lib/store';

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

let _msgId = 5000;
function genMsgId(): string {
  _msgId += 1;
  return `msg_${_msgId}_${Date.now()}`;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  const candidate = String(value || '');
  return allowed.includes(candidate as T) ? candidate as T : fallback;
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
    const today = new Date().toISOString().split('T')[0];

    switch (syncData.type) {
      case 'procurement': {
        const d = syncData.data;
        addOrder({
          itemName: String(d.item_name || '未知物品'),
          category: normalizeInventoryCategory(d.category),
          quantity: Number(d.quantity) || 1,
          unit: String(d.unit || '个'),
          unitPrice: Number(d.price) || 0,
          supplier: String(d.supplier || '线上'),
          purchaseDate: today,
          status: 'delivered',
          consumed: 0,
        });
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
          const meals = rawMeals.map(rawMeal => {
            const meal = rawMeal as Record<string, unknown>;
            return {
              time: String(meal.time || '08:00'),
              food: String(meal.food || '待确认食物'),
              note: String(meal.note || ''),
            };
          });
          return {
            id: `stage_${Date.now()}_${stageIndex}`,
            name: String(stage.name || `阶段 ${stageIndex + 1}`),
            startDate: String(stage.start_date || today),
            endDate: String(stage.end_date || stage.start_date || today),
            description: String(stage.description || ''),
            mealsPerDay: Math.max(1, meals.length),
            mealSchedule: meals.length > 0 ? meals : [{ time: '08:00', food: '待确认食物', note: '' }],
            supplements: String(stage.supplements || ''),
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
            mealSchedule: [{ time: '08:00', food: '待确认食物', note: '' }],
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
    try {
      // Build message history for API
      const apiMessages = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      apiMessages.push({ role: 'user' as const, content: content.trim() });

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, image }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;

          try {
            const data = JSON.parse(payload);
            if (data.text) {
              fullText += data.text;
              // Clean sync data markers from display
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
            // Skip malformed chunks
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : '网络错误';
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
      setLoading(false);
    }
  }, [messages, syncData, addChatMessages]);

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
        <div className="fixed bottom-6 right-6 w-[400px] h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col z-50 border border-[#D6E8F5] animate-in fade-in slide-in-from-bottom-4 duration-200">
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
                <p className="text-sm text-[#6B8A9E] mb-1">你好！我是你的智能助手</p>
                <p className="text-xs text-[#6B8A9E]/70 mb-4">可以帮你录入数据、查询信息</p>
                <div className="text-[11px] text-[#6B8A9E]/60 space-y-1">
                  <p>试试说：</p>
                  <p>“买了猫粮200块”</p>
                  <p>“制定一周喂食计划”</p>
                  <p>“猫瘟住院了7天”</p>
                  <p>或者直接发图片给我识别</p>
                </div>
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
          {messages.length === 0 && (
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
                placeholder="说点什么...（可粘贴图片）"
                className="flex-1 bg-[#E8F4FD] rounded-full px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#89CFF0] transition-shadow"
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || (!input.trim() && !pendingImage)}
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
