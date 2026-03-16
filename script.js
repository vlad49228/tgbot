const tg = window.Telegram.WebApp;
tg.expand();
tg.setBackgroundColor('#080808');
tg.setHeaderColor('#080808');

const API_BASE_URL = '';

let balances = { USDT: 0, BTC: 0, ETH: 0, TON: 0 };
let prices = {
    BTC:  { usd: 0, change: 0 },
    ETH:  { usd: 0, change: 0 },
    TON:  { usd: 0, change: 0 },
    USDT: { usd: 1.00, change: 0 }
};

// Binance symbols (TON торгуется как TONUSDT)
const BINANCE_SYMBOLS = { BTC: 'BTCUSDT', ETH: 'ETHUSDT', TON: 'TONUSDT' };

const CRYPTO_META = {
    BTC:  { name: 'Bitcoin',  img: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',    cls: 'btc'  },
    ETH:  { name: 'Ethereum', img: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',  cls: 'eth'  },
    TON:  { name: 'Toncoin',  img: 'https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png', cls: 'ton'  },
    USDT: { name: 'Tether',   img: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',   cls: 'usdt' },
};

function cryptoIcon(sym, size=24) {
    const m = CRYPTO_META[sym];
    return `<img src="${m.img}" alt="${sym}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;">`;
}

// ── Элементы ──
const totalBalanceEl = document.getElementById('total-balance');
const balanceMetaBtc = document.getElementById('balance-meta-btc');
const balanceChip    = document.getElementById('balance-chip');
const balanceElements = { TON: document.getElementById('balance-TON'), BTC: document.getElementById('balance-BTC'), ETH: document.getElementById('balance-ETH'), USDT: document.getElementById('balance-USDT') };
const priceElements   = { TON: document.getElementById('price-TON'),   BTC: document.getElementById('price-BTC'),   ETH: document.getElementById('price-ETH'),   USDT: document.getElementById('price-USDT') };
const changeElements  = { TON: document.getElementById('change-TON'),  BTC: document.getElementById('change-BTC'),  ETH: document.getElementById('change-ETH'),  USDT: document.getElementById('change-USDT') };

// ── Реальные курсы через свой сервер (он проксирует Binance) ──
function fetchPrices() {
    fetch(`${API_BASE_URL}/api/prices`)
        .then(r => r.json())
        .then(data => {
            if (data.BTC)  { prices.BTC.usd  = data.BTC.usd;  prices.BTC.change  = data.BTC.change;  }
            if (data.ETH)  { prices.ETH.usd  = data.ETH.usd;  prices.ETH.change  = data.ETH.change;  }
            if (data.TON)  { prices.TON.usd  = data.TON.usd;  prices.TON.change  = data.TON.change;  }
            if (data.USDT) { prices.USDT.usd = data.USDT.usd; prices.USDT.change = data.USDT.change; }
            updateAll();
            updateTicker();
            console.log('Prices updated:', prices);
        })
        .catch(err => console.error('Price fetch error:', err));
}

// ── График с Binance klines ──
// interval: 1h, 4h, 1d; limit: кол-во свечей
// Разные временные диапазоны, но максимальная детализация в каждом
const CHART_CONFIGS = [
    { label: '1H',  interval: '1m',  limit: 60  },   // 1 час   — свечи 1 мин  (60 точек)
    { label: '24H', interval: '5m',  limit: 288 },   // 24 часа — свечи 5 мин  (288 точек)
    { label: '7D',  interval: '1h',  limit: 168 },   // 7 дней  — свечи 1 час  (168 точек)
    { label: '30D', interval: '4h',  limit: 180 },   // 30 дней — свечи 4 часа (180 точек)
];

function fetchChart(symbol, cfgIndex) {
    if (symbol === 'USDT') return Promise.resolve([]);  // USDT — плоская линия
    const binSym = BINANCE_SYMBOLS[symbol];
    if (!binSym) return Promise.resolve([]);
    const cfg = CHART_CONFIGS[cfgIndex];
    const url = `${API_BASE_URL}/api/chart?symbol=${symbol}&interval=${cfg.interval}&limit=${cfg.limit}`;
    return fetch(url)
        .then(r => r.json())
        .then(data => data);  // [time, closePrice]
}

// ── Тикер ──
function updateTicker() {
    const tickEls = document.querySelectorAll('.tick');
    const data = [{ sym:'BTC', p:prices.BTC }, { sym:'ETH', p:prices.ETH }, { sym:'TON', p:prices.TON }, { sym:'USDT', p:prices.USDT }];
    tickEls.forEach((el, i) => {
        const d = data[i % 4];
        if (!d.p.usd) return;
        const pos = d.p.change >= 0;
        el.className = 'tick ' + (pos ? 'pos' : 'neg');
        el.innerHTML = `${d.sym} <b>$${fmtPrice(d.p.usd)}</b> <em>${pos?'+':''}${d.p.change}%</em>`;
    });
}

// ── Баланс ──
function requestBalance() {
    const user = tg.initDataUnsafe?.user;
    if (!user?.id) return;
    fetch(`${API_BASE_URL}/api/balances?user_id=${encodeURIComponent(user.id)}`)
        .then(r => r.json())
        .then(data => {
            balances = { USDT: Number(data.USDT||0), BTC: Number(data.BTC||0), ETH: Number(data.ETH||0), TON: Number(data.TON||0) };
            const addr = `0x${user.id.toString(16).padStart(8,'0')}...${user.id.toString(16).slice(-4)}`;
            document.getElementById('walletAddr').textContent = addr;
            updateAll();
        }).catch(err => console.error('Balance error:', err));
}

function fmtPrice(v) {
    if (!v) return '0';
    return v.toLocaleString('en-US', { maximumFractionDigits: v < 10 ? 4 : 2 });
}

function updateAll() { updatePrices(); updateBalances(); updateTotalBalance(); }

function updatePrices() {
    for (const c of ['TON','BTC','ETH','USDT']) {
        const p = prices[c];
        if (!p.usd) continue;
        if (priceElements[c])  priceElements[c].textContent = '$' + fmtPrice(p.usd);
        if (changeElements[c]) {
            changeElements[c].textContent = (p.change >= 0 ? '+' : '') + p.change + '%';
            changeElements[c].className   = 'asset-change ' + (p.change >= 0 ? 'positive' : 'negative');
        }
    }
    // Тоже обновляем тикер при каждом updatePrices
    updateTicker();
}

function updateBalances() {
    for (const c of ['TON','BTC','ETH','USDT']) { const el = balanceElements[c]; if (el) el.textContent = (balances[c]||0).toFixed(4)+' '+c; }
}

function updateTotalBalance() {
    let total = 0;
    for (const c of ['TON','BTC','ETH','USDT']) total += (balances[c]||0) * prices[c].usd;
    const fmt = total >= 1_000_000 ? '$'+(total/1_000_000).toFixed(2)+'M' : '$'+total.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
    if (totalBalanceEl) totalBalanceEl.textContent = fmt;
    const btcVal = prices.BTC.usd > 0 ? total/prices.BTC.usd : 0;
    if (balanceMetaBtc) balanceMetaBtc.textContent = btcVal.toFixed(6)+' BTC';
    const ch = prices.BTC.change;
    if (balanceChip) { balanceChip.textContent = (ch>=0?'+':'')+ch+'%'; balanceChip.className = 'balance-chip '+(ch>=0?'positive':'negative'); }
}

// ──────────────── ЭКРАН АКТИВА ────────────────
function openAssetScreen(symbol) {
    document.querySelector('.asset-screen')?.remove();
    const meta = CRYPTO_META[symbol];
    const p    = prices[symbol];
    const pos  = p.change >= 0;

    const screen = document.createElement('div');
    screen.className = 'asset-screen';
    screen.innerHTML = `
        <div class="as-header">
            <button class="as-back">←</button>
            <div class="as-title-row">
                <div class="asset-icon ${meta.cls}">${cryptoIcon(symbol, 36)}</div>
                <div>
                    <div class="as-name">${meta.name}</div>
                    <div class="as-sym">${symbol}</div>
                </div>
            </div>
            <div style="width:36px"></div>
        </div>

        <div class="as-price-block">
            <div class="as-price">$${fmtPrice(p.usd)}</div>
            <div class="as-change ${pos?'positive':'negative'}">${pos?'+':''}${p.change}% 24h</div>
        </div>

        <div class="as-period-row">
            ${CHART_CONFIGS.map((c,i) => `<button class="period-btn${i===1?' active':''}" data-idx="${i}">${c.label}</button>`).join('')}
        </div>

        <div class="as-chart-wrap">
            <canvas id="as-canvas"></canvas>
            <div class="as-chart-loading" id="as-loading">Loading...</div>
        </div>

        <div class="as-stats-row">
            <div class="as-stat">
                <span class="as-stat-label">Current</span>
                <span class="as-stat-val">$${fmtPrice(p.usd)}</span>
            </div>
            <div class="as-stat">
                <span class="as-stat-label">Change 24h</span>
                <span class="as-stat-val ${pos?'positive':'negative'}">${pos?'+':''}${p.change}%</span>
            </div>
            <div class="as-stat">
                <span class="as-stat-label">My balance</span>
                <span class="as-stat-val">${(balances[symbol]||0).toFixed(4)} ${symbol}</span>
            </div>
            <div class="as-stat">
                <span class="as-stat-label">Value</span>
                <span class="as-stat-val">$${((balances[symbol]||0)*p.usd).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
            </div>
        </div>

        <div class="as-actions">
            <button class="as-btn" id="as-send">↑ Send</button>
            <button class="as-btn" id="as-recv">↓ Receive</button>
            <button class="as-btn" id="as-swap">⇄ Swap</button>
        </div>`;

    document.body.appendChild(screen);

    screen.querySelector('.as-back').addEventListener('click', () => screen.remove());
    screen.querySelector('#as-send').addEventListener('click', () => tg.showAlert('Send — coming soon'));
    screen.querySelector('#as-recv').addEventListener('click', () => tg.showAlert('Receive address:\nUQAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    screen.querySelector('#as-swap').addEventListener('click', () => tg.showAlert('Swap — coming soon'));

    // Установить размер canvas
    const canvas = document.getElementById('as-canvas');
    canvas.width  = canvas.parentElement.clientWidth - 36;
    canvas.height = 160;

    // Периоды
    screen.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            screen.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadAndDraw(symbol, parseInt(btn.dataset.idx));
        });
    });

    // Грузим 24H по умолчанию
    loadAndDraw(symbol, 1);
}

function loadAndDraw(symbol, cfgIdx) {
    const canvas  = document.getElementById('as-canvas');
    const loading = document.getElementById('as-loading');
    if (!canvas || !loading) return;

    loading.textContent = 'Loading...';
    loading.style.display = 'flex';
    canvas.style.opacity  = '0';

    if (symbol === 'USDT') {
        // Плоская линия для стейблкоина
        const flat = Array.from({length: 30}, (_, i) => [i, 1.0]);
        drawChart(canvas, flat, true);
        loading.style.display = 'none';
        canvas.style.opacity  = '1';
        return;
    }

    fetchChart(symbol, cfgIdx)
        .then(pts => {
            if (!pts || pts.length < 2) { loading.textContent = 'No data'; return; }
            const isPos = pts[pts.length-1][1] >= pts[0][1];
            drawChart(canvas, pts, isPos);
            loading.style.display = 'none';
            canvas.style.opacity  = '1';
        })
        .catch(() => { loading.textContent = 'Chart unavailable'; });
}

function drawChart(canvas, pts, isPositive) {
    const W = canvas.width;
    const H = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const vals  = pts.map(p => p[1]);
    const min   = Math.min(...vals);
    const max   = Math.max(...vals);
    const range = max - min || 1;

    const pad = { top: 16, bottom: 28, left: 6, right: 6 };
    const w   = W - pad.left - pad.right;
    const h   = H - pad.top  - pad.bottom;

    const toX = i => pad.left + (i / (pts.length - 1)) * w;
    const toY = v => pad.top  + h - ((v - min) / range) * h;

    const color = isPositive ? '#00e676' : '#ff3d57';

    // Горизонтальные сетки (4 линии)
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
        const y = pad.top + (h / 4) * i;
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    }

    // Сглаженная линия через кривые Безье
    const buildPath = () => {
        ctx.beginPath();
        ctx.moveTo(toX(0), toY(pts[0][1]));
        for (let i = 1; i < pts.length; i++) {
            const x0 = toX(i-1), y0 = toY(pts[i-1][1]);
            const x1 = toX(i),   y1 = toY(pts[i][1]);
            const cpx = (x0 + x1) / 2;
            ctx.bezierCurveTo(cpx, y0, cpx, y1, x1, y1);
        }
    };

    // Заливка под линией
    buildPath();
    ctx.lineTo(toX(pts.length-1), H);
    ctx.lineTo(toX(0), H);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, H);
    grad.addColorStop(0, isPositive ? 'rgba(0,230,118,0.25)' : 'rgba(255,61,87,0.25)');
    grad.addColorStop(0.7, isPositive ? 'rgba(0,230,118,0.05)' : 'rgba(255,61,87,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad; ctx.fill();

    // Сама линия
    buildPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 1.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();

    // Точка на конце + пульс
    const lx = toX(pts.length-1), ly = toY(vals[vals.length-1]);
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI*2);
    ctx.fillStyle = isPositive ? 'rgba(0,230,118,0.2)' : 'rgba(255,61,87,0.2)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();

    // Метки мин/макс
    ctx.font = '10px Space Mono, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.textAlign = 'left';  ctx.fillText('$'+fmtPrice(min), pad.left, H - 8);
    ctx.textAlign = 'right'; ctx.fillText('$'+fmtPrice(max), W - pad.right, H - 8);
}

// ── Клик по активам ──
document.querySelectorAll('.asset-item').forEach(item => {
    item.addEventListener('click', () => openAssetScreen(item.getAttribute('data-crypto')));
});

// ── Кнопки главного экрана ──
document.getElementById('copyBtn')?.addEventListener('click', () => navigator.clipboard?.writeText(document.getElementById('walletAddr')?.textContent||'').then(()=>tg.showAlert('Address copied')));
document.getElementById('transferBtn')?.addEventListener('click',  () => tg.showAlert('Send — coming soon'));
document.getElementById('depositBtn')?.addEventListener('click',   () => tg.showAlert('Receive address:\nUQAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
document.getElementById('withdrawBtn')?.addEventListener('click',  () => { const a=prompt('Enter USDT (TRC20) wallet address:'); if(a&&a.length>30){tg.sendData(JSON.stringify({action:'withdraw',address:a}));tg.showAlert('Submitted');}else tg.showAlert('Invalid address'); });
document.getElementById('exchangeBtn')?.addEventListener('click',  () => tg.showAlert('Swap — coming soon'));
document.querySelector('.history-link')?.addEventListener('click', () => tg.showAlert('Market — coming soon'));
document.getElementById('menuBtn')?.addEventListener('click',      () => tg.showAlert('Menu — coming soon'));

document.querySelectorAll('.nav-item').forEach((btn, i) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const pages=['wallet','trade','bonuses','history','profile'];
        if(pages[i]==='wallet'){requestBalance();return;}
        tg.showAlert(['Wallet','Market','Swap','History','Profile'][i]+' — coming soon');
    });
});


// ── Спарклайны на главной (реальные данные за 1ч) ──
const SPARK_COLORS = { BTC:'#f7931a', ETH:'#627eea', TON:'#5b7fff', USDT:'#26a17b' };

function drawSparkline(sym, pts) {
    const canvas = document.getElementById('spark-' + sym);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!pts || pts.length < 2) return;

    const vals  = pts.map(p => p[1]);
    const min   = Math.min(...vals);
    const max   = Math.max(...vals);
    const range = max - min || 1;
    const isPos = vals[vals.length-1] >= vals[0];
    const color = isPos ? '#00e676' : '#ff3d57';

    const toX = i => (i / (pts.length - 1)) * W;
    const toY = v => H - 2 - ((v - min) / range) * (H - 4);

    // Заливка
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, isPos ? 'rgba(0,230,118,0.3)' : 'rgba(255,61,87,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p[1])) : ctx.lineTo(toX(i), toY(p[1])));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();

    // Линия
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(toX(i), toY(p[1])) : ctx.lineTo(toX(i), toY(p[1])));
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
}

function loadSparklines() {
    const syms = ['BTC', 'ETH', 'TON', 'USDT'];
    syms.forEach(sym => {
        if (sym === 'USDT') {
            // USDT — плоская линия
            const flat = Array.from({length: 20}, (_, i) => [i, 1.0]);
            drawSparkline('USDT', flat);
            return;
        }
        fetch(`${API_BASE_URL}/api/chart?symbol=${sym}&interval=5m&limit=12`)
            .then(r => r.json())
            .then(pts => drawSparkline(sym, pts))
            .catch(() => {});
    });
}

// ── Запуск ──
fetchPrices();
requestBalance();
loadSparklines();
setInterval(fetchPrices, 30_000);
setInterval(loadSparklines, 60_000);
