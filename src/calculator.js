export const CURRENCY_SYMBOLS = {
    USD: '$',
    EUR: '\u20AC',
    GBP: '\u00A3',
    JPY: '\u00A5',
    CNY: '\u00A5',
    HKD: 'HK$',
    AUD: 'A$',
    SGD: 'S$',
    KRW: '\u20A9',
    TWD: 'NT$',
    CAD: 'C$'
};

// Offline reference rates (CNY per 1 unit of foreign currency)
export const DEFAULT_FALLBACK_RATES = {
    CNY: 1,
    USD: 7.25,
    EUR: 7.85,
    GBP: 9.15,
    JPY: 0.048,
    KRW: 0.0052,
    HKD: 0.93,
    TWD: 0.225,
    CAD: 5.20,
    SGD: 5.40,
    AUD: 4.70
};

export const VALID_CYCLES = [30, 90, 180, 365, 730, 1095];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Strictly parse YYYY-MM-DD into a UTC midnight timestamp (ms).
 * Returns null if invalid or non-existent calendar date (e.g. 2026-02-30).
 */
export function parseDateUTC(dateStr) {
    if (typeof dateStr !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const utcMs = Date.UTC(year, month - 1, day);
    const check = new Date(utcMs);
    if (
        check.getUTCFullYear() !== year ||
        check.getUTCMonth() !== month - 1 ||
        check.getUTCDate() !== day
    ) {
        return null;
    }

    return utcMs;
}

/**
 * Format a local Date object as YYYY-MM-DD.
 */
export function formatDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Add calendar days to a YYYY-MM-DD date string using UTC arithmetic.
 */
export function addDaysISO(dateStr, days) {
    const utcMs = parseDateUTC(dateStr);
    if (utcMs === null) return '';
    const next = new Date(utcMs + Math.round(days) * MS_PER_DAY);
    const y = next.getUTCFullYear();
    const m = String(next.getUTCMonth() + 1).padStart(2, '0');
    const d = String(next.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Format YYYY-MM-DD for display as YYYY/MM/DD.
 */
export function formatDateDisplay(value) {
    return value ? value.replace(/-/g, '/') : '--/--/--';
}

/**
 * Compute remaining VPS value, days, daily cost, and progress percentage.
 */
export function calculateRemainingValue({
    price,
    rate,
    cycleDays = 365,
    dueDate,
    tradeDate
}) {
    const safePrice = Number.isFinite(Number(price)) ? Math.max(0, Number(price)) : 0;
    const safeRate = Number.isFinite(Number(rate)) ? Math.max(0, Number(rate)) : 0;
    const safeCycle = Number.isFinite(Number(cycleDays)) && Number(cycleDays) > 0
        ? Number(cycleDays)
        : 365;

    const totalCNY = safePrice * safeRate;
    const dailyOrig = safePrice / safeCycle;
    const dailyCNY = dailyOrig * safeRate;

    const dueUtc = parseDateUTC(dueDate);
    const tradeUtc = parseDateUTC(tradeDate);

    if (dueUtc === null || tradeUtc === null) {
        return {
            validDates: false,
            totalCNY,
            dailyOrig,
            dailyCNY,
            diffDays: 0,
            daysRemaining: 0,
            isExpired: false,
            remainingOrig: 0,
            remainingCNY: 0,
            progress: 0,
            visualProgress: 0
        };
    }

    const diffDays = Math.round((dueUtc - tradeUtc) / MS_PER_DAY);

    if (diffDays <= 0) {
        return {
            validDates: true,
            totalCNY,
            dailyOrig,
            dailyCNY,
            diffDays,
            daysRemaining: 0,
            isExpired: true,
            remainingOrig: 0,
            remainingCNY: 0,
            progress: 0,
            visualProgress: 0
        };
    }

    const remainingOrig = dailyOrig * diffDays;
    const remainingCNY = remainingOrig * safeRate;
    const baseDays = diffDays > safeCycle
        ? safeCycle * Math.ceil(diffDays / safeCycle)
        : safeCycle;
    const progress = (diffDays / baseDays) * 100;
    const visualProgress = Math.min(100, Math.max(0, progress));

    return {
        validDates: true,
        totalCNY,
        dailyOrig,
        dailyCNY,
        diffDays,
        daysRemaining: diffDays,
        isExpired: false,
        remainingOrig,
        remainingCNY,
        progress,
        visualProgress
    };
}

/**
 * Build a Markdown summary suitable for forums / chat sharing.
 */
export function buildMarkdownSummary({
    price,
    currency,
    rate,
    cycleLabel,
    tradeDate,
    dueDate,
    result
}) {
    const safePrice = Number.isFinite(Number(price)) ? Math.max(0, Number(price)) : 0;
    const safeRate = Number.isFinite(Number(rate)) ? Math.max(0, Number(rate)) : 0;
    const priceText = price === '' || price === undefined || price === null ? '0' : String(price);
    const rateText = rate === '' || rate === undefined || rate === null ? safeRate.toFixed(4) : String(rate);
    const cnyPrice = (safePrice * safeRate).toFixed(2);
    const dailyCNY = result.dailyCNY.toFixed(2);

    return [
        '## VPS 剩余价值',
        `- 交易日期：${tradeDate || '--'}`,
        `- 外币汇率：1 ${currency} ≈ ${rateText} CNY`,
        `- 续费价格：${priceText} ${currency}/${cycleLabel}（约 ¥${cnyPrice}，日均 ¥${dailyCNY}）`,
        `- 剩余天数：${result.daysRemaining} 天（${dueDate || '--'} 到期）`,
        `- 剩余价值：¥${result.remainingCNY.toFixed(2)}（约 ${result.remainingOrig.toFixed(2)} ${currency}）`
    ].join('\n');
}

/**
 * Parse and validate optional calculator parameters from a URL query string.
 */
export function parseShareParams(search) {
    if (!search || typeof search !== 'string') return null;
    const params = new URLSearchParams(search);
    const result = {};
    let hasAny = false;

    const price = params.get('price');
    if (price !== null && price !== '' && Number.isFinite(Number(price)) && Number(price) >= 0) {
        result.price = String(Number(price));
        hasAny = true;
    }

    const currency = params.get('currency')?.toUpperCase();
    if (currency && Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, currency)) {
        result.currency = currency;
        hasAny = true;
    }

    const cycle = Number(params.get('cycle'));
    if (VALID_CYCLES.includes(cycle)) {
        result.cycle = String(cycle);
        hasAny = true;
    }

    const due = params.get('due');
    if (due && parseDateUTC(due) !== null) {
        result.dueDate = due;
        hasAny = true;
    }

    const trade = params.get('trade');
    if (trade && parseDateUTC(trade) !== null) {
        result.tradeDate = trade;
        hasAny = true;
    }

    const rate = params.get('rate');
    if (rate !== null && rate !== '' && Number.isFinite(Number(rate)) && Number(rate) > 0) {
        result.customRate = String(Number(rate));
        hasAny = true;
    }

    return hasAny ? result : null;
}

/**
 * Build a shareable query string from current calculator inputs.
 */
export function buildShareQuery({ price, currency, cycle, dueDate, tradeDate, customRate }) {
    const params = new URLSearchParams();
    if (price !== '' && price !== undefined && Number(price) >= 0) params.set('price', String(price));
    if (currency && Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, currency)) params.set('currency', currency);
    if (VALID_CYCLES.includes(Number(cycle))) params.set('cycle', String(cycle));
    if (dueDate && parseDateUTC(dueDate) !== null) params.set('due', dueDate);
    if (tradeDate && parseDateUTC(tradeDate) !== null) params.set('trade', tradeDate);
    if (customRate !== '' && customRate !== undefined && Number(customRate) > 0 && currency !== 'CNY') {
        params.set('rate', String(customRate));
    }
    return params.toString();
}
