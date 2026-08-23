import type { CareReminder, DailyObservation, HealthRecord } from '@/lib/store';

const META_PREFIX = '__HEALTH_META__=';
const LEGACY_END_DATE = /^__END_DATE__=(\d{4}-\d{2}-\d{2})\n?/;

interface HealthRecordMeta {
  endDate?: string;
  observation?: DailyObservation;
  reminder?: CareReminder;
}

export function parseHealthDetail(rawDetail: string): { detail: string; meta: HealthRecordMeta } {
  if (rawDetail.startsWith(META_PREFIX)) {
    const lineEnd = rawDetail.indexOf('\n');
    const metaText = rawDetail.slice(META_PREFIX.length, lineEnd === -1 ? undefined : lineEnd);
    try {
      return {
        detail: lineEnd === -1 ? '' : rawDetail.slice(lineEnd + 1),
        meta: JSON.parse(metaText) as HealthRecordMeta,
      };
    } catch {
      // Preserve malformed legacy data as visible detail.
    }
  }

  const endDateMatch = rawDetail.match(LEGACY_END_DATE);
  return {
    detail: rawDetail.replace(LEGACY_END_DATE, ''),
    meta: { endDate: endDateMatch?.[1] },
  };
}

export function serializeHealthDetail(record: Pick<HealthRecord, 'detail' | 'endDate' | 'observation' | 'reminder'>): string {
  const meta: HealthRecordMeta = {};
  if (record.endDate) meta.endDate = record.endDate;
  if (record.observation) meta.observation = record.observation;
  if (record.reminder) meta.reminder = record.reminder;

  if (Object.keys(meta).length === 0) return record.detail;
  return `${META_PREFIX}${JSON.stringify(meta)}\n${record.detail}`;
}

export function nextReminderDate(date: string, repeat: CareReminder['repeat'], afterDate = date): string {
  const next = new Date(`${date}T12:00:00`);
  let nextValue = date;
  do {
    if (repeat === 'daily') next.setDate(next.getDate() + 1);
    if (repeat === 'weekly') next.setDate(next.getDate() + 7);
    if (repeat === 'monthly') next.setMonth(next.getMonth() + 1);
    if (repeat === 'yearly') next.setFullYear(next.getFullYear() + 1);
    nextValue = next.toISOString().split('T')[0];
  } while (repeat !== 'none' && nextValue <= afterDate);
  return nextValue;
}
