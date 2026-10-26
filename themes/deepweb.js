/* ===================================================
   ISpeedType — Tema inmersivo: DEEP WEB (computadora poseída)
   Depende de themes/immersive.js (motor) y themes/deepweb.css (estilos).

   Aquí vive lo que el CSS no puede hacer solo:
     - la linterna: una capa de oscuridad cuyo "agujero de luz" sigue la palabra
       actual y se encoge hasta apagarse si dejas de teclear 2 s,
     - el filtro VHS (grano, banda de tracking, líneas de barrido),
     - los sustos al fallar: sacudida, destello invertido, rostro oculto en la estática,
     - la pantalla de "sin señal" al perder,
     - el sonido (todo sintetizado con Web Audio): golpes en madera, estática de radio
       de fondo, latido en la oscuridad, pitido de televisión sin señal.

   SEGURIDAD: este tema puede provocar convulsiones en personas con epilepsia
   fotosensible, por eso:
     - antes de activarlo se muestra una advertencia y el usuario elige entre
       "con sustos" y "modo suave" (sin destellos ni rostros);
     - en "modo suave" NO hay destellos ni rostros: solo una sacudida leve y un pulso
       rojo tenue en los bordes; con prefers-reduced-motion se quita también la sacudida
       y los destellos/rostros no aparecen aunque se haya elegido "con sustos";
     - cada susto (destello, rostro o pulso) es único y entre dos hay siempre ≥ 1 s
       (muy por debajo del límite de 3 destellos por segundo).

   Optimización (la justa, sin tocar lo importante):
     - La linterna es UNA capa; solo se actualizan 3 variables CSS y la posición se
       lee dentro de requestAnimationFrame.
     - Todo lo demás son capas fijas que animan solo transform / opacity.
   =================================================== */
(function () {
    'use strict';

    const T = window.ImmersiveThemes;
    if (!T) return;

    const A = T.audio;

    const KEY_MODE = 'speedtype-deepweb-mode';   // 'full' (con sustos) | 'soft' (sin destellos)
    const IDLE_MS = 2000;            // sin teclear este tiempo, la luz empieza a apagarse
    const SHRINK_MS = 3400;          // lo que tarda la luz en apagarse del todo (igual que el CSS)
    const SCARE_COOLDOWN = 1000;     // mínimo entre dos destellos / rostros
    const FACE_COOLDOWN = 3200;      // mínimo entre dos rostros
    const MIN_RADIUS = 150;

    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
    };

    const t = (key) => (window.I18N ? window.I18N.t(key) : key);
    const rand = (a, b) => a + Math.random() * (b - a);

    // "Modo con sustos" solo si el usuario lo eligió Y no pidió reducir el movimiento.
    const scaresOn = () => store.get(KEY_MODE) === 'full' && !T.reducedMotion;

    // ---------------------------------------------------
    // Imágenes generadas por código (sin archivos): ruido y rostros
    // ---------------------------------------------------
    let noiseURL = '';
    let faceURLs = [];

    function makeNoise() {
        if (noiseURL) return noiseURL;
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 128;
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(128, 128);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.random() * 255;
                img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
                img.data[i + 3] = 255;
            }
            ctx.putImageData(img, 0, 0);
            noiseURL = 'url(' + c.toDataURL('image/png') + ')';
        } catch (e) { noiseURL = 'none'; }
        return noiseURL;
    }

    function svgURL(svg) {
        return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
    }

    function makeFaces() {
        if (faceURLs.length) return faceURLs;
        const defs =
            "<defs><radialGradient id='g' cx='50%' cy='42%' r='65%'><stop offset='0' stop-color='#d8d8cc'/>" +
            "<stop offset='1' stop-color='#5f5f58'/></radialGradient>" +
            "<filter id='w' x='-10%' y='-10%' width='120%' height='120%'>" +
            "<feTurbulence type='fractalNoise' baseFrequency='0.015 0.07' numOctaves='2' seed='SEED' result='n'/>" +
            "<feDisplacementMap in='SourceGraphic' in2='n' scale='13'/></filter></defs>";

        // Rostro A: gritando, ojos huecos.
        const a = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'>" + defs.replace('SEED', '4') +
            "<g filter='url(#w)'>" +
            "<ellipse cx='100' cy='132' rx='60' ry='94' fill='url(#g)'/>" +
            "<ellipse cx='72' cy='108' rx='19' ry='28' fill='#020202' transform='rotate(-14 72 108)'/>" +
            "<ellipse cx='128' cy='108' rx='19' ry='28' fill='#020202' transform='rotate(14 128 108)'/>" +
            "<circle cx='72' cy='118' r='2.4' fill='#e8e8e0'/><circle cx='128' cy='118' r='2.4' fill='#e8e8e0'/>" +
            "<path d='M96 138 L92 160 L100 164 L108 160 L104 138' fill='#2a2a26' opacity='.65'/>" +
            "<path d='M60 182 Q100 262 140 182 Q100 204 60 182 Z' fill='#000'/>" +
            "<path d='M70 124 L66 196 M130 124 L134 196' stroke='#000' stroke-width='3' opacity='.55'/>" +
            "</g></svg>";

        // Rostro B: alargado, sonrisa demasiado ancha con dientes finos.
        let teeth = '';
        for (let i = 0; i <= 14; i++) {
            const x = 46 + i * 7.9;
            const y = 176 + 18 * Math.sin((i / 14) * Math.PI) - 1;
            teeth += "M" + x.toFixed(1) + " " + y.toFixed(1) + " l0 9 ";
        }
        const b = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'>" + defs.replace('SEED', '9') +
            "<g filter='url(#w)'>" +
            "<ellipse cx='100' cy='130' rx='46' ry='100' fill='url(#g)'/>" +
            "<ellipse cx='78' cy='100' rx='18' ry='23' fill='#000' opacity='.5'/>" +
            "<ellipse cx='122' cy='100' rx='18' ry='23' fill='#000' opacity='.5'/>" +
            "<ellipse cx='78' cy='100' rx='10' ry='15' fill='#000'/><ellipse cx='122' cy='100' rx='10' ry='15' fill='#000'/>" +
            "<path d='M44 176 Q100 222 156 176 Q100 198 44 176 Z' fill='#000'/>" +
            "<path d='" + teeth + "' stroke='#cfcfc4' stroke-width='1.5' fill='none'/>" +
            "</g></svg>";

        faceURLs = [svgURL(a), svgURL(b)];
        return faceURLs;
    }

    // ---------------------------------------------------
    // Capas
    // ---------------------------------------------------
    let dark = null, vhs = null, grain = null, track = null;
    let flash = null, pulse = null, face = null, faceImg = null, faceStatic = null;
    let signal = null, signalStatic = null, signalAnim = null;
    let appContainer = null;
    let shakeAnim = null;

    function el(cls, parent) {
        const d = document.createElement('div');
        d.className = cls;
        d.setAttribute('aria-hidden', 'true');
        (parent || document.body).appendChild(d);
        return d;
    }

    function buildLayers() {
        if (dark) return;
        const noise = makeNoise();
        dark = el('dw-dark');
        vhs = el('dw-vhs');
        grain = el('dw-grain');
        grain.style.backgroundImage = noise;
        track = el('dw-track');
        flash = el('dw-flash');
        pulse = el('dw-pulse');
        face = el('dw-face');
        faceStatic = el('dw-face-static', face);
        faceStatic.style.backgroundImage = noise;
        faceImg = el('dw-face-img', face);
        signal = el('dw-signal');
        signalStatic = el('dw-signal-static', signal);
        signalStatic.style.backgroundImage = noise;
        const txt = el('dw-signal-text', signal);
        txt.textContent = t('dw.nosignal');
        signal.setAttribute('role', 'presentation');
    }

    function removeLayers() {
        [dark, vhs, grain, track, flash, pulse, face, signal].forEach(e => { if (e) e.remove(); });
        dark = vhs = grain = track = flash = pulse = face = faceImg = faceStatic = null;
        signal = signalStatic = null;
        signalAnim = null;
    }

    // ---------------------------------------------------
    // Linterna: sigue la palabra actual
    // ---------------------------------------------------
    let inTest = false;
    let ended = false;
    let aimEl = null;
    let aimRaf = 0;
    let idleT = 0;
    let heartT = 0;
    let heartI = 0;

    // Elemento (palabra) que debe quedar iluminado después de teclear `charEl`.
    function targetWord(charEl) {
        let n = charEl.nextElementSibling;
        if (!n && charEl.parentElement && charEl.parentElement.classList.contains('word')) {
            n = charEl.parentElement.nextElementSibling; // fin de palabra: lo siguiente es el espacio
        }
        const own = charEl.parentElement && charEl.parentElement.classList.contains('word') ? charEl.parentElement : charEl;
        if (!n) return own;
        if (n.classList.contains('word')) return n;                         // acabas de teclear el espacio
        if (n.classList.contains('char-space')) return own;                 // te falta solo el espacio: sigue en esta palabra
        return n.parentElement && n.parentElement.classList.contains('word') ? n.parentElement : n;
    }

    function aim(charEl) {
        aimEl = charEl;
        if (!aimRaf) aimRaf = requestAnimationFrame(applyAim);
    }

    function applyAim() {
        aimRaf = 0;
        if (!dark) return;
        if (!aimEl || !aimEl.isConnected) aimEl = document.querySelector('#text-display .char-current') || document.querySelector('#text-display .char');
        if (!aimEl) return;
        const r = targetWord(aimEl).getBoundingClientRect(); // se lee una sola vez, dentro de rAF
        if (!r.width && !r.height) return;
        dark.style.setProperty('--dw-x', (r.left + r.width / 2).toFixed(1) + 'px');
        dark.style.setProperty('--dw-y', (r.top + r.height / 2).toFixed(1) + 'px');
        dark.style.setProperty('--dw-r0', Math.max(MIN_RADIUS, r.width / 2 + 100).toFixed(0) + 'px');
    }

    function clearIdle() {
        clearTimeout(idleT);
        clearTimeout(heartT);
        clearInterval(heartI);
        idleT = heartT = heartI = 0;
        if (dark) dark.classList.remove('dw-idle');
    }

    function armIdle() {
        clearIdle();
        if (!inTest || ended) return;
        idleT = setTimeout(() => {
            if (!dark || !inTest || ended) return;
            dark.classList.add('dw-idle');
            // Cuando la luz se apaga del todo, se oye un latido.
            heartT = setTimeout(() => {
                beat();
                heartI = setInterval(beat, 1150);
            }, SHRINK_MS + 150);
        }, IDLE_MS);
    }

    function beat() { sound(t0 => thump(t0)); }

    function syncDark() {
        if (dark) dark.classList.toggle('dw-on', inTest);
    }

    // ---------------------------------------------------
    // Sonido (síntesis con Web Audio)
    // ---------------------------------------------------
    let amb = null;
    let crackleT = 0;

    function sound(fn) {
        if (!A.ready()) return;
        try { fn(A.ctx.currentTime + 0.002); } catch (e) { /* un fallo de audio nunca debe afectar al juego */ }
    }

    // Golpe en madera pesada, amortiguado, como si llamaran a una puerta desde dentro.
    function knock(t0, power) {
        const k = power || 1;
        A.tone(t0, { f0: rand(98, 122), f1: 52, dur: 0.17, gain: 0.5 * k });
        A.noiseHit(t0, { type: 'lowpass', freq: rand(300, 420), q: 0.7, dur: 0.12, gain: 0.32 * k });
        A.noiseHit(t0, { freq: rand(650, 900), q: 3, dur: 0.045, gain: 0.2 * k });
        A.tone(t0 + 0.01, { f0: rand(180, 205), dur: 0.2, gain: 0.05 * k, type: 'triangle' });
    }

    // Fallo: golpes dobles más fuertes + zumbido grave desafinado + ráfaga de estática.
    function pound(t0) {
        knock(t0, 1.5);
        knock(t0 + 0.09, 1.2);
        A.tone(t0, { f0: 62, dur: 0.42, gain: 0.13, type: 'sawtooth' });
        A.tone(t0, { f0: 66, dur: 0.42, gain: 0.13, type: 'sawtooth' });
        A.noiseHit(t0, { type: 'lowpass', freq: 900, q: 0.7, dur: 0.26, gain: 0.34 });
    }

    function thump(t0) {
        A.tone(t0, { f0: 70, f1: 38, dur: 0.13, gain: 0.5 });
        A.tone(t0 + 0.2, { f0: 62, f1: 36, dur: 0.12, gain: 0.36 });
    }

    // Pitido agudo de televisión sin señal (sostenido y con fundido de salida).
    function beep(t0, dur) {
        [[1000, 0.06], [2500, 0.045]].forEach(function (p) {
            const o = A.ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = p[0];
            const g = A.ctx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(p[1], t0 + 0.03);
            g.gain.setValueAtTime(p[1], t0 + dur - 0.15);
            g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
            o.connect(g);
            g.connect(A.out);
            o.start(t0);
            o.stop(t0 + dur + 0.02);
        });
        A.noiseHit(t0, { type: 'highpass', freq: 3500, dur: dur, gain: 0.05, attack: 0.05 });
    }

    // Estática de radio grave de fondo, con respiración lenta y chasquidos sueltos.
    function startAmbient() {
        if (amb || !A.ready()) return;
        try {
            const ctx = A.ctx;
            const src = ctx.createBufferSource();
            src.buffer = A.noise;
            src.loop = true;
            const lp = ctx.createBiquadFilter();
            lp.type = 'lowpass';
            lp.frequency.value = 380;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, ctx.currentTime);
            g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 1.2);
            const lfo = ctx.createOscillator();
            lfo.frequency.value = 0.19;
            const lg = ctx.createGain();
            lg.gain.value = 0.02;
            lfo.connect(lg);
            lg.connect(g.gain);
            src.connect(lp);
            lp.connect(g);
            g.connect(A.out);
            src.start();
            lfo.start();
            amb = { src: src, g: g, lfo: lfo };
            crackle();
        } catch (e) { amb = null; }
    }

    function crackle() {
        clearTimeout(crackleT);
        crackleT = setTimeout(() => {
            if (!amb) return;
            if (!A.enabled) { stopAmbient(); return; }
            sound(t0 => A.noiseHit(t0, { type: Math.random() < 0.5 ? 'highpass' : 'lowpass', freq: Math.random() < 0.5 ? 2800 : 500, dur: 0.012 + Math.random() * 0.02, gain: 0.05 }));
            crackle();
        }, rand(500, 1900));
    }

    function stopAmbient() {
        clearTimeout(crackleT);
        if (!amb) return;
        const a = amb;
        amb = null;
        try {
            const now = A.ctx.currentTime;
            a.g.gain.cancelScheduledValues(now);
            a.g.gain.setValueAtTime(Math.max(a.g.gain.value, 0.0001), now);
            a.g.gain.linearRampToValueAtTime(0.0001, now + 0.45);
            setTimeout(() => { try { a.src.stop(); a.lfo.stop(); } catch (e) { /* ya parado */ } }, 520);
        } catch (e) { /* sin audio */ }
    }

    // ---------------------------------------------------
    // Efectos de susto
    // ---------------------------------------------------
    let lastScare = -Infinity;
    let lastFace = -Infinity;

    function shake() {
        if (T.reducedMotion) return;
        if (!appContainer || !appContainer.isConnected) appContainer = document.querySelector('.app-container');
        if (!appContainer || !appContainer.animate) return;
        const a = scaresOn() ? 11 : 5; // el modo suave sacude menos
        if (shakeAnim) shakeAnim.cancel();
        shakeAnim = appContainer.animate([
            { translate: '0 0' },
            { translate: (-a) + 'px ' + (a * 0.35) + 'px' },
            { translate: a + 'px ' + (-a * 0.3) + 'px' },
            { translate: (-a * 0.8) + 'px ' + (a * 0.2) + 'px' },
            { translate: (a * 0.6) + 'px 0' },
            { translate: (-a * 0.3) + 'px 0' },
            { translate: '0 0' }
        ], { duration: 320, easing: 'ease-out' });
    }

    // Pulso rojo tenue en los bordes: sin cambio brusco de luminosidad.
    function softPulse() {
        if (!pulse || !pulse.animate) return;
        pulse.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    }

    // Destello invertido: UN solo pulso corto.
    function invertFlash() {
        if (!flash || !flash.animate) return;
        flash.animate([{ opacity: 0 }, { opacity: 1, offset: 0.22 }, { opacity: 0 }], { duration: 130, easing: 'linear' });
    }

    // Rostro oculto en la estática: aparece, tiembla y se desvanece en ~0,3 s.
    function faceFlash() {
        if (!face || !face.animate) return;
        const urls = makeFaces();
        faceImg.style.backgroundImage = urls[Math.floor(Math.random() * urls.length)];
        faceImg.style.translate = rand(-18, 18).toFixed(0) + 'vw ' + rand(-10, 10).toFixed(0) + 'vh';
        faceStatic.animate([
            { transform: 'translate(0,0)' }, { transform: 'translate(-37px,21px)' },
            { transform: 'translate(29px,-48px)' }, { transform: 'translate(-61px,-17px)' }
        ], { duration: 300, easing: 'steps(4,end)' });
        faceImg.animate([
            { transform: 'scale(.92) rotate(-1.5deg)' },
            { transform: 'scale(1.04) rotate(1deg)', offset: 0.5 },
            { transform: 'scale(1.1) rotate(-1deg)' }
        ], { duration: 300, easing: 'linear' });
        face.animate([{ opacity: 0 }, { opacity: 1, offset: 0.18 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 300, easing: 'linear' });
    }

    // Pantalla "sin señal" al perder.
    function showSignal() {
        if (!signal || !signal.animate) return;
        if (signalAnim) signalAnim.cancel();
        const full = scaresOn();
        signalStatic.style.opacity = full ? '0.55' : '0.2';
        const total = 1900;
        signalAnim = signal.animate([
            { opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.82 }, { opacity: 0 }
        ], { duration: total, easing: 'linear' });
        if (full) {
            const st = signalStatic.animate([
                { transform: 'translate(0,0)' }, { transform: 'translate(-31px,17px)' },
                { transform: 'translate(24px,-40px)' }, { transform: 'translate(-52px,-9px)' }
            ], { duration: 560, iterations: Math.ceil(total / 560), easing: 'steps(4,end)' });
            signalAnim.onfinish = () => st.cancel();
        }
    }

    // ---------------------------------------------------
    // Eventos del juego
    // ---------------------------------------------------
    let lastKeySound = 0;
    let lastEl = null;

    function onKey(e) {
        const now = performance.now();

        if (e.el) { lastEl = e.el; aim(e.el); }
        if (inTest && !ended) armIdle();

        // Sonido
        if (inTest) startAmbient();
        if (now - lastKeySound > 18) { // si llegan teclas casi a la vez, solo suena una
            lastKeySound = now;
            if (e.ok) sound(t0 => knock(t0, e.char === ' ' ? 1.25 : 1));
            else sound(pound);
        }

        // Visual: solo al fallar
        if (e.ok || !dark) return;
        shake();
        if (scaresOn()) {
            if (now - lastScare >= SCARE_COOLDOWN) {
                lastScare = now;
                const roll = Math.random();
                if (roll < 0.55) invertFlash();
                else if (roll < 0.82 && now - lastFace >= FACE_COOLDOWN) { lastFace = now; faceFlash(); }
                else softPulse();
            }
        } else if (now - lastScare >= SCARE_COOLDOWN) {
            lastScare = now;
            softPulse();
        }
    }

    function onSection(name) {
        inTest = name === 'typing';
        ended = false;
        clearIdle();
        if (dark) dark.classList.remove('dw-open');
        syncDark();
        if (inTest) {
            // Al empezar (o repetir) el test, la luz se coloca en la primera palabra.
            setTimeout(() => {
                const first = document.querySelector('#text-display .char');
                if (first && dark) { lastEl = first; aim(first); }
            }, 80);
        } else {
            stopAmbient();
        }
    }

    function onEnd(kind) {
        ended = true;
        clearIdle();
        stopAmbient();
        if (kind === 'gameover') {
            sound(t0 => { pound(t0); beep(t0 + 0.2, 1.6); });
            showSignal();
        } else {
            // Final: tres golpes que se alejan, un crujido… y la linterna se abre.
            sound(t0 => {
                knock(t0, 1.3);
                knock(t0 + 0.42, 0.9);
                knock(t0 + 0.9, 0.55);
                A.noiseHit(t0 + 0.2, { freq: 380, freq2: 190, q: 6, dur: 0.6, attack: 0.1, gain: 0.12 });
            });
            if (dark) dark.classList.add('dw-open');
        }
    }

    function onActivate() {
        buildLayers();
        appContainer = document.querySelector('.app-container');
        lastScare = lastFace = -Infinity;
        const card = document.querySelector('.typing-card');
        inTest = !!(card && card.offsetParent !== null); // por si se activa en plena partida
        ended = false;
        syncDark();
        if (inTest) {
            const cur = document.querySelector('#text-display .char-current') || document.querySelector('#text-display .char');
            if (cur) { lastEl = cur; aim(cur); }
        }
    }

    function onDeactivate() {
        clearIdle();
        stopAmbient();
        if (aimRaf) { cancelAnimationFrame(aimRaf); aimRaf = 0; }
        if (shakeAnim) { shakeAnim.cancel(); shakeAnim = null; }
        removeLayers();
        inTest = false;
        ended = false;
        aimEl = lastEl = appContainer = null;
    }

    // Al cambiar el tamaño de la ventana (o el zoom del juego) la luz se recoloca.
    window.addEventListener('resize', () => { if (dark && inTest && lastEl) aim(lastEl); });

    // ---------------------------------------------------
    // Advertencia previa (se muestra ANTES de activar el tema)
    // ---------------------------------------------------
    function showWarning(go) {
        if (document.querySelector('.dw-warn')) return;
        const prev = document.activeElement;
        const wrap = document.createElement('div');
        wrap.className = 'dw-warn';
        wrap.setAttribute('role', 'dialog');
        wrap.setAttribute('aria-modal', 'true');
        wrap.setAttribute('aria-labelledby', 'dw-warn-title');
        const box = document.createElement('div');
        box.className = 'dw-warn-box';
        const h = document.createElement('h2');
        h.className = 'dw-warn-title';
        h.id = 'dw-warn-title';
        h.textContent = t('dw.warn-title');
        const p = document.createElement('p');
        p.className = 'dw-warn-text';
        p.textContent = t('dw.warn-text');
        const actions = document.createElement('div');
        actions.className = 'dw-warn-actions';

        function close() {
            document.removeEventListener('keydown', onKeyDown, true);
            wrap.remove();
            if (prev && prev.focus) prev.focus();
        }
        function choose(mode) {
            store.set(KEY_MODE, mode);
            close();
            go(); // sigue dentro del clic del usuario: el audio puede iniciarse
        }
        function mk(label, cls, fn) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'dw-warn-btn ' + cls;
            b.textContent = label;
            b.addEventListener('click', fn);
            actions.appendChild(b);
            return b;
        }
        const soft = mk(t('dw.btn-soft'), 'dw-warn-primary', () => choose('soft'));
        const full = mk(t('dw.btn-full'), '', () => choose('full'));
        const cancel = mk(t('dw.btn-cancel'), 'dw-warn-cancel', close);
        const buttons = [soft, full, cancel];

        function onKeyDown(ev) {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); }
            else if (ev.key === 'Tab') { // el foco se queda dentro del cuadro
                const i = buttons.indexOf(document.activeElement);
                const next = (i + (ev.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
                ev.preventDefault();
                buttons[next].focus();
            }
        }
        document.addEventListener('keydown', onKeyDown, true);

        box.appendChild(h);
        box.appendChild(p);
        box.appendChild(actions);
        wrap.appendChild(box);
        document.body.appendChild(wrap);
        (store.get(KEY_MODE) === 'full' ? full : soft).focus(); // por defecto, la opción segura
    }

    T.register('deepweb', {
        bodyClass: 'theme-deepweb',
        fontHref: 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap',
        beforeActivate: showWarning,
        on: {
            activate: onActivate,
            deactivate: onDeactivate,
            key: onKey,
            section: onSection,
            end: onEnd
        }
    });
})();
