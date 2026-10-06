-- 0002_site_content.sql
-- 이 사이트(newirumcompany) 전용 테이블. 모두 site_ 접두어 — 같은 프로젝트의
-- 회원 수강신청 시스템(applications, courses, profiles …)과 충돌하지 않는다.
--
-- 전제(라이브 DB 에 이미 존재, 변경하지 않음):
--   public.admins(user_id)  /  private.is_admin()
-- 읽기: 콘텐츠는 누구나. 쓰기·신청/문의 조회: private.is_admin() 만.

-- ── 콘텐츠 ──────────────────────────────────────────────────
create table if not exists public.site_content (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.site_courses (
  slug text primary key,
  title text not null,
  category text not null,
  price integer not null check (price >= 0),
  short_description text not null,
  duration_label text not null,
  format_label text not null,
  tools text[] not null default '{}',
  sort_order integer not null default 0,
  published boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.site_course_groups (
  id serial primary key,
  title text not null,
  description text not null default '',
  slugs text[] not null default '{}',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.site_revisions (
  id bigserial primary key,
  table_name text not null,
  row_key text not null,
  old_value jsonb,
  new_value jsonb,
  changed_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists site_revisions_lookup
  on public.site_revisions (table_name, row_key, created_at desc);

-- ── 신청 / 문의 (익명 INSERT, 관리자 조회) ───────────────────
create table if not exists public.site_applications (
  id uuid primary key default gen_random_uuid(),
  track text not null check (track in ('institution','workshop')),
  org_name text check (char_length(org_name) <= 200),
  contact_name text not null check (char_length(contact_name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (char_length(phone) <= 50),
  program_slug text check (char_length(program_slug) <= 100),
  headcount integer check (headcount is null or headcount between 1 and 100000),
  preferred_date text check (char_length(preferred_date) <= 200),
  message text check (char_length(message) <= 5000),
  status text not null default 'new' check (status in ('new','contacted','done')),
  created_at timestamptz not null default now()
);

create table if not exists public.site_inquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  email text not null check (char_length(email) between 3 and 254),
  category text not null default 'general'
    check (category in ('general','institution','workshop','partnership')),
  message text not null check (char_length(message) between 1 and 5000),
  status text not null default 'new' check (status in ('new','contacted','done')),
  created_at timestamptz not null default now()
);

-- ── 감사/리비전 트리거 ──────────────────────────────────────
create or replace function public.site_touch_and_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if tg_op = 'DELETE' then
    k := coalesce(to_jsonb(old)->>'key', to_jsonb(old)->>'slug', to_jsonb(old)->>'id');
    insert into public.site_revisions(table_name, row_key, old_value, new_value, changed_by)
    values (tg_table_name, k, to_jsonb(old), null, auth.uid());
    return old;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  k := coalesce(to_jsonb(new)->>'key', to_jsonb(new)->>'slug', to_jsonb(new)->>'id');
  insert into public.site_revisions(table_name, row_key, old_value, new_value, changed_by)
  values (tg_table_name, k,
          case when tg_op = 'UPDATE' then to_jsonb(old) end,
          to_jsonb(new), auth.uid());
  return new;
end;
$$;
revoke all on function public.site_touch_and_log() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['site_content','site_settings','site_courses','site_course_groups'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_log', t);
    execute format(
      'create trigger %I before insert or update or delete on public.%I
       for each row execute function public.site_touch_and_log()', t || '_log', t);
  end loop;
end $$;

-- ── RLS ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['site_content','site_settings','site_courses','site_course_groups'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)',
                   t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using ((select private.is_admin())) with check ((select private.is_admin()))',
                   t || '_admin_write', t);
  end loop;
end $$;

alter table public.site_revisions enable row level security;
drop policy if exists site_revisions_admin_read on public.site_revisions;
create policy site_revisions_admin_read on public.site_revisions
  for select to authenticated using ((select private.is_admin()));

alter table public.site_applications enable row level security;
drop policy if exists site_applications_anon_insert on public.site_applications;
create policy site_applications_anon_insert on public.site_applications
  for insert to anon, authenticated with check (status = 'new');
drop policy if exists site_applications_admin_read on public.site_applications;
create policy site_applications_admin_read on public.site_applications
  for select to authenticated using ((select private.is_admin()));
drop policy if exists site_applications_admin_update on public.site_applications;
create policy site_applications_admin_update on public.site_applications
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

alter table public.site_inquiries enable row level security;
drop policy if exists site_inquiries_anon_insert on public.site_inquiries;
create policy site_inquiries_anon_insert on public.site_inquiries
  for insert to anon, authenticated with check (status = 'new');
drop policy if exists site_inquiries_admin_read on public.site_inquiries;
create policy site_inquiries_admin_read on public.site_inquiries
  for select to authenticated using ((select private.is_admin()));
drop policy if exists site_inquiries_admin_update on public.site_inquiries;
create policy site_inquiries_admin_update on public.site_inquiries
  for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ── 시드: 기존 정적 콘텐츠 이관 ─────────────────────────────
insert into public.site_courses (slug,title,category,price,short_description,duration_label,format_label,tools,sort_order) values
('marketing-ai','AI 마케팅 실무','마케팅',550000,'AI 도구를 활용한 마케팅 전략 수립부터 실행까지, 실무에 바로 적용 가능한 마케팅 역량을 강화합니다.','6주','온라인 실시간 + 과제','{ChatGPT,Claude,GA4,Make.com,Canva,Midjourney}',1),
('planning-ai','AI 기획 실무','기획',500000,'AI를 활용한 기획 프로세스부터 실행까지, 체계적인 기획 역량을 강화하고 실무에 바로 적용할 수 있는 스킬을 습득합니다.','5주','온라인 실시간 + 프로젝트','{ChatGPT,Claude,Notion,Figma,Miro}',2),
('dev-ai','AI 개발 실무','개발',600000,'AI 도구를 활용한 개발 프로세스 최적화부터 코드 생성, 테스트 자동화까지 실무 개발 역량을 강화합니다.','6주','온라인 실시간 + 실습','{ChatGPT,"GitHub Copilot",Cursor,Git,"VS Code",Postman}',3),
('design-ai','AI 디자인 실무','디자인',500000,'AI 도구를 활용한 디자인 프로세스부터 자동화까지, 창의적이고 효율적인 디자인 역량을 강화합니다.','5주','온라인 실시간 + 포트폴리오','{Midjourney,DALL-E,Figma,"Adobe Firefly",Canva,ChatGPT}',4),
('sales-ai','AI 영업 실무','영업실무',450000,'AI를 활용한 영업 프로세스 최적화부터 고객 관리까지, 영업 성과를 극대화하는 실무 역량을 강화합니다.','5주','온라인 실시간 + 롤플레이','{ChatGPT,Claude,CRM,Make.com,LinkedIn,Zoom}',5),
('hr-ai','AI 인사행정 실무','인사행정',450000,'AI를 활용한 인사 프로세스 최적화부터 채용, 평가, 개발까지 HR 실무 역량을 강화합니다.','5주','온라인 실시간 + 케이스 스터디','{ChatGPT,HRIS,ATS,Make.com,Excel,"Power BI"}',6),
('job-bootcamp','공기업 사기업 취업특강','취업특강',400000,'2026년 공기업과 사기업의 높아진 문턱에 맞는 새로운 전략과 과거의 성공적인 취업 노하우를 제공합니다.','6주','온라인 실시간 + 멘토링','{ChatGPT,LinkedIn,Notion,Canva,Zoom}',7),
('career-ai','AI 취업 특강: 6시간에 끝내는 취업 전략','취업',200000,'AI·ATS 시대, 이력서부터 면접까지 한번에 끝내는 실전 취업 전략. AI를 활용해 서류 합격률을 높이고 면접을 완벽하게 대비하세요.','6시간','원데이 특강','{ChatGPT,Claude,ATS,Notion}',8),
('employee-ai','기업재직자 AI경쟁력 강화','실무 역량',800000,'기업의 디지털 전환 시대, AI 도구를 활용한 실무 생산성 향상과 업무 자동화를 통해 재직자의 핵심 경쟁력을 강화하는 맞춤형 교육 프로그램입니다.','8시간 (1일 집중과정) 또는 4시간 × 2일','이론 40% + 실습 60%','{ChatGPT,Claude,Notion,Gamma}',9)
on conflict (slug) do nothing;

insert into public.site_course_groups (title,description,slugs,sort_order)
select * from (values
  ('직무 실무형','직무별 업무에 AI를 바로 적용하는 실습 중심 과정','{marketing-ai,planning-ai,dev-ai,design-ai,sales-ai,hr-ai}'::text[],1),
  ('취업·진로형','AI·ATS 시대의 취업 전략을 다루는 학생·구직자 대상 과정','{career-ai,job-bootcamp}'::text[],2),
  ('재직자형','재직자의 생산성과 업무 자동화 역량을 높이는 과정','{employee-ai}'::text[],3)
) v(title,description,slugs,sort_order)
where not exists (select 1 from public.site_course_groups);

insert into public.site_content (key,value) values
('home.hero', '{"title":"AI 리터러시를 넘어,\n경쟁력이 되는 실무교육","subtitle":"이룸아카데미는 대학·기관 맞춤 AI 교육과\n강사를 위한 집중 워크샵을 만듭니다."}'::jsonb),
('home.tracks', '[{"label":"FOR UNIVERSITIES & ORGANIZATIONS","title":"대학·기관 교육","body":"대학, 공공기관, 기업을 위한 맞춤형 AI 실무 교육. 직무별 9개 프로그램을 출강·온라인·혼합으로 운영합니다.","cta":"프로그램 보기 →","href":"html/programs.html"},{"label":"FOR INSTRUCTORS","title":"강사 워크샵","body":"강사를 위한 집중교육 워크샵. 콘텐츠 설계부터 실습 운영, 브랜딩까지 강의력을 완성합니다.","cta":"워크샵 보기 →","href":"html/workshop.html"}]'::jsonb),
('home.features', '{"title":"왜 이룸아카데미인가","items":[{"title":"실습 중심","body":"이론이 아닌 실무 — ChatGPT, Claude, Make.com 등 최신 AI 도구를 직접 다루는 실습 위주 커리큘럼."},{"title":"맞춤 설계","body":"기관의 목적·대상·일정에 맞춰 시간, 난이도, 실습 비중을 조정한 맞춤형 교육을 설계합니다."},{"title":"현업 강사진","body":"AI 실무와 강의 경험을 겸비한 현업 전문가들이 직접 교육을 진행합니다."}]}'::jsonb),
('home.process', '{"title":"진행 프로세스","subtitle":"신청부터 교육까지, 간단한 3단계로 진행됩니다.","steps":[{"title":"신청·상담","body":"신청서를 남겨주시면 담당자가 1~2일 내 연락드립니다."},{"title":"맞춤 설계·견적","body":"목적과 일정에 맞춘 커리큘럼과 견적을 제안드립니다."},{"title":"교육 진행·결과 보고","body":"교육 후 만족도와 성과를 정리해 보고드립니다."}]}'::jsonb)
on conflict (key) do nothing;
