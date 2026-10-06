/**
 * Content Client
 * Supabase 의 사이트 콘텐츠(site_content / site_settings / courses / course_groups)를 읽는다.
 * 실패하거나 느리면 null 을 돌려주고, 호출 측은 HTML 에 들어 있는 정적 문구를 그대로 둔다.
 * supabase-client.js(supabaseClient 전역)를 먼저 로드해야 한다.
 */

const CONTENT_CACHE_PREFIX = 'irum:content:';
const CONTENT_CACHE_TTL_MS = 60 * 1000;
const CONTENT_FETCH_TIMEOUT_MS = 4000;

function contentCacheGet(name) {
    try {
        const raw = sessionStorage.getItem(CONTENT_CACHE_PREFIX + name);
        if (!raw) return null;
        const { t, v } = JSON.parse(raw);
        return Date.now() - t < CONTENT_CACHE_TTL_MS ? v : null;
    } catch (e) {
        return null;
    }
}

function contentCacheSet(name, value) {
    try {
        sessionStorage.setItem(CONTENT_CACHE_PREFIX + name, JSON.stringify({ t: Date.now(), v: value }));
    } catch (e) { /* 저장 불가 환경은 무시 */ }
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); })
    ]);
}

/** HTML 이스케이프 — DB 값을 innerHTML 에 넣을 때 반드시 사용 */
function escHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** 이스케이프 후 줄바꿈(\n)만 <br> 로 */
function escWithBreaks(s) {
    return escHtml(s).replace(/\n/g, '<br>');
}

/** 상대 경로 또는 http(s) 링크만 허용 (javascript: 등 차단) */
function safeHref(href) {
    const h = String(href || '').trim();
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(h);
    if (hasScheme) return /^https?:/i.test(h) ? h : '#';
    return h.startsWith('//') ? '#' : h;
}

/**
 * site_content 또는 site_settings 의 전체 행을 {key: value} 로 반환. 실패 시 null.
 * @param {'site_content'|'site_settings'} table
 */
async function fetchKeyValueTable(table) {
    const cached = contentCacheGet(table);
    if (cached) return cached;
    try {
        const { data, error } = await withTimeout(
            supabaseClient.from(table).select('key,value'), CONTENT_FETCH_TIMEOUT_MS);
        if (error || !data) return null;
        const map = {};
        data.forEach(function (row) { map[row.key] = row.value; });
        contentCacheSet(table, map);
        return map;
    } catch (e) {
        return null;
    }
}

function fetchSiteContent() { return fetchKeyValueTable('site_content'); }
function fetchSiteSettings() { return fetchKeyValueTable('site_settings'); }

/** 공개된 프로그램 목록을 courses-data.js 와 같은 모양으로 반환. 실패 시 null. */
async function fetchCourses() {
    const cached = contentCacheGet('courses');
    if (cached) return cached;
    try {
        const { data, error } = await withTimeout(
            supabaseClient.from('site_courses').select('*').eq('published', true).order('sort_order'),
            CONTENT_FETCH_TIMEOUT_MS);
        if (error || !data || !data.length) return null;
        const list = data.map(function (r) {
            return {
                slug: r.slug,
                title: r.title,
                category: r.category,
                price: r.price,
                shortDescription: r.short_description,
                durationLabel: r.duration_label,
                formatLabel: r.format_label,
                tools: r.tools || []
            };
        });
        contentCacheSet('courses', list);
        return list;
    } catch (e) {
        return null;
    }
}

/** 프로그램 그룹 목록. 실패 시 null. */
async function fetchCourseGroups() {
    const cached = contentCacheGet('course_groups');
    if (cached) return cached;
    try {
        const { data, error } = await withTimeout(
            supabaseClient.from('site_course_groups').select('title,description,slugs').order('sort_order'),
            CONTENT_FETCH_TIMEOUT_MS);
        if (error || !data || !data.length) return null;
        const list = data.map(function (g) {
            return { title: g.title, desc: g.description, slugs: g.slugs || [] };
        });
        contentCacheSet('course_groups', list);
        return list;
    } catch (e) {
        return null;
    }
}
