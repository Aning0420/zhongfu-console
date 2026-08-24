import type { AppState } from '@/lib/store';

const SYNC_KEY_STORAGE = 'zhongfu-sync-key';
const DEVICE_ID_STORAGE = 'zhongfu-device-id';
const SYNC_API_URL = process.env.NEXT_PUBLIC_SYNC_API_URL || '';

export interface CloudSnapshot {
  data: AppState;
  revision: number;
  updatedAt: string;
  deviceId: string;
}

function normalizeSyncKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_STORAGE);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(DEVICE_ID_STORAGE, value);
  return value;
}

function headers(key: string) {
  return {
    'Content-Type': 'application/json',
    'X-Sync-Key': normalizeSyncKey(key),
    'X-Device-Id': deviceId(),
  };
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { error?: string };
    return new Error(body.error || `同步服务返回 ${response.status}`);
  } catch {
    return new Error(`同步服务返回 ${response.status}`);
  }
}

export function cloudSyncAvailable(): boolean {
  return Boolean(SYNC_API_URL);
}

export function getStoredSyncKey(): string {
  if (typeof window === 'undefined') return '';
  return normalizeSyncKey(localStorage.getItem(SYNC_KEY_STORAGE) || '');
}

export function storeSyncKey(key: string): string {
  const normalized = normalizeSyncKey(key);
  if (normalized.length < 8) throw new Error('同步码至少需要 8 位');
  localStorage.setItem(SYNC_KEY_STORAGE, normalized);
  return normalized;
}

export function clearStoredSyncKey() {
  localStorage.removeItem(SYNC_KEY_STORAGE);
}

export function generateSyncKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, value => alphabet[value % alphabet.length]).join('');
}

export async function fetchCloudSnapshot(key: string): Promise<CloudSnapshot | null> {
  if (!SYNC_API_URL) throw new Error('当前版本没有配置云同步地址');
  const response = await fetch(SYNC_API_URL, {
    method: 'GET',
    headers: headers(key),
    cache: 'no-store',
  });
  if (response.status === 404) return null;
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<CloudSnapshot>;
}

export async function saveCloudSnapshot(key: string, data: AppState): Promise<{ revision: number; updatedAt: string }> {
  if (!SYNC_API_URL) throw new Error('当前版本没有配置云同步地址');
  const response = await fetch(SYNC_API_URL, {
    method: 'PUT',
    headers: headers(key),
    body: JSON.stringify({ data }),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<{ revision: number; updatedAt: string }>;
}
