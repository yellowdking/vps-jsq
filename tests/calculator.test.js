import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseDateUTC,
    addDaysISO,
    formatDateDisplay,
    calculateRemainingValue,
    buildMarkdownSummary,
    parseShareParams,
    buildShareQuery
} from '../src/calculator.js';

test('parseDateUTC validates real calendar dates and rejects invalid ones', () => {
    assert.equal(parseDateUTC('2026-03-15'), Date.UTC(2026, 2, 15));
    assert.equal(parseDateUTC('2024-02-29'), Date.UTC(2024, 1, 29));
    assert.equal(parseDateUTC('2025-02-29'), null);
    assert.equal(parseDateUTC('2026-04-31'), null);
    assert.equal(parseDateUTC('invalid'), null);
    assert.equal(parseDateUTC(''), null);
});

test('addDaysISO accurately adds days across months and leap years', () => {
    assert.equal(addDaysISO('2026-01-01', 365), '2027-01-01');
    assert.equal(addDaysISO('2024-02-28', 1), '2024-02-29');
    assert.equal(addDaysISO('2024-02-28', 2), '2024-03-01');
    assert.equal(addDaysISO('bad-date', 30), '');
});

test('formatDateDisplay formats ISO date or fallback placeholder', () => {
    assert.equal(formatDateDisplay('2026-11-23'), '2026/11/23');
    assert.equal(formatDateDisplay(''), '--/--/--');
});

test('calculateRemainingValue computes standard annual remaining value accurately', () => {
    const res = calculateRemainingValue({
        price: 36.5,
        rate: 7.2,
        cycleDays: 365,
        tradeDate: '2026-01-01',
        dueDate: '2026-04-11'
    });

    assert.equal(res.validDates, true);
    assert.equal(res.isExpired, false);
    assert.equal(res.daysRemaining, 100);
    assert.ok(Math.abs(res.remainingOrig - 10) < 1e-9);
    assert.ok(Math.abs(res.remainingCNY - 72) < 1e-9);
    assert.ok(Math.abs(res.dailyOrig - 0.1) < 1e-9);
    assert.ok(Math.abs(res.dailyCNY - 0.72) < 1e-9);
    assert.ok(Math.abs(res.progress - (100 / 365) * 100) < 1e-9);
});

test('calculateRemainingValue handles multi-cycle remaining days', () => {
    const res = calculateRemainingValue({
        price: 10,
        rate: 7,
        cycleDays: 30,
        tradeDate: '2026-01-01',
        dueDate: '2026-02-15'
    });

    assert.equal(res.daysRemaining, 45);
    assert.ok(Math.abs(res.remainingOrig - 15) < 1e-9);
    assert.ok(Math.abs(res.progress - 75) < 1e-9);
    assert.ok(Math.abs(res.visualProgress - 75) < 1e-9);
});

test('calculateRemainingValue marks expired or same-day VPS as zero value', () => {
    const expired = calculateRemainingValue({
        price: 100,
        rate: 7,
        cycleDays: 365,
        tradeDate: '2026-05-10',
        dueDate: '2026-05-01'
    });
    assert.equal(expired.isExpired, true);
    assert.equal(expired.daysRemaining, 0);
    assert.equal(expired.remainingCNY, 0);

    const sameDay = calculateRemainingValue({
        price: 100,
        rate: 7,
        cycleDays: 365,
        tradeDate: '2026-05-10',
        dueDate: '2026-05-10'
    });
    assert.equal(sameDay.isExpired, true);
    assert.equal(sameDay.daysRemaining, 0);
});

test('calculateRemainingValue clamps negative price and rate to zero', () => {
    const res = calculateRemainingValue({
        price: -50,
        rate: -7,
        cycleDays: 365,
        tradeDate: '2026-01-01',
        dueDate: '2026-06-01'
    });
    assert.equal(res.totalCNY, 0);
    assert.equal(res.remainingCNY, 0);
    assert.equal(res.remainingOrig, 0);
});

test('buildMarkdownSummary formats expected markdown output', () => {
    const result = calculateRemainingValue({
        price: 36.5,
        rate: 7.2,
        cycleDays: 365,
        tradeDate: '2026-01-01',
        dueDate: '2026-04-11'
    });
    const md = buildMarkdownSummary({
        price: '36.5',
        currency: 'USD',
        rate: '7.2000',
        cycleLabel: '年付',
        tradeDate: '2026-01-01',
        dueDate: '2026-04-11',
        result
    });
    assert.match(md, /## VPS 剩余价值/);
    assert.match(md, /1 USD ≈ 7\.2000 CNY/);
    assert.match(md, /剩余天数：100 天（2026-04-11 到期）/);
    assert.match(md, /剩余价值：¥72\.00（约 10\.00 USD）/);
});

test('parseShareParams and buildShareQuery round-trip valid parameters and ignore invalid ones', () => {
    const query = buildShareQuery({
        price: '29.99',
        currency: 'USD',
        cycle: '365',
        dueDate: '2027-01-01',
        tradeDate: '2026-01-01',
        customRate: '7.25'
    });
    const parsed = parseShareParams(`?${query}`);
    assert.deepEqual(parsed, {
        price: '29.99',
        currency: 'USD',
        cycle: '365',
        dueDate: '2027-01-01',
        tradeDate: '2026-01-01',
        customRate: '7.25'
    });

    assert.equal(parseShareParams('?price=-5&currency=XXX&cycle=999&due=bad'), null);
});
