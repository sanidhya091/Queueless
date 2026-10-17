import { MAX_REPORT_AGE_MS } from './queue';
import type { QueueReport } from './queue';
import { supabase } from './supabase';

const REPORT_COLUMNS =
  'place_id, level, wait_minutes, people_ahead, created_at';
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

// Bound both time and place IDs. Paginate to avoid silently using Supabase's
// default row limit as an aggregation cap. All screens use this same window.
export async function fetchCurrentQueueReports(
  placeIds: number[],
  now = Date.now(),
  signal?: AbortSignal
): Promise<QueueReport[]> {
  const ids = [...new Set(placeIds)];
  if (ids.length === 0) return [];
  const reports: QueueReport[] = [];
  const since = new Date(now - MAX_REPORT_AGE_MS).toISOString();
  const until = new Date(now).toISOString();

  for (let start = 0; start < ids.length; start += ID_BATCH_SIZE) {
    const batch = ids.slice(start, start + ID_BATCH_SIZE);

    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = supabase
        .from('queue_reports')
        .select(REPORT_COLUMNS)
        .in('place_id', batch)
        .gte('created_at', since)
        .lte('created_at', until)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (signal) {
        if (signal.aborted) throw new Error('Queue request cancelled');
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) throw error;

      const page = (data || []) as QueueReport[];
      reports.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return reports;
}

export async function fetchLatestQueueReport(
  placeId: number
): Promise<QueueReport | null> {
  const { data, error } = await supabase
    .from('queue_reports')
    .select(REPORT_COLUMNS)
    .eq('place_id', placeId)
    .lte('created_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as QueueReport | null;
}

export function groupReportsByPlace(reports: QueueReport[]) {
  const grouped = new Map<number, QueueReport[]>();

  for (const report of reports) {
    if (report.place_id === undefined) continue;
    const group = grouped.get(report.place_id) || [];
    group.push(report);
    grouped.set(report.place_id, group);
  }

  return grouped;
}
