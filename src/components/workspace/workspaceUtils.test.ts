import { describe, expect, it } from 'vitest';
import { csvCell, csvDocument, manilaDateKey, planningEndDate, planningPeriodOverlaps } from './workspaceUtils';

describe('Calendar and planning-period filters', () => {
  it('uses the Manila calendar date across the UTC midnight boundary', () => {
    expect(manilaDateKey('2026-11-07T15:59:59Z')).toBe('2026-11-07');
    expect(manilaDateKey('2026-11-07T16:00:00Z')).toBe('2026-11-08');
    expect(manilaDateKey('2026-11-08')).toBe('2026-11-08');
    expect(manilaDateKey('not-a-date')).toBe('');
  });
  it('calculates inclusive assistance end dates across month and leap-year boundaries', () => {
    expect(planningEndDate('2026-11-08', 1)).toBe('2026-11-08');
    expect(planningEndDate('2026-11-30', 3)).toBe('2026-12-02');
    expect(planningEndDate('2028-02-28', 3)).toBe('2028-03-01');
    expect(planningEndDate('2026-02-30', 1)).toBe('');
    expect(planningEndDate('2026-11-08', 0)).toBe('');
  });
  it('includes requests started before the filter when assistance continues into it', () => {
    expect(planningPeriodOverlaps('2026-11-08', 4, '2026-11-10', '2026-11-12')).toBe(true);
    expect(planningPeriodOverlaps('2026-11-08', 4, '2026-11-11', '2026-11-11')).toBe(true);
    expect(planningPeriodOverlaps('2026-11-08', 4, '2026-11-12', '2026-11-15')).toBe(false);
    expect(planningPeriodOverlaps('2026-11-16', 2, '2026-11-12', '2026-11-15')).toBe(false);
  });
  it('supports open date ranges and refuses reversed filter dates', () => {
    expect(planningPeriodOverlaps('2026-11-08', 4, '', '2026-11-08')).toBe(true);
    expect(planningPeriodOverlaps('2026-11-08', 4, '2026-11-11', '')).toBe(true);
    expect(planningPeriodOverlaps('2026-11-08', 4, '', '')).toBe(true);
    expect(planningPeriodOverlaps('2026-11-08', 4, '2026-11-11', '2026-11-09')).toBe(false);
  });
});

describe('Spreadsheet-safe operational CSV', () => {
  it.each(['=HYPERLINK("https://example.com")', '+SUM(1,2)', '-cmd', '@SUM(A1)', '   =1+1', '\t=1+1', '\r=1+1'])(
    'neutralizes user-supplied formula-like text: %s', value => {
      expect(csvCell(value).startsWith('"\'')).toBe(true);
    },
  );
  it('preserves actual numeric values and escapes quotes, commas and line breaks', () => {
    expect(csvCell(-3)).toBe('"-3"');
    expect(csvCell('Balingayan')).toBe('"Balingayan"');
    expect(csvCell('Pump "A", depot\nCalapan')).toBe('"Pump ""A"", depot\nCalapan"');
    expect(csvCell(null)).toBe('""');
  });
  it('writes Unicode barangay names with a BOM and consistent CSV records', () => {
    expect(csvDocument([['Barangay', 'Liters'], ['Sto. Niño', 300]])).toBe('\uFEFF"Barangay","Liters"\r\n"Sto. Niño","300"');
  });
});
