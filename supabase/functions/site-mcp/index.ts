// site-mcp — 이룸아카데미 사이트 편집용 원격 MCP 서버 (Streamable HTTP, JSON 응답, OAuth 2.1)
//
// 연결: Claude 커스텀 커넥터에 `https://<ref>.supabase.co/functions/v1/site-mcp` 만 입력.
//   → 커넥터가 OAuth 로그인(관리자 계정)을 진행하고, 이후 호출은 그 관리자의 토큰으로 이뤄진다.
// 보안: 서비스 롤 키를 쓰지 않는다. 모든 DB 호출은 요청자의 Bearer 토큰으로 수행되어 RLS 가 그대로 적용되고,
//   추가로 public.is_admin() 이 true 가 아니면 403. (verify_jwt=false 인 이유: 401 챌린지/메타데이터 응답을
//   직접 내려야 하기 때문 — 토큰 검증은 아래 auth.getUser() 로 한다.)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const SERVER_INFO = { name: "irum-site-editor", version: "1.3.0" };
const INSTRUCTIONS =
  "이룸아카데미 사이트(메인 문구·프로그램·헤더/푸터 설정)와 신청/문의를 편집하는 서버입니다. " +
  "수정 전에는 get_content/list_courses 로 현재 값을 확인하고, 변경 후에는 결과 diff 를 사용자에게 알려주세요. " +
  "잘못 바꾼 경우 list_revisions → rollback 으로 되돌릴 수 있습니다. " +
  "여러 과정(기수)은 list_programs/upsert_program 으로 관리합니다(처음에는 published=false 로 만들고 확인 후 공개).";

const CONTENT_TABLES: Record<string, string> = { content: "site_content", settings: "site_settings" };
const REVISION_TABLES = ["site_content", "site_settings", "site_courses", "site_course_groups", "site_programs"];
const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_VALUE_BYTES = 20_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, mcp-session-id, mcp-protocol-version, accept",
  "Access-Control-Expose-Headers": "mcp-session-id, www-authenticate",
};

class ToolError extends Error {}

// ── 검증 유틸 ─────────────────────────────────────────────
/** 문자열 안에 스크립트/이벤트 핸들러/javascript: 가 있으면 거부 */
function assertSafeStrings(v: unknown, path = "value"): void {
  if (typeof v === "string") {
    if (
      /<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b/i.test(v) || /\bon[a-z]+\s*=/i.test(v) ||
      /javascript\s*:/i.test(v)
    ) {
      throw new ToolError(`${path}: 스크립트/위험한 HTML 은 허용되지 않습니다.`);
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => assertSafeStrings(x, `${path}[${i}]`));
  } else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) assertSafeStrings(x, `${path}.${k}`);
  }
}

function assertSize(v: unknown) {
  if (new TextEncoder().encode(JSON.stringify(v)).length > MAX_VALUE_BYTES) {
    throw new ToolError(`값이 너무 큽니다 (최대 ${MAX_VALUE_BYTES} bytes).`);
  }
}

const isStr = (x: unknown): x is string => typeof x === "string" && x.length > 0;

function checkHrefs(v: unknown) {
  const walk = (x: any) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      for (const [k, y] of Object.entries(x)) {
        if (
          (k === "href" || k === "more_href") && typeof y === "string" &&
          ((/^[a-z][a-z0-9+.-]*:/i.test(y) && !/^https?:/i.test(y)) || y.startsWith("//"))
        ) {
          throw new ToolError(`href 는 상대경로 또는 http(s) 링크만 허용됩니다: ${y}`);
        }
        walk(y);
      }
    }
  };
  walk(v);
}

/** 이미지·소스 주소: 상대 경로 또는 https 만 허용 (http:, //, javascript: 등 거부) */
function checkImages(v: unknown) {
  const walk = (x: any) => {
    if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") {
      for (const [k, y] of Object.entries(x)) {
        if (
          (k === "image" || k === "src") && typeof y === "string" &&
          ((/^[a-z][a-z0-9+.-]*:/i.test(y) && !/^https:/i.test(y)) || y.startsWith("//"))
        ) {
          throw new ToolError(`${k} 는 상대경로 또는 https 주소만 허용됩니다: ${y}`);
        }
        walk(y);
      }
    }
  };
  walk(v);
}

/** irumacademy 메인(home.*) 신규 키 검증. 선택 항목은 없어도 되지만 있으면 문자열이어야 한다. */
function validateHome(key: string, v: any, need: (cond: boolean, msg: string) => void) {
  const isArr = (x: unknown, min: number, max: number) => Array.isArray(x) && x.length >= min && x.length <= max;
  const optStr = (x: unknown) => x === undefined || typeof x === "string";
  const link = (x: any, p: string) => {
    if (x === undefined) return;
    need(!!x && isStr(x.label) && isStr(x.href), `${p} 에 label, href 가 필요합니다.`);
  };
  switch (key) {
    case "home.hero_meta":
      need(v && typeof v === "object", "객체가 필요합니다.");
      need(v.tags === undefined || (isArr(v.tags, 1, 8) && v.tags.every(isStr)), "tags 는 문자열 1~8개입니다.");
      link(v.cta1, "cta1");
      link(v.cta2, "cta2");
      break;
    case "home.slides":
      need(isArr(v, 1, 6), "슬라이드는 1~6개(배열)입니다.");
      v.forEach((s: any, i: number) => {
        need(isStr(s?.title), `slides[${i}] 에 title 이 필요합니다.`);
        need(["label", "desc", "image", "alt", "href", "cta"].every((f) => optStr(s?.[f])), `slides[${i}] 의 label,desc,image,alt,href,cta 는 문자열입니다.`);
      });
      break;
    case "home.highlights":
      need(isArr(v, 1, 8) && v.every(isStr), "핵심 문장은 문자열 1~8개(배열)입니다.");
      break;
    case "home.cards":
      need(isArr(v, 1, 4), "트랙 카드는 1~4개(배열)입니다.");
      v.forEach((c: any, i: number) => {
        need(isStr(c?.name), `cards[${i}] 에 name 이 필요합니다.`);
        need(["code", "status", "tagline", "desc", "sessions", "fee", "output", "cta", "href"].every((f) => optStr(c?.[f])), `cards[${i}] 의 값은 문자열입니다.`);
        need(c?.tone === undefined || ["live", "open", "closed"].includes(c.tone), `cards[${i}].tone 은 live|open|closed 입니다.`);
      });
      break;
    case "home.timeline":
      need(isArr(v?.weeks, 1, 24), "{title?, weeks(1~24개)} 가 필요합니다.");
      v.weeks.forEach((w: any, i: number) => need(isStr(w?.no) && isStr(w?.date) && isStr(w?.title), `weeks[${i}] 에 no,date,title 이 필요합니다.`));
      break;
    case "home.outcomes":
      need(isArr(v?.items, 1, 6), "{title, items(1~6개)} 가 필요합니다.");
      v.items.forEach((t: any, i: number) => need(isStr(t?.title) && isStr(t?.body), `items[${i}] 에 title,body 가 필요합니다.`));
      break;
    case "home.system":
      need(isArr(v?.rows, 1, 12), "{title?, rows(1~12개)} 가 필요합니다.");
      v.rows.forEach((r: any, i: number) => need(isStr(r?.k) && isStr(r?.v), `rows[${i}] 에 k,v 가 필요합니다.`));
      break;
    case "home.instructor":
      need(isStr(v?.name), "name 이 필요합니다.");
      need(v.bio === undefined || (isArr(v.bio, 1, 12) && v.bio.every(isStr)), "bio 는 문자열 배열입니다.");
      break;
    case "home.metrics":
      need(isArr(v?.items, 1, 4), "{items(1~4개)} 가 필요합니다.");
      v.items.forEach((m: any, i: number) => need(isStr(m?.n) && isStr(m?.label), `items[${i}] 에 n,label 이 필요합니다.`));
      break;
    case "home.enrollment":
      need(v && typeof v === "object", "객체가 필요합니다.");
      need(v.fees === undefined || isArr(v.fees, 1, 8), "fees 는 1~8개입니다.");
      (v.fees ?? []).forEach((f: any, i: number) => need(isStr(f?.name) && isStr(f?.price), `fees[${i}] 에 name,price 가 필요합니다.`));
      need(v.account === undefined || (isStr(v.account?.bank) && isStr(v.account?.number) && isStr(v.account?.holder)), "account 에 bank,number,holder 가 필요합니다.");
      need(v.notice === undefined || (isArr(v.notice, 1, 8) && v.notice.every(isStr)), "notice 는 문자열 1~8개입니다.");
      break;
    // ── 메인 재구성(2026-10-08): 히어로 사진·신뢰 로고·출강 사례·강의영역·인사이트·CTA ──
    case "home.hero_images":
      need(isArr(v?.items, 1, 5), "{items(1~5장)} 가 필요합니다.");
      v.items.forEach((m: any, i: number) => need(isStr(m?.src) && optStr(m?.alt), `items[${i}] 에 src(상대경로/https)가 필요합니다.`));
      break;
    case "home.clients":
      need(isArr(v?.items, 1, 30), "{items(1~30개)} 가 필요합니다.");
      v.items.forEach((m: any, i: number) => need(isStr(m?.name) && optStr(m?.src) && optStr(m?.href), `items[${i}] 에 name 이 필요합니다(src, href 는 선택).`));
      break;
    case "home.cases":
      need(isArr(v?.items, 1, 12), "{items(1~12개), more_href?} 가 필요합니다.");
      need(optStr(v.more_href), "more_href 는 문자열입니다.");
      v.items.forEach((m: any, i: number) => {
        need(isStr(m?.title) && optStr(m?.image) && optStr(m?.href), `items[${i}] 에 title 이 필요합니다(image, href 는 선택).`);
        need(m?.tags === undefined || (isArr(m.tags, 1, 2) && m.tags.every(isStr)), `items[${i}].tags 는 문자열 1~2개입니다.`);
      });
      break;
    case "home.areas":
      need(isArr(v?.items, 1, 6), "{items(1~6개)} 가 필요합니다.");
      v.items.forEach((m: any, i: number) => {
        need(isStr(m?.name), `items[${i}] 에 name 이 필요합니다.`);
        need(["desc", "audience", "output"].every((f) => optStr(m?.[f])), `items[${i}] 의 desc,audience,output 은 문자열입니다.`);
        need(m?.courses === undefined || (isArr(m.courses, 1, 3) && m.courses.every(isStr)), `items[${i}].courses 는 문자열 1~3개입니다.`);
        need(m?.images === undefined || (isArr(m.images, 1, 3) && m.images.every((g: any) => isStr(g?.src) && optStr(g?.alt))), `items[${i}].images 는 {src,alt?} 1~3개입니다.`);
      });
      break;
    case "home.insights":
      need(isArr(v?.items, 1, 12), "{items(1~12개), more_href?} 가 필요합니다.");
      need(optStr(v.more_href), "more_href 는 문자열입니다.");
      v.items.forEach((m: any, i: number) => need(isStr(m?.title) && isStr(m?.href) && optStr(m?.tag) && optStr(m?.image), `items[${i}] 에 title, href 가 필요합니다(tag, image 는 선택).`));
      break;
    case "home.cta":
      need(isStr(v?.title), "title 이 필요합니다.");
      need(optStr(v.body), "body 는 문자열입니다.");
      link(v.primary, "primary");
      link(v.secondary, "secondary");
      break;
    case "home.faq":
      need(isArr(v, 1, 20), "FAQ 는 1~20개(배열)입니다.");
      v.forEach((f: any, i: number) => need(isStr(f?.q) && isStr(f?.a), `faq[${i}] 에 q,a 가 필요합니다.`));
      break;
  }
}

/** 알려진 키는 모양을 검증한다. 모르는 키는 통과(프론트가 읽을 때까지 영향 없음). */
function validateKnown(table: string, key: string, v: any) {
  const need = (cond: boolean, msg: string) => {
    if (!cond) throw new ToolError(`${table}/${key}: ${msg}`);
  };
  if (table === "site_content") {
    validateHome(key, v, need);
    if (key === "home.hero") {
      need(isStr(v?.title) && isStr(v?.subtitle), "{title, subtitle} 문자열이 필요합니다.");
    } else if (key === "home.tracks") {
      need(Array.isArray(v) && v.length === 2, "트랙 카드는 정확히 2개(배열)여야 합니다.");
      v.forEach((t: any, i: number) =>
        need(
          ["label", "title", "body", "cta", "href"].every((f) => isStr(t?.[f])),
          `tracks[${i}] 에 label,title,body,cta,href 가 필요합니다.`,
        )
      );
    } else if (key === "home.features") {
      need(isStr(v?.title) && Array.isArray(v?.items) && v.items.length === 3, "{title, items(3개)} 가 필요합니다.");
      v.items.forEach((t: any, i: number) => need(isStr(t?.title) && isStr(t?.body), `items[${i}] 에 title,body 가 필요합니다.`));
    } else if (key === "home.process") {
      need(isStr(v?.title) && Array.isArray(v?.steps) && v.steps.length === 3, "{title, subtitle?, steps(3개)} 가 필요합니다.");
      v.steps.forEach((t: any, i: number) => need(isStr(t?.title) && isStr(t?.body), `steps[${i}] 에 title,body 가 필요합니다.`));
    }
  } else if (table === "site_settings") {
    if (key === "seo") {
      need(isStr(v?.title) || isStr(v?.description), "title 또는 description 이 필요합니다.");
      need(v.title === undefined || typeof v.title === "string", "title 은 문자열입니다.");
      need(v.description === undefined || typeof v.description === "string", "description 은 문자열입니다.");
    } else if (key === "nav") {
      need(Array.isArray(v?.items) && v.items.length >= 1 && v.items.length <= 6, "{items(1~6개), cta_label} 가 필요합니다.");
      v.items.forEach((t: any, i: number) => need(isStr(t?.label) && isStr(t?.href), `items[${i}] 에 label,href 가 필요합니다.`));
      need(isStr(v?.cta_label), "cta_label 이 필요합니다.");
    } else if (key === "footer") {
      need(
        ["cta_title", "cta_description", "email", "address"].every((f) => isStr(v?.[f])),
        "cta_title,cta_description,email,address 가 필요합니다.",
      );
      need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email), "email 형식이 올바르지 않습니다.");
      need(v.kakao_url === undefined || /^https:\/\//i.test(v.kakao_url), "kakao_url 은 https 주소만 허용됩니다.");
      need(
        v.sns === undefined || (Array.isArray(v.sns) && v.sns.length <= 6 && v.sns.every((x: any) => isStr(x?.label) && /^https:\/\//i.test(x?.href ?? ""))),
        "sns 는 {label, href(https)} 최대 6개입니다.",
      );
    }
  }
}


// ── 과정(site_programs) ───────────────────────────────────
const PROGRAM_KINDS = ["live", "online", "external"];
const PROGRAM_STATUS = ["open", "ongoing", "upcoming", "closed"];
const APPLY_MODES = ["internal", "external"];
const PROGRAM_TEXT_MAX: Record<string, number> = {
  title: 200, subtitle: 200, summary: 600, badge: 80, schedule_label: 300, format_label: 200, duration_label: 200,
  price_label: 300, host_label: 300, audience_label: 400, location_label: 200, poster_alt: 300, source_name: 100,
};
const PROGRAM_FIELDS = [
  "kind", "status", "published", "featured", "hero_order", "sort_order", "title", "subtitle", "summary", "badge", "tags",
  "start_date", "end_date", "schedule_label", "format_label", "duration_label", "price_label", "host_label", "audience_label",
  "location_label", "late_join", "poster", "poster_alt", "thumb", "apply_mode", "apply_course_slug", "external_url", "source_name",
  "checked_at", "detail",
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SAFE_IMG_RE = /^(https:\/\/\S+|[A-Za-z0-9_][^:\s]*)$/;
const HTTPS_RE = /^https:\/\/\S+$/;
const CURRICULUM_TYPES = ["zoom", "offline", "online", "video"];

/** detail jsonb 의 알려진 구역 모양 검증 (모르는 구역은 통과, 크기·위험 문자열은 별도 검사) */
function validateProgramDetail(d: any, need: (c: boolean, m: string) => void) {
  need(d && typeof d === "object" && !Array.isArray(d), "detail 은 객체여야 합니다.");
  const arr = (k: string, max: number) => d[k] === undefined || (Array.isArray(d[k]) && d[k].length <= max);
  need(arr("overview", 12) && (d.overview ?? []).every(isStr), "overview 는 문자열 12개 이하입니다.");
  need(arr("tracks", 4), "tracks 는 4개 이하입니다.");
  (d.tracks ?? []).forEach((t: any, i: number) => need(isStr(t?.name), `tracks[${i}] 에 name 이 필요합니다.`));
  for (const k of ["learn", "outcomes"]) {
    need(arr(k, 12), `${k} 는 12개 이하입니다.`);
    (d[k] ?? []).forEach((t: any, i: number) => need(isStr(t?.title), `${k}[${i}] 에 title 이 필요합니다.`));
  }
  need(arr("curriculum", 40), "curriculum 은 40행 이하입니다.");
  (d.curriculum ?? []).forEach((r: any, i: number) => {
    need(isStr(r?.title), `curriculum[${i}] 에 title 이 필요합니다.`);
    need(r?.type === undefined || CURRICULUM_TYPES.includes(r.type), `curriculum[${i}].type 은 ${CURRICULUM_TYPES.join("|")} 입니다.`);
  });
  need(arr("operations", 12), "operations 는 12개 이하입니다.");
  (d.operations ?? []).forEach((r: any, i: number) => need(isStr(r?.k) && isStr(r?.v), `operations[${i}] 에 k,v 가 필요합니다.`));
  need(arr("notices", 12) && (d.notices ?? []).every(isStr), "notices 는 문자열 12개 이하입니다.");
  need(arr("materials", 12) && (d.materials ?? []).every(isStr), "materials 는 문자열 12개 이하입니다.");
  need(arr("faq", 20), "faq 는 20개 이하입니다.");
  (d.faq ?? []).forEach((f: any, i: number) => need(isStr(f?.q) && isStr(f?.a), `faq[${i}] 에 q,a 가 필요합니다.`));
  need(arr("fees", 12), "fees 는 12개 이하입니다.");
  (d.fees ?? []).forEach((f: any, i: number) => need(isStr(f?.name) && isStr(f?.price), `fees[${i}] 에 name,price 가 필요합니다.`));
  need(arr("gallery", 8), "gallery 는 8개 이하입니다.");
  (d.gallery ?? []).forEach((g: any, i: number) => need(isStr(g?.src) && SAFE_IMG_RE.test(g.src), `gallery[${i}].src 는 상대경로 또는 https 입니다.`));
  if (d.payment !== undefined) {
    need(isStr(d.payment?.bank) && isStr(d.payment?.number) && isStr(d.payment?.holder), "payment 에 bank, number, holder 가 필요합니다.");
  }
}

/** 병합된 최종 행(row)을 검증한다. 신규 생성이면 필수값도 확인. */
function validateProgram(row: any, isNew: boolean) {
  const need = (c: boolean, m: string) => {
    if (!c) throw new ToolError(`program/${row.slug}: ${m}`);
  };
  need(SLUG_RE.test(row.slug ?? ""), "slug 는 소문자/숫자/하이픈만 가능합니다 (64자 이하).");
  if (isNew) need(isStr(row.title), "새 과정에는 title 이 필요합니다.");
  need(row.kind === undefined || PROGRAM_KINDS.includes(row.kind), `kind 는 ${PROGRAM_KINDS.join("|")} 입니다.`);
  need(row.status === undefined || PROGRAM_STATUS.includes(row.status), `status 는 ${PROGRAM_STATUS.join("|")} 입니다.`);
  need(row.apply_mode === undefined || APPLY_MODES.includes(row.apply_mode), `apply_mode 는 ${APPLY_MODES.join("|")} 입니다.`);
  for (const [f, max] of Object.entries(PROGRAM_TEXT_MAX)) {
    need(row[f] == null || (typeof row[f] === "string" && row[f].length <= max), `${f} 는 ${max}자 이하 문자열입니다.`);
  }
  for (const f of ["published", "featured", "late_join"]) need(row[f] === undefined || typeof row[f] === "boolean", `${f} 는 true/false 입니다.`);
  for (const f of ["hero_order", "sort_order"]) need(row[f] === undefined || Number.isInteger(row[f]), `${f} 는 정수입니다.`);
  for (const f of ["start_date", "end_date", "checked_at"]) need(row[f] == null || DATE_RE.test(row[f]), `${f} 는 YYYY-MM-DD 형식입니다.`);
  need(!row.start_date || !row.end_date || row.start_date <= row.end_date, "start_date 는 end_date 보다 늦을 수 없습니다.");
  need(row.tags === undefined || (Array.isArray(row.tags) && row.tags.length <= 8 && row.tags.every(isStr)), "tags 는 문자열 8개 이하입니다.");
  for (const f of ["poster", "thumb"]) need(row[f] == null || SAFE_IMG_RE.test(row[f]), `${f} 는 사이트 안 상대경로 또는 https 주소만 가능합니다.`);
  need(row.external_url == null || HTTPS_RE.test(row.external_url), "external_url 은 https 주소만 가능합니다.");
  need(row.apply_mode !== "external" || isStr(row.external_url), "apply_mode=external 이면 external_url 이 필요합니다.");
  need(row.apply_course_slug == null || SLUG_RE.test(row.apply_course_slug), "apply_course_slug 는 courses.slug 형식입니다.");
  if (row.detail !== undefined) validateProgramDetail(row.detail, need);
}

/** apply 입력: 신청 과정(courses)과 옵션(course_options) */
function validateApply(a: any) {
  if (!a || typeof a !== "object") throw new ToolError("apply 는 객체여야 합니다.");
  const course = a.course ?? {};
  const okText = (v: unknown, max: number) => v == null || (typeof v === "string" && v.length <= max);
  if (!(okText(course.title, 200) && okText(course.subtitle, 200) && okText(course.level, 200) && okText(course.duration, 200) &&
        okText(course.schedule, 300) && okText(course.host, 300) && okText(course.price_text, 300) && okText(course.capacity_text, 100))) {
    throw new ToolError("apply.course 의 문구가 너무 길거나 문자열이 아닙니다.");
  }
  if (course.status !== undefined && !["draft", "open", "closed"].includes(course.status)) throw new ToolError("apply.course.status 는 draft|open|closed 입니다.");
  if (course.sort_order !== undefined && !Number.isInteger(course.sort_order)) throw new ToolError("apply.course.sort_order 는 정수입니다.");
  if (a.options !== undefined) {
    if (!Array.isArray(a.options) || a.options.length < 1 || a.options.length > 8) throw new ToolError("apply.options 는 1~8개 배열입니다.");
    a.options.forEach((o: any, i: number) => {
      if (!isStr(o?.name) || o.name.length > 100) throw new ToolError(`apply.options[${i}] 에 name(100자 이하)이 필요합니다.`);
      if (!Number.isInteger(o?.price) || o.price < 0) throw new ToolError(`apply.options[${i}].price 는 0 이상 정수(원)입니다.`);
      if (!okText(o.description, 200)) throw new ToolError(`apply.options[${i}].description 은 200자 이하입니다.`);
    });
  }
}

function ok(data: unknown) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] };
}

function dbErr(e: { message: string } | null) {
  if (e) throw new ToolError(`DB 오류: ${e.message}`);
}

function tableOf(which: string): string {
  const t = CONTENT_TABLES[which];
  if (!t) throw new ToolError("table 은 'content' 또는 'settings' 여야 합니다.");
  return t;
}

// ── 도구 ──────────────────────────────────────────────────
type Tool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: any, db: SupabaseClient) => Promise<unknown>;
};

const STATUS = { type: "string", enum: ["new", "contacted", "done"] };

const tools: Tool[] = [
  {
    name: "site_overview",
    description: "사이트 편집 현황: 콘텐츠/설정 키 목록, 프로그램 수, 미처리 신청·문의 수.",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, db) => {
      const [c, s, co, a, i, pr] = await Promise.all([
        db.from("site_content").select("key,updated_at"),
        db.from("site_settings").select("key,updated_at"),
        db.from("site_courses").select("slug", { count: "exact", head: true }),
        db.from("site_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
        db.from("site_inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
        db.from("site_programs").select("slug,kind,status,published,featured"),
      ]);
      const programs = (pr.data ?? []) as any[];
      return ok({
        content_keys: c.data,
        settings_keys: s.data,
        courses: co.count,
        programs: {
          total: programs.length,
          published: programs.filter((p) => p.published).length,
          featured_in_hero: programs.filter((p) => p.published && p.featured && ["open", "ongoing"].includes(p.status)).length,
          by_status: Object.fromEntries(PROGRAM_STATUS.map((st) => [st, programs.filter((p) => p.status === st).length])),
          by_kind: Object.fromEntries(PROGRAM_KINDS.map((k) => [k, programs.filter((p) => p.kind === k).length])),
        },
        new_applications: a.count,
        new_inquiries: i.count,
        known_keys: {
          content: [
            "home.hero", "home.hero_meta", "home.slides", "home.highlights", "home.cards",
            "home.timeline", "home.outcomes", "home.system", "home.instructor", "home.metrics",
            "home.enrollment", "home.faq",
            // 메인 재구성(2026-10-08)
            "home.hero_images", "home.clients", "home.cases", "home.areas", "home.insights", "home.cta",
            // newirumcompany(보조 사이트) 전용
            "home.tracks", "home.features", "home.process",
          ],
          settings: ["nav", "footer", "seo"],
        },
      });
    },
  },
  {
    name: "get_content",
    description: "메인 페이지 문구(table=content) 또는 헤더·푸터 설정(table=settings)을 조회. key 를 생략하면 전체.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string", enum: ["content", "settings"] }, key: { type: "string" } },
      required: ["table"],
    },
    run: async (a, db) => {
      const q = db.from(tableOf(a.table)).select("key,value,updated_at");
      const { data, error } = a.key ? await q.eq("key", a.key) : await q;
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "set_content",
    description:
      "메인 문구/설정 값을 교체(전체 value 를 보내야 함 — 먼저 get_content 로 현재 값 확인). " +
      "home.hero{title,subtitle}, home.hero_meta{tags[],cta1{label,href},cta2}, home.slides[{label,title,desc,image,alt,href,cta}], " +
      "home.highlights[문장], home.cards[{code,name,status,tone,tagline,desc,sessions,fee,output,cta,href}], " +
      "home.timeline{title,weeks[{no,date,title,body,milestone}]}, home.outcomes{title,items[{title,body}]}, home.system{title,rows[{k,v}]}, " +
      "home.instructor{name,role,bio[]}, home.metrics{items[{n,label}]}, home.enrollment{schedule,fees[{name,price,note}],account{bank,number,holder},notice[]}, " +
      "home.hero_images{items[{src,alt}] 1~5장}, home.clients{items[{name,src,href}]}, home.cases{more_href,items[{title,image,tags[],href}]}, " +
      "home.areas{items[{name,desc,audience,courses[],output,images[{src,alt}]}] 최대 6개}, home.insights{more_href,items[{title,tag,image,href}]}, home.cta{title,body,primary{label,href},secondary{label,href}}, " +
      "home.faq[{q,a}] (irumcompany.co.kr 메인), home.tracks[2], home.features{title,items[3]}, home.process{title,subtitle,steps[3]} (보조 사이트), " +
      "settings: nav{items[],cta_label}, footer{cta_title,cta_description,email,address,kakao_url?,sns?[{label,href}]}, seo{title,description}. 줄바꿈은 \\n.",
    inputSchema: {
      type: "object",
      properties: { table: { type: "string", enum: ["content", "settings"] }, key: { type: "string" }, value: {} },
      required: ["table", "key", "value"],
    },
    run: async (a, db) => {
      const table = tableOf(a.table);
      if (!KEY_RE.test(a.key ?? "")) throw new ToolError("key 형식이 올바르지 않습니다 (소문자/숫자/._-, 64자 이하).");
      assertSize(a.value);
      assertSafeStrings(a.value);
      checkHrefs(a.value);
      checkImages(a.value);
      validateKnown(table, a.key, a.value);
      const { data: before } = await db.from(table).select("value").eq("key", a.key).maybeSingle();
      const { error } = await db.from(table).upsert({ key: a.key, value: a.value });
      dbErr(error);
      return ok({ saved: `${table}/${a.key}`, before: before?.value ?? null, after: a.value });
    },
  },
  {
    name: "list_courses",
    description: "프로그램(과정) 전체 목록 (비공개 포함).",
    inputSchema: { type: "object", properties: {} },
    run: async (_a, db) => {
      const { data, error } = await db.from("site_courses").select("*").order("sort_order");
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "upsert_course",
    description:
      "프로그램 추가/수정(slug 기준). 수정 시 보내지 않은 필드는 유지. 새로 만들 때는 모든 필수 필드 필요. " +
      "참고: 상세 페이지(html/courses/<slug>.html)는 별도 파일이라 상세 페이지가 없는 새 slug 는 링크가 404 입니다.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        title: { type: "string" },
        category: { type: "string" },
        price: { type: "integer", minimum: 0 },
        short_description: { type: "string" },
        duration_label: { type: "string" },
        format_label: { type: "string" },
        tools: { type: "array", items: { type: "string" } },
        sort_order: { type: "integer" },
        published: { type: "boolean" },
      },
      required: ["slug"],
    },
    run: async (a, db) => {
      if (!SLUG_RE.test(a.slug ?? "")) throw new ToolError("slug 는 소문자/숫자/하이픈만 가능합니다.");
      const fields = ["title", "category", "price", "short_description", "duration_label", "format_label", "tools", "sort_order", "published"];
      const patch: Record<string, unknown> = {};
      for (const f of fields) if (a[f] !== undefined) patch[f] = a[f];
      assertSafeStrings(patch, "course");
      assertSize(patch);
      const { data: before } = await db.from("site_courses").select("*").eq("slug", a.slug).maybeSingle();
      if (!before) {
        const missing = ["title", "category", "price", "short_description", "duration_label", "format_label"].filter((f) =>
          patch[f] === undefined
        );
        if (missing.length) throw new ToolError(`새 프로그램에는 다음 필드가 필요합니다: ${missing.join(", ")}`);
      }
      const { data, error } = await db.from("site_courses").upsert({ ...(before ?? {}), ...patch, slug: a.slug }).select().single();
      dbErr(error);
      return ok({ saved: a.slug, created: !before, before, after: data });
    },
  },
  {
    name: "set_course_groups",
    description: "프로그램 목록 페이지의 그룹 구성을 통째로 교체. groups: [{title, description, slugs[]}] (순서대로 노출).",
    inputSchema: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: { title: { type: "string" }, description: { type: "string" }, slugs: { type: "array", items: { type: "string" } } },
            required: ["title", "slugs"],
          },
        },
      },
      required: ["groups"],
    },
    run: async (a, db) => {
      assertSafeStrings(a.groups, "groups");
      assertSize(a.groups);
      const { data: courses, error: ce } = await db.from("site_courses").select("slug");
      dbErr(ce);
      const known = new Set((courses ?? []).map((c: any) => c.slug));
      for (const g of a.groups) {
        if (!isStr(g.title)) throw new ToolError("그룹 title 이 필요합니다.");
        for (const s of g.slugs) if (!known.has(s)) throw new ToolError(`존재하지 않는 slug: ${s}`);
      }
      const { data: old } = await db.from("site_course_groups").select("id");
      const rows = a.groups.map((g: any, i: number) => ({
        title: g.title,
        description: g.description ?? "",
        slugs: g.slugs,
        sort_order: i + 1,
      }));
      const ins = await db.from("site_course_groups").insert(rows).select();
      dbErr(ins.error);
      if (old?.length) {
        const del = await db.from("site_course_groups").delete().in("id", old.map((r: any) => r.id));
        dbErr(del.error);
      }
      return ok({ saved: ins.data });
    },
  },
  {
    name: "list_applications",
    description: "교육 신청 목록(개인정보 포함). 최신순.",
    inputSchema: {
      type: "object",
      properties: {
        status: STATUS,
        track: { type: "string", enum: ["institution", "workshop"] },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
    },
    run: async (a, db) => {
      let q = db.from("site_applications").select("*").order("created_at", { ascending: false }).limit(a.limit ?? 30);
      if (a.status) q = q.eq("status", a.status);
      if (a.track) q = q.eq("track", a.track);
      const { data, error } = await q;
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "update_application_status",
    description: "신청 처리 상태 변경 (new → contacted → done).",
    inputSchema: { type: "object", properties: { id: { type: "string" }, status: STATUS }, required: ["id", "status"] },
    run: async (a, db) => {
      const { data, error } = await db.from("site_applications").update({ status: a.status }).eq("id", a.id).select("id,status").maybeSingle();
      dbErr(error);
      if (!data) throw new ToolError("해당 id 의 신청이 없습니다.");
      return ok(data);
    },
  },
  {
    name: "list_inquiries",
    description: "문의 목록(개인정보 포함). 최신순.",
    inputSchema: { type: "object", properties: { status: STATUS, limit: { type: "integer", minimum: 1, maximum: 100 } } },
    run: async (a, db) => {
      let q = db.from("site_inquiries").select("*").order("created_at", { ascending: false }).limit(a.limit ?? 30);
      if (a.status) q = q.eq("status", a.status);
      const { data, error } = await q;
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "update_inquiry_status",
    description: "문의 처리 상태 변경.",
    inputSchema: { type: "object", properties: { id: { type: "string" }, status: STATUS }, required: ["id", "status"] },
    run: async (a, db) => {
      const { data, error } = await db.from("site_inquiries").update({ status: a.status }).eq("id", a.id).select("id,status").maybeSingle();
      dbErr(error);
      if (!data) throw new ToolError("해당 id 의 문의가 없습니다.");
      return ok(data);
    },
  },
  {
    name: "list_revisions",
    description: "변경 이력 조회 (최신순). table: site_content | site_settings | site_courses | site_course_groups | site_programs.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", enum: REVISION_TABLES },
        key: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    run: async (a, db) => {
      let q = db.from("site_revisions").select("id,table_name,row_key,old_value,new_value,created_at").order("id", { ascending: false }).limit(a.limit ?? 10);
      if (a.table) q = q.eq("table_name", a.table);
      if (a.key) q = q.eq("row_key", a.key);
      const { data, error } = await q;
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "list_programs",
    description:
      "과정(기수) 카탈로그 목록(비공개 포함). 메인 히어로 슬라이드(featured)·진행중 과정 카드·상세 페이지의 원본. " +
      "slug 를 주면 detail 까지 전체, 생략하면 목록용 요약.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, status: { type: "string", enum: PROGRAM_STATUS }, kind: { type: "string", enum: PROGRAM_KINDS } },
    },
    run: async (a, db) => {
      if (a.slug) {
        const { data, error } = await db.from("site_programs").select("*").eq("slug", a.slug).maybeSingle();
        dbErr(error);
        if (!data) throw new ToolError("해당 slug 의 과정이 없습니다.");
        return ok(data);
      }
      let q = db.from("site_programs").select(
        "slug,kind,status,published,featured,hero_order,sort_order,title,subtitle,badge,start_date,end_date,schedule_label,price_label,apply_mode,apply_course_slug,external_url,source_name,checked_at,updated_at",
      ).order("sort_order").order("slug");
      if (a.status) q = q.eq("status", a.status);
      if (a.kind) q = q.eq("kind", a.kind);
      const { data, error } = await q;
      dbErr(error);
      return ok(data);
    },
  },
  {
    name: "upsert_program",
    description:
      "과정 추가/수정(slug 기준). 수정 시 보내지 않은 필드는 유지. 새 과정은 published=false 로 만들어 확인한 뒤 true 로 공개하세요. " +
      "필드: kind(live|online|external), status(open|ongoing|upcoming|closed), published, featured(히어로 슬라이드 포함), hero_order, sort_order, " +
      "title, subtitle, summary, badge, tags[], start_date/end_date(YYYY-MM-DD), schedule_label, format_label, duration_label, price_label, host_label, " +
      "audience_label, location_label, late_join, poster/poster_alt/thumb(상대경로 또는 https), apply_mode(internal|external), apply_course_slug, " +
      "external_url(https), source_name, checked_at, detail{...}. detail 은 통째 교체되므로 일부만 바꿀 때는 set_program_detail 을 쓰세요. " +
      "apply 를 함께 보내면 신청 페이지용 과정(courses)·옵션(course_options)도 같은 slug(또는 apply_course_slug)로 만들고 수정합니다(비원자적).",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        kind: { type: "string", enum: PROGRAM_KINDS },
        status: { type: "string", enum: PROGRAM_STATUS },
        published: { type: "boolean" },
        featured: { type: "boolean" },
        hero_order: { type: "integer" },
        sort_order: { type: "integer" },
        title: { type: "string" },
        subtitle: { type: "string" },
        summary: { type: "string" },
        badge: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        start_date: { type: "string" },
        end_date: { type: "string" },
        schedule_label: { type: "string" },
        format_label: { type: "string" },
        duration_label: { type: "string" },
        price_label: { type: "string" },
        host_label: { type: "string" },
        audience_label: { type: "string" },
        location_label: { type: "string" },
        late_join: { type: "boolean" },
        poster: { type: "string" },
        poster_alt: { type: "string" },
        thumb: { type: "string" },
        apply_mode: { type: "string", enum: APPLY_MODES },
        apply_course_slug: { type: "string" },
        external_url: { type: "string" },
        source_name: { type: "string" },
        checked_at: { type: "string" },
        detail: { type: "object" },
        apply: {
          type: "object",
          properties: {
            course: {
              type: "object",
              properties: {
                title: { type: "string" }, subtitle: { type: "string" }, level: { type: "string" }, duration: { type: "string" },
                schedule: { type: "string" }, host: { type: "string" }, price_text: { type: "string" }, capacity_text: { type: "string" },
                status: { type: "string", enum: ["draft", "open", "closed"] }, sort_order: { type: "integer" },
              },
            },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: { name: { type: "string" }, description: { type: "string" }, price: { type: "integer", minimum: 0 } },
                required: ["name", "price"],
              },
            },
          },
        },
      },
      required: ["slug"],
    },
    run: async (a, db) => {
      if (!SLUG_RE.test(a.slug ?? "")) throw new ToolError("slug 는 소문자/숫자/하이픈만 가능합니다.");
      const patch: Record<string, unknown> = {};
      for (const f of PROGRAM_FIELDS) if (a[f] !== undefined) patch[f] = a[f];
      assertSafeStrings(patch, "program");
      assertSize(patch);
      checkHrefs(patch);
      checkImages(patch);
      const { data: before, error: be } = await db.from("site_programs").select("*").eq("slug", a.slug).maybeSingle();
      dbErr(be);
      const merged = { ...(before ?? {}), ...patch, slug: a.slug } as any;
      validateProgram(merged, !before);
      if (merged.apply_mode === "internal" && a.apply && merged.apply_course_slug == null) merged.apply_course_slug = a.slug;

      // 1) 신청용 과정·옵션 (apply_course_slug 가 가리키는 courses 행)
      let applied: unknown = undefined;
      if (a.apply) {
        validateApply(a.apply);
        assertSafeStrings(a.apply, "apply");
        const cslug = merged.apply_course_slug ?? a.slug;
        const { data: cb, error: ce } = await db.from("courses").select("*").eq("slug", cslug).maybeSingle();
        dbErr(ce);
        const cpatch: Record<string, unknown> = {};
        for (const f of ["title", "subtitle", "level", "duration", "schedule", "host", "price_text", "capacity_text", "status", "sort_order"]) {
          if (a.apply.course?.[f] !== undefined) cpatch[f] = a.apply.course[f];
        }
        if (!cb) {
          const title = cpatch.title ?? merged.title;
          if (!isStr(title)) throw new ToolError("새 신청 과정에는 apply.course.title 또는 program title 이 필요합니다.");
          cpatch.title = title;
          cpatch.status = cpatch.status ?? "draft";
        }
        const cw = cb
          ? await db.from("courses").update(cpatch).eq("id", cb.id).select().single()
          : await db.from("courses").insert({ slug: cslug, ...cpatch }).select().single();
        dbErr(cw.error);
        const course = cw.data as any;
        let opts: unknown = undefined;
        if (a.apply.options) {
          // 옵션은 이름 기준으로 맞춘다: 있으면 수정, 없으면 추가, 목록에서 빠진 것은 비활성화(삭제하지 않음 — 기존 신청 보호)
          const { data: cur, error: oe } = await db.from("course_options").select("*").eq("course_id", course.id);
          dbErr(oe);
          const byName = new Map((cur ?? []).map((o: any) => [o.name, o]));
          const names = new Set<string>();
          for (let i = 0; i < a.apply.options.length; i++) {
            const o = a.apply.options[i];
            names.add(o.name);
            const row = { name: o.name, description: o.description ?? null, price: o.price, sort_order: i + 1, active: true };
            const ex = byName.get(o.name) as any;
            const w = ex
              ? await db.from("course_options").update(row).eq("id", ex.id)
              : await db.from("course_options").insert({ course_id: course.id, ...row });
            dbErr(w.error);
          }
          for (const [n, ex] of byName) {
            if (!names.has(n as string) && (ex as any).active) {
              const w = await db.from("course_options").update({ active: false }).eq("id", (ex as any).id);
              dbErr(w.error);
            }
          }
          const { data: after } = await db.from("course_options").select("name,price,active,sort_order").eq("course_id", course.id).order("sort_order");
          opts = after;
        }
        applied = { course: { slug: course.slug, status: course.status, title: course.title }, options: opts, created: !cb };
      }

      // 2) 과정 카탈로그 행
      const row = { ...merged };
      delete row.updated_at;
      delete row.updated_by;
      const { data, error } = await db.from("site_programs").upsert(row).select().single();
      if (error) {
        throw new ToolError(`DB 오류: ${error.message}${applied ? " (신청용 과정·옵션은 이미 저장되었습니다. 같은 요청을 다시 보내면 이어서 처리됩니다.)" : ""}`);
      }
      return ok({
        saved: a.slug,
        created: !before,
        published: data.published,
        changed_fields: Object.keys(patch),
        before: before ? Object.fromEntries(Object.keys(patch).map((k) => [k, (before as any)[k]])) : null,
        apply: applied,
        note: data.published ? "공개 중입니다. 메인에 바로 반영됩니다." : "비공개 상태입니다. 확인 후 published=true 로 공개하세요.",
      });
    },
  },
  {
    name: "set_program_detail",
    description:
      "과정 상세(detail)의 한 구역만 교체. section: overview|tracks|learn|outcomes|curriculum|operations|notices|materials|faq|fees|gallery|payment|audience. " +
      "value 에 해당 구역의 전체 값을 보냅니다(예: curriculum 은 [{no,date,type,title,body,track,milestone}]). value 가 null 이면 구역을 삭제(숨김)합니다.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        section: { type: "string", enum: ["overview", "tracks", "learn", "outcomes", "curriculum", "operations", "notices", "materials", "faq", "fees", "gallery", "payment", "audience"] },
        value: {},
      },
      required: ["slug", "section", "value"],
    },
    run: async (a, db) => {
      const { data: before, error } = await db.from("site_programs").select("slug,detail").eq("slug", a.slug).maybeSingle();
      dbErr(error);
      if (!before) throw new ToolError("해당 slug 의 과정이 없습니다. 먼저 upsert_program 으로 만드세요.");
      const detail: any = { ...(before.detail ?? {}) };
      const prev = detail[a.section] ?? null;
      if (a.value === null) delete detail[a.section];
      else detail[a.section] = a.value;
      assertSafeStrings(detail, "detail");
      assertSize(detail);
      checkHrefs(detail);
      checkImages(detail);
      validateProgram({ slug: a.slug, detail }, false);
      const { error: e2 } = await db.from("site_programs").update({ detail }).eq("slug", a.slug);
      dbErr(e2);
      return ok({ saved: `${a.slug}/detail.${a.section}`, before: prev, after: a.value });
    },
  },
  {
    name: "set_program_order",
    description: "과정 노출 순서를 일괄 지정. items: [{slug, sort_order?, hero_order?}] (작은 숫자가 앞). 목록 카드는 sort_order, 히어로 슬라이드는 hero_order.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array", minItems: 1, maxItems: 50,
          items: { type: "object", properties: { slug: { type: "string" }, sort_order: { type: "integer" }, hero_order: { type: "integer" } }, required: ["slug"] },
        },
      },
      required: ["items"],
    },
    run: async (a, db) => {
      const results: unknown[] = [];
      for (const it of a.items) {
        if (!SLUG_RE.test(it.slug ?? "")) throw new ToolError(`slug 형식 오류: ${it.slug}`);
        const patch: Record<string, number> = {};
        if (it.sort_order !== undefined) { if (!Number.isInteger(it.sort_order)) throw new ToolError("sort_order 는 정수입니다."); patch.sort_order = it.sort_order; }
        if (it.hero_order !== undefined) { if (!Number.isInteger(it.hero_order)) throw new ToolError("hero_order 는 정수입니다."); patch.hero_order = it.hero_order; }
        if (!Object.keys(patch).length) continue;
        const { data, error } = await db.from("site_programs").update(patch).eq("slug", it.slug).select("slug,sort_order,hero_order").maybeSingle();
        dbErr(error);
        if (!data) throw new ToolError(`존재하지 않는 slug: ${it.slug}`);
        results.push(data);
      }
      return ok({ saved: results });
    },
  },
  {
    name: "close_program",
    description:
      "과정을 마감(status=closed)하고 히어로·진행중 목록에서 내린다. hide=true 면 비공개(published=false)까지. " +
      "신청 페이지의 연결 과정(courses)도 함께 마감하려면 close_apply=true. 삭제는 하지 않는다.",
    inputSchema: {
      type: "object",
      properties: { slug: { type: "string" }, hide: { type: "boolean" }, close_apply: { type: "boolean" } },
      required: ["slug"],
    },
    run: async (a, db) => {
      const { data: p, error } = await db.from("site_programs").select("slug,status,published,apply_course_slug").eq("slug", a.slug).maybeSingle();
      dbErr(error);
      if (!p) throw new ToolError("해당 slug 의 과정이 없습니다.");
      const patch: Record<string, unknown> = { status: "closed", featured: false };
      if (a.hide === true) patch.published = false;
      const { error: e2 } = await db.from("site_programs").update(patch).eq("slug", a.slug);
      dbErr(e2);
      let applyClosed: unknown = null;
      if (a.close_apply === true && p.apply_course_slug) {
        const { data, error: e3 } = await db.from("courses").update({ status: "closed" }).eq("slug", p.apply_course_slug).select("slug,status").maybeSingle();
        dbErr(e3);
        applyClosed = data;
      }
      return ok({ closed: a.slug, before: { status: p.status, published: p.published }, after: patch, apply_course: applyClosed });
    },
  },
  {
    name: "rollback",
    description: "list_revisions 의 revision id 시점 '이전 값'으로 되돌린다 (수정 이력만 가능, 최초 생성 이력은 불가).",
    inputSchema: { type: "object", properties: { revision_id: { type: "integer" } }, required: ["revision_id"] },
    run: async (a, db) => {
      const { data: rev, error } = await db.from("site_revisions").select("*").eq("id", a.revision_id).maybeSingle();
      dbErr(error);
      if (!rev) throw new ToolError("해당 revision 이 없습니다.");
      if (!rev.old_value) throw new ToolError("최초 생성 이력은 되돌릴 이전 값이 없습니다.");
      if (!REVISION_TABLES.includes(rev.table_name)) throw new ToolError("허용되지 않은 테이블입니다.");
      const { error: e2 } = await db.from(rev.table_name).upsert(rev.old_value);
      dbErr(e2);
      return ok({ restored: `${rev.table_name}/${rev.row_key}`, value: rev.old_value });
    },
  },
];

// ── JSON-RPC ──────────────────────────────────────────────
const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: unknown, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg: any, db: SupabaseClient): Promise<unknown | null> {
  const { id, method, params } = msg ?? {};
  if (method === undefined || id === undefined) return null; // 응답 또는 notification
  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? "2025-03-26",
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params?.name);
      if (!tool) return rpcError(id, -32602, `알 수 없는 도구: ${params?.name}`);
      try {
        return rpcResult(id, await tool.run(params?.arguments ?? {}, db));
      } catch (e) {
        if (!(e instanceof ToolError)) console.error(e);
        const text = e instanceof ToolError ? e.message : "서버 내부 오류가 발생했습니다.";
        return rpcResult(id, { isError: true, content: [{ type: "text", text }] });
      }
    }
    default:
      return rpcError(id, -32601, `지원하지 않는 메서드: ${method}`);
  }
}

// ── HTTP / OAuth ──────────────────────────────────────────
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", ...extra } });
}

/** 이 함수의 공개 URL (…/functions/v1/site-mcp) */
function baseUrl(): string {
  return `${SUPABASE_URL}/functions/v1/site-mcp`;
}

function challenge(status: 401 | 403, error: string) {
  const meta = `${baseUrl()}/.well-known/oauth-protected-resource`;
  return json({ error }, status, {
    "WWW-Authenticate": `Bearer resource_metadata="${meta}"`,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const path = new URL(req.url).pathname;
  // RFC 9728: 보호 리소스 메타데이터 — 인증 서버는 Supabase Auth
  if (path.endsWith("/.well-known/oauth-protected-resource")) {
    return json({
      resource: baseUrl(),
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
    });
  }

  const authz = req.headers.get("authorization") ?? "";
  const token = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
  if (!token) return challenge(401, "unauthorized");

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error: uerr } = await db.auth.getUser(token);
  if (uerr || !user?.user) return challenge(401, "invalid_token");
  const { data: isAdmin } = await db.rpc("is_admin");
  if (isAdmin !== true) return json({ error: "관리자로 등록된 계정만 사용할 수 있습니다." }, 403);

  if (req.method === "GET") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST" } });
  if (req.method === "DELETE") return new Response(null, { status: 200, headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, db)))).filter((x) => x !== null);
    return out.length ? json(out) : new Response(null, { status: 202, headers: CORS });
  }
  const res = await handle(body, db);
  return res === null ? new Response(null, { status: 202, headers: CORS }) : json(res);
});
