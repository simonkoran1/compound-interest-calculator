// ─────────────────────────────────────────────────────────────────────────────
// Investown Investment Calculator
// Supports two modes set via the wrapper attribute:
//   <div int-calc-type="a" class="int-calc_wrapper">  -> simple stacked-area chart
//   <div int-calc-type="b" class="int-calc_wrapper">  -> comparison multi-line chart
//
// Locale support (detected from <html lang>):
//   lang="cs"  -> Czech strings, space thousands, "Kč" suffix
//   any other  -> English strings, comma thousands, "Kč" suffix
//   CZK values and steps are always used regardless of locale
// ─────────────────────────────────────────────────────────────────────────────

// ── 1. LOCALE ─────────────────────────────────────────────────────────────────

const isEN = (document.documentElement.lang || '').toLowerCase() !== 'cs';

// ── 2. TRANSLATIONS ───────────────────────────────────────────────────────────

const I18N = {
    cs: {
        year:           'Rok',
        total:          'Celkem',
        returns:        'Zhodnocení',
        invested:       'Investice',
        investedLabel:  'Investováno',
        investown:      'Investown',
        securities:     'Spořicí účet',
        bonds:          'Dluhopisy',
        millions:       '\u00a0M',
        thousands:      '\u00a0tis.',
    },
    en: {
        year:           'Year',
        total:          'Total',
        returns:        'Returns',
        invested:       'Invested',
        investedLabel:  'Invested',
        investown:      'Investown',
        securities:     'Savings account',
        bonds:          'Bonds',
        millions:       '\u00a0M',
        thousands:      'k',
    }
};

const T = isEN ? I18N.en : I18N.cs;

// ── 3. FORMATTING CONSTANTS ───────────────────────────────────────────────────

const CURRENCY  = '\u00a0K\u010d';
const THOUSANDS = isEN ? ',' : '\u00a0';
const TRUNCATED = isEN
    ? '99,999,999\u00a0K\u010d...'
    : '99\u00a0999\u00a0999\u00a0K\u010d...';

// ── 4. STEPS (± buttons) ──────────────────────────────────────────────────────

const STEPS = {
    initialDeposit:    10000,
    monthlyInvestment: 1000
};

// ── 5. INITIAL VALUES ─────────────────────────────────────────────────────────

const DEFAULTS = {
    initialDeposit:    120000,
    monthlyInvestment: 5000
};

// ── 6. DYNAMIC INVESTOWN RATE ─────────────────────────────────────────────────

function loadInvestownRate(fallback) {
    try {
        const scriptEl = document.getElementById('stats-data');
        if (scriptEl) {
            const data = JSON.parse(scriptEl.textContent);
            const raw = parseFloat(data.averageYield);
            if (!isNaN(raw) && raw > 0) return raw > 1 ? raw / 100 : raw;
        }
    } catch (e) {
        console.warn('[int-calc] Could not parse stats-data JSON, using fallback rate.', e);
    }
    return fallback;
}

const FALLBACK_RATE = 0.093;

// ── 7. STATE ──────────────────────────────────────────────────────────────────

const state = {
    initialDeposit:    DEFAULTS.initialDeposit,
    monthlyInvestment: DEFAULTS.monthlyInvestment,
    duration:          20,
    investownRate:     loadInvestownRate(FALLBACK_RATE)
};

const comparisonRates = {
    securities: 0.035,
    bonds:      0.04
};

const comparisonToggles = {
    investown:  true,
    securities: true,
    bonds:      true
};

let chartInstance = null;

// ── 8. YEAR LABEL HELPER ──────────────────────────────────────────────────────
// CS: 1 = "rok", 2–4 = "roky", 5+ = "let"
// EN: 1 = "year", 2+ = "years"

function getYearLabel(years) {
    if (isEN) {
        return years === 1 ? 'year' : 'years';
    }
    if (years === 1)                return 'rok';
    if (years >= 2 && years <= 4)   return 'roky';
    return 'let';
}

function updateDurationLabel(years) {
    setText('durationValue', years + '\u00a0' + getYearLabel(years));
}

// ── 9. CALCULATOR TYPE ────────────────────────────────────────────────────────

function getCalcType() {
    const wrapper = document.querySelector('.int-calc_wrapper');
    if (!wrapper) return 'a';
    return (wrapper.getAttribute('int-calc-type') || 'a').toLowerCase().trim() === 'b' ? 'b' : 'a';
}

// ── 10. SHARED MATH ───────────────────────────────────────────────────────────

function calculateFutureValue(principal, monthlyContribution, years, annualRate) {
    const monthlyRate = annualRate / 12;
    const months = years * 12;
    const fvPrincipal = principal * Math.pow(1 + monthlyRate, months);
    const fvContributions = monthlyRate === 0
        ? monthlyContribution * months
        : monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    return fvPrincipal + fvContributions;
}

function calculateTotalInvested(principal, monthlyContribution, years) {
    return principal + monthlyContribution * years * 12;
}

function generateLabels(years) {
    const currentYear = new Date().getFullYear();
    const labels = [];
    for (let y = 1; y <= years; y++) labels.push(currentYear + y);
    return labels;
}

function generateInvestedData(principal, monthly, years) {
    const data = [];
    for (let y = 1; y <= years; y++) data.push(calculateTotalInvested(principal, monthly, y));
    return data;
}

function generateFutureValueData(principal, monthly, years, rate) {
    const data = [];
    for (let y = 1; y <= years; y++) data.push(calculateFutureValue(principal, monthly, y, rate));
    return data;
}

// ── 11. FORMAT HELPERS ────────────────────────────────────────────────────────

function formatNumber(num, truncate = false) {
    const rounded = Math.round(num);
    if (truncate && rounded > 99999999) return TRUNCATED;
    return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, THOUSANDS);
}

function parseFormattedNumber(str) {
    return parseInt(str.replace(/[\s\u00a0,]/g, '')) || 0;
}

function parseRate(str) {
    return parseFloat(String(str).replace(',', '.')) || 0;
}

function formatRate(value) {
    return isEN ? value.toFixed(1) : value.toFixed(1).replace('.', ',');
}

// ── 12. DOM HELPERS ───────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function setText(id, text) {
    const node = el(id);
    if (node) node.textContent = text;
}

// ── 13. RESULT DISPLAY ────────────────────────────────────────────────────────

function updateResult() {
    const futureValue = calculateFutureValue(
        state.initialDeposit, state.monthlyInvestment, state.duration, state.investownRate
    );
    const profit = futureValue - calculateTotalInvested(
        state.initialDeposit, state.monthlyInvestment, state.duration
    );

    setText('resultAmount', formatNumber(futureValue) + CURRENCY);
    setText('profitValue', '+ ' + formatNumber(profit) + CURRENCY);
}

// ── 14. SLIDER FILL ───────────────────────────────────────────────────────────

function updateSliderFill() {
    const slider = el('durationSlider');
    const fill   = el('sliderFill');
    if (!slider || !fill) return;
    fill.style.width = ((slider.value - slider.min) / (slider.max - slider.min)) * 100 + '%';
}

// ── 15. SAFARI / iOS FONT FIX ────────────────────────────────────────────────

function applyChartFont() {
    const computed = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.family = computed || 'Inter, sans-serif';
    if (chartInstance) chartInstance.update();
}

// ── 16. CHART HELPERS ─────────────────────────────────────────────────────────

const verticalLinePlugin = {
    id: 'verticalLine',
    afterDatasetsDraw(chart) {
        const active = chart.getActiveElements();
        if (!active || !active.length) return;
        const { ctx, chartArea } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(148,163,184,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.restore();
    }
};

function makeGradient(ctx, chartArea, topColor, bottomColor) {
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, topColor);
    g.addColorStop(1, bottomColor);
    return g;
}

// ── 17. SHARED CHART SCALES ───────────────────────────────────────────────────

const sharedScales = {
    x: {
        display: true,
        grid: { display: false },
        ticks: {
            color: '#94a3b8',
            font: { size: 11, weight: '500' },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10
        },
        border: { display: false }
    },
    y: {
        display: true,
        beginAtZero: true,
        grid: { color: 'rgba(148,163,184,0.1)', drawBorder: false },
        ticks: {
            color: '#94a3b8',
            font: { size: 11, weight: '500' },
            padding: 12,
            callback(value) {
                if (value >= 1000000) return (value / 1000000).toFixed(1) + T.millions + CURRENCY;
                if (value >= 1000)    return (value / 1000).toFixed(0)    + T.thousands + CURRENCY;
                return formatNumber(value) + CURRENCY;
            }
        },
        border: { display: false }
    }
};

// ── 18. TYPE A — STACKED AREA CHART ──────────────────────────────────────────

function buildTypeADatasets() {
    const { initialDeposit: p, monthlyInvestment: m, duration: d, investownRate: r } = state;
    return [
        {
            label: T.returns,
            data: generateFutureValueData(p, m, d, r),
            borderColor: '#22c55e',
            borderWidth: 2.5,
            backgroundColor(context) {
                const { ctx, chartArea } = context.chart;
                if (!chartArea) return 'rgba(34,197,94,0.2)';
                return makeGradient(ctx, chartArea, 'rgba(34,197,94,0.45)', 'rgba(34,197,94,0.08)');
            },
            fill: '+1',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#22c55e',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            order: 1
        },
        {
            label: T.invested,
            data: generateInvestedData(p, m, d),
            borderColor: '#6B7280',
            borderWidth: 2,
            borderDash: [6, 4],
            backgroundColor(context) {
                const { ctx, chartArea } = context.chart;
                if (!chartArea) return 'rgba(148,163,184,0.2)';
                return makeGradient(ctx, chartArea, 'rgba(148,163,184,0.6)', 'rgba(148,163,184,0.2)');
            },
            fill: 'origin',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBackgroundColor: '#9CA3AF',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            order: 2
        }
    ];
}

function getTypeAOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        hover:       { mode: 'index', intersect: false },
        plugins: {
            legend: {
                display: true,
                position: 'bottom',
                onClick: () => {},
                labels: {
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 24,
                    color: '#64748b',
                    font: { size: 13, weight: '500' },
                    boxWidth: 8,
                    boxHeight: 8,
                    generateLabels(chart) {
                        return chart.data.datasets.map((ds, i) => ({
                            text:        ds.label,
                            fillStyle:   i === 0 ? '#22c55e' : '#9CA3AF',
                            strokeStyle: i === 0 ? '#22c55e' : '#9CA3AF',
                            pointStyle: 'circle',
                            hidden: false,
                            datasetIndex: i
                        }));
                    }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15,23,42,0.95)',
                titleColor: '#f8fafc',
                bodyColor:  '#cbd5e1',
                borderColor: 'rgba(148,163,184,0.2)',
                borderWidth: 1,
                padding: 16,
                cornerRadius: 12,
                displayColors: true,
                boxPadding: 6,
                titleFont: { size: 14, weight: '600' },
                bodyFont:  { size: 13 },
                callbacks: {
                    title: ctx => T.year + ' ' + ctx[0].label,
                    label(context) {
                        if (context.datasetIndex === 0) {
                            const total    = context.raw;
                            const invested = context.chart.data.datasets[1].data[context.dataIndex];
                            return ' ' + T.returns + ': ' + formatNumber(total - invested) + CURRENCY;
                        }
                        return ' ' + context.dataset.label + ': ' + formatNumber(context.raw) + CURRENCY;
                    },
                    afterBody(context) {
                        return '\n' + T.total + ': ' + formatNumber(context[0].raw) + CURRENCY;
                    }
                }
            }
        },
        scales: sharedScales
    };
}

// ── 19. TYPE B — COMPARISON MULTI-LINE CHART ─────────────────────────────────

function buildTypeBDatasets() {
    const { initialDeposit: p, monthlyInvestment: m, duration: d } = state;
    const datasets = [];

    if (comparisonToggles.investown) {
        datasets.push({
            label: T.investown,
            data: generateFutureValueData(p, m, d, state.investownRate),
            borderColor: '#3536FF',
            borderWidth: 2.5,
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#3536FF',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            order: 1
        });
    }

    if (comparisonToggles.securities) {
        datasets.push({
            label: T.securities,
            data: generateFutureValueData(p, m, d, comparisonRates.securities),
            borderColor: '#E89B3C',
            borderWidth: 2.5,
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#E89B3C',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            order: 2
        });
    }

    if (comparisonToggles.bonds) {
        datasets.push({
            label: T.bonds,
            data: generateFutureValueData(p, m, d, comparisonRates.bonds),
            borderColor: '#B5A3AD',
            borderWidth: 2.5,
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 6,
            pointHoverBackgroundColor: '#B5A3AD',
            pointHoverBorderColor: '#fff',
            pointHoverBorderWidth: 2,
            order: 3
        });
    }

    datasets.push({
        label: T.investedLabel,
        data: generateInvestedData(p, m, d),
        borderColor: '#6B7280',
        borderWidth: 2,
        borderDash: [6, 4],
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: '#9CA3AF',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2,
        order: 4
    });

    return datasets;
}

function getTypeBOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        hover:       { mode: 'index', intersect: false },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(15,23,42,0.95)',
                titleColor: '#f8fafc',
                bodyColor:  '#cbd5e1',
                borderColor: 'rgba(148,163,184,0.2)',
                borderWidth: 1,
                padding: 16,
                cornerRadius: 12,
                displayColors: true,
                boxPadding: 6,
                titleFont: { size: 14, weight: '600' },
                bodyFont:  { size: 13 },
                callbacks: {
                    title: ctx => T.year + ' ' + ctx[0].label,
                    label: ctx => ' ' + ctx.dataset.label + ': ' + formatNumber(ctx.raw) + CURRENCY
                }
            }
        },
        scales: sharedScales
    };
}

// ── 20. UNIFIED CHART UPDATE ──────────────────────────────────────────────────

function updateChart() {
    const canvas = el('investmentChart');
    if (!canvas) return;

    const type     = getCalcType();
    const labels   = generateLabels(state.duration);
    const datasets = type === 'b' ? buildTypeBDatasets() : buildTypeADatasets();

    if (chartInstance) {
        chartInstance.data.labels   = labels;
        chartInstance.data.datasets = datasets;
        chartInstance.update('none');
    } else {
        chartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels, datasets },
            plugins: [verticalLinePlugin],
            options: type === 'b' ? getTypeBOptions() : getTypeAOptions()
        });
    }
}

// ── 21. COMPARISON TOGGLE LISTENERS (type B only) ─────────────────────────────

function initComparisonToggles(wrapper) {
    wrapper.querySelectorAll('.int-calc_comparison-toggle').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (e.target.classList.contains('int-calc_comparison-toggle-rate-input')) return;
            const product = this.dataset.product;
            if (!product || !(product in comparisonToggles)) return;
            comparisonToggles[product] = !comparisonToggles[product];
            this.classList.toggle('active', comparisonToggles[product]);
            updateChart();
        });
    });

    function bindRateInput(inputId, rateKey) {
        const input = el(inputId);
        if (!input) return;
        input.addEventListener('click', e => e.stopPropagation());
        input.addEventListener('blur', function() {
            const val = Math.max(0, Math.min(30, parseRate(this.value)));
            comparisonRates[rateKey] = val / 100;
            this.value = formatRate(val);
            updateChart();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
    }

    bindRateInput('compSecuritiesRate', 'securities');
    bindRateInput('compBondsRate', 'bonds');

    ['compSecuritiesRate', 'compBondsRate'].forEach(id => {
        const input = el(id);
        if (input) input.value = isEN
            ? input.value.replace(',', '.')
            : input.value.replace('.', ',');
    });
}

// ── 22. MAIN INPUT LISTENERS ──────────────────────────────────────────────────

function initInputListeners(wrapper) {
    const depositInput = el('initialDepositInput');
    const monthlyInput = el('monthlyInvestmentInput');
    const slider       = el('durationSlider');

    if (!depositInput || !monthlyInput || !slider) {
        console.warn('[int-calc] Required input elements not found.');
        return;
    }

    wrapper.querySelectorAll('.int-calc_control-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const target   = this.dataset.target;
            const htmlStep = parseInt(this.dataset.step, 10);
            const sign     = htmlStep < 0 ? -1 : 1;

            if (target === 'initialDeposit') {
                state.initialDeposit = Math.max(0, state.initialDeposit + sign * STEPS.initialDeposit);
                depositInput.value   = formatNumber(state.initialDeposit, true);
            } else if (target === 'monthlyInvestment') {
                state.monthlyInvestment = Math.max(0, state.monthlyInvestment + sign * STEPS.monthlyInvestment);
                monthlyInput.value      = formatNumber(state.monthlyInvestment, true);
            }
            updateResult();
            updateChart();
        });
    });

    depositInput.addEventListener('input', function() {
        state.initialDeposit = Math.max(0, parseFormattedNumber(this.value));
    });
    depositInput.addEventListener('blur', function() {
        this.value = formatNumber(state.initialDeposit, true);
        updateResult();
        updateChart();
    });
    depositInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

    monthlyInput.addEventListener('input', function() {
        state.monthlyInvestment = Math.max(0, parseFormattedNumber(this.value));
    });
    monthlyInput.addEventListener('blur', function() {
        this.value = formatNumber(state.monthlyInvestment, true);
        updateResult();
        updateChart();
    });
    monthlyInput.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

    slider.addEventListener('input', function() {
        state.duration = parseInt(this.value, 10);
        updateDurationLabel(state.duration);
        updateSliderFill();
        updateResult();
        updateChart();
    });
}

// ── 23. INIT ──────────────────────────────────────────────────────────────────

function init() {
    const wrapper = document.querySelector('.int-calc_wrapper');
    if (!wrapper) return;

    const type = getCalcType();

    document.fonts.ready.then(applyChartFont);

    updateSliderFill();
    updateDurationLabel(state.duration);   // set correct label on page load
    updateResult();
    initInputListeners(wrapper);

    if (type === 'b') {
        const togglesPanel = wrapper.querySelector('.int-calc_comparison-toggles');
        if (togglesPanel) togglesPanel.classList.add('active');

        wrapper.querySelectorAll('.int-calc_comparison-toggle').forEach(btn => {
            const product = btn.dataset.product;
            if (product && comparisonToggles[product]) btn.classList.add('active');
        });

        initComparisonToggles(wrapper);
    }

    setTimeout(updateChart, 100);
}

document.addEventListener('DOMContentLoaded', init);
