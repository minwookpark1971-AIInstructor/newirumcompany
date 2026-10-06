# site-mcp — 채팅으로 사이트 편집하는 원격 MCP

Claude 커스텀 커넥터에 **URL 하나**만 넣으면 연결된다. 인증은 OAuth(Supabase Auth)이고,
호출은 로그인한 **관리자 본인의 토큰**으로 이뤄져 RLS 가 그대로 적용된다(서비스 롤 키 미사용).

```
https://tdayexcmksjfryhthyfz.supabase.co/functions/v1/site-mcp
```

## 1회 설정 (대시보드 — 코드로는 불가)

1. **Authentication → OAuth Server** 에서 활성화 (Beta).
   - Authorization path(동의 화면): `/html/oauth-consent.html`
   - **Dynamic client registration 허용** (Claude 커넥터가 스스로 클라이언트를 등록함)
2. **Authentication → URL Configuration → Site URL / Redirect URLs** 에 동의 화면이 호스팅되는 주소 등록
   (현재 이 저장소 배포: `https://minwookpark1971-aiinstructor.github.io/newirumcompany`).
   ⚠ 이 프로젝트는 회원 수강신청 시스템과 **Auth 를 공유**한다. Site URL 을 바꾸지 말고 Redirect URLs 에 **추가**만 할 것.
3. 관리자 등록: 사용자를 만든 뒤 `public.admins` 에 `user_id` 추가 (SQL Editor).
   ```sql
   insert into public.admins (user_id, note) values ('<auth.users.id>', 'site editor');
   ```

## 배포

```bash
supabase functions deploy site-mcp --no-verify-jwt --project-ref tdayexcmksjfryhthyfz
```

`--no-verify-jwt` 인 이유: 401 챌린지(`WWW-Authenticate`)와 OAuth 메타데이터를 인증 전에 내려줘야 하기 때문.
토큰 검증은 함수 안에서 `auth.getUser()` + `public.is_admin()` 으로 수행한다.

## 연결

Claude(웹/데스크톱) → 설정 → 커넥터 → 커스텀 커넥터 추가 → 위 URL 입력 → 브라우저에서 관리자 로그인·승인.

## 도구

`site_overview`, `get_content`, `set_content`, `list_courses`, `upsert_course`, `set_course_groups`,
`list_applications`, `update_application_status`, `list_inquiries`, `update_inquiry_status`, `list_revisions`, `rollback`.
모든 변경은 `site_revisions` 에 기록되며 `rollback` 또는 관리자 화면의 "사이트 편집" 탭에서 되돌린다.

## 한계

- 레이아웃·디자인·새 페이지는 DB 콘텐츠가 아니라 코드 수정이므로 이 MCP 범위 밖(Claude Code 로 처리).
- 프로그램 상세 페이지(`html/courses/*.html`)의 커리큘럼/산출물은 아직 정적 파일.
