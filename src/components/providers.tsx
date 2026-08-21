'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { loadState, saveState, type AppState, type Order, type FeedingRecord, type FeedingPlan, type HealthRecord, type Expense, type ChatMessage } from '@/lib/store';

interface AppContextType {
  state: AppState;
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  deleteOrder: (id: string) => void;
  addFeedingRecord: (record: Omit<FeedingRecord, 'id'>) => void;
  updateFeedingRecord: (id: string, record: Partial<FeedingRecord>) => void;
  deleteFeedingRecord: (id: string) => void;
  toggleFeedingComplete: (id: string) => void;
  addFeedingPlan: (plan: Omit<FeedingPlan, 'id' | 'createdAt'>) => string;
  updateFeedingPlan: (id: string, updates: Partial<Omit<FeedingPlan, 'id' | 'createdAt'>>) => void;
  deleteFeedingPlan: (id: string) => void;
  addHealthRecord: (record: Omit<HealthRecord, 'id'>) => void;
  deleteHealthRecord: (id: string) => void;
  addExpense: (expense: Omit<Expense, 'id'>) => void;
  deleteExpense: (id: string) => void;
  addChatMessages: (msgs: Omit<ChatMessage, 'id'>[]) => void;
  clearChatMessages: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

let _idCounter = Date.now();
function genId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}${_idCounter}`;
}

// Helper to convert DB row to app types
function rowToOrder(row: Record<string, unknown>): Order {
  return {
    id: row.id as string,
    itemName: row.item_name as string,
    category: row.category as string,
    quantity: row.quantity as number,
    unit: row.unit as string,
    unitPrice: parseFloat(row.unit_price as string),
    purchaseDate: row.purchase_date as string,
    status: row.status as Order['status'],
    consumed: row.consumed as number,
    supplier: (row.supplier as string) || '',
    productionDate: row.production_date as string | undefined,
    shelfLife: row.shelf_life as number | undefined,
    dailyUsage: row.daily_usage ? parseFloat(row.daily_usage as string) : undefined,
  };
}

function rowToFeedingRecord(row: Record<string, unknown>): FeedingRecord {
  return {
    id: row.id as string,
    date: row.date as string,
    mealType: row.meal_type as FeedingRecord['mealType'],
    foodName: row.food_name as string,
    amount: (row.amount as string) || '',
    completed: row.completed as boolean,
    note: (row.note as string) || '',
    eatingSpeed: row.eating_speed as FeedingRecord['eatingSpeed'],
  };
}

function rowToHealthRecord(row: Record<string, unknown>): HealthRecord {
  return {
    id: row.id as string,
    date: row.date as string,
    type: row.type as HealthRecord['type'],
    title: row.title as string,
    detail: (row.detail as string) || '',
    weight: row.weight ? parseFloat(row.weight as string) : undefined,
    hospital: row.hospital as string | undefined,
    doctor: row.doctor as string | undefined,
  };
}

function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    date: row.date as string,
    category: row.category as string,
    amount: parseFloat(row.amount as string),
    description: (row.description as string) || '',
    relatedModule: (row.related_module as Expense['relatedModule']) || 'other',
  };
}

// Sync helpers using API routes
async function syncToCloud(table: string, data: Record<string, unknown>) {
  try {
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, data }),
    });
  } catch (e) {
    console.warn(`Failed to sync to cloud (${table}):`, e);
  }
}

async function updateInCloud(table: string, id: string, data: Record<string, unknown>) {
  try {
    await fetch('/api/data', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id, data }),
    });
  } catch (e) {
    console.warn(`Failed to update in cloud (${table}):`, e);
  }
}

async function deleteFromCloud(table: string, id?: string) {
  try {
    await fetch('/api/data', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ table, id }),
    });
  } catch (e) {
    console.warn(`Failed to delete from cloud (${table}):`, e);
  }
}

// Load all data from cloud
async function loadFromCloud(): Promise<AppState | null> {
  try {
    const res = await fetch('/api/data?type=all');
    if (!res.ok) return null;
    const json = await res.json();
    
    if (!json.orders && !json.feedingRecords) return null;

    return {
      orders: (json.orders || []).map(rowToOrder),
      feedingRecords: (json.feedingRecords || []).map(rowToFeedingRecord),
      healthRecords: (json.healthRecords || []).map(rowToHealthRecord),
      expenses: (json.expenses || []).map(rowToExpense),
      chatMessages: [],
      feedingPlans: (json.feedingPlans || []).map((p: any) => ({
        ...p,
        startDate: p.start_date,
        endDate: p.end_date,
        stages: p.stages ? JSON.parse(p.stages) : [],
      })),
    };
  } catch {
    return null;
  }
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

  // Load data: try cloud first, fallback to localStorage
  useEffect(() => {
    async function init() {
      const cloudData = await loadFromCloud();
      if (cloudData && (cloudData.orders.length > 0 || cloudData.feedingRecords.length > 0 || cloudData.healthRecords.length > 0 || cloudData.expenses.length > 0)) {
        // Merge with localStorage chat messages
        const localState = loadState();
        setState({
          ...cloudData,
          chatMessages: localState.chatMessages.length > 0 ? localState.chatMessages : cloudData.chatMessages,
        });
      } else {
        setState(loadState());
      }
      setLoaded(true);
    }
    init();
  }, []);

  // Save to localStorage as backup
  useEffect(() => {
    if (loaded) saveState(state);
  }, [state, loaded]);

  const addOrder = useCallback((order: Omit<Order, 'id'>) => {
    const id = genId('o');
    const newOrder = { ...order, id };
    setState(prev => ({ ...prev, orders: [...prev.orders, newOrder] }));
    
    syncToCloud('orders', {
      id,
      item_name: order.itemName,
      category: order.category,
      quantity: order.quantity,
      unit: order.unit,
      unit_price: order.unitPrice.toString(),
      purchase_date: order.purchaseDate,
      status: order.status,
      consumed: order.consumed,
      supplier: order.supplier,
      production_date: order.productionDate || null,
      shelf_life: order.shelfLife || null,
      daily_usage: order.dailyUsage?.toString() || null,
    });
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order['status']) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(o => o.id === id ? { ...o, status } : o),
    }));
    updateInCloud('orders', id, { status });
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setState(prev => ({ ...prev, orders: prev.orders.filter(o => o.id !== id) }));
    deleteFromCloud('orders', id);
  }, []);

  const addFeedingRecord = useCallback((record: Omit<FeedingRecord, 'id'>) => {
    const id = genId('f');
    const newRecord = { ...record, id };
    setState(prev => ({ ...prev, feedingRecords: [...prev.feedingRecords, newRecord] }));
    
    syncToCloud('feeding_records', {
      id,
      date: record.date,
      meal_type: record.mealType,
      food_name: record.foodName,
      amount: record.amount,
      completed: record.completed,
      note: record.note,
      eating_speed: record.eatingSpeed || null,
    });
  }, []);

  const updateFeedingRecord = useCallback((id: string, updates: Partial<FeedingRecord>) => {
    setState(prev => {
      const record = prev.feedingRecords.find(r => r.id === id);
      if (record) {
        const cloudUpdates: Record<string, unknown> = {};
        if (updates.date !== undefined) cloudUpdates.date = updates.date;
        if (updates.mealType !== undefined) cloudUpdates.meal_type = updates.mealType;
        if (updates.foodName !== undefined) cloudUpdates.food_name = updates.foodName;
        if (updates.amount !== undefined) cloudUpdates.amount = updates.amount;
        if (updates.completed !== undefined) cloudUpdates.completed = updates.completed;
        if (updates.note !== undefined) cloudUpdates.note = updates.note;
        if (updates.eatingSpeed !== undefined) cloudUpdates.eating_speed = updates.eatingSpeed;
        updateInCloud('feeding_records', id, cloudUpdates);
      }
      return {
        ...prev,
        feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, ...updates } : r),
      };
    });
  }, []);

  const deleteFeedingRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, feedingRecords: prev.feedingRecords.filter(r => r.id !== id) }));
    deleteFromCloud('feeding_records', id);
  }, []);

  const toggleFeedingComplete = useCallback((id: string) => {
    setState(prev => {
      const record = prev.feedingRecords.find(r => r.id === id);
      if (record) {
        updateInCloud('feeding_records', id, { completed: !record.completed });
      }
      return {
        ...prev,
        feedingRecords: prev.feedingRecords.map(r => r.id === id ? { ...r, completed: !r.completed } : r),
      };
    });
  }, []);

  const addFeedingPlan = useCallback((plan: Omit<FeedingPlan, 'id' | 'createdAt'>) => {
    const id = genId('fp');
    const newPlan = { ...plan, id, createdAt: new Date().toISOString() };
    setState(prev => ({ ...prev, feedingPlans: [...prev.feedingPlans, newPlan] }));
    syncToCloud('feeding_plans', {
      id,
      name: plan.name,
      stages: JSON.stringify(plan.stages),
      active: plan.active ? 1 : 0,
    });
    return id;
  }, []);

  const updateFeedingPlan = useCallback((id: string, updates: Partial<Omit<FeedingPlan, 'id' | 'createdAt'>>) => {
    setState(prev => ({
      ...prev,
      feedingPlans: prev.feedingPlans.map(p => p.id === id ? { ...p, ...updates } : p),
    }));
    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.stages !== undefined) updateData.stages = JSON.stringify(updates.stages);
    if (updates.active !== undefined) updateData.active = updates.active ? 1 : 0;
    updateInCloud('feeding_plans', id, updateData);
  }, []);

  const deleteFeedingPlan = useCallback((id: string) => {
    setState(prev => ({ ...prev, feedingPlans: prev.feedingPlans.filter(p => p.id !== id) }));
    deleteFromCloud('feeding_plans', id);
  }, []);

  const addHealthRecord = useCallback((record: Omit<HealthRecord, 'id'>) => {
    const id = genId('h');
    const newRecord = { ...record, id };
    setState(prev => ({ ...prev, healthRecords: [...prev.healthRecords, newRecord] }));
    
    syncToCloud('health_records', {
      id,
      date: record.date,
      type: record.type,
      title: record.title,
      detail: record.detail,
      weight: record.weight?.toString() || null,
      hospital: record.hospital || null,
      doctor: record.doctor || null,
    });
  }, []);

  const deleteHealthRecord = useCallback((id: string) => {
    setState(prev => ({ ...prev, healthRecords: prev.healthRecords.filter(r => r.id !== id) }));
    deleteFromCloud('health_records', id);
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, 'id'>) => {
    const id = genId('e');
    const newExpense = { ...expense, id };
    setState(prev => ({ ...prev, expenses: [...prev.expenses, newExpense] }));
    
    syncToCloud('expenses', {
      id,
      date: expense.date,
      category: expense.category,
      amount: expense.amount.toString(),
      description: expense.description,
      related_module: expense.relatedModule,
    });
  }, []);

  const deleteExpense = useCallback((id: string) => {
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }));
    deleteFromCloud('expenses', id);
  }, []);

  const addChatMessages = useCallback((msgs: Omit<ChatMessage, 'id'>[]) => {
    const newMsgs = msgs.map(m => ({ ...m, id: genId('c') }));
    setState(prev => ({ ...prev, chatMessages: [...prev.chatMessages, ...newMsgs] }));
    
    newMsgs.forEach(msg => {
      syncToCloud('chat_messages', {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        created_at: msg.timestamp,
      });
    });
  }, []);

  const clearChatMessages = useCallback(() => {
    const greeting: ChatMessage = {
      id: genId('c'),
      role: 'assistant',
      content: '你好！我是钟福的专属助手，有什么可以帮你的吗？你可以问我关于喂食、支出、健康等方面的问题。',
      timestamp: new Date().toISOString(),
    };
    setState(prev => ({ ...prev, chatMessages: [greeting] }));
    
    deleteFromCloud('chat_messages');
    setTimeout(() => {
      syncToCloud('chat_messages', {
        id: greeting.id,
        role: greeting.role,
        content: greeting.content,
        created_at: greeting.timestamp,
      });
    }, 500);
  }, []);

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{ state, addOrder, updateOrderStatus, deleteOrder, addFeedingRecord, updateFeedingRecord, deleteFeedingRecord, toggleFeedingComplete, addFeedingPlan, updateFeedingPlan, deleteFeedingPlan, addHealthRecord, deleteHealthRecord, addExpense, deleteExpense, addChatMessages, clearChatMessages }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
