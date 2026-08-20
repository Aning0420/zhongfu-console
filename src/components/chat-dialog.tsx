'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Send, MessageCircle, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/components/providers';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/store';

/* ── 意图解析引擎 ── */

const MEAL_KEYWORDS: Record<string, string> = {
  '早餐': 'breakfast', '早饭': 'breakfast', '早上': 'breakfast',
  '午餐': 'lunch', '午饭': 'lunch', '中午': 'lunch',
  '晚餐': 'dinner', '晚饭': 'dinner', '晚上': 'dinner',
  '零食': 'snack', '加餐': 'snack', '小吃': 'snack',
};

const CATEGORY_MAP: Record<string, string> = {
  '猫粮': '主粮', '狗粮': '主粮', '主粮': '主粮', '粮': '主粮',
  '罐头': '零食', '妙鲜包': '零食', '零食': '零食', '肉干': '零食', '冻干': '零食',
  '猫砂': '日用', '尿垫': '日用', '沐浴露': '日用', '日用': '日用', '清洁': '日用',
  '化毛膏': '保健品', '营养膏': '保健品', '羊奶粉': '保健品', '维生素': '保健品', '保健': '保健品', '钙片': '保健品',
  '玩具': '玩具', '逗猫棒': '玩具', '猫爬架': '玩具',
  '驱虫': '医疗', '疫苗': '医疗', '体检': '医疗', '看病': '医疗', '药': '医疗',
};

function detectCategory(text: string): string {
  for (const [keyword, cat] of Object.entries(CATEGORY_MAP)) {
    if (text.includes(keyword)) return cat;
  }
  return '其他';
}

function extractAmount(text: string): number | null {
  // Match patterns: 200块, 200元, ¥200, 200
  const patterns = [
    /(\d+\.?\d*)\s*[块元]/,
    /[¥￥]\s*(\d+\.?\d*)/,
    /花了?\s*(\d+\.?\d*)/,
    /(\d+\.?\d*)\s*块/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function extractWeight(text: string): number | null {
  const m = text.match(/(\d+\.?\d*)\s*(kg|公斤|斤)/i);
  if (m) {
    let val = parseFloat(m[1]);
    if (m[2] === '斤') val = val / 2; // 斤 to kg
    return val;
  }
  // Also try just number with "体重" context
  const m2 = text.match(/体重\s*(\d+\.?\d*)/);
  if (m2) return parseFloat(m2[1]);
  return null;
}

function extractQuantity(text: string): { qty: number; unit: string } | null {
  const m = text.match(/(\d+\.?\d*)\s*(kg|斤|包|袋|罐|盒|瓶|支|个|件|套|条)/i);
  if (m) return { qty: parseFloat(m[1]), unit: m[2] };
  return null;
}

function extractItemName(text: string): string {
  // Remove action keywords and amount info to get item name
  let name = text
    .replace(/(我|今天|昨天|刚|又|也|了|的|啦|吧|啊|呢|哦|～|~)/g, '')
    .replace(/(买了|采购|下单|购入|入手|花了|支出|喂了|喂食|吃了|称了|体重|去了|看了)/g, '')
    .replace(/(\d+\.?\d*\s*[块元kg斤包袋罐盒瓶支个件套条])/g, '')
    .replace(/[¥￥]\s*\d+/g, '')
    .trim();
  return name || '未命名物品';
}

interface ParseResult {
  intent: 'purchase' | 'feeding' | 'weight' | 'query' | 'chat';
  data: Record<string, unknown>;
  confirmMsg: string;
}

function parseIntent(text: string, ctx: {
  orders: { itemName: string; quantity: number; consumed: number; unit: string }[];
  feedingRecords: { date: string; mealType: string; completed: boolean }[];
  expenses: { amount: number; date: string }[];
  healthRecords: { type: string; date: string; weight?: number }[];
}): ParseResult {
  const today = new Date().toISOString().split('T')[0];
  const thisMonth = today.slice(0, 7);

  // ── 1. 购买/支出意图 ──
  if (/买了|采购|下单|购入|入手|花了|支出/.test(text)) {
    const amount = extractAmount(text);
    const category = detectCategory(text);
    const itemName = extractItemName(text);
    const qty = extractQuantity(text);

    return {
      intent: 'purchase',
      data: { itemName, category, amount, qty, date: today },
      confirmMsg: [
        `好的，已帮你记录：`,
        `- 采购：${itemName}${qty ? ` ${qty.qty}${qty.unit}` : ''}`,
        amount ? `- 支出：¥${amount}（分类：${category}）` : '',
        '',
        '数据已同步到采购总览和支出记账~',
      ].filter(Boolean).join('\n'),
    };
  }

  // ── 2. 喂食意图 ──
  if (/喂了|喂食|吃了|喂|打卡/.test(text) && !/买了|花了/.test(text)) {
    let mealType = 'breakfast';
    for (const [kw, mt] of Object.entries(MEAL_KEYWORDS)) {
      if (text.includes(kw)) { mealType = mt; break; }
    }
    const mealLabels: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食' };
    const foodName = extractItemName(text);
    const qty = extractQuantity(text);

    return {
      intent: 'feeding',
      data: { mealType, foodName: foodName === '未命名物品' ? '猫粮' : foodName, qty, date: today },
      confirmMsg: `已帮你打卡${mealLabels[mealType]}：${foodName === '未命名物品' ? '猫粮' : foodName}${qty ? ` ${qty.qty}${qty.unit}` : ''} ✅`,
    };
  }

  // ── 3. 体重意图 ──
  if (/体重|称了|称重/.test(text)) {
    const weight = extractWeight(text);
    if (weight) {
      return {
        intent: 'weight',
        data: { weight, date: today },
        confirmMsg: `已记录体重：${weight}kg ✅ 快去健康管理看看趋势吧~`,
      };
    }
    return {
      intent: 'chat',
      data: {},
      confirmMsg: '请告诉我具体体重数值哦，比如"体重4.5kg"',
    };
  }

  // ── 4. 查询意图 ──
  if (/统计|多少|剩余|还有|库存|本月|今天|花了多少|支出/.test(text)) {
    const monthExpenses = ctx.expenses.filter(e => e.date.startsWith(thisMonth));
    const totalMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const todayFeedings = ctx.feedingRecords.filter(r => r.date === today);
    const completedCount = todayFeedings.filter(r => r.completed).length;
    const latestWeight = ctx.healthRecords.filter(r => r.type === 'weight' && r.weight).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];

    const lines = [`当前状态一览：`];
    if (totalMonth > 0) lines.push(`- 本月支出：¥${totalMonth.toLocaleString()}`);
    lines.push(`- 今日喂食：${completedCount}/${todayFeedings.length || 3} 已完成`);
    if (latestWeight?.weight) lines.push(`- 最新体重：${latestWeight.weight}kg`);
    const lowStock = ctx.orders.filter(o => {
      const ratio = (o.quantity - o.consumed) / o.quantity;
      return ratio < 0.3;
    });
    if (lowStock.length > 0) {
      lines.push(`- 库存预警：${lowStock.map(o => o.itemName).join('、')}不足`);
    }

    return { intent: 'query', data: {}, confirmMsg: lines.join('\n') };
  }

  // ── 5. 默认闲聊 ──
  return {
    intent: 'chat',
    data: {},
    confirmMsg: `收到！你可以试试这样跟我说：\n\n- "买了猫粮 200块" → 自动录入采购+支出\n- "喂了早餐" → 自动打卡喂食\n- "体重4.5kg" → 记录体重\n- "本月统计" → 查看数据概览`,
  };
}

/* ── 快捷回复 ── */

const quickReplies = [
  '本月统计',
  '今天喂食了吗',
  '库存不足的物资',
  '买了猫粮200块',
];

/* ── 组件 ── */

let msgCounter = 2000;
function nextId(): string {
  msgCounter += 1;
  return String(msgCounter);
}

export default function ChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, addOrder, addFeedingRecord, addHealthRecord, addExpense, addChatMessages, clearChatMessages } = useAppContext();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Display messages = persisted messages from context
  const messages = state.chatMessages;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const processMessage = useCallback((text: string) => {
    const content = text.trim();
    if (!content) return;

    // 1. Add user message
    const userMsg = { role: 'user' as const, content, timestamp: new Date().toISOString() };

    // 2. Parse intent
    const result = parseIntent(content, {
      orders: state.orders,
      feedingRecords: state.feedingRecords,
      expenses: state.expenses,
      healthRecords: state.healthRecords,
    });

    // 3. Execute data sync based on intent
    const today = new Date().toISOString().split('T')[0];

    switch (result.intent) {
      case 'purchase': {
        const d = result.data;
        const itemName = d.itemName as string;
        const category = d.category as string;
        const amount = d.amount as number | null;
        const qty = d.qty as { qty: number; unit: string } | null;

        // Add order
        addOrder({
          itemName,
          category,
          quantity: qty?.qty || 1,
          unit: qty?.unit || '个',
          unitPrice: amount || 0,
          purchaseDate: today,
          status: 'delivered',
          consumed: 0,
          supplier: '对话录入',
        });

        // Add expense if amount exists
        if (amount && amount > 0) {
          addExpense({
            date: today,
            category,
            amount,
            description: `${itemName}${qty ? ` ${qty.qty}${qty.unit}` : ''}`,
            relatedModule: 'procurement',
          });
        }
        break;
      }
      case 'feeding': {
        const d = result.data;
        const mealType = d.mealType as 'breakfast' | 'lunch' | 'dinner' | 'snack';
        const foodName = d.foodName as string;
        const qty = d.qty as { qty: number; unit: string } | null;

        addFeedingRecord({
          date: today,
          mealType,
          foodName,
          amount: qty ? `${qty.qty}${qty.unit}` : '适量',
          completed: true,
          note: '对话助手录入',
        });
        break;
      }
      case 'weight': {
        const d = result.data;
        const weight = d.weight as number;

        addHealthRecord({
          date: today,
          type: 'weight',
          title: '体重记录',
          detail: '对话助手录入',
          weight,
        });
        break;
      }
      default:
        break;
    }

    // 4. Add assistant reply
    const assistantMsg = { role: 'assistant' as const, content: result.confirmMsg, timestamp: new Date().toISOString() };

    // 5. Persist both messages
    addChatMessages([userMsg, assistantMsg]);
    setInput('');
  }, [state, addOrder, addFeedingRecord, addHealthRecord, addExpense, addChatMessages]);

  const handleSend = useCallback((text?: string) => {
    processMessage(text || input);
  }, [input, processMessage]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[420px] h-[560px] bg-card rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">钟福助手</p>
              <p className="text-xs text-muted-foreground">说句话就能帮你记数据</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={clearChatMessages} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="清空对话">
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line',
                  msg.role === 'user'
                    ? 'bg-accent text-white rounded-2xl rounded-br-md'
                    : 'bg-muted text-foreground rounded-2xl rounded-bl-md'
                )}
              >
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Replies */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0">
          {quickReplies.map(q => (
            <button
              key={q}
              onClick={() => handleSend(q)}
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:bg-accent/5 hover:text-accent hover:border-accent/30 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border focus-within:border-accent/40 transition-colors">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder='试试说 "买了猫粮200块"...'
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-8 h-8 shrink-0 text-accent hover:bg-accent/10"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
