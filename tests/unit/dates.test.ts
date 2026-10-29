import { describe, expect, it } from 'vitest';

import {
  addDays,
  dateOnlyInIST,
  daysBetween,
  describeDate,
  fiscalYearLabel,
  formatDate,
  formatDateTime,
  istDayRange,
  relativeDueDate,
  relativeEndDate,
  todayIST,
} from '@/lib/dates';

describe('fiscalYearLabel', () => {
  it('runs April to March', () => {
    expect(fiscalYearLabel('2025-04-01')).toBe('25-26');
    expect(fiscalYearLabel('2025-06-15')).toBe('25-26');
    expect(fiscalYearLabel('2026-02-01')).toBe('25-26');
    expect(fiscalYearLabel('2026-03-31')).toBe('25-26');
    expect(fiscalYearLabel('2026-04-01')).toBe('26-27');
    expect(fiscalYearLabel('2025-03-31')).toBe('24-25');
  });
});

describe('IST helpers', () => {
  it('computes today in India from any instant', () => {
    expect(todayIST(new Date('2026-03-12T20:00:00Z'))).toBe('2026-03-13');
    expect(todayIST(new Date('2026-03-12T18:29:59Z'))).toBe('2026-03-12');
    expect(dateOnlyInIST('2026-03-12T18:30:00Z')).toBe('2026-03-13');
  });

  it('returns UTC bounds for an IST day', () => {
    expect(istDayRange('2026-03-12')).toEqual({
      start: '2026-03-11T18:30:00.000Z',
      end: '2026-03-12T18:30:00.000Z',
    });
  });

  it('formats dates the Indian way', () => {
    expect(formatDate('2026-03-12')).toBe('12 Mar 2026');
    expect(formatDateTime('2026-03-12T13:15:00Z')).toBe('12 Mar 2026, 6:45 pm');
  });
});

describe('date arithmetic', () => {
  it('adds and diffs calendar days across month ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
  });
});

describe('relative labels', () => {
  const today = '2026-03-12';

  it('describes membership end dates', () => {
    expect(relativeEndDate('2026-03-15', today).label).toBe('3 days left');
    expect(relativeEndDate('2026-03-13', today).label).toBe('1 day left');
    expect(relativeEndDate('2026-03-12', today).label).toBe('Ends today');
    expect(relativeEndDate('2026-03-07', today).label).toBe('Ended 5 days ago');
    expect(relativeEndDate('2026-03-11', today).label).toBe('Ended yesterday');
  });

  it('describes due dates', () => {
    expect(relativeDueDate('2026-03-15', today).label).toBe('Due in 3 days');
    expect(relativeDueDate('2026-03-13', today).label).toBe('Due tomorrow');
    expect(relativeDueDate('2026-03-12', today).label).toBe('Due today');
    expect(relativeDueDate('2026-03-07', today).label).toBe('5 days overdue');
    expect(relativeDueDate('2026-03-11', today).label).toBe('1 day overdue');
  });

  it('describes nearby dates by name', () => {
    expect(describeDate('2026-03-12', today)).toBe('Today');
    expect(describeDate('2026-03-13', today)).toBe('Tomorrow');
    expect(describeDate('2026-03-11', today)).toBe('Yesterday');
    expect(describeDate('2026-03-20', today)).toBe('20 Mar 2026');
  });
});
