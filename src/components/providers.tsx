'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loadState, saveState, type AppState, type Order, type FeedingRecord, type FeedingPlan, type HealthRecord, type Expense, type ChatMessage } from '@/lib/store';

interface AppContextType {
  state: AppState;
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  updateOrderCategory: (id: string, category: string) => void;
  recordOrderUsage: (id: string, amount: number) => void;
  deleteOrder: (id: string) => void;
  addFeedingRecord: (record: Omit<FeedingRecord, 'id'>) => void;
  updateFeedingRecord: (id: string, record: Partial<FeedingRecord>) => void;
  deleteFeedingRecord: (id: string) => void;
  toggleFeedingComplete: (id: string) => void;
  addFeedingPlan: (plan: Omit<FeedingPlan, 'id' | 'createdAt'>) => string;
  updateFeedingPlan: (id: string, updates: Partial<Omit<FeedingPlan, 'id' | 'createdAt'>>) => void;
  deleteFeedingPlan: (id: string) => void;
  addHealthRecord: (record: Omit<HealthRecord, 'id'>) => void;
  updateHealthRecord: (id: string, updates: Partial<Omit<HealthRecord, 'id'>>) => void;
  deleteHealthRecord: (id: string) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  updateExpense: (id: string, updates: Partial<Omit<Expense, 'id'>>) => void;
  deleteExpense: (id: string) => void;
  addChatMessages: (msgs: Omit<ChatMessage, 'id'>[]) => void;
  clearChatMessages: () => void;
  restoreState: (nextState: AppState) => void;
}

const AppContext = createContext<AppContextType | null>(null);

let _idCounter = Date.now();
function genId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}${_idCounter}`;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    orders: [],
    feedingRecords: [],
    feedingPlans: [],
    healthRecords: [],
    expenses: [],
    chatMessages: [],
  });
  const [loaded, setLoaded] = useState(false);

  // All personal data stays in this browser/PWA installation.
  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  // Save immediately after every local change.
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const addOrder = useCallback((order: Omit<Order, 'id'>) => {
    const id = genId('o');
    const newOrder = { ...order, id };
    setState(prev => ({ ...prev, orders: [...prev.orders, newOrder] }));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order['status']) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === id ? { ...o, status } : o),
    }));
  }, []);

  const updateOrderCategory = useCallback((id: string, category: string) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(order => order.id === id ? { ...order, category } : order),
    }));
  }, []);

  const recordOrderUsage = useCallback((id: string, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    setState(prev => {
      const order = prev.orders.find(item => item.id === id);
      if (!order) return prev;

      const consumed = Math.min(order.quantity, order.consumed + amount);

      return {
        ...prev,
        orders: prev.orders.map(item => item.id === id ? { ...item, consumed } : item),
      };
    });
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== id) }));
  }, []);

  const addFeedingRecord = useCallback((record: Omit<FeedingRecord, 'id'>) => {
    const id = genId('f');
    const newRecord = { ...record, id };
    setState(prev => ({ ...prev, feedingRecords: [...prev.feedingRecords, newRecord] }));
  }, []);

  const updateFeedingRecord = useCallback((id: string, updates: Partial<FeedingRecord>) => {
    setState(prev => ({
      ...prev,
      feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, ...updates } : r),
    }));
  }, []);

  const deleteFeedingRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, feedingRecords: prev.feedingRecords.filter(r => r.id !== id) }));
  }, []);

  const toggleFeedingComplete = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, completed: !r.completed } : r),
    }));
  }, []);

  const addFeedingPlan = useCallback((plan: Omit<FeedingPlan, 'id' | 'createdAt'>) => {
    const id = genId('fp');
    const newPlan = { ...plan, id, createdAt: new Date().toISOString() };
    setState(prev => ({ ...prev, feedingPlans: [...prev.feedingPlans, newPlan] }));
    return id;
  }, []);

  const updateFeedingPlan = useCallback((id: string, updates: Partial<Omit<FeedingPlan, 'id' | 'createdAt'>>) => {
    setState(prev => ({
      ...prev,
      feedingPlans: prev.feedingPlans.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
  }, []);

  const deleteFeedingPlan = useCallback((id: string) => {
    setState(prev => ({ ...prev, feedingPlans: prev.feedingPlans.filter(p => p.id !== id) }));
  }, []);

  const addHealthRecord = useCallback((record: Omit<HealthRecord, 'id'>) => {
    const id = genId('h');
    const newRecord = { ...record, id };
    setState(prev => ({ ...prev, healthRecords: [...prev.healthRecords, newRecord] }));
  }, []);

  const updateHealthRecord = useCallback((id: string, updates: Partial<Omit<HealthRecord, 'id'>>) => {
    setState(prev => {
      const existing = prev.healthRecords.find(record => record.id === id);
      if (!existing) return prev;
      const nextRecord = { ...existing, ...updates };
      return {
        ...prev,
        healthRecords: prev.healthRecords.map(record => record.id === id ? nextRecord : record),
      };
    });
  }, []);

  const deleteHealthRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, healthRecords: prev.healthRecords.filter(r => r.id !== id) }));
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    const id = genId('e');
    const newExpense = { ...expense, id };
    setState(prev => ({ ...prev, expenses: [...prev.expenses, newExpense] }));
  }, []);

  const updateExpense = useCallback((id: string, updates: Partial<Omit<Expense, 'id'>>) => {
    setState(prev => {
      const existing = prev.expenses.find(expense => expense.id === id);
      if (!existing) return prev;
      const nextExpense = { ...existing, ...updates };
      return {
        ...prev,
        expenses: prev.expenses.map(expense => expense.id === id ? nextExpense : expense),
      };
    });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
  }, []);

  const addChatMessages = useCallback((msgs: Omit<ChatMessage, 'id'>[]) => {
    const newMsgs = msgs.map(m => ({ ...m, id: genId('c') }));
    setState(prev => ({ ...prev, chatMessages: [...prev.chatMessages, ...newMsgs] }));
  }, []);

  const clearChatMessages = useCallback(() => {
    const greeting: ChatMessage = {
      id: genId('c'),
      role: 'assistant',
      content: '你好！我是钟福的专属助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。',
      timestamp: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, chatMessages: [greeting] }));
  }, []);

  const restoreState = useCallback((nextState: AppState) => {
    saveState(nextState);
    setState(nextState);
  }, []);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{ state, addOrder, updateOrderStatus, updateOrderCategory, recordOrderUsage, deleteOrder, addFeedingRecord, updateFeedingRecord, deleteFeedingRecord, toggleFeedingComplete, addFeedingPlan, updateFeedingPlan, deleteFeedingPlan, addHealthRecord, updateHealthRecord, deleteHealthRecord, addExpense, updateExpense, deleteExpense, addChatMessages, clearChatMessages, restoreState }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
