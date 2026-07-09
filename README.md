# Irum Academy (이룸아카데미)

대학·기관 맞춤 AI 실무교육과 강사 집중 워크샵을 위한 정적 웹사이트.
2026년 7월 미니멀 개편 — 두 트랙(대학·기관 / 강사 워크샵) 중심 구조.

## 기술 스택

- **Frontend**: 정적 HTML + CSS + JavaScript (신규 코드는 vanilla JS, 레거시 상세 페이지만 jQuery)
- **Font**: Pretendard (CDN)
- **Backend**: Supabase (신청·문의 저장, 관리자 인증) — 별도 서버 없음
- **배포**: 정적 호스팅 (GitHub Pages / Vercel 등)

## 사이트 구조

```
index.html                     # 홈 — 두 트랙 분기 허브
html/
├── programs.html              # 대학·기관 교육 (프로그램 카탈로그 9개, 3그룹)
├── courses/*.html             # 프로그램 상세 9개
├── workshop.html              # 강사 집중교육 워크샵
├── apply.html                 # 교육 신청 폼 (track=institution|workshop)
├── contact.html               # 문의 폼
├── admin.html                 # 관리자 (Supabase Auth 로그인, 신청/문의 조회)
├── privacy.html / terms.html
css/  main.css, animations.css
js/
├── components.js              # 헤더/푸터 생성 (전 페이지 공용, vanilla)
├── supabase-client.js         # Supabase 클라이언트 + 제출 헬퍼
├── courses-data.js            # 프로그램 데이터 (단일 소스)
├── main.js, animations.js     # 레거시 상세 페이지용 (jQuery)
docs/archive/                  # 과거 점검 보고서 아카이브
```

## 데이터 흐름

- 방문자가 `apply.html`/`contact.html` 폼 제출 → Supabase `applications`/`inquiries` 테이블에 INSERT
- RLS 정책: 익명(anon)은 INSERT만 가능, 조회 불가. 인증된 관리자만 SELECT/UPDATE
- 관리자는 `html/admin.html`에서 로그인 후 신청/문의 조회, 상태 변경(신규→연락함→완료), CSV 내보내기

### Supabase

- 프로젝트: `irum-academy` (ap-northeast-2)
- URL/publishable key는 `js/supabase-client.js`에 있음 (공개 가능 — 보안은 RLS로 담보)
- 관리자 계정: Supabase 대시보드 → Authentication → Users에서 생성

## 로컬 실행

```bash
npx http-server -p 3999 .
# http://localhost:3999
```
