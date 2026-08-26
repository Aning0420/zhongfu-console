'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import {
  deductInventoryForFeeding,
  convertInventoryAmount,
  loadState,
  parseBackup,
  restoreInventoryDeductions,
  saveState,
  type AppState,
  type Order,
  type FeedingRecord,
  type FeedingPlan,
  type HealthRecord,
  type Expense,
  type ChatMessage,
} from '@/lib/store';
import { plannedFeedingRecordsForDate, reconcilePlannedFeedingRecords } from '@/lib/feeding-plan';
import { localDateKey, millisecondsUntilNextLocalDay } from '@/lib/local-date';
import {
  clearStoredSyncKey,
  cloudSyncAvailable,
  fetchCloudSnapshot,
  generateSyncKey,
  getStoredSyncKey,
  saveCloudSnapshot,
  storeSyncKey,
} from '@/lib/cloud-sync';

export interface SyncInfo {
  available: boolean;
  key: string;
  status: 'off' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';
  lastSyncedAt: string;
  error: string;
}

interface AppContextType {
  state: AppState;
  today: string;
  addOrder: (order: Omit<Order, 'id'>) => void;
  updateOrder: (id: string, updates: Partial<Omit<Order, 'id'>>) => void;
  updateOrderStatus: (id: string, status: Order['status']) => void;
  markOrderRepurchased: (id: string, date: string) => void;
  updateOrderCategory: (id: string, category: string) => void;
  adjustOrderStock: (id: string, mode: 'consume' | 'restore', amount: number) => void;
  deleteOrder: (id: string) => void;
  addFeedingRecord: (record: Omit<FeedingRecord, 'id'>) => void;
  syncPlannedFeedingRecords: (date: string, planId: string, records: Omit<FeedingRecord, 'id'>[]) => void;
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
  syncInfo: SyncInfo;
  createCloudSync: () => Promise<string>;
  connectCloudSync: (key: string) => Promise<'created' | 'connected'>;
  disconnectCloudSync: () => void;
  syncNow: () => Promise<void>;
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
  const [today, setToday] = useState(localDateKey);
  const [syncInfo, setSyncInfo] = useState<SyncInfo>({
    available: false,
    key: '',
    status: 'off',
    lastSyncedAt: '',
    error: '',
  });
  const stateRef = useRef(state);
  const syncKeyRef = useRef('');
  const syncReadyRef = useRef(false);
  const suppressUploadRef = useRef(false);
  const uploadTimerRef = useRef<number | null>(null);
  const uploadingRef = useRef(false);
  const revisionRef = useRef(0);

  useEffect(() => {
    const initialState = loadState();
    const storedKey = getStoredSyncKey();
    stateRef.current = initialState;
    syncKeyRef.current = storedKey;
    setState(initialState);
    setSyncInfo({
      available: cloudSyncAvailable(),
      key: storedKey,
      status: storedKey ? 'connecting' : 'off',
      lastSyncedAt: '',
      error: '',
    });
    setLoaded(true);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const refreshDate = () => setToday(localDateKey());
    const scheduleMidnight = () => {
      timer = window.setTimeout(() => {
        refreshDate();
        scheduleMidnight();
      }, millisecondsUntilNextLocalDay());
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDate();
    };
    scheduleMidnight();
    window.addEventListener('focus', refreshDate);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', refreshDate);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const applyCloudState = useCallback((data: AppState, revision: number, updatedAt: string) => {
    const validated = parseBackup(JSON.stringify(data));
    suppressUploadRef.current = true;
    revisionRef.current = revision;
    stateRef.current = validated;
    saveState(validated);
    setState(validated);
    setSyncInfo(current => ({ ...current, status: 'synced', lastSyncedAt: updatedAt, error: '' }));
  }, []);

  const pushCurrentState = useCallback(async () => {
    const key = syncKeyRef.current;
    if (!key || !syncReadyRef.current || uploadingRef.current) return;
    uploadingRef.current = true;
    setSyncInfo(current => ({ ...current, status: 'syncing', error: '' }));
    try {
      const result = await saveCloudSnapshot(key, stateRef.current);
      revisionRef.current = result.revision;
      setSyncInfo(current => ({ ...current, status: 'synced', lastSyncedAt: result.updatedAt, error: '' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : '云同步失败';
      setSyncInfo(current => ({ ...current, status: navigator.onLine ? 'error' : 'offline', error: message }));
      throw error;
    } finally {
      uploadingRef.current = false;
    }
  }, []);

  const connectCloudSync = useCallback(async (rawKey: string): Promise<'created' | 'connected'> => {
    const key = storeSyncKey(rawKey);
    syncKeyRef.current = key;
    syncReadyRef.current = false;
    setSyncInfo(current => ({ ...current, available: true, key, status: 'connecting', error: '' }));
    try {
      const remote = await fetchCloudSnapshot(key);
      if (remote) {
        applyCloudState(remote.data, remote.revision, remote.updatedAt);
        syncReadyRef.current = true;
        return 'connected';
      }

      const result = await saveCloudSnapshot(key, stateRef.current);
      revisionRef.current = result.revision;
      syncReadyRef.current = true;
      setSyncInfo(current => ({ ...current, status: 'synced', lastSyncedAt: result.updatedAt, error: '' }));
      return 'created';
    } catch (error) {
      syncReadyRef.current = false;
      const message = error instanceof Error ? error.message : '无法连接云同步';
      setSyncInfo(current => ({ ...current, status: navigator.onLine ? 'error' : 'offline', error: message }));
      throw error;
    }
  }, [applyCloudState]);

  const createCloudSync = useCallback(async () => {
    const key = generateSyncKey();
    await connectCloudSync(key);
    return key;
  }, [connectCloudSync]);

  const disconnectCloudSync = useCallback(() => {
    if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
    uploadTimerRef.current = null;
    syncReadyRef.current = false;
    syncKeyRef.current = '';
    revisionRef.current = 0;
    clearStoredSyncKey();
    setSyncInfo(current => ({ ...current, key: '', status: 'off', lastSyncedAt: '', error: '' }));
  }, []);

  const syncNow = useCallback(async () => {
    if (!syncKeyRef.current) throw new Error('请先开启云同步');
    await pushCurrentState();
  }, [pushCurrentState]);

  useEffect(() => {
    if (!loaded || !syncInfo.key || syncReadyRef.current) return;
    void connectCloudSync(syncInfo.key).catch(() => undefined);
  }, [loaded, syncInfo.key, connectCloudSync]);

  useEffect(() => {
    stateRef.current = state;
    if (!loaded) return;
    saveState(state);
    if (suppressUploadRef.current) {
      suppressUploadRef.current = false;
      return;
    }
    if (!syncReadyRef.current || !syncKeyRef.current) return;
    if (uploadTimerRef.current !== null) window.clearTimeout(uploadTimerRef.current);
    setSyncInfo(current => ({ ...current, status: 'syncing', error: '' }));
    uploadTimerRef.current = window.setTimeout(() => {
      uploadTimerRef.current = null;
      void pushCurrentState().catch(() => undefined);
    }, 1_000);
  }, [state, loaded, pushCurrentState]);

  useEffect(() => {
    if (!loaded || !syncInfo.key) return;
    let stopped = false;
    const pullLatest = async () => {
      if (
        stopped || !syncReadyRef.current || uploadingRef.current || uploadTimerRef.current !== null
        || document.visibilityState === 'hidden'
      ) return;
      try {
        const remote = await fetchCloudSnapshot(syncKeyRef.current);
        if (remote && remote.revision > revisionRef.current) {
          applyCloudState(remote.data, remote.revision, remote.updatedAt);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '无法读取云端数据';
        setSyncInfo(current => ({ ...current, status: navigator.onLine ? 'error' : 'offline', error: message }));
      }
    };
    const interval = window.setInterval(() => void pullLatest(), 20_000);
    const onOnline = () => void pullLatest();
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
    };
  }, [loaded, syncInfo.key, applyCloudState]);

  const addOrder = useCallback((order: Omit<Order, 'id'>) => {
    const id = genId('o');
    const newOrder = { ...order, id };
    setState(prev => ({ ...prev, orders: [...prev.orders, newOrder] }));
  }, []);

  const updateOrder = useCallback((id: string, updates: Partial<Omit<Order, 'id'>>) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(order => {
        if (order.id !== id) return order;
        const quantity = Number.isFinite(updates.quantity) && (updates.quantity ?? 0) > 0
          ? updates.quantity!
          : order.quantity;
        const nextUnit = updates.unit?.trim() || order.unit;
        const convertedConsumed = nextUnit !== order.unit
          ? convertInventoryAmount(order.consumed, order.unit, nextUnit) ?? order.consumed
          : order.consumed;
        const convertedBeforeFinished = order.consumedBeforeFinished === undefined
          ? undefined
          : nextUnit !== order.unit
            ? convertInventoryAmount(order.consumedBeforeFinished, order.unit, nextUnit) ?? order.consumedBeforeFinished
            : order.consumedBeforeFinished;
        const convertedBeforeDurable = order.consumedBeforeDurable === undefined
          ? undefined
          : nextUnit !== order.unit
            ? convertInventoryAmount(order.consumedBeforeDurable, order.unit, nextUnit) ?? order.consumedBeforeDurable
            : order.consumedBeforeDurable;
        const nextStatus = updates.status ?? order.status;
        const activeConsumed = order.status === 'finished'
          ? convertedBeforeFinished ?? convertedConsumed
          : order.status === 'durable'
            ? convertedBeforeDurable ?? convertedConsumed
            : convertedConsumed;
        const next = {
          ...order,
          ...updates,
          quantity,
          unit: nextUnit,
          consumed: Math.min(quantity, activeConsumed),
          consumedBeforeFinished: undefined,
          consumedBeforeDurable: undefined,
        };

        if (nextStatus === 'finished') {
          return {
            ...next,
            status: nextStatus,
            consumedBeforeFinished: Math.min(quantity, activeConsumed),
            consumed: quantity,
          };
        }
        if (nextStatus === 'durable') {
          return {
            ...next,
            status: nextStatus,
            consumedBeforeDurable: Math.min(quantity, activeConsumed),
            consumed: 0,
          };
        }
        return { ...next, status: nextStatus };
      }),
    }));
  }, []);

  const updateOrderStatus = useCallback((id: string, status: Order['status']) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(order => {
        if (order.id !== id) return order;
        const activeConsumed = order.status === 'finished'
          ? order.consumedBeforeFinished ?? order.consumed
          : order.status === 'durable'
            ? order.consumedBeforeDurable ?? order.consumed
            : order.consumed;
        if (status === 'finished') {
          return {
            ...order,
            status,
            consumedBeforeFinished: Math.min(order.quantity, activeConsumed),
            consumedBeforeDurable: undefined,
            consumed: order.quantity,
          };
        }
        if (status === 'durable') {
          return {
            ...order,
            status,
            consumed: 0,
            consumedBeforeFinished: undefined,
            consumedBeforeDurable: Math.min(order.quantity, activeConsumed),
          };
        }
        return {
          ...order,
          status,
          consumed: Math.min(order.quantity, activeConsumed),
          consumedBeforeFinished: undefined,
          consumedBeforeDurable: undefined,
        };
      }),
    }));
  }, []);

  const updateOrderCategory = useCallback((id: string, category: string) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(order => order.id === id ? { ...order, category } : order),
    }));
  }, []);

  const markOrderRepurchased = useCallback((id: string, date: string) => {
    setState(prev => ({
      ...prev,
      orders: prev.orders.map(order => order.id === id ? { ...order, repurchasedAt: date } : order),
    }));
  }, []);

  const adjustOrderStock = useCallback((id: string, mode: 'consume' | 'restore', amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;

    setState(prev => {
      const order = prev.orders.find(item => item.id === id);
      if (!order) return prev;

      const consumed = mode === 'consume'
        ? Math.min(order.quantity, order.consumed + amount)
        : Math.max(0, order.consumed - amount);

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
    setState(prev => {
      const baseRecord = { ...record, id, inventoryDeductions: undefined };
      const result = deductInventoryForFeeding(baseRecord, prev.orders);
      const newRecord = result.deductions.length > 0
        ? { ...baseRecord, inventoryDeductions: result.deductions }
        : baseRecord;
      return { ...prev, orders: result.orders, feedingRecords: [...prev.feedingRecords, newRecord] };
    });
  }, []);

  const syncPlannedFeedingRecords = useCallback((date: string, planId: string, records: Omit<FeedingRecord, 'id'>[]) => {
    setState(prev => {
      const result = reconcilePlannedFeedingRecords(prev.feedingRecords, date, planId, records, () => genId('f'));
      return result.changed ? { ...prev, feedingRecords: result.records } : prev;
    });
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const activePlan = state.feedingPlans.find(plan => plan.active);
    if (!activePlan) return;
    const records = plannedFeedingRecordsForDate(activePlan, today);
    if (records.length > 0) syncPlannedFeedingRecords(today, activePlan.id, records);
  }, [loaded, state.feedingPlans, syncPlannedFeedingRecords, today]);

  const updateFeedingRecord = useCallback((id: string, updates: Partial<FeedingRecord>) => {
    setState(prev => {
      const current = prev.feedingRecords.find(record => record.id === id);
      if (!current) return prev;
      const shouldRecalculate = ['foodName', 'amount', 'remainingAmount', 'completed']
        .some(field => Object.prototype.hasOwnProperty.call(updates, field));
      if (!shouldRecalculate) {
        return {
          ...prev,
          feedingRecords: prev.feedingRecords.map(record => record.id === id ? { ...record, ...updates } : record),
        };
      }

      const restoredOrders = restoreInventoryDeductions(prev.orders, current.inventoryDeductions);
      const nextRecord = { ...current, ...updates, inventoryDeductions: undefined };
      const result = deductInventoryForFeeding(nextRecord, restoredOrders);
      const storedRecord = result.deductions.length > 0
        ? { ...nextRecord, inventoryDeductions: result.deductions }
        : nextRecord;
      return {
        ...prev,
        orders: result.orders,
        feedingRecords: prev.feedingRecords.map(record => record.id === id ? storedRecord : record),
      };
    });
  }, []);

  const deleteFeedingRecord = useCallback((id: string) => {
    setState(prev => {
      const record = prev.feedingRecords.find(item => item.id === id);
      return {
        ...prev,
        orders: restoreInventoryDeductions(prev.orders, record?.inventoryDeductions),
        feedingRecords: prev.feedingRecords.filter(item => item.id !== id),
      };
    });
  }, []);

  const toggleFeedingComplete = useCallback((id: string) => {
    setState(prev => {
      const current = prev.feedingRecords.find(record => record.id === id);
      if (!current) return prev;
      if (current.completed) {
        const nextRecord = { ...current, completed: false, inventoryDeductions: undefined };
        return {
          ...prev,
          orders: restoreInventoryDeductions(prev.orders, current.inventoryDeductions),
          feedingRecords: prev.feedingRecords.map(record => record.id === id ? nextRecord : record),
        };
      }

      const nextRecord = { ...current, completed: true, inventoryDeductions: undefined };
      const result = deductInventoryForFeeding(nextRecord, prev.orders);
      const storedRecord = result.deductions.length > 0
        ? { ...nextRecord, inventoryDeductions: result.deductions }
        : nextRecord;
      return {
        ...prev,
        orders: result.orders,
        feedingRecords: prev.feedingRecords.map(record => record.id === id ? storedRecord : record),
      };
    });
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
    <AppContext.Provider value={{ state, today, addOrder, updateOrder, updateOrderStatus, markOrderRepurchased, updateOrderCategory, adjustOrderStock, deleteOrder, addFeedingRecord, syncPlannedFeedingRecords, updateFeedingRecord, deleteFeedingRecord, toggleFeedingComplete, addFeedingPlan, updateFeedingPlan, deleteFeedingPlan, addHealthRecord, updateHealthRecord, deleteHealthRecord, addExpense, updateExpense, deleteExpense, addChatMessages, clearChatMessages, restoreState, syncInfo, createCloudSync, connectCloudSync, disconnectCloudSync, syncNow }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
