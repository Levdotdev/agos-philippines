import type { State } from '../types';
import { calapanBarangays } from './barangays';

const manilaDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A calendar date in the response workspace's timezone, regardless of the device timezone. */
export function today(now: Date = new Date()): string {
  const parts = manilaDateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Reference data can be cached; operational records start empty and come from the database. */
export function createEmptyState(): State {
  return {
    baseline: 6,
    drinkingBaseline: 3,
    cookingBaseline: 3,
    reports: [],
    resources: [],
    deliveries: [],
    teams: [],
    audit: [],
    barangays: calapanBarangays.map((barangay) => ({
      ...barangay,
      sourceUrls: barangay.sourceUrls ? [...barangay.sourceUrls] : undefined,
      metadata: barangay.metadata ? { ...barangay.metadata } : undefined,
    })),
    revision: 0,
  };
}

export const seed = createEmptyState;
