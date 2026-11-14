import { useQuery, type QueryClient } from '@tanstack/react-query';
import { db } from './client';
import { unwrap } from './unwrap';
import { qk } from './keys';

export function useJournalMonth(userId: string | null, start: string, end: string) {
  return useQuery({
    queryKey: qk.journal.month(start, end),
    enabled: !!userId,
    queryFn: async () => ((unwrap(await db.from('journal_entries').select('entry_date')
      .eq('user_id', userId as string).gte('entry_date', start).lte('entry_date', end)) ?? []) as Array<{ entry_date: string }>)
      .map((r) => r.entry_date),
  });
}

export function useJournalDay(userId: string | null, date: string | null) {
  return useQuery({
    queryKey: qk.journal.day(date ?? ''),
    enabled: !!userId && !!date,
    refetchOnWindowFocus: false, // seeds the editable entry
    refetchOnReconnect: false,
    queryFn: async () => unwrap(await db.from('journal_entries').select('id, content, entry_date, updated_at')
      .eq('user_id', userId as string).eq('entry_date', date as string).maybeSingle()),
  });
}

export const invalidateJournal = (client: QueryClient) => client.invalidateQueries({ queryKey: qk.journal.all });
