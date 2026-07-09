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
            <nav class="desktop-nav">
                <a href="${p.programsUrl}" class="nav-link">대학·기관 교육</a>
                <a href="${p.workshopUrl}" class="nav-link">강사 워크샵</a>
                <a href="${p.contactUrl}" class="nav-link">문의하기</a>
            </nav>

            <!-- Desktop Actions -->
            <div class="desktop-actions">
                <a href="${p.applyUrl}" class="btn btn-primary btn-sm">교육 신청</a>
            </div>

            <!-- Mobile Menu Button -->
            <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="메뉴 열기">
                <span class="menu-icon"></span>
                <span class="menu-icon"></span>
                <span class="menu-icon"></span>
            </button>
        </div>

        <!-- Mobile Navigation -->
        <nav class="mobile-nav" id="mobile-nav">
            <a href="${p.programsUrl}" class="mobile-nav-link">대학·기관 교육</a>
            <a href="${p.workshopUrl}" class="mobile-nav-link">강사 워크샵</a>
            <a href="${p.contactUrl}" class="mobile-nav-link">문의하기</a>
            <div class="mobile-actions">
                <a href="${p.applyUrl}" class="btn btn-primary btn-sm btn-block">교육 신청</a>
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
            <h3 class="footer-cta-title">AI 교육, 이룸아카데미와 시작하세요</h3>
            <p class="footer-cta-description">
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
                <a href="mailto:irum.ceo@gmail.com">irum.ceo@gmail.com</a>
                <span>서울특별시 강남구 도산대로 54길 41</span>
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

// Load header and footer
function loadComponents() {
    const headerContainer = document.getElementById('header-container');
    const footerContainer = document.getElementById('footer-container');

    if (headerContainer) {
        headerContainer.innerHTML = generateHeader();
        setTimeout(function () {
            if (typeof initHeader === 'function') {
                initHeader();
            }
        }, 100);
    }

    if (footerContainer) {
        footerContainer.innerHTML = generateFooter();
    }
}

// Auto-load on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadComponents);
} else {
    loadComponents();
}
