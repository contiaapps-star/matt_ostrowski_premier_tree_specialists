export const TIME_RANGE_KEYS = ['24h', '3d', 'week', 'month'] as const;
export type TimeRangeKey = (typeof TIME_RANGE_KEYS)[number];

export const TIME_RANGES: Record<TimeRangeKey, { hours: number; label: string; shortLabel: string }> = {
  '24h': { hours: 24, label: 'Last 24 hours', shortLabel: '24h' },
  '3d': { hours: 72, label: 'Last 3 days', shortLabel: '3d' },
  week: { hours: 168, label: 'Last 7 days', shortLabel: 'Week' },
  month: { hours: 720, label: 'Last 30 days', shortLabel: 'Month' },
};

export const DEFAULT_TIME_RANGE: TimeRangeKey = '24h';

export function parseTimeRange(value: string | null | undefined): TimeRangeKey {
  if (!value) return DEFAULT_TIME_RANGE;
  return (TIME_RANGE_KEYS as readonly string[]).includes(value)
    ? (value as TimeRangeKey)
    : DEFAULT_TIME_RANGE;
}

export function rangeStartDate(key: TimeRangeKey, now: Date = new Date()): Date {
  const { hours } = TIME_RANGES[key];
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

export function rangeHours(key: TimeRangeKey): number {
  return TIME_RANGES[key].hours;
}
