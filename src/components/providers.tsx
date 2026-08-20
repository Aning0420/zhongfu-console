'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loadState, saveState, type AppState, type Order, type FeedingRecord, type HealthRecord, type Expense } from '@/lib/store';

interface AppContextType {
  state: AppState;
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  addFeedingRecord: (record: Omit<FeedingRecord, 'id'>) => void;
  toggleFeedingComplete: (id: string) => void;
  addHealthRecord: (record: Omit<HealthRecord, 'id'>) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    orders: [],
    feedingRecords: [],
    healthRecords: [],
    expenses: [],
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
    setState(prev => ({ ...prev, orders: [...prev.orders, { ...order, id: `o${Date.now()}` }] }));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order['status']) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === id ? { ...o, status } : o),
    }));
  }, []);

  const addFeedingRecord = useCallback((record: Omit<FeedingRecord, 'id'>) => {
    setState(prev => ({ ...prev, feedingRecords: [...prev.feedingRecords, { ...record, id: `f${Date.now()}` }] }));
  }, []);

  const toggleFeedingComplete = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, completed: !r.completed } : r),
    }));
  }, []);

  const addHealthRecord = useCallback((record: Omit<HealthRecord, 'id'>) => {
    setState(prev => ({ ...prev, healthRecords: [...prev.healthRecords, { ...record, id: `h${Date.now()}` }] }));
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    setState(prev => ({ ...prev, expenses: [...prev.expenses, { ...expense, id: `e${Date.now()}` }] }));
  }, []);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{ state, addOrder, updateOrderStatus, addFeedingRecord, toggleFeedingComplete, addHealthRecord, addExpense }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
