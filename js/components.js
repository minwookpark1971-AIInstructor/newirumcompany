/**
 * Components JavaScript
 * Generates header and footer dynamically without AJAX
 * This allows the site to work with file:// protocol
 */

// Generate header HTML
function generateHeader() {
    const p = getPathInfo();

    return `
<header class="main-header" id="main-header">
    <div class="container">
        <div class="header-content">
            <a href="${p.homeUrl}" class="logo">
                <img src="${p.logoUrl}" alt="Irum Academy" class="logo-image" style="height: 60px; width: auto; display: block;">
            </a>

            <!-- Desktop Navigation -->
            <nav class="desktop-nav" data-site="nav.desktop">
                <a href="${p.programsUrl}" class="nav-link">대학·기관 교육</a>
                <a href="${p.workshopUrl}" class="nav-link">강사 워크샵</a>
                <a href="${p.contactUrl}" class="nav-link">문의하기</a>
            </nav>

            <!-- Desktop Actions -->
            <div class="desktop-actions">
                <a href="${p.applyUrl}" class="btn btn-primary btn-sm" data-site="nav.cta">교육 신청</a>
            </div>

            <!-- Mobile Menu Button -->
            <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="메뉴 열기">
                <span class="menu-icon"></span>
                <span class="menu-icon"></span>
                <span class="menu-icon"></span>
            </button>
        </div>

        <!-- Mobile Navigation -->
        <nav class="mobile-nav" id="mobile-nav" data-site="nav.mobile">
            <a href="${p.programsUrl}" class="mobile-nav-link">대학·기관 교육</a>
            <a href="${p.workshopUrl}" class="mobile-nav-link">강사 워크샵</a>
            <a href="${p.contactUrl}" class="mobile-nav-link">문의하기</a>
            <div class="mobile-actions">
                <a href="${p.applyUrl}" class="btn btn-primary btn-sm btn-block" data-site="nav.cta">교육 신청</a>
            </div>
        </nav>
    </div>

    <!-- Header Indicator (for interaction demo) -->
    <div class="header-indicator" id="header-indicator"></div>
</header>`;
}

// Generate footer HTML
function generateFooter() {
    const p = getPathInfo();
    const currentYear = new Date().getFullYear();

    const normalizedHref = window.location.href.replace(/\\/g, '/');
    const isCourseDetail = normalizedHref.includes('/courses/');

    return `
<footer class="main-footer">
    <div class="container">
        ${!isCourseDetail ? `
        <div class="footer-cta">
            <h3 class="footer-cta-title" data-site="footer.cta_title">AI 교육, 이룸아카데미와 시작하세요</h3>
            <p class="footer-cta-description" data-site="footer.cta_description">
                대학·기관 맞춤 교육부터 강사 집중 워크샵까지, 지금 신청하세요.
            </p>
            <div class="footer-cta-buttons">
                <a href="${p.applyUrl}" class="btn btn-primary btn-lg">교육 신청</a>
                <a href="${p.programsUrl}" class="btn btn-outline btn-lg">프로그램 보기</a>
            </div>
        </div>
        ` : ''}

        <div class="footer-bottom">
            <p class="footer-copyright">© ${currentYear} Irum Academy. All rights reserved.</p>
            <div class="footer-contact">
                <a href="mailto:irum.ceo@gmail.com" data-site="footer.email">irum.ceo@gmail.com</a>
                <span data-site="footer.address">서울특별시 강남구 도산대로 54길 41</span>
            </div>
            <div class="footer-legal">
                <a href="${p.privacyUrl}">개인정보처리방침</a>
                <a href="${p.termsUrl}">이용약관</a>
            </div>
        </div>
    </div>
</footer>`;
}

// Get path information for current page
function getPathInfo() {
    const normalizedPathname = window.location.pathname.replace(/\\/g, '/');
    const pathParts = normalizedPathname.split('/').filter(p => p);
    const htmlIndex = pathParts.indexOf('html');

    // Prefix from current location to the html/ folder
    let toHtml, toRoot;
    if (htmlIndex === -1) {
        // Root (index.html)
        toHtml = 'html/';
        toRoot = '';
    } else {
        // Inside html/ or a subfolder of it (e.g. html/courses/)
        const depth = pathParts.length - htmlIndex - 2; // 0 in html/, 1 in html/courses/
        toHtml = '../'.repeat(depth);
        toRoot = '../'.repeat(depth + 1);
    }

    return {
        rootUrl: toRoot,
        homeUrl: toRoot + 'index.html',
        programsUrl: toHtml + 'programs.html',
        workshopUrl: toHtml + 'workshop.html',
        applyUrl: toHtml + 'apply.html',
        contactUrl: toHtml + 'contact.html',
        privacyUrl: toHtml + 'privacy.html',
        termsUrl: toHtml + 'terms.html',
        logoUrl: toRoot + 'images/logo/이룸아카데미_logo.png'
    };
}

// Vanilla header behavior for pages that do not load jQuery/main.js
function vanillaHeaderInit() {
    const header = document.getElementById('main-header');
    const toggle = document.getElementById('mobile-menu-toggle');
    const mobileNav = document.getElementById('mobile-nav');
    if (!header) return;

    window.addEventListener('scroll', function () {
        header.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });

    if (toggle && mobileNav) {
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            mobileNav.classList.toggle('active');
        });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.header-content, .mobile-nav')) {
                mobileNav.classList.remove('active');
            }
        });
        mobileNav.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                mobileNav.classList.remove('active');
            });
        });
    }
}

// Vanilla reveal/stagger animations for pages that do not load animations.js
function vanillaRevealInit() {
    const targets = document.querySelectorAll(
        '.reveal, .reveal-up, .reveal-down, .reveal-left, .reveal-right, .reveal-fade, .stagger-container');
    if (!targets.length) return;

    const observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    targets.forEach(function (el) { observer.observe(el); });
}

// Load a script once, resolving when it has executed (or failed — callers fall back to static HTML)
function loadScriptOnce(src) {
    return new Promise(function (resolve) {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
    });
}

// 콘텐츠 클라이언트가 페이지에 없으면 동적으로 로드한다 (정적 페이지 수정 없이 DB 연동)
async function ensureContentClient() {
    if (typeof fetchSiteSettings === 'function') return true;
    const p = getPathInfo();
    try {
        if (typeof supabaseClient === 'undefined') {
            if (!window.supabase) {
                await loadScriptOnce('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
            }
            if (!window.supabase) return false;
            await loadScriptOnce(p.rootUrl + 'js/supabase-client.js');
        }
        await loadScriptOnce(p.rootUrl + 'js/content-client.js');
    } catch (e) {
        return false;
    }
    return typeof fetchSiteSettings === 'function';
}

// site_settings(nav, footer)를 헤더·푸터에 반영. 실패 시 정적 문구 유지.
async function applySiteSettings() {
    if (!(await ensureContentClient())) return;
    const s = await fetchSiteSettings();
    if (!s) return;
    const p = getPathInfo();
    const q = function (sel) { return document.querySelectorAll('[data-site="' + sel + '"]'); };
    const toUrl = function (href) {
        const h = safeHref(href);
        return /^(https?:|#)/i.test(h) ? h : p.rootUrl + h.replace(/^\//, '');
    };

    const nav = s.nav;
    if (nav && Array.isArray(nav.items)) {
        q('nav.desktop').forEach(function (el) {
            el.innerHTML = nav.items.map(function (i) {
                return '<a href="' + escHtml(toUrl(i.href)) + '" class="nav-link">' + escHtml(i.label) + '</a>';
            }).join('');
        });
        q('nav.mobile').forEach(function (el) {
            const actions = el.querySelector('.mobile-actions');
            el.querySelectorAll('.mobile-nav-link').forEach(function (a) { a.remove(); });
            nav.items.forEach(function (i) {
                const a = document.createElement('a');
                a.className = 'mobile-nav-link';
                a.href = toUrl(i.href);
                a.textContent = i.label;
                el.insertBefore(a, actions);
            });
        });
    }
    if (nav && nav.cta_label) {
        q('nav.cta').forEach(function (el) { el.textContent = nav.cta_label; });
    }

    const f = s.footer;
    if (f) {
        q('footer.cta_title').forEach(function (el) { if (f.cta_title) el.textContent = f.cta_title; });
        q('footer.cta_description').forEach(function (el) { if (f.cta_description) el.textContent = f.cta_description; });
        q('footer.email').forEach(function (el) {
            if (f.email) { el.textContent = f.email; el.href = 'mailto:' + f.email; }
        });
        q('footer.address').forEach(function (el) { if (f.address) el.textContent = f.address; });
    }
}

// Load header and footer
function loadComponents() {
    const headerContainer = document.getElementById('header-container');
    const footerContainer = document.getElementById('footer-container');

    if (headerContainer) {
        headerContainer.innerHTML = generateHeader();
        setTimeout(function () {
            if (typeof initHeader === 'function') {
                initHeader(); // jQuery version from main.js (legacy pages)
            } else {
                vanillaHeaderInit();
            }
        }, 100);
    }

    if (footerContainer) {
        footerContainer.innerHTML = generateFooter();
    }

    if (typeof initRevealAnimations !== 'function') {
        vanillaRevealInit();
    }

    applySiteSettings();
}

// Auto-load on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadComponents);
} else {
    loadComponents();
}
