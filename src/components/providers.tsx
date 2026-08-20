'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loadState, saveState, type AppState, type Order, type FeedingRecord, type HealthRecord, type Expense, type ChatMessage } from '@/lib/store';

interface AppContextType {
  state: AppState;
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  addFeedingRecord: (record: Omit<FeedingRecord, 'id'>) => void;
  toggleFeedingComplete: (id: string) => void;
  addHealthRecord: (record: Omit<HealthRecord, 'id'>) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  addChatMessages: (msgs: Omit<ChatMessage, 'id'>[]) => void;
  clearChatMessages: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

let _idCounter = 1000;
function genId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}${_idCounter}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    orders: [],
    feedingRecords: [],
    healthRecords: [],
    expenses: [],
    chatMessages: [],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const addOrder = useCallback((order: Omit<Order, 'id'>) => {
    setState(prev => ({ ...prev, orders: [...prev.orders, { ...order, id: genId('o') }] }));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order['status']) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === id ? { ...o, status } : o),
    }));
  }, []);

  const addFeedingRecord = useCallback((record: Omit<FeedingRecord, 'id'>) => {
    setState(prev => ({ ...prev, feedingRecords: [...prev.feedingRecords, { ...record, id: genId('f') }] }));
  }, []);

  const toggleFeedingComplete = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, completed: !r.completed } : r),
    }));
  }, []);

  const addHealthRecord = useCallback((record: Omit<HealthRecord, 'id'>) => {
    setState(prev => ({ ...prev, healthRecords: [...prev.healthRecords, { ...record, id: genId('h') }] }));
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    setState(prev => ({ ...prev, expenses: [...prev.expenses, { ...expense, id: genId('e') }] }));
  }, []);

  const addChatMessages = useCallback((msgs: Omit<ChatMessage, 'id'>[]) => {
    setState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, ...msgs.map(m => ({ ...m, id: genId('c') }))],
    }));
  }, []);

  const clearChatMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      chatMessages: [{ id: genId('c'), role: 'assistant', content: '你好！我是钟福的专属助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。', timestamp: new Date().toISOString() }],
    }));
  }, []);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{ state, addOrder, updateOrderStatus, addFeedingRecord, toggleFeedingComplete, addHealthRecord, addExpense, addChatMessages, clearChatMessages }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
