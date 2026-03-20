import './style.css';

const API_URL = 'https://open.er-api.com/v6/latest/CNY';
let htmlToImageModulePromise = null;

const currencySymbols = {
    'USD': '$', 'EUR': '\u20AC', 'GBP': '\u00A3', 'JPY': '\u00A5',
    'CNY': '\u00A5', 'HKD': 'HK$', 'AUD': 'A$', 'SGD': 'S$',
    'KRW': '\u20A9', 'TWD': 'NT$', 'CAD': 'C$'
};

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
    symbolDisplay: document.querySelector('.symbol-display'),
    finalValue: document.getElementById('finalValue'),
    originalCurrencyValue: document.getElementById('originalCurrencyValue'),
    daysRemaining: document.getElementById('daysRemaining'),
    progressBar: document.getElementById('progressBar'),
    progressText: document.getElementById('progressText'),
    priceCNYPreview: document.getElementById('priceCNYPreview'),
    toast: document.getElementById('toast'),
    rateLimitTip: document.getElementById('rateLimitTip'),
    themeToggle: document.getElementById('themeToggle'),
    themeToggleKnob: document.getElementById('themeToggleKnob')
};

let rateLimitTimer = null;

window.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadInputsFromCookie(); 
    initDates(); 
    initRates(); 
    setupEventListeners();
    calculate(); 
});

function setupEventListeners() {
    const debouncedSave = debounce(saveInputsToCookie, 500);

    [els.price, els.dueDate, els.tradeDate, els.customRate].forEach(el => el.addEventListener('input', () => {
        syncDateDisplays();
        calculate();
        debouncedSave();
    }));

    [els.dueDate, els.tradeDate].forEach(el => el.addEventListener('change', () => {
        syncDateDisplays();
        calculate();
        saveInputsToCookie();
    }));
    
    els.cycles.forEach(radio => radio.addEventListener('change', () => {
        calculate();
        saveInputsToCookie();
    }));

    els.currency.addEventListener('change', () => {
        updateCurrencySymbol();
        initRates(); 
        syncDateDisplays();
        calculate();
        saveInputsToCookie();
    });

    els.refreshBtn.addEventListener('click', manualRefreshRate); 
    els.themeToggle.addEventListener('click', toggleTheme);
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
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

function setCookie(name, value, hours) {
    const expiresAt = Date.now() + (hours * 60 * 60 * 1000);
    localStorage.setItem(name, JSON.stringify({ value, expiresAt }));
}

function getCookie(name) {
    const stored = localStorage.getItem(name);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (!parsed.expiresAt || parsed.expiresAt > Date.now()) {
                return parsed.value || "";
            }
            localStorage.removeItem(name);
        } catch (e) {
            localStorage.removeItem(name);
        }
    }

    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for(let i = 0; i <ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') {
            c = c.substring(1);
        }
        if (c.indexOf(cname) == 0) {
            return c.substring(cname.length, c.length);
        }
    }
    return "";
}

async function getHtmlToImage() {
    if (!htmlToImageModulePromise) {
        htmlToImageModulePromise = import('html-to-image');
    }

    return htmlToImageModulePromise;
}

function formatDateForDisplay(value) {
    return value ? value.replace(/-/g, '/') : '--/--/--';
}

function syncDateDisplays() {
    els.dueDateDisplay.textContent = formatDateForDisplay(els.dueDate.value);
    els.tradeDateDisplay.textContent = formatDateForDisplay(els.tradeDate.value);
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

function saveInputsToCookie() {
    const data = {
        price: els.price.value,
        currency: els.currency.value,
        cycle: Array.from(els.cycles).find(r => r.checked)?.value || "365",
        dueDate: els.dueDate.value,
        customRate: els.customRate.value
    };
    setCookie("vps_inputs", JSON.stringify(data), 0.5);
}

function loadInputsFromCookie() {
    const saved = getCookie("vps_inputs");
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if(data.price) els.price.value = data.price;
            if(data.currency) els.currency.value = data.currency;
            if(data.dueDate) els.dueDate.value = data.dueDate;
            if(data.customRate) els.customRate.value = data.customRate;
            if(data.cycle) {
                const radio = document.querySelector(`input[name="cycle"][value="${data.cycle}"]`);
                if(radio) radio.checked = true;
            }
            updateCurrencySymbol();
        } catch(e) { console.error("Cookie parse error", e); }
    }
}

async function initRates() {
    const base = els.currency.value;
    if (base === 'CNY') {
        finishRateUpdate(1, "1.0000");
        return;
    }

    const cacheKey = `vps_rate_${base}`;
    const cachedData = getCookie(cacheKey);

    if (cachedData) {
        try {
            const data = JSON.parse(cachedData);
            finishRateUpdate(data.rate, data.rate.toFixed(4));
        } catch (e) {
            manualRefreshRate(false);
        }
    } else {
        manualRefreshRate(false);
    }
}

async function manualRefreshRate(isUserClick = true) {
    const base = els.currency.value;
    if (base === 'CNY') return;

    const limitKey = "vps_refresh_limit";
    const rawLimit = getCookie(limitKey);
    let limitData = { count: 0, resetTime: Date.now() + 12*3600*1000 };

    if (rawLimit) {
        try {
            const parsed = JSON.parse(rawLimit);
            if (parsed.resetTime && Date.now() < parsed.resetTime) {
                limitData = parsed;
            } else {
                limitData = { count: 0, resetTime: Date.now() + 12*3600*1000 };
            }
        } catch(e) {}
    }

    if (isUserClick) {
        if (limitData.count >= 2) {
            showRateLimitTip();
            return;
        }
        limitData.count++;
        const hoursLeft = (limitData.resetTime - Date.now()) / (1000*3600);
        setCookie(limitKey, JSON.stringify(limitData), Math.max(0.1, hoursLeft));
    }

    await fetchExchangeRate();
}

async function fetchExchangeRate() {
    const base = els.currency.value;
    els.refreshIcon.classList.add('spin');
    els.apiRateDisplay.textContent = "...";

    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        if (data.result === "success") {
            const baseInCNY = data.rates[base];
            if (baseInCNY) {
                const rate = 1 / baseInCNY;
                finishRateUpdate(rate, rate.toFixed(4));
                
                const cacheData = JSON.stringify({ rate: rate, time: Date.now() });
                setCookie(`vps_rate_${base}`, cacheData, 12);
                saveInputsToCookie();
            } else {
                throw new Error("Currency not found");
            }
        } else {
            throw new Error("API Error");
        }
    } catch (error) {
        console.error(error);
        els.apiRateDisplay.textContent = "ERR";
        els.refreshIcon.classList.remove('spin');
        showToast("获取汇率失败");
    }
}

function finishRateUpdate(rate, text) {
    els.customRate.value = rate.toFixed(4);
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

window.hideRateLimitTip = hideRateLimitTip;

function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    setTimeout(() => {
        els.toast.classList.remove('show');
    }, 2000);
}

function initDates() {
    const now = new Date();
    els.tradeDate.value = formatDate(now);
    if (els.dueDate.value) return;
    const currentYear = now.getFullYear();
    const thisYearNov25 = new Date(currentYear, 10, 25); 
    let targetDueDate;
    if (now.getTime() <= thisYearNov25.getTime()) {
        targetDueDate = thisYearNov25;
    } else {
        targetDueDate = new Date(currentYear + 1, 10, 25);
    }
    els.dueDate.value = formatDate(targetDueDate);
}

function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function updateCurrencySymbol() {
    const code = els.currency.value;
    els.symbolDisplay.textContent = currencySymbols[code] || code;
}

function calculate() {
    syncDateDisplays();

    const price = parseFloat(els.price.value) || 0;
    const rate = parseFloat(els.customRate.value) || 0;
    const due = new Date(els.dueDate.value);
    const trade = new Date(els.tradeDate.value);
    
    let cycleDays = 365;
    for (const radio of els.cycles) {
        if (radio.checked) { cycleDays = parseInt(radio.value); break; }
    }

    const totalCNY = price * rate;
    els.priceCNYPreview.textContent = `≈${totalCNY.toFixed(2)}元`;

    if (isNaN(due.getTime()) || isNaN(trade.getTime())) return;

    const diffTime = due - trade;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const dailyPrice = price / cycleDays;
    
    let valOrig = 0, valCNY = 0, progress = 0;

    if (diffDays <= 0) {
        valOrig = 0; valCNY = 0; progress = 0; 
    } else {
        valOrig = dailyPrice * diffDays;
        valCNY = valOrig * rate;
        let baseDays = cycleDays;
        if (diffDays > cycleDays) {
            baseDays = cycleDays * Math.ceil(diffDays / cycleDays);
        }
        progress = (diffDays / baseDays) * 100;
    }
    
    let visualProgress = progress;
    if (visualProgress > 100) visualProgress = 100;
    if (visualProgress < 0) visualProgress = 0;

    els.progressBar.style.width = `${visualProgress}%`;
    els.finalValue.textContent = valCNY.toFixed(2);
    els.originalCurrencyValue.textContent = `≈ ${valOrig.toFixed(2)} ${els.currency.value}`;
    els.daysRemaining.textContent = diffDays > 0 ? diffDays : "0";
    els.progressText.textContent = `${progress.toFixed(1)}%`;
}

function copyResult() {
    const price = els.price.value || "0";
    const currency = els.currency.value;
    const rate = els.customRate.value || "0";
    const days = els.daysRemaining.textContent;
    const valCNY = els.finalValue.textContent;
    const valOrig = els.originalCurrencyValue.textContent.replace('≈', '').trim().split(' ')[0];
    const tradeDate = els.tradeDate.value;
    const dueDate = els.dueDate.value;
    
    let cycleText = "年付";
    for (const radio of els.cycles) {
        if (radio.checked) { 
            cycleText = radio.parentElement.innerText.trim();
            break; 
        }
    }

    const cnyPrice = (parseFloat(price) * parseFloat(rate)).toFixed(2);
    const md = `## VPS 剩余价值
- 交易日期：${tradeDate}
- 外币汇率：1 ${currency} ≈ ${rate} CNY
- 续费价格：${price} ${currency}/${cycleText}（约${cnyPrice}元）
- 剩余天数：${days}天（${dueDate} 到期）
- 剩余价值：${valCNY}元（约${valOrig} ${currency}）`;

    const textArea = document.createElement("textarea");
    textArea.value = md;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand("copy");
    document.body.removeChild(textArea);
    showToast("已复制到剪贴板");
}

const modal = {
    el: document.getElementById('imageModal'),
    img: document.getElementById('generatedImage'),
    loading: document.getElementById('modalLoading'),
    actions: document.getElementById('modalActions')
};

function closeImageModal() {
    modal.el.classList.remove('opacity-100');
    setTimeout(() => {
        modal.el.classList.add('hidden');
        modal.img.classList.add('hidden');
        modal.actions.classList.add('hidden');
        modal.loading.classList.remove('hidden');
        modal.img.src = '';
    }, 300);
}

// Close modal on background click
modal.el.addEventListener('click', (e) => {
    if (e.target === modal.el) closeImageModal();
});

async function generateImage() {
    console.log('generateImage called');
    
    // Show modal immediately to indicate processing
    modal.el.classList.remove('hidden');
    // Force reflow
    void modal.el.offsetWidth;
    modal.el.classList.add('opacity-100');
    
    // Use setTimeout to allow UI to update before heavy lifting
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
                    transform: 'scale(1)',
                }
            });

            console.log('Image generated successfully');
            modal.loading.classList.add('hidden');
            modal.img.src = dataUrl;
            modal.img.classList.remove('hidden');
            modal.actions.classList.remove('hidden');
        } catch (e) {
            console.error('Synchronous error during image generation:', e);
            closeImageModal();
            showToast('生成出错');
        } finally {
            restoreDateInputs();
        }
    }, 100);
}

// Expose functions to global scope for HTML onclick attributes
window.copyResult = copyResult;
window.generateImage = generateImage;
window.closeImageModal = closeImageModal;
window.hideRateLimitTip = hideRateLimitTip;
window.manualRefreshRate = manualRefreshRate;
window.toggleTheme = toggleTheme;

