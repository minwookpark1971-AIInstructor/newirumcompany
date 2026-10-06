/**
 * Home Content
 * index.html 의 data-content 영역을 site_content(DB) 값으로 덮어쓴다.
 * DB 조회가 실패하면 HTML 에 들어 있는 정적 문구가 그대로 남는다.
 */
(function () {
    function setHtml(el, html) { if (el) el.innerHTML = html; }

    function applyHero(v) {
        if (!v) return;
        const h1 = document.querySelector('[data-content="hero.title"]');
        const p = document.querySelector('[data-content="hero.subtitle"]');
        if (v.title) setHtml(h1, escWithBreaks(v.title));
        if (v.subtitle) setHtml(p, escWithBreaks(v.subtitle));
    }

    function applyTracks(list) {
        if (!Array.isArray(list)) return;
        const cards = document.querySelectorAll('[data-content="tracks"] .track-card');
        list.forEach(function (t, i) {
            const card = cards[i];
            if (!card) return;
            if (t.href) card.setAttribute('href', safeHref(t.href));
            setHtml(card.querySelector('.track-card-label'), escHtml(t.label));
            setHtml(card.querySelector('h2'), escHtml(t.title));
            setHtml(card.querySelector('p'), escHtml(t.body));
            setHtml(card.querySelector('.track-card-cta'), escHtml(t.cta));
        });
    }

    function applyFeatures(v) {
        if (!v) return;
        if (v.title) setHtml(document.querySelector('[data-content="features.title"]'), escHtml(v.title));
        const cards = document.querySelectorAll('[data-content="features.items"] .card');
        (v.items || []).forEach(function (it, i) {
            const card = cards[i];
            if (!card) return;
            setHtml(card.querySelector('.card-title'), escHtml(it.title));
            setHtml(card.querySelector('.card-description'), escHtml(it.body));
        });
    }

    function applyProcess(v) {
        if (!v) return;
        if (v.title) setHtml(document.querySelector('[data-content="process.title"]'), escHtml(v.title));
        if (v.subtitle) setHtml(document.querySelector('[data-content="process.subtitle"]'), escHtml(v.subtitle));
        const steps = document.querySelectorAll('[data-content="process.steps"] .process-step');
        (v.steps || []).forEach(function (s, i) {
            const step = steps[i];
            if (!step) return;
            setHtml(step.querySelector('h3'), escHtml(s.title));
            setHtml(step.querySelector('p'), escHtml(s.body));
        });
    }

    fetchSiteContent().then(function (c) {
        if (!c) return;
        applyHero(c['home.hero']);
        applyTracks(c['home.tracks']);
        applyFeatures(c['home.features']);
        applyProcess(c['home.process']);
    });
})();
