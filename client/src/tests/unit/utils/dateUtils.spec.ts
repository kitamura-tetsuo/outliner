import { describe, it, expect } from 'vitest';
import { formatDate, formatDateTime, formatDateTimeSeconds } from '../../../utils/dateUtils';

describe('dateUtils', () => {
    describe('formatDate', () => {
        it('should correctly format a valid Date object', () => {
            const date = new Date(2026, 6, 20); // July 20, 2026 (local time)
            expect(formatDate(date)).toBe('2026-07-20');
        });

        it('should correctly format a valid timestamp number', () => {
            const date = new Date(2026, 0, 5); // Jan 5, 2026
            expect(formatDate(date.getTime())).toBe('2026-01-05');
        });

        it('should correctly format a valid date string', () => {
            // Using a format that creates a local date
            expect(formatDate('2026/07/20 00:00:00')).toBe('2026-07-20');
        });

        it('should return empty string for null', () => {
            expect(formatDate(null)).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(formatDate(undefined)).toBe('');
        });

        it('should return empty string for invalid date string', () => {
            expect(formatDate('invalid-date')).toBe('');
        });

        it('should return empty string for NaN timestamp', () => {
            expect(formatDate(NaN)).toBe('');
        });
    });

    describe('formatDateTime', () => {
        it('should correctly format a valid Date object', () => {
            const date = new Date(2026, 6, 20, 14, 30); // July 20, 2026 14:30 (local time)
            expect(formatDateTime(date)).toBe('2026-07-20 14:30');
        });

        it('should correctly pad single-digit hours and minutes', () => {
            const date = new Date(2026, 6, 20, 9, 5); // July 20, 2026 09:05 (local time)
            expect(formatDateTime(date)).toBe('2026-07-20 09:05');
        });

        it('should return empty string for null', () => {
            expect(formatDateTime(null)).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(formatDateTime(undefined)).toBe('');
        });

        it('should return empty string for invalid date string', () => {
            expect(formatDateTime('invalid-date')).toBe('');
        });
    });

    describe('formatDateTimeSeconds', () => {
        it('should correctly format a valid Date object', () => {
            const date = new Date(2026, 6, 20, 14, 30, 45); // July 20, 2026 14:30:45 (local time)
            expect(formatDateTimeSeconds(date)).toBe('2026-07-20 14:30:45');
        });

        it('should correctly pad single-digit hours, minutes, and seconds', () => {
            const date = new Date(2026, 6, 20, 9, 5, 2); // July 20, 2026 09:05:02 (local time)
            expect(formatDateTimeSeconds(date)).toBe('2026-07-20 09:05:02');
        });

        it('should return empty string for null', () => {
            expect(formatDateTimeSeconds(null)).toBe('');
        });

        it('should return empty string for undefined', () => {
            expect(formatDateTimeSeconds(undefined)).toBe('');
        });

        it('should return empty string for invalid date string', () => {
            expect(formatDateTimeSeconds('invalid-date')).toBe('');
        });
    });
});
