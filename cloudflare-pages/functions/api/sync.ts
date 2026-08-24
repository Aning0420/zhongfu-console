interface D1Result<T> {
  results?: T[];
  success: boolean;
}

interface D1PreparedStatement {
  bind: (...values: unknown[]) => D1PreparedStatement;
  first: <T>() => Promise<T | null>;
  run: <T = Record<string, unknown>>() => Promise<D1Result<T>>;
}

interface D1Database {
  prepare: (query: string) => D1PreparedStatement;
}

interface Env {
  DB: D1Database;
  ALLOWED_ORIGIN: string;
}

interface PagesContext {
  request: Request;
  env: Env;
}

interface SnapshotRow {
  data: string;
  revision: number;
  updated_at: string;
  device_id: string;
}

const MAX_STATE_BYTES = 2 * 1024 * 1024;

function corsHeaders(origin: string) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, X-Sync-Key, X-Device-Id',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}

function json(data: unknown, status: number, origin: string) {
  return Response.json(data, { status, headers: corsHeaders(origin) });
}

function syncKey(request: Request): string {
  const value = (request.headers.get('X-Sync-Key') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (value.length < 8 || value.length > 32) throw new Error('同步码格式不正确');
  return value;
}

function isAppState(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return ['orders', 'feedingRecords', 'feedingPlans', 'healthRecords', 'expenses', 'chatMessages']
    .every(key => Array.isArray(state[key]));
}

export async function onRequest(context: PagesContext) {
  const { request, env } = context;
  const origin = request.headers.get('Origin') || '';
  if (origin !== env.ALLOWED_ORIGIN) return new Response('Forbidden', { status: 403 });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

  try {
    const key = syncKey(request);

    if (request.method === 'GET') {
      const row = await env.DB.prepare(
        'SELECT data, revision, updated_at, device_id FROM sync_snapshots WHERE sync_key = ?'
      ).bind(key).first<SnapshotRow>();
      if (!row) return json({ error: 'not_found' }, 404, origin);
      return json({
        data: JSON.parse(row.data),
        revision: row.revision,
        updatedAt: row.updated_at,
        deviceId: row.device_id,
      }, 200, origin);
    }

    if (request.method === 'PUT') {
      const contentLength = Number(request.headers.get('Content-Length') || 0);
      if (contentLength > MAX_STATE_BYTES) return json({ error: '数据超过 2MB' }, 413, origin);

      const body = await request.json() as { data?: unknown };
      if (!isAppState(body.data)) return json({ error: '同步数据格式不正确' }, 400, origin);
      const serialized = JSON.stringify(body.data);
      if (new TextEncoder().encode(serialized).byteLength > MAX_STATE_BYTES) {
        return json({ error: '数据超过 2MB' }, 413, origin);
      }

      const updatedAt = new Date().toISOString();
      const deviceId = (request.headers.get('X-Device-Id') || 'unknown').slice(0, 80);
      await env.DB.prepare(`
        INSERT INTO sync_snapshots (sync_key, data, revision, updated_at, device_id)
        VALUES (?, ?, 1, ?, ?)
        ON CONFLICT(sync_key) DO UPDATE SET
          data = excluded.data,
          revision = sync_snapshots.revision + 1,
          updated_at = excluded.updated_at,
          device_id = excluded.device_id
      `).bind(key, serialized, updatedAt, deviceId).run();
      const row = await env.DB.prepare(
        'SELECT revision, updated_at FROM sync_snapshots WHERE sync_key = ?'
      ).bind(key).first<{ revision: number; updated_at: string }>();
      return json({ revision: row?.revision || 1, updatedAt: row?.updated_at || updatedAt }, 200, origin);
    }

    return json({ error: 'method_not_allowed' }, 405, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步服务暂时不可用';
    return json({ error: message }, 500, origin);
  }
}
