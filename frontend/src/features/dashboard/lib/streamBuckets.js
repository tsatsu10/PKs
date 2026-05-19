/**
 * Group objects into relative-time buckets for Stream view.
 * @param {Array<{ updated_at?: string }>} objects
 * @returns {Array<[string, typeof objects]>}
 */
export function groupObjectsByTimeBucket(objects) {
  const buckets = new Map();
  const order = [];

  for (const obj of objects) {
    const label = getTimeBucketLabel(obj.updated_at);
    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label).push(obj);
  }

  return order.map((label) => [label, buckets.get(label)]);
}

/**
 * @param {string | undefined} iso
 */
export function getTimeBucketLabel(iso) {
  if (!iso) return 'Earlier';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Earlier';

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  const startOfLastWeek = new Date(startOfToday);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 14);

  if (date >= startOfToday) return 'Today';
  if (date >= startOfYesterday) return 'Yesterday';
  if (date >= startOfWeek) return 'This week';
  if (date >= startOfLastWeek) return 'Last week';

  return date.toLocaleDateString(undefined, { month: 'long', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

const HEADER_HEIGHT = 36;
const ROW_HEIGHT_COMFORTABLE = 64;
const ROW_HEIGHT_COMPACT = 48;

/**
 * Flat virtual list items for Stream view.
 * @param {Array<object>} objects
 * @param {'compact' | 'comfortable'} density
 */
export function buildStreamVirtualItems(objects, density = 'comfortable') {
  const rowHeight = density === 'compact' ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_COMFORTABLE;
  const groups = groupObjectsByTimeBucket(objects);
  const idToNavIndex = new Map(objects.map((o, i) => [o.id, i]));
  /** @type {Array<{ kind: 'header', id: string, label: string, size: number } | { kind: 'row', id: string, obj: object, bucket: string, navIndex: number, size: number }>} */
  const items = [];

  for (const [label, group] of groups) {
    if (!group?.length) continue;
    items.push({ kind: 'header', id: `header-${label}`, label, size: HEADER_HEIGHT });
    for (const obj of group) {
      items.push({
        kind: 'row',
        id: obj.id,
        obj,
        bucket: label,
        navIndex: idToNavIndex.get(obj.id) ?? 0,
        size: rowHeight,
      });
    }
  }

  return items;
}

export function getStreamRowHeight(density) {
  return density === 'compact' ? ROW_HEIGHT_COMPACT : ROW_HEIGHT_COMFORTABLE;
}

export function getStreamHeaderHeight() {
  return HEADER_HEIGHT;
}
