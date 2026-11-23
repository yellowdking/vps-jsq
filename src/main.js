import './style.css';
import {
    CURRENCY_SYMBOLS,
    DEFAULT_FALLBACK_RATES,
    formatDateISO,
    addDaysISO,
    formatDateDisplay,
    calculateRemainingValue,
    buildMarkdownSummary,
    parseShareParams,
    buildShareQuery
} from './calculator.js';

const RATE_SOURCES = [
    {
        name: 'ExchangeRate-API',
        url: 'https://open.er-api.com/v6/latest/CNY',
        parse: (data) => {
            if (data?.result !== 'success' || !data.rates) return null;
            const cnyPerUnit = {};
            for (const code of Object.keys(CURRENCY_SYMBOLS)) {
                if (code === 'CNY') {
                    cnyPerUnit.CNY = 1;
                } else if (data.rates[code] > 0) {
                    cnyPerUnit[code] = 1 / data.rates[code];
                }
            }
            return Object.keys(cnyPerUnit).length > 1 ? cnyPerUnit : null;
        }
    },
    {
        name: 'Currency-API',
        url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json',
        parse: (data) => {
            const rates = data?.cny;
            if (!rates) return null;
            const cnyPerUnit = {};
            for (const code of Object.keys(CURRENCY_SYMBOLS)) {
                if (code === 'CNY') {
                    cnyPerUnit.CNY = 1;
                } else {
                    const v = rates[code.toLowerCase()];
                    if (v > 0) cnyPerUnit[code] = 1 / v;
                }
            }
            return Object.keys(cnyPerUnit).length > 1 ? cnyPerUnit : null;
        }
    }
];

const RATES_CACHE_KEY = 'vps_rates_all_v2';
const INPUTS_CACHE_KEY = 'vps_inputs';
const REFRESH_LIMIT_KEY = 'vps_refresh_limit';
const FETCH_TIMEOUT_MS = 8000;

let htmlToImageModulePromise = null;
let rateLimitTimer = null;
let toastTimer = null;
let hasCustomRateOverride = false;
let latestGeneratedDataUrl = '';
let latestResult = null;

const els = {
    price: document.getElementById('price'),
    currency: document.getElementById('currency'),
    cycles: document.getElementsByName('cycle'),
    dueDate: document.getElementById('dueDate'),
    dueDateDisplay: document.getElementById('dueDateDisplay'),
    tradeDate: document.getElementById('tradeDate'),
    tradeDateDisplay: document.getElementById('tradeDateDisplay'),
    customRate: document.getElementById('customRate'),
    apiRateDisplay: document.getElementById('apiRateDisplay'),
    refreshBtn: document.getElementById('refreshRateBtn'),
    refreshIcon: document.getElementById('refreshIcon'),
    resetBtn: document.getElementById('resetBtn'),
    shareLinkBtn: document.getElementById('shareLinkBtn'),
    symbolDisplay: document.querySelector('.symbol-display'),
    finalValue: document.getElementById('finalValue'),
    originalCurrencyValue: document.getElementById('originalCurrencyValue'),
    dailyCostPreview: document.getElementById('dailyCostPreview'),
    expiredBadge: document.getElementById('expiredBadge'),
    daysRemaining: document.getElementById('daysRemaining'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    priceCNYPreview: document.getElementById('priceCNYPreview'),
    toast: document.getElementById('toast'),
    rateLimitTip: document.getElementById('rateLimitTip'),
    closeRateLimitBtn: document.getElementById('closeRateLimitBtn'),
    themeToggle: document.getElementById('themeToggle'),
    themeToggleKnob: document.getElementById('themeToggleKnob'),
    copyBtn: document.getElementById('copyBtn'),
    imgBtn: document.getElementById('imgBtn'),
    modalEl: document.getElementById('imageModal'),
    modalCloseBtn: document.getElementById('closeModalBtn'),
    modalImg: document.getElementById('generatedImage'),
    modalLoading: document.getElementById('modalLoading'),
    modalActions: document.getElementById('modalActions'),
    downloadImgBtn: document.getElementById('downloadImgBtn'),
    copyImgBtn: document.getElementById('copyImgBtn')
};

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadInputs();
    initDates();
    initRates({ preserveCustomRate: hasCustomRateOverride });
    setupEventListeners();
    calculate();
});

function setupEventListeners() {
    const debouncedSave = debounce(saveInputs, 400);

    els.price.addEventListener('input', () => {
        if (Number(els.price.value) < 0) els.price.value = '0';
        calculate();
        debouncedSave();
    });

    els.customRate.addEventListener('input', () => {
        if (Number(els.customRate.value) < 0) els.customRate.value = '0';
        hasCustomRateOverride = els.customRate.value.trim() !== '';
        calculate();
        debouncedSave();
    });

    [els.dueDate, els.tradeDate].forEach((el) => {
        el.addEventListener('input', () => {
            syncDateDisplays();
            calculate();
            debouncedSave();
        });
        el.addEventListener('change', () => {
            syncDateDisplays();
            calculate();
            saveInputs();
        });
    });

    els.cycles.forEach((radio) => {
        radio.addEventListener('change', () => {
            calculate();
            saveInputs();
        });
    });

    els.currency.addEventListener('change', () => {
        hasCustomRateOverride = false;
        updateCurrencySymbol();
        initRates({ preserveCustomRate: false });
        syncDateDisplays();
        calculate();
        saveInputs();
    });

    els.refreshBtn.addEventListener('click', () => manualRefreshRate(true));
    els.themeToggle.addEventListener('click', toggleTheme);
    els.copyBtn.addEventListener('click', copyResult);
    els.imgBtn.addEventListener('click', generateImage);
    els.resetBtn?.addEventListener('click', resetCalculator);
    els.shareLinkBtn?.addEventListener('click', copyShareLink);
    els.closeRateLimitBtn?.addEventListener('click', hideRateLimitTip);
    els.modalCloseBtn?.addEventListener('click', closeImageModal);
    els.downloadImgBtn?.addEventListener('click', downloadGeneratedImage);
    els.copyImgBtn?.addEventListener('click', copyGeneratedImage);

    els.modalEl.addEventListener('click', (e) => {
        if (e.target === els.modalEl) closeImageModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !els.modalEl.classList.contains('hidden')) {
            closeImageModal();
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function initTheme() {
    if (
        localStorage.theme === 'dark' ||
        (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
        document.documentElement.classList.add('dark');
        updateToggleUI(true);
    } else {
        document.documentElement.classList.remove('dark');
        updateToggleUI(false);
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.theme = isDark ? 'dark' : 'light';
    updateToggleUI(isDark);
}

function updateToggleUI(isDark) {
    if (isDark) {
        els.themeToggleKnob.classList.add('translate-x-6');
        els.themeToggleKnob.classList.remove('translate-x-1');
    } else {
        els.themeToggleKnob.classList.remove('translate-x-6');
        els.themeToggleKnob.classList.add('translate-x-1');
    }
}

function setStorageWithTTL(name, value, hours) {
    try {
        const expiresAt = Date.now() + hours * 60 * 60 * 1000;
        localStorage.setItem(name, JSON.stringify({ value, expiresAt }));
    } catch (e) {
        console.warn('Storage write skipped:', e);
    }
}

function getStorageWithTTL(name) {
    try {
        const stored = localStorage.getItem(name);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (!parsed.expiresAt || parsed.expiresAt > Date.now()) {
                return parsed.value || '';
            }
            localStorage.removeItem(name);
        }
    } catch (e) {
        localStorage.removeItem(name);
    }

    // Legacy cookie fallback for existing users
    const cname = `${name}=`;
    const decodedCookie = decodeURIComponent(document.cookie || '');
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(cname) === 0) {
            return c.substring(cname.length);
        }
    }
    return '';
}

async function getHtmlToImage() {
    if (!htmlToImageModulePromise) {
        htmlToImageModulePromise = import('html-to-image');
    }
    return htmlToImageModulePromise;
}

function syncDateDisplays() {
    els.dueDateDisplay.textContent = formatDateDisplay(els.dueDate.value);
    els.tradeDateDisplay.textContent = formatDateDisplay(els.tradeDate.value);
}

function prepareDateInputsForExport(node) {
    const restoreTasks = [];
    const nativeInputs = node.querySelectorAll('.date-native');

    nativeInputs.forEach((input) => {
        input.style.display = 'none';
        restoreTasks.push(() => {
            input.style.display = '';
        });
    });

    return () => {
        restoreTasks.reverse().forEach((restore) => restore());
    };
}

function getSelectedCycle() {
    for (const radio of els.cycles) {
        if (radio.checked) {
            return {
                days: parseInt(radio.value, 10),
                label: radio.parentElement.innerText.trim()
            };
        }
    }
    return { days: 365, label: '年付' };
}

function saveInputs() {
    const data = {
        price: els.price.value,
        currency: els.currency.value,
        cycle: String(getSelectedCycle().days),
        dueDate: els.dueDate.value,
        customRate: els.customRate.value,
        customRateOverride: hasCustomRateOverride
    };
    setStorageWithTTL(INPUTS_CACHE_KEY, JSON.stringify(data), 24);
}

function loadInputs() {
    const urlParams = parseShareParams(window.location.search);
    if (urlParams) {
        applyInputData({
            ...urlParams,
            customRateOverride: Boolean(urlParams.customRate)
        });
        return;
    }

    const saved = getStorageWithTTL(INPUTS_CACHE_KEY);
    if (saved) {
        try {
            const data = JSON.parse(saved);
            applyInputData(data);
        } catch (e) {
            console.error('Saved state parse error:', e);
        }
    }
}

function applyInputData(data) {
    if (data.price !== undefined) els.price.value = data.price;
    if (data.currency && Object.prototype.hasOwnProperty.call(CURRENCY_SYMBOLS, data.currency)) {
        els.currency.value = data.currency;
    }
    if (data.dueDate) els.dueDate.value = data.dueDate;
    if (data.tradeDate) els.tradeDate.value = data.tradeDate;
    if (data.customRate) {
        els.customRate.value = data.customRate;
        hasCustomRateOverride = Boolean(data.customRateOverride);
    }
    if (data.cycle) {
        const radio = document.querySelector(`input[name="cycle"][value="${data.cycle}"]`);
        if (radio) radio.checked = true;
    }
    updateCurrencySymbol();
}

function resetCalculator() {
    els.price.value = '';
    els.currency.value = 'USD';
    const annualRadio = document.querySelector('input[name="cycle"][value="365"]');
    if (annualRadio) annualRadio.checked = true;

    const today = formatDateISO(new Date());
    els.tradeDate.value = today;
    els.dueDate.value = addDaysISO(today, 365);

    hasCustomRateOverride = false;
    updateCurrencySymbol();
    localStorage.removeItem(INPUTS_CACHE_KEY);

    if (window.location.search) {
        window.history.replaceState({}, '', window.location.pathname);
    }

    initRates({ preserveCustomRate: false });
    calculate();
    showToast('已重置');
}

function getCachedRatesTable() {
    const raw = getStorageWithTTL(RATES_CACHE_KEY);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.rates === 'object') {
            return parsed.rates;
        }
    } catch (e) {
        localStorage.removeItem(RATES_CACHE_KEY);
    }
    return null;
}

async function initRates({ preserveCustomRate = false } = {}) {
    const base = els.currency.value;
    if (base === 'CNY') {
        finishRateUpdate(1, '1.0000', { preserveCustomRate: false });
        return;
    }

    const cachedRates = getCachedRatesTable();
    if (cachedRates && cachedRates[base] > 0) {
        const rate = cachedRates[base];
        finishRateUpdate(rate, rate.toFixed(4), { preserveCustomRate });
        return;
    }

    await fetchExchangeRates({ preserveCustomRate });
}

async function manualRefreshRate(isUserClick = true) {
    const base = els.currency.value;
    if (base === 'CNY') return;

    const rawLimit = getStorageWithTTL(REFRESH_LIMIT_KEY);
    let limitData = { count: 0, resetTime: Date.now() + 12 * 3600 * 1000 };

    if (rawLimit) {
        try {
            const parsed = JSON.parse(rawLimit);
            if (parsed.resetTime && Date.now() < parsed.resetTime) {
                limitData = parsed;
            }
        } catch (e) {
            // ignore corrupted limit cache
        }
    }

    if (isUserClick) {
        if (limitData.count >= 5) {
            showRateLimitTip();
            return;
        }
        limitData.count += 1;
        const hoursLeft = (limitData.resetTime - Date.now()) / (1000 * 3600);
        setStorageWithTTL(REFRESH_LIMIT_KEY, JSON.stringify(limitData), Math.max(0.1, hoursLeft));
    }

    hasCustomRateOverride = false;
    await fetchExchangeRates({ preserveCustomRate: false, showSuccessToast: isUserClick });
}

async function fetchJsonWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function fetchExchangeRates({ preserveCustomRate = false, showSuccessToast = false } = {}) {
    const base = els.currency.value;
    els.refreshIcon.classList.add('spin');
    els.apiRateDisplay.textContent = '...';

    for (const source of RATE_SOURCES) {
        try {
            const data = await fetchJsonWithTimeout(source.url, FETCH_TIMEOUT_MS);
            const table = source.parse(data);
            if (table && table[base] > 0) {
                setStorageWithTTL(
                    RATES_CACHE_KEY,
                    JSON.stringify({ rates: table, source: source.name, time: Date.now() }),
                    12
                );
                const rate = table[base];
                finishRateUpdate(rate, rate.toFixed(4), { preserveCustomRate });
                saveInputs();
                if (showSuccessToast) {
                    showToast('汇率已更新');
                }
                return;
            }
        } catch (error) {
            console.warn(`Rate source ${source.name} failed:`, error);
        }
    }

    // All remote sources failed: fall back to offline reference rate
    const fallbackRate = DEFAULT_FALLBACK_RATES[base] || 1;
    els.refreshIcon.classList.remove('spin');
    finishRateUpdate(fallbackRate, `离线 ${fallbackRate.toFixed(2)}`, { preserveCustomRate });
    showToast('实时汇率不可用，已使用参考汇率');
}

function finishRateUpdate(rate, text, { preserveCustomRate = false } = {}) {
    if (!preserveCustomRate || !els.customRate.value.trim()) {
        els.customRate.value = rate.toFixed(4);
    }
    els.apiRateDisplay.textContent = text;
    els.refreshIcon.classList.remove('spin');
    calculate();
}

function showRateLimitTip() {
    els.rateLimitTip.classList.add('show');
    if (rateLimitTimer) clearTimeout(rateLimitTimer);
    rateLimitTimer = setTimeout(() => {
        hideRateLimitTip();
    }, 2000);
}

function hideRateLimitTip() {
    els.rateLimitTip.classList.remove('show');
    if (rateLimitTimer) {
        clearTimeout(rateLimitTimer);
        rateLimitTimer = null;
    }
}

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        els.toast.classList.remove('show');
        toastTimer = null;
    }, 2000);
}

function initDates() {
    const today = formatDateISO(new Date());
    if (!els.tradeDate.value) {
        els.tradeDate.value = today;
    }
    if (!els.dueDate.value) {
        els.dueDate.value = addDaysISO(els.tradeDate.value, 365);
    }
    syncDateDisplays();
}

function updateCurrencySymbol() {
    const code = els.currency.value;
    els.symbolDisplay.textContent = CURRENCY_SYMBOLS[code] || code;
}

function calculate() {
    syncDateDisplays();

    const { days: cycleDays } = getSelectedCycle();
    const res = calculateRemainingValue({
        price: els.price.value,
        rate: els.customRate.value,
        cycleDays,
        dueDate: els.dueDate.value,
        tradeDate: els.tradeDate.value
    });

    latestResult = res;

    els.priceCNYPreview.textContent = `≈ ¥${res.totalCNY.toFixed(2)}`;
    if (!res.validDates) return;

    els.progressBar.style.width = `${res.visualProgress}%`;
    els.finalValue.textContent = res.remainingCNY.toFixed(2);
    els.originalCurrencyValue.textContent = `≈ ${res.remainingOrig.toFixed(2)} ${els.currency.value}`;
    if (els.dailyCostPreview) {
        els.dailyCostPreview.textContent = `日均 ¥${res.dailyCNY.toFixed(2)} / 天`;
    }
    els.daysRemaining.textContent = String(res.daysRemaining);
    els.progressText.textContent = `${res.progress.toFixed(1)}%`;

    if (els.expiredBadge) {
        els.expiredBadge.classList.toggle('hidden', !res.isExpired);
    }
}

async function writeTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // Fall through to legacy textarea copy
        }
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    let ok = false;
    try {
        ok = document.execCommand('copy');
    } finally {
        document.body.removeChild(textArea);
    }
    return ok;
}

async function copyResult() {
    if (!latestResult) calculate();
    const { label: cycleLabel } = getSelectedCycle();
    const md = buildMarkdownSummary({
        price: els.price.value,
        currency: els.currency.value,
        rate: els.customRate.value,
        cycleLabel,
        tradeDate: els.tradeDate.value,
        dueDate: els.dueDate.value,
        result: latestResult
    });

    const copied = await writeTextToClipboard(md);
    showToast(copied ? '已复制到剪贴板' : '复制失败，请手动复制');
}

async function copyShareLink() {
    const query = buildShareQuery({
        price: els.price.value,
        currency: els.currency.value,
        cycle: getSelectedCycle().days,
        dueDate: els.dueDate.value,
        tradeDate: els.tradeDate.value,
        customRate: els.customRate.value
    });
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ''}`;
    const copied = await writeTextToClipboard(url);
    showToast(copied ? '已复制分享链接' : '复制链接失败');
}

function closeImageModal() {
    els.modalEl.classList.remove('opacity-100');
    setTimeout(() => {
        els.modalEl.classList.add('hidden');
        els.modalImg.classList.add('hidden');
        els.modalActions.classList.add('hidden');
        els.modalLoading.classList.remove('hidden');
        els.modalImg.src = '';
        latestGeneratedDataUrl = '';
    }, 300);
}

function downloadGeneratedImage() {
    if (!latestGeneratedDataUrl) return;
    const link = document.createElement('a');
    const dateStamp = (els.tradeDate.value || formatDateISO(new Date())).replace(/-/g, '');
    link.download = `vps-value-${dateStamp}.png`;
    link.href = latestGeneratedDataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('图片已下载');
}

async function copyGeneratedImage() {
    if (!latestGeneratedDataUrl) return;
    if (!navigator.clipboard || typeof window.ClipboardItem === 'undefined') {
        showToast('当前环境不支持直接复制图片，请点击下载');
        return;
    }
    try {
        const res = await fetch(latestGeneratedDataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
        showToast('图片已复制到剪贴板');
    } catch (e) {
        console.error('Copy image error:', e);
        showToast('复制图片失败，请点击下载');
    }
}

async function generateImage() {
    els.modalEl.classList.remove('hidden');
    void els.modalEl.offsetWidth;
    els.modalEl.classList.add('opacity-100');

    setTimeout(async () => {
        const node = document.getElementById('mainCard');
        const isDark = document.documentElement.classList.contains('dark');
        const restoreDateInputs = prepareDateInputsForExport(node);

        try {
            const htmlToImage = await getHtmlToImage();
            const dataUrl = await htmlToImage.toPng(node, {
                quality: 0.95,
                pixelRatio: 2,
                backgroundColor: isDark ? '#000000' : '#f0f2f5',
                filter: (element) => {
                    if (!element || !element.id) return true;
                    return element.id !== 'btnContainer';
                },
                style: {
                    transform: 'scale(1)'
                }
            });

            latestGeneratedDataUrl = dataUrl;
            els.modalLoading.classList.add('hidden');
            els.modalImg.src = dataUrl;
            els.modalImg.classList.remove('hidden');
            els.modalActions.classList.remove('hidden');

            if (els.copyImgBtn) {
                const canCopyImg = Boolean(navigator.clipboard && typeof window.ClipboardItem !== 'undefined' && window.isSecureContext);
                els.copyImgBtn.classList.toggle('hidden', !canCopyImg);
            }
        } catch (e) {
            console.error('Image generation failed:', e);
            closeImageModal();
            showToast('生成图片出错');
        } finally {
            restoreDateInputs();
        }
    }, 80);
}
