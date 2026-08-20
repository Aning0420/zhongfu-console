'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Send, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const quickReplies = [
  '今天喂食了吗？',
  '本月支出统计',
  '下次体检时间',
  '库存不足的物资',
];

const autoResponses: Record<string, string> = {
  '今天喂食了吗？': '今天已完成早餐（皇家猫粮 50g），午餐和晚餐还未打卡哦。记得按时喂食~',
  '本月支出统计': '本月累计支出 ¥2,854，其中主粮 ¥890、零食 ¥204、保健品 ¥520、日用 ¥210、医疗 ¥900、玩具 ¥45。',
  '下次体检时间': '上次体检是 7月15日，建议每年体检一次。下次体检建议在 2026年7月左右，届时我会提醒你~',
  '库存不足的物资': '以下物资需要注意：妙鲜包剩余约12包（约4天用量），猫砂剩余约4袋（约20天用量）。建议及时补货。',
};

let msgCounter = 100;
function nextId(): string {
  msgCounter += 1;
  return String(msgCounter);
}

export default function ChatDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'assistant', content: '你好！我是钟福的专属助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。', timestamp: new Date() },
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback((text?: string) => {
    const content = text || input.trim();
    if (!content) return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    setTimeout(() => {
      const reply = autoResponses[content] || `收到你的问题："${content}"。我会持续关注钟福的状态，有任何异常会第一时间提醒你！`;
      const assistantMsg: ChatMessage = { id: nextId(), role: 'assistant', content: reply, timestamp: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
    }, 500);
  }, [input]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 sm:items-center sm:justify-center">
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[420px] h-[560px] bg-card rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">钟福助手</p>
              <p className="text-xs text-muted-foreground">在线</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map(msg => (
            <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : 'bg-muted text-foreground rounded-bl-md'
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
              className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border border-border text-muted-foreground hover:bg-primary/5 hover:text-primary hover:border-primary/30 transition-colors"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2 border border-border focus-within:border-primary/40 transition-colors">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="输入你的问题..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className="w-8 h-8 shrink-0 text-primary hover:bg-primary/10"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
