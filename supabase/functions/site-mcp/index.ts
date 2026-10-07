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

const SERVER_INFO = { name: "irum-site-editor", version: "1.0.0" };
const INSTRUCTIONS =
  "이룸아카데미 사이트(메인 문구·프로그램·헤더/푸터 설정)와 신청/문의를 편집하는 서버입니다. " +
  "수정 전에는 get_content/list_courses 로 현재 값을 확인하고, 변경 후에는 결과 diff 를 사용자에게 알려주세요. " +
  "잘못 바꾼 경우 list_revisions → rollback 으로 되돌릴 수 있습니다.";

const CONTENT_TABLES: Record<string, string> = { content: "site_content", settings: "site_settings" };
const REVISION_TABLES = ["site_content", "site_settings", "site_courses", "site_course_groups"];
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
          k === "href" && typeof y === "string" &&
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

/** 알려진 키는 모양을 검증한다. 모르는 키는 통과(프론트가 읽을 때까지 영향 없음). */
function validateKnown(table: string, key: string, v: any) {
  const need = (cond: boolean, msg: string) => {
    if (!cond) throw new ToolError(`${table}/${key}: ${msg}`);
  };
  if (table === "site_content") {
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
    if (key === "nav") {
      need(Array.isArray(v?.items) && v.items.length >= 1 && v.items.length <= 6, "{items(1~6개), cta_label} 가 필요합니다.");
      v.items.forEach((t: any, i: number) => need(isStr(t?.label) && isStr(t?.href), `items[${i}] 에 label,href 가 필요합니다.`));
      need(isStr(v?.cta_label), "cta_label 이 필요합니다.");
    } else if (key === "footer") {
      need(
        ["cta_title", "cta_description", "email", "address"].every((f) => isStr(v?.[f])),
        "cta_title,cta_description,email,address 가 필요합니다.",
      );
      need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email), "email 형식이 올바르지 않습니다.");
    }
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
      const [c, s, co, a, i] = await Promise.all([
        db.from("site_content").select("key,updated_at"),
        db.from("site_settings").select("key,updated_at"),
        db.from("site_courses").select("slug", { count: "exact", head: true }),
        db.from("site_applications").select("id", { count: "exact", head: true }).eq("status", "new"),
        db.from("site_inquiries").select("id", { count: "exact", head: true }).eq("status", "new"),
      ]);
      return ok({
        content_keys: c.data,
        settings_keys: s.data,
        courses: co.count,
        new_applications: a.count,
        new_inquiries: i.count,
        known_keys: {
          content: ["home.hero", "home.tracks", "home.features", "home.process"],
          settings: ["nav", "footer"],
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
      "home.hero{title,subtitle}, home.tracks[2], home.features{title,items[3]}, home.process{title,subtitle,steps[3]}, " +
      "settings: nav{items[],cta_label}, footer{cta_title,cta_description,email,address}. 줄바꿈은 \\n.",
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
    description: "변경 이력 조회 (최신순). table: site_content | site_settings | site_courses | site_course_groups.",
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
