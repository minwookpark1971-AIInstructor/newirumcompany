-- 0003_site_programs.sql
-- irumcompany.co.kr 메인의 "진행중 과정" 카탈로그. 한 과정(기수) = 한 행.
--   · 히어로 슬라이드(featured)·진행중 과정 카드·과정별 상세 페이지가 이 테이블을 읽는다.
--   · 신청·옵션·수강료의 원본은 courses / course_options (공유 회원 시스템) — 여기서는 변경하지 않고
--     apply_course_slug 로 연결만 한다.
-- 읽기: 공개(published) 행은 누구나, 비공개 포함 전체는 관리자. 쓰기: 관리자(private.is_admin()).
-- 전제(라이브 DB 에 이미 존재): private.is_admin(), public.site_touch_and_log() (0002)

create table if not exists public.site_programs (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,63}$'),

  kind text not null default 'live' check (kind in ('live', 'online', 'external')),
  status text not null default 'open' check (status in ('open', 'ongoing', 'upcoming', 'closed')),
  published boolean not null default false,
  featured boolean not null default false,
  hero_order integer not null default 100,
  sort_order integer not null default 100,

  title text not null check (char_length(title) between 1 and 200),
  subtitle text check (char_length(subtitle) <= 200),
  summary text check (char_length(summary) <= 600),
  badge text check (char_length(badge) <= 80),
  tags text[] not null default '{}',

  start_date date,
  end_date date,
  schedule_label text check (char_length(schedule_label) <= 300),
  format_label text check (char_length(format_label) <= 200),
  duration_label text check (char_length(duration_label) <= 200),
  price_label text check (char_length(price_label) <= 300),
  host_label text check (char_length(host_label) <= 300),
  audience_label text check (char_length(audience_label) <= 400),
  location_label text check (char_length(location_label) <= 200),
  late_join boolean not null default false,

  -- 이미지: 사이트 안 상대경로 또는 https 만 (http:, //, javascript: 등 불가)
  poster text check (poster is null or poster ~ '^(https://[^[:space:]]+|[A-Za-z0-9_][^:[:space:]]*)$'),
  poster_alt text check (char_length(poster_alt) <= 300),
  thumb text check (thumb is null or thumb ~ '^(https://[^[:space:]]+|[A-Za-z0-9_][^:[:space:]]*)$'),

  apply_mode text not null default 'internal' check (apply_mode in ('internal', 'external')),
  apply_course_slug text,
  external_url text check (external_url is null or external_url ~ '^https://[^[:space:]]+$'),
  source_name text check (char_length(source_name) <= 100),
  checked_at date,

  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),

  constraint site_programs_external_needs_url check (apply_mode <> 'external' or external_url is not null),
  constraint site_programs_dates_order check (start_date is null or end_date is null or start_date <= end_date)
);

create index if not exists site_programs_list
  on public.site_programs (published, status, sort_order);

-- 이력·updated_at/updated_by 자동 기록 (0002 의 함수 재사용: slug 를 행 키로 쓴다)
drop trigger if exists site_programs_log on public.site_programs;
create trigger site_programs_log
  before insert or update or delete on public.site_programs
  for each row execute function public.site_touch_and_log();

alter table public.site_programs enable row level security;

drop policy if exists site_programs_read on public.site_programs;
create policy site_programs_read on public.site_programs
  for select to anon, authenticated
  using (published or (select private.is_admin()));

drop policy if exists site_programs_admin_write on public.site_programs;
create policy site_programs_admin_write on public.site_programs
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- ── 시드: AI 캡스톤 2트랙 (기존 home.* 값을 이관, 홍보 이미지로 확정된 사실만) ──────────
insert into public.site_programs (
  slug, kind, status, published, featured, hero_order, sort_order,
  title, subtitle, summary, badge, tags,
  start_date, end_date, schedule_label, format_label, duration_label, price_label, host_label, location_label, late_join,
  poster, poster_alt, apply_mode, apply_course_slug, detail
) values (
  'ai-capstone-2026q4', 'live', 'ongoing', true, true, 10, 10,
  'AI 캡스톤 2트랙', '노코드로 만드는 서비스',
  '설계도를 그리는 사람이 AI를 운전합니다. 한 회차에 동작하는 결과물을 하나씩 만들어, 6주 뒤 내 도메인으로 열리는 서비스 하나가 남습니다.',
  'A코스 진행중 · B코스 10/23 개강', array['AI캡스톤', '바이브코딩', '6주완성'],
  date '2026-10-02', date '2026-11-06',
  '매주 금요일 20~22시 · A코스 10/2~10/16 · B코스 10/23~11/6',
  'ZOOM 라이브 · 총 6회', '6회 · 6주', 'A코스·B코스 각 18만원 · 함께 등록 30만원(6만원 할인)',
  '이룸아카데미 · 강사온스쿨', 'ZOOM 온라인', true,
  'images/cover/cover-main.png',
  '노코드로 만드는 서비스 AI 캡스톤 — 10/2(금) 개강, ZOOM 라이브, 6주 완성',
  'internal', 'ai-capstone-2026q4',
  jsonb_build_object(
    'overview', jsonb_build_array(
      '한 회차에 동작하는 결과물을 하나씩 만들어 갑니다.',
      '100% 같이 만들어 가는 캡스톤 방식으로 AI 프로젝트 전체 과정을 습득하고, 6주 뒤 내 도메인으로 열리는 서비스 하나를 남깁니다.'
    ),
    'tracks', jsonb_build_array(
      jsonb_build_object('code', 'A', 'name', 'AI 강의 운영 플랫폼',
        'tagline', '# 강사님만의 강의 운영플랫폼을 수정해서 소유하는 프로젝트',
        'desc', '강의자료·사전학습 제작 영상·질문·과제 AI평가를 담은 나만의 강의 운영 플랫폼을 직접 완성합니다. 수강신청부터 결제까지 붙여 자체 교육·판매 시스템을 갖추고, 수료 직후 강사님의 본인 사이트로 바로 오픈할 수 있습니다.',
        'sessions', '3회 · 10/2 · 10/9 · 10/16', 'output', '나만의 강의 운영 플랫폼 (본인 사이트로 오픈)'),
      jsonb_build_object('code', 'B', 'name', '기관/대학 캡스톤 프로젝트',
        'tagline', '# 기관과 대학에서 가장 자주하는 주제에 대한 완벽한 자료와 교수법',
        'desc', '대학과 기관이 실제로 찾는 교육 주제를 직접 기획하고, 캡스톤 프로젝트로 한 편을 끝까지 완성합니다. 완성된 결과물은 그대로 다음 학기 제안서이자 바로 들어가는 강의안이 됩니다.',
        'sessions', '3회 · 10/23 · 10/30 · 11/6', 'output', '다음 학기 제안서 · 강의안')
    ),
    'outcomes', jsonb_build_array(
      jsonb_build_object('title', '나만의 강의 운영 플랫폼', 'body', '강의자료·사전학습 영상·질문·과제 AI평가를 담은 플랫폼을 직접 완성하고, 수료 직후 본인 사이트로 오픈합니다.'),
      jsonb_build_object('title', '다음 학기 제안서 · 강의안', 'body', '기관과 대학에서 가장 자주 찾는 주제로 완성한 캡스톤 결과물이 그대로 제안서이자 강의안이 됩니다.'),
      jsonb_build_object('title', '내 도메인으로 열리는 서비스', 'body', '6주 뒤, 한 회차에 하나씩 동작하는 결과물을 쌓아 내 도메인으로 열리는 서비스 하나가 남습니다.')
    ),
    'curriculum', jsonb_build_array(
      jsonb_build_object('no', 'A 1회차', 'date', '10/2(금)', 'type', 'zoom', 'track', 'A', 'title', '기획과 화면설계', 'body', 'A코스 · AI 강의 운영 플랫폼'),
      jsonb_build_object('no', 'A 2회차', 'date', '10/9(금)', 'type', 'zoom', 'track', 'A', 'title', 'DB 연동과 파일 업로드', 'body', 'A코스 · AI 강의 운영 플랫폼'),
      jsonb_build_object('no', 'A 3회차', 'date', '10/16(금)', 'type', 'zoom', 'track', 'A', 'title', 'AI 기능 연동 · 수정방법 · 배포', 'body', 'A코스 · AI 강의 운영 플랫폼', 'milestone', true),
      jsonb_build_object('no', 'B 1회차', 'date', '10/23(금)', 'type', 'zoom', 'track', 'B', 'title', '대학/기관 AI교수법과 화면설계', 'body', 'B코스 · 기관/대학 캡스톤 프로젝트'),
      jsonb_build_object('no', 'B 2회차', 'date', '10/30(금)', 'type', 'zoom', 'track', 'B', 'title', 'AI Agent 구현', 'body', 'B코스 · 기관/대학 캡스톤 프로젝트'),
      jsonb_build_object('no', 'B 3회차', 'date', '11/6(금)', 'type', 'zoom', 'track', 'B', 'title', '배포와 도메인 연동', 'body', 'B코스 · 기관/대학 캡스톤 프로젝트', 'milestone', true)
    ),
    'operations', jsonb_build_array(
      jsonb_build_object('k', '진행 방식', 'v', '매주 금요일 20~22시 ZOOM 라이브'),
      jsonb_build_object('k', '회차 구성', 'v', '총 6회 — A코스 3회(10/2 · 10/9 · 10/16) + B코스 3회(10/23 · 10/30 · 11/6)'),
      jsonb_build_object('k', '수업 방식', 'v', '100% 같이 만들어 가는 캡스톤 방식 — 한 회차에 동작하는 결과물을 하나씩 만듭니다.'),
      jsonb_build_object('k', '질문 · 지원', 'v', '수업 외 시간에도 Q&A 사이트에서 수시로 1:1 문의할 수 있습니다.'),
      jsonb_build_object('k', '결과', 'v', '6주 뒤, 내 도메인으로 열리는 서비스 하나가 남습니다.')
    ),
    'payment', jsonb_build_object('bank', '하나은행', 'number', '215-910426-61207', 'holder', '박민욱'),
    'notices', jsonb_build_array('신청서를 남기신 뒤 위 계좌로 입금해 주시면, 입금 확인 후 수강이 확정되고 확정 안내 문자가 발송됩니다.'),
    'gallery', jsonb_build_array(
      jsonb_build_object('src', 'images/cover/cover-a.png', 'alt', 'A코스 AI 강의 운영 플랫폼 — 강의자료·사전학습 영상·질문·과제 AI평가를 담은 나만의 강의 운영 플랫폼'),
      jsonb_build_object('src', 'images/cover/cover-b.png', 'alt', 'B코스 기관/대학 캡스톤 프로젝트 — 대학과 기관이 실제로 찾는 교육 주제를 캡스톤 프로젝트로 완성')
    )
  )
)
on conflict (slug) do nothing;
