/* ===================================================
   ISpeedType — Módulo de Estadísticas
   Guarda el historial de partidas y dibuja el panel
   "Estadísticas" (resumen, tendencia, modos, actividad,
   teclas más falladas, récords y progreso de logros).
   API pública: window.SpeedStats
   =================================================== */
(function () {
    'use strict';

    const HISTORY_KEY = 'speedtype-history';
    const KEYS_KEY = 'speedtype-keystats';
    const DAYS_KEY = 'speedtype-days';
    const USER_STATS_KEY = 'speedtype-user-stats';
    const MAX_HISTORY = 1000;
    const MAX_DAYS = 800;
    const CHART_POINTS = 30;

    const MODOS = [
        { id: 'clasico', nombre: 'Clásico', icono: '⌨️' },
        { id: 'vidas', nombre: 'Vidas', icono: '❤️' },
        { id: 'desvanecer', nombre: 'Desvanecimiento', icono: '👻' },
        { id: 'tormenta', nombre: 'Tormenta Eléctrica', icono: '⚡' },
        { id: 'punto-muerto', nombre: 'Punto Muerto', icono: '🔒' }
    ];
    const NOMBRE_MODO = {};
    MODOS.forEach(m => { NOMBRE_MODO[m.id] = m.nombre; });

    const CATEGORIAS_LOGROS = [
        ['rachas', '🔥 Rachas'],
        ['velocidad', '⚡ Velocidad'],
        ['precision', '🎯 Precisión'],
        ['vidas', '❤️ Supervivencia'],
        ['modos', '🎮 Modos'],
        ['persistencia', '👑 Persistencia']
    ];

    const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

    // ---------- Almacenamiento ----------
    function load(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (raw) return JSON.parse(raw);
        } catch (e) { /* almacenamiento no disponible */ }
        return fallback;
    }

    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sin espacio / bloqueado */ }
    }

    let history = load(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];
    let keyStats = load(KEYS_KEY, {});
    if (!keyStats || typeof keyStats !== 'object' || Array.isArray(keyStats)) keyStats = {};
    let days = load(DAYS_KEY, []);
    if (!Array.isArray(days)) days = [];

    let achievementsProvider = null;
    let chartMetric = 'wpm';

    // ---------- Utilidades ----------
    const $ = (id) => document.getElementById(id);

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function num(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function dayKey(t) {
        const d = new Date(t);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function parseDay(k) {
        const [y, m, d] = k.split('-').map(Number);
        return new Date(y, m - 1, d, 12);
    }

    function fmtNum(n) { return Math.round(n).toLocaleString('es-ES'); }

    function fmtDur(s) {
        s = Math.round(s);
        if (s < 60) return `${s}s`;
        if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
        return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    }

    function fmtDate(t) {
        return new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function fmtShort(t) {
        return new Date(t).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    }

    function avg(arr) {
        return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    }

    function readUserStats() {
        const base = load(USER_STATS_KEY, {});
        return (base && typeof base === 'object') ? base : {};
    }

    // ---------- Racha de días ----------
    function dayStreaks() {
        const set = new Set(days);
        let current = 0;
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        if (!set.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
        while (set.has(dayKey(d.getTime()))) {
            current++;
            d.setDate(d.getDate() - 1);
        }

        let best = 0, run = 0, prev = null;
        [...set].sort().forEach(k => {
            const dt = parseDay(k);
            run = (prev && Math.round((dt - prev) / 86400000) === 1) ? run + 1 : 1;
            best = Math.max(best, run);
            prev = dt;
        });
        return { current, best };
    }

    // ---------- Registro de partidas ----------
    // entry: { wpm, acc, secs, errors, chars, words, mode, dif, result: 'ok'|'gameover'|'ghost', keys }
    function record(e) {
        const entry = {
            t: num(e.t) || Date.now(),
            wpm: Math.round(num(e.wpm)),
            acc: Math.round(num(e.acc)),
            secs: Math.round(num(e.secs)),
            errors: Math.round(num(e.errors)),
            chars: Math.round(num(e.chars)),
            words: Math.round(num(e.words)),
            mode: NOMBRE_MODO[e.mode] ? e.mode : 'clasico',
            dif: e.dif ? String(e.dif).slice(0, 24) : '',
            result: (e.result === 'gameover' || e.result === 'ghost') ? e.result : 'ok'
        };
        history.push(entry);
        if (history.length > MAX_HISTORY) history = history.slice(-MAX_HISTORY);
        save(HISTORY_KEY, history);

        if (e.keys && typeof e.keys === 'object') {
            Object.keys(e.keys).forEach(k => {
                const add = e.keys[k];
                const cur = keyStats[k] || [0, 0];
                cur[0] += num(add[0]);
                cur[1] += num(add[1]);
                keyStats[k] = cur;
            });
            save(KEYS_KEY, keyStats);
        }

        const dk = dayKey(entry.t);
        if (!days.includes(dk)) {
            days.push(dk);
            if (days.length > MAX_DAYS) days = days.slice(-MAX_DAYS);
            save(DAYS_KEY, days);
        }

        if (isOpen()) render();
    }

    // ---------- Gráficas (SVG) ----------
    function lineChart(values, dates, opt) {
        const W = 640, H = 210, pl = 38, pr = 14, pt = 14, pb = 28;
        const n = values.length;
        const iw = W - pl - pr, ih = H - pt - pb;
        const min = opt.min, max = opt.max;
        const X = i => pl + (n === 1 ? iw / 2 : iw * i / (n - 1));
        const Y = v => pt + ih - ih * (Math.min(Math.max(v, min), max) - min) / ((max - min) || 1);

        let grid = '';
        for (let i = 0; i <= 4; i++) {
            const v = min + (max - min) * i / 4;
            const y = Y(v).toFixed(1);
            grid += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" class="st-grid"/>` +
                    `<text x="${pl - 6}" y="${(+y + 4).toFixed(1)}" class="st-axis" text-anchor="end">${Math.round(v)}</text>`;
        }

        const pts = values.map((v, i) => [X(i), Y(v)]);
        const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const base = Y(min).toFixed(1);
        const area = n > 1 ? `${path} L${pts[n - 1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z` : '';

        // Media móvil (ventana de 5)
        const ma = values.map((_, i) => avg(values.slice(Math.max(0, i - 4), i + 1)));
        const maPath = n > 2 ? ma.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ') : '';

        const dots = pts.map((p, i) =>
            `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" class="st-dot"><title>${esc(dates[i])}: ${values[i]}${opt.unit}</title></circle>`
        ).join('');

        const gid = 'stGrad-' + opt.id;
        return `
        <svg class="st-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.label)}" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent-primary)" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="var(--accent-primary)" stop-opacity="0"/>
                </linearGradient>
            </defs>
            ${grid}
            ${area ? `<path d="${area}" fill="url(#${gid})"/>` : ''}
            ${maPath ? `<path d="${maPath}" class="st-ma"/>` : ''}
            ${n > 1 ? `<path d="${path}" class="st-line"/>` : ''}
            ${dots}
            <text x="${pl}" y="${H - 6}" class="st-axis">${esc(dates[0])}</text>
            <text x="${W - pr}" y="${H - 6}" class="st-axis" text-anchor="end">${esc(dates[n - 1])}</text>
        </svg>`;
    }

    function barChart(items, opt) {
        // items: [{label, value, title}]
        const max = Math.max(1, ...items.map(i => i.value));
        return `<div class="st-bars ${opt && opt.cls ? opt.cls : ''}">` + items.map(i => {
            const h = i.value > 0 ? Math.max(4, Math.round(i.value / max * 100)) : 0;
            return `<div class="st-bar-col" title="${esc(i.title || (i.label + ': ' + i.value))}">
                <span class="st-bar-val">${i.value > 0 ? i.value : ''}</span>
                <div class="st-bar-track"><div class="st-bar-fill" style="height:${h}%"></div></div>
                <span class="st-bar-lbl">${esc(i.label)}</span>
            </div>`;
        }).join('') + '</div>';
    }

    function heatmap(counts) {
        const weeks = 16;
        const today = new Date();
        today.setHours(12, 0, 0, 0);
        const dow = (today.getDay() + 6) % 7; // lunes = 0
        const start = new Date(today);
        start.setDate(start.getDate() - dow - (weeks - 1) * 7);

        let cells = '';
        for (let w = 0; w < weeks; w++) {
            for (let d = 0; d < 7; d++) {
                const dt = new Date(start);
                dt.setDate(start.getDate() + w * 7 + d);
                if (dt > today) { cells += '<div class="st-cell st-cell-future"></div>'; continue; }
                const c = counts[dayKey(dt.getTime())] || 0;
                const lvl = c === 0 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : c <= 6 ? 3 : 4;
                const label = `${fmtDate(dt.getTime())}: ${c} ${c === 1 ? 'partida' : 'partidas'}`;
                cells += `<div class="st-cell st-lvl-${lvl}" title="${esc(label)}"></div>`;
            }
        }
        return `<div class="st-heat-wrap">
            <div class="st-heat-days"><span>Lun</span><span></span><span>Mié</span><span></span><span>Vie</span><span></span><span>Dom</span></div>
            <div class="st-heat" style="--weeks:${weeks}">${cells}</div>
        </div>
        <div class="st-heat-legend">Menos <i class="st-cell st-lvl-0"></i><i class="st-cell st-lvl-1"></i><i class="st-cell st-lvl-2"></i><i class="st-cell st-lvl-3"></i><i class="st-cell st-lvl-4"></i> Más</div>`;
    }

    // ---------- Secciones ----------
    function card(icon, label, value, sub, cls) {
        return `<div class="st-card ${cls || ''}">
            <span class="st-card-icon">${icon}</span>
            <span class="st-card-value">${value}</span>
            <span class="st-card-label">${esc(label)}</span>
            ${sub ? `<span class="st-card-sub">${sub}</span>` : ''}
        </div>`;
    }

    function section(title, subtitle, inner, extra) {
        return `<section class="st-section ${extra || ''}">
            <div class="st-section-head"><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}</div>
            ${inner}
        </section>`;
    }

    function secResumen(H, done, us) {
        const wpms = done.map(h => h.wpm);
        const best = wpms.length ? Math.max(...wpms) : 0;
        const streaks = dayStreaks();
        const lifetime = Math.max(num(us.testsCompleted), done.length);

        // Consistencia: 100 − coeficiente de variación del WPM (últimas 20 completadas)
        let consist = '—', consistSub = 'Necesitas 5 pruebas';
        const recent = wpms.slice(-20);
        if (recent.length >= 5) {
            const m = avg(recent);
            const sd = Math.sqrt(avg(recent.map(v => (v - m) ** 2)));
            const c = m > 0 ? Math.max(0, Math.round(100 - (sd / m) * 100)) : 0;
            consist = c + '%';
            consistSub = c >= 85 ? 'Muy estable' : c >= 70 ? 'Estable' : 'Muy variable';
        }

        // Tendencia: últimas N pruebas vs las N anteriores
        let trend = '—', trendSub = 'Necesitas 4 pruebas', trendCls = '';
        if (wpms.length >= 4) {
            const size = Math.min(10, Math.floor(wpms.length / 2));
            const last = avg(wpms.slice(-size));
            const prev = avg(wpms.slice(-size * 2, -size));
            const diff = last - prev;
            const sign = diff > 0.5 ? '▲ +' : diff < -0.5 ? '▼ ' : '● ';
            trend = `${sign}${Math.abs(diff) < 0.5 ? '0' : diff.toFixed(1)}`;
            trendSub = `WPM: últimas ${size} vs ${size} anteriores`;
            trendCls = diff > 0.5 ? 'st-up' : diff < -0.5 ? 'st-down' : '';
        }

        const cards = [
            card('🎮', 'Partidas jugadas', fmtNum(H.length), `${fmtNum(done.length)} completadas · ${fmtNum(H.length - done.length)} derrotas`),
            card('✅', 'Pruebas completadas', fmtNum(lifetime), 'Total histórico'),
            card('🚀', 'Mejor WPM', best ? fmtNum(best) : '—', best ? 'Récord personal' : 'Aún sin datos'),
            card('📈', 'WPM medio', wpms.length ? fmtNum(avg(wpms)) : '—', wpms.length ? `Últimas 10: ${fmtNum(avg(wpms.slice(-10)))}` : ''),
            card('🎯', 'Precisión media', done.length ? Math.round(avg(done.map(h => h.acc))) + '%' : '—', done.length ? `Mejor: ${Math.max(...done.map(h => h.acc))}%` : ''),
            card('⏱️', 'Tiempo jugado', H.length ? fmtDur(H.reduce((a, h) => a + h.secs, 0)) : '—', H.length ? `Media: ${fmtDur(avg(H.map(h => h.secs)))} por partida` : ''),
            card('⌨️', 'Caracteres escritos', fmtNum(H.reduce((a, h) => a + h.chars, 0)), `${fmtNum(H.reduce((a, h) => a + h.words, 0))} palabras aprox.`),
            card('❌', 'Errores totales', fmtNum(H.reduce((a, h) => a + h.errors, 0)),
                 `${(H.reduce((a, h) => a + h.errors, 0) / Math.max(1, H.reduce((a, h) => a + h.chars, 0)) * 100).toFixed(1)} por cada 100 caracteres`),
            card('🔥', 'Mejor racha de palabras', fmtNum(num(us.maxWordStreak)), 'Sin cometer errores'),
            card('📅', 'Racha de días', `${streaks.current}`, `Mejor racha: ${streaks.best} ${streaks.best === 1 ? 'día' : 'días'}`),
            card('🧘', 'Consistencia', consist, consistSub),
            card('📊', 'Tendencia', trend, trendSub, trendCls)
        ].join('');

        return section('Resumen general', 'Tus números de siempre, de un vistazo', `<div class="st-cards">${cards}</div>`);
    }

    function secTendencia(done) {
        const last = done.slice(-CHART_POINTS);
        const tabs = `<div class="st-tabs">
            <button type="button" class="st-tab ${chartMetric === 'wpm' ? 'active' : ''}" data-st-metric="wpm">WPM</button>
            <button type="button" class="st-tab ${chartMetric === 'acc' ? 'active' : ''}" data-st-metric="acc">Precisión</button>
        </div>`;

        if (last.length === 0) {
            return section('Evolución', `Últimas ${CHART_POINTS} pruebas completadas`, tabs + '<p class="st-empty">Completa tu primera prueba para ver aquí tu progreso.</p>');
        }

        const dates = last.map(h => fmtShort(h.t));
        let chart, legend;
        if (chartMetric === 'wpm') {
            const values = last.map(h => h.wpm);
            const max = Math.max(20, Math.ceil(Math.max(...values) / 20) * 20);
            chart = lineChart(values, dates, { id: 'wpm', min: 0, max, unit: ' WPM', label: 'Evolución del WPM' });
            legend = `<span>Mejor: <b>${Math.max(...values)}</b></span><span>Peor: <b>${Math.min(...values)}</b></span><span>Media: <b>${Math.round(avg(values))}</b></span>`;
        } else {
            const values = last.map(h => h.acc);
            const min = Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10);
            chart = lineChart(values, dates, { id: 'acc', min: Math.min(min, 90), max: 100, unit: '%', label: 'Evolución de la precisión' });
            legend = `<span>Mejor: <b>${Math.max(...values)}%</b></span><span>Peor: <b>${Math.min(...values)}%</b></span><span>Media: <b>${Math.round(avg(values))}%</b></span>`;
        }

        return section('Evolución', `Últimas ${last.length} pruebas completadas · línea punteada = media móvil`,
            `${tabs}${chart}<div class="st-legend">${legend}</div>`);
    }

    function secModos(H) {
        const rows = MODOS.map(m => {
            const g = H.filter(h => h.mode === m.id);
            const ok = g.filter(h => h.result === 'ok');
            const pct = g.length ? Math.round(ok.length / g.length * 100) : 0;
            const dim = g.length === 0 ? 'st-row-dim' : '';
            return `<div class="st-mode-row ${dim}">
                <div class="st-mode-name"><span>${m.icono}</span> ${esc(m.nombre)}</div>
                <div class="st-mode-cell" data-label="Partidas">${g.length ? fmtNum(g.length) : '—'}</div>
                <div class="st-mode-cell st-mode-bar" data-label="Completadas">
                    <div class="st-meter"><div class="st-meter-fill" style="width:${pct}%"></div></div>
                    <span>${g.length ? pct + '%' : '—'}</span>
                </div>
                <div class="st-mode-cell" data-label="Mejor WPM">${ok.length ? Math.max(...ok.map(h => h.wpm)) : '—'}</div>
                <div class="st-mode-cell" data-label="WPM medio">${ok.length ? Math.round(avg(ok.map(h => h.wpm))) : '—'}</div>
                <div class="st-mode-cell" data-label="Precisión">${ok.length ? Math.round(avg(ok.map(h => h.acc))) + '%' : '—'}</div>
            </div>`;
        }).join('');

        const head = `<div class="st-mode-row st-mode-head">
            <div class="st-mode-name">Modo</div><div class="st-mode-cell">Partidas</div><div class="st-mode-cell">Completadas</div>
            <div class="st-mode-cell">Mejor WPM</div><div class="st-mode-cell">WPM medio</div><div class="st-mode-cell">Precisión</div>
        </div>`;

        return section('Rendimiento por modo', 'Cuántas partidas terminas con éxito y qué tan rápido eres en cada modo', `<div class="st-modes">${head}${rows}</div>`);
    }

    function secActividad(H) {
        const counts = {};
        const byDow = new Array(7).fill(0);
        const byHour = new Array(24).fill(0);
        H.forEach(h => {
            counts[dayKey(h.t)] = (counts[dayKey(h.t)] || 0) + 1;
            const d = new Date(h.t);
            byDow[(d.getDay() + 6) % 7]++;
            byHour[d.getHours()]++;
        });

        let favHour = '—', favDay = '—';
        if (H.length) {
            const hMax = Math.max(...byHour);
            const dMax = Math.max(...byDow);
            favHour = `${pad(byHour.indexOf(hMax))}:00`;
            favDay = DIAS_SEMANA[byDow.indexOf(dMax)];
        }

        const dowChart = barChart(byDow.map((v, i) => ({ label: DIAS_SEMANA[i], value: v, title: `${DIAS_SEMANA[i]}: ${v} partidas` })));
        const hourChart = barChart(byHour.map((v, i) => ({ label: i % 3 === 0 ? String(i) : '', value: v, title: `${pad(i)}:00 — ${v} partidas` })), { cls: 'st-bars-thin' });

        const inner = `
            ${heatmap(counts)}
            <div class="st-pair">
                <div><h4>Por día de la semana <small>Favorito: <b>${favDay}</b></small></h4>${dowChart}</div>
                <div><h4>Por hora del día <small>Favorita: <b>${favHour}</b></small></h4>${hourChart}</div>
            </div>`;
        return section('Actividad', 'Cuándo practicas (últimas 16 semanas)', inner);
    }

    function secDistribucion(done) {
        if (done.length === 0) {
            return section('Distribución de velocidad', 'Cuántas pruebas caen en cada rango de WPM', '<p class="st-empty">Sin pruebas completadas todavía.</p>');
        }
        const lo = Math.floor(Math.min(...done.map(h => h.wpm)) / 10);
        const hi = Math.floor(Math.max(...done.map(h => h.wpm)) / 10);
        const buckets = Math.min(12, Math.max(3, hi - lo + 1));
        const counts = new Array(buckets).fill(0);
        done.forEach(h => { counts[Math.min(buckets - 1, Math.max(0, Math.floor(h.wpm / 10) - lo))]++; });
        const items = counts.map((v, i) => {
            const from = (lo + i) * 10;
            const last = i === buckets - 1 && hi - lo + 1 > buckets;
            const label = last ? `${from}+` : `${from}`;
            return { label, value: v, title: `${last ? from + '+' : from + '–' + (from + 9)} WPM: ${v} pruebas` };
        });
        const mode = (lo + counts.indexOf(Math.max(...counts))) * 10;
        return section('Distribución de velocidad', `Tu rango más habitual: <b>${mode}–${mode + 9} WPM</b>`, barChart(items));
    }

    function secTeclas() {
        const rows = Object.keys(keyStats)
            .map(k => ({ k, total: keyStats[k][0], err: keyStats[k][1] }))
            .filter(r => r.total >= 15 && r.err > 0)
            .map(r => ({ ...r, rate: r.err / r.total }))
            .sort((a, b) => b.rate - a.rate || b.err - a.err)
            .slice(0, 10);

        if (rows.length === 0) {
            return section('Teclas más falladas', 'Las letras que más te cuestan', '<p class="st-empty">Todavía no hay suficientes datos de teclas. Juega algunas partidas y vuelve.</p>');
        }
        const maxRate = Math.max(...rows.map(r => r.rate));
        const list = rows.map((r, i) => `
            <div class="st-key-row">
                <span class="st-key-rank">${i + 1}</span>
                <kbd class="st-key">${esc(r.k === '"' ? '"' : r.k.toUpperCase())}</kbd>
                <div class="st-meter st-meter-err"><div class="st-meter-fill" style="width:${Math.round(r.rate / maxRate * 100)}%"></div></div>
                <span class="st-key-pct">${(r.rate * 100).toFixed(1)}%</span>
                <span class="st-key-cnt">${r.err}/${fmtNum(r.total)}</span>
            </div>`).join('');
        return section('Teclas más falladas', 'Porcentaje de veces que fallas cada tecla (mínimo 15 pulsaciones)', `<div class="st-keys">${list}</div>`);
    }

    function secRecords(H, done, us) {
        const streaks = dayStreaks();
        const items = [];

        if (done.length) {
            const bw = done.reduce((a, b) => (b.wpm > a.wpm ? b : a));
            items.push(['🏆', 'Mejor WPM', `${bw.wpm} WPM`, `${fmtDate(bw.t)} · ${NOMBRE_MODO[bw.mode]}`]);

            const long = done.filter(h => h.words >= 20);
            const pool = long.length ? long : done;
            const ba = pool.reduce((a, b) => (b.acc > a.acc || (b.acc === a.acc && b.wpm > a.wpm)) ? b : a);
            items.push(['🎯', long.length ? 'Mejor precisión (≥ 20 palabras)' : 'Mejor precisión', `${ba.acc}%`, `${fmtDate(ba.t)} · ${ba.wpm} WPM`]);

            const bl = done.reduce((a, b) => (b.words > a.words ? b : a));
            items.push(['📝', 'Texto más largo', `${fmtNum(bl.words)} palabras`, `${fmtDate(bl.t)}`]);

            const bt = H.reduce((a, b) => (b.secs > a.secs ? b : a));
            items.push(['⏱️', 'Partida más larga', fmtDur(bt.secs), `${fmtDate(bt.t)}`]);
        }

        items.push(['🔥', 'Mejor racha de palabras', fmtNum(num(us.maxWordStreak)), 'Sin cometer errores']);
        items.push(['📅', 'Mejor racha de días', `${streaks.best} ${streaks.best === 1 ? 'día' : 'días'}`, `Actual: ${streaks.current}`]);

        if (H.length) {
            let best = 0, run = 0;
            H.forEach(h => { run = h.result === 'ok' ? run + 1 : 0; best = Math.max(best, run); });
            items.push(['✅', 'Pruebas seguidas sin perder', fmtNum(best), 'Mejor racha de victorias']);

            const perDay = {};
            H.forEach(h => { perDay[dayKey(h.t)] = (perDay[dayKey(h.t)] || 0) + 1; });
            const topDay = Object.keys(perDay).reduce((a, b) => perDay[b] > perDay[a] ? b : a);
            items.push(['🗓️', 'Día más activo', `${perDay[topDay]} partidas`, fmtDate(parseDay(topDay).getTime())]);
        }

        const html = items.map(i => `<div class="st-record">
            <span class="st-record-icon">${i[0]}</span>
            <div><span class="st-record-label">${esc(i[1])}</span><span class="st-record-value">${esc(i[2])}</span><span class="st-record-sub">${esc(i[3])}</span></div>
        </div>`).join('');
        return section('Récords personales', 'Tus mejores marcas', `<div class="st-records">${html}</div>`);
    }

    function secLogros() {
        const list = achievementsProvider ? achievementsProvider() : [];
        if (!list.length) return '';
        const total = list.filter(a => a.completado).length;
        const rows = CATEGORIAS_LOGROS.map(([id, nombre]) => {
            const items = list.filter(a => a.categoria === id);
            if (!items.length) return '';
            const done = items.filter(a => a.completado).length;
            const pct = Math.round(done / items.length * 100);
            return `<div class="st-ach-row">
                <span class="st-ach-name">${nombre}</span>
                <div class="st-meter"><div class="st-meter-fill" style="width:${pct}%"></div></div>
                <span class="st-ach-count">${done}/${items.length}</span>
            </div>`;
        }).join('');
        return section('Progreso de logros', `${total} de ${list.length} desbloqueados (${Math.round(total / list.length * 100)}%)`, `<div class="st-ach">${rows}</div>`);
    }

    function secFooter(H) {
        return `<div class="st-footer">
            <p>${H.length ? `Se guardan tus últimas ${MAX_HISTORY} partidas en este navegador.` : 'Las estadísticas se guardan en este navegador.'}</p>
            <button type="button" class="st-reset" id="stats-reset" ${H.length ? '' : 'disabled'}>Borrar historial de partidas</button>
        </div>`;
    }

    // ---------- Render / modal ----------
    function render() {
        const body = $('stats-body');
        if (!body) return;
        const top = body.scrollTop;
        const H = history;
        const done = H.filter(h => h.result === 'ok');
        const us = readUserStats();

        let intro = '';
        if (H.length === 0) {
            intro = `<div class="st-intro">📊 Aún no hay partidas en el historial. Cada prueba que juegues desde ahora se registrará aquí con sus gráficas y récords.</div>`;
        }

        body.innerHTML = intro +
            secResumen(H, done, us) +
            secTendencia(done) +
            secModos(H) +
            secActividad(H) +
            secDistribucion(done) +
            secTeclas() +
            secRecords(H, done, us) +
            secLogros() +
            secFooter(H);
        body.scrollTop = top;
    }

    function isOpen() {
        const m = $('stats-modal');
        return !!m && !m.classList.contains('hidden');
    }

    function open() {
        const m = $('stats-modal');
        if (!m) return;
        render();
        m.classList.remove('hidden');
        const body = $('stats-body');
        if (body) body.scrollTop = 0;
    }

    function close() {
        const m = $('stats-modal');
        if (m) m.classList.add('hidden');
    }

    function resetHistory() {
        if (!history.length) return;
        if (!window.confirm('¿Borrar todo el historial de partidas y las estadísticas de teclas?\n\nTus logros NO se borran.')) return;
        history = [];
        keyStats = {};
        days = [];
        save(HISTORY_KEY, history);
        save(KEYS_KEY, keyStats);
        save(DAYS_KEY, days);
        render();
    }

    function bind() {
        const toggle = $('stats-toggle');
        const modal = $('stats-modal');
        const closeBtn = $('stats-close');
        if (toggle) toggle.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (modal) {
            modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
            modal.addEventListener('click', (e) => {
                const tab = e.target.closest && e.target.closest('[data-st-metric]');
                if (tab) { chartMetric = tab.dataset.stMetric; render(); return; }
                if (e.target.id === 'stats-reset') resetHistory();
            });
        }
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) close(); });
    }

    bind();

    window.SpeedStats = {
        record,
        open,
        close,
        dayStreaks,
        setAchievementsProvider: (fn) => { achievementsProvider = fn; },
        getHistory: () => history.slice()
    };
})();
