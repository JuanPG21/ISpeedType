/* ===================================================
   ISpeedType — Motor de traducción (i18n)
   Idiomas: Español (es, por defecto) e Inglés (en).

   Los diccionarios viven en i18n/es.js e i18n/en.js y se
   registran en window.I18N_DICTS. Uso en el HTML:
     data-i18n="clave"              -> textContent
     data-i18n-html="clave"         -> innerHTML (solo textos propios)
     data-i18n-attr="title:clave;aria-label:clave"
   Uso en JS:  I18N.t('clave', { n: 3 })
   Plurales:   si pasas { n }, se busca 'clave_one' / 'clave_other'.
   =================================================== */
(function () {
    'use strict';

    const STORAGE_KEY = 'speedtype-lang';
    const SUPPORTED = ['es', 'en'];
    const DEFAULT_LANG = 'es';
    const LOCALES = { es: 'es-ES', en: 'en-US' };
    const dicts = window.I18N_DICTS || (window.I18N_DICTS = {});
    const listeners = [];

    // Prioridad: ?lang=en en la URL > elección guardada > español
    function detectLang() {
        try {
            const q = new URLSearchParams(window.location.search).get('lang');
            if (SUPPORTED.includes(q)) return q;
        } catch (e) { /* URL no disponible */ }
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (SUPPORTED.includes(saved)) return saved;
        } catch (e) { /* almacenamiento no disponible */ }
        return DEFAULT_LANG;
    }

    let lang = detectLang();

    function lookup(l, key) {
        const d = dicts[l];
        return d && Object.prototype.hasOwnProperty.call(d, key) ? d[key] : undefined;
    }

    function t(key, vars) {
        let s;
        if (vars && typeof vars.n === 'number') {
            const pk = key + (vars.n === 1 ? '_one' : '_other');
            s = lookup(lang, pk);
            if (s === undefined) s = lookup(DEFAULT_LANG, pk);
        }
        if (s === undefined) s = lookup(lang, key);
        if (s === undefined) s = lookup(DEFAULT_LANG, key);
        if (s === undefined) return key; // clave sin traducir: se nota a simple vista
        if (vars) {
            s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
        }
        return s;
    }

    function apply(root) {
        root = root || document;
        root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
        root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
        root.querySelectorAll('[data-i18n-attr]').forEach(el => {
            el.dataset.i18nAttr.split(';').forEach(pair => {
                const i = pair.indexOf(':');
                if (i > 0) el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
            });
        });
    }

    function updateToggle() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            const active = btn.dataset.lang === lang;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function updateMeta() {
        document.title = t('meta.title');
        const desc = document.querySelector('meta[name="description"]');
        if (desc) desc.setAttribute('content', t('meta.description'));
    }

    function setLang(next, opts) {
        if (!SUPPORTED.includes(next)) return;
        const changed = next !== lang;
        lang = next;
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* sin almacenamiento */ }
        document.documentElement.lang = lang;
        updateMeta();
        apply(document);
        updateToggle();
        listeners.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });

        // Aviso para lectores de pantalla (solo cuando el usuario cambia el idioma)
        if (changed && !(opts && opts.silent)) {
            const live = document.getElementById('lang-announcer');
            if (live) {
                live.textContent = '';
                setTimeout(() => { live.textContent = t('lang.changed'); }, 50);
            }
        }
    }

    function bindToggle() {
        document.querySelectorAll('.lang-btn').forEach(btn => {
            btn.addEventListener('click', () => setLang(btn.dataset.lang));
        });
    }

    window.I18N = {
        t,
        apply,
        setLang,
        get lang() { return lang; },
        get locale() { return LOCALES[lang]; },
        supported: SUPPORTED.slice(),
        onChange: (fn) => { listeners.push(fn); },
        fmtNumber: (n) => Number(n).toLocaleString(LOCALES[lang]),
        fmtDate: (ts, opts) => new Date(ts).toLocaleDateString(LOCALES[lang], opts || { day: '2-digit', month: 'short', year: 'numeric' })
    };

    // Arranque: traduce la página tan pronto como el DOM exista (el script va al final del <body>)
    bindToggle();
    setLang(lang, { silent: true });
})();
