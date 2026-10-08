# irumcompany.co.kr 메인페이지 화면계획안 (Claude Code용)

Oct 8, 2026 · @Eddy's AI Chat

## 1. 개요

메인페이지를 [jocodingax.ai](https://jocodingax.ai/)처럼 '흰 여백 + 큰 타이포 + 무한 롤링 + 스크롤 등장'의 심플한 구성으로 바꾸고, 강의영역은 대표님 Canva 강의자료에서 추출한 6개 분야로 채운다.

| 항목 | 내용 |
| --- | --- |
| 대상 | [irumcompany.co.kr](https://www.irumcompany.co.kr/index.html) 메인(index.html) |
| 유지 | 서브페이지·URL, apply.html 신청 흐름, Google 로그인, 관리자, Supabase 연동(home.hero) |
| 변경 | 메인 섹션 구성, 디자인 토큰, 애니메이션, 반응형 UI |
| 구현 | Claude Code — 정적 HTML + CSS + 바닐라 JS(빌드 도구 없이), 외부 라이브러리 최소화 |
| 원칙 | 섹션당 메시지 1개, 애니메이션은 '보조'로만, prefers-reduced-motion 시 전부 정지 |

## 2. 레퍼런스 분석 — jocodingax.ai

조코딩AX파트너스 메인은 7개 섹션을 위에서 아래로 '약속 → 신뢰 → 사례 → 서비스 → 제품 → 콘텐츠 → 전환' 순서로 쌓는다. 화면 텍스트는 짧고, 움직임은 롤링과 탭 전환에 집중된다. ([출처](https://jocodingax.ai/))

| 순서 | 섹션 | 구성 | 움직임(추정) | irumcompany 적용 |
| --- | --- | --- | --- | --- |
| 0 | GNB | 흰 로고, 6개 메뉴 드롭다운, 「소개자료 받기」「문의하기」 2버튼 | 호버 시 드롭다운 펼침, 스크롤 시 배경 전환 | 5개 메뉴 + 「강의 신청」 「제안 요청」 |
| 1 | 히어로 | 이미지 5장 배경 위 2줄 대형 카피 + 1줄 서브 + 2버튼 | 배경 이미지 크로스페이드 | 강의 현장 사진 5장 크로스페이드 |
| 2 | 고객사 로고 | 20개 로고 가로 띠 | 무한 마키(좌측 흐름) | 출강 기관 로고 롤링 |
| 3 | AX 사례 | 사진 카드(태그 · 제목 · 자세히 보기) 9장 | 무한 가로 캐러셀(목록 2회 반복) | 출강 사례 카드 캐러셀 |
| 4 | AI교육과 AX구축 | 탭 3개(집체교육·퍼실리테이팅·AX올인원) + 이미지 3장 + 설명 1줄 | 탭 전환 시 이미지 교체 | 강의영역 6개 탭 |
| 5 | 프로덕트 | 탭 2개 + 실제 앱 콘솔 목업(카드 7개) | 목업 카드 등장 | 이룸 자체 도구(이룸보드·스킬갤러리) 목업 |
| 6 | 블로그 사례 | 썸네일 8장 | 무한 가로 롤링 | 인사이트·후기 롤링 |
| 7 | 무료진단 CTA | 질문형 카피 + 2버튼(기업용·개인용) | — | 「우리 기관 AI 교육, 무엇부터?」 상담 CTA |
| 8 | 푸터 · FAB | 사이트맵, 사업자 정보, SNS, 우하단 상담 버튼 | FAB 상시 노출 | 사업자 정보 + 카카오 상담 FAB |

## 3. 강의영역 분석 — Canva 강의자료 기준

최근 수정순 Canva 프레젠테이션 약 100건의 제목을 분류한 결과, 강의는 6개 분야로 묶인다. 업무자동화와 데이터분석이 가장 많고, 바이브코딩이 대표 차별점이다. 메인의 강의영역 탭은 이 6개를 그대로 쓴다.

| # | 강의영역 | Canva 근거 자료(예) | 주 대상 | 메인 카드 카피(초안) |
| --- | --- | --- | --- | --- |
| 01 | AI 업무자동화 · 스마트워크 | AI자격검정 과목3(업무 위임·반복문서·정기보고·예약운영), 강원소방학교 4일차 Gem 업무비서, 대전도시과학고 AI업무자동화, 실무엑셀과 AI스마트워크(178p), 강사업무 자동화 무료강의, CJ올리브네트웍스 AI Agent 특강 | 공공기관·기업 재직자, 교원 | 반복 업무를 대신하는 나만의 AI 비서를 만든다 |
| 02 | AI 데이터분석 · 시각화 | AI자격검정 과목4(시각화 원리·차트 실무·대시보드), 국립중앙의료원 Gemini 엑셀 대시보드, 군포 AI 데이터분석 광고전략 | 재직자, 비전공 대학생 | 엑셀 데이터를 한 화면 대시보드와 인사이트로 |
| 03 | AI 바이브코딩 · 서비스 개발 | 기초 바이브코딩의 모든 것(121p), 한양대 바이브코딩 기초, KECA WEEK3 시스템구조·PRD·첫 화면, 구글 AI 스튜디오 4H | 대학생, 비전공자, 강사 | PRD 한 장에서 실제 접속되는 서비스 URL까지 |
| 04 | AI 콘텐츠 · 마케팅 · 영상 | 군포 AI마케팅(브리프→카피→스토리보드), CapCut 첫 편집 영상, 강원소방학교 5일차 홍보영상, 국립중앙의료원 이미지·영상 콘텐츠, AI 검색 시대 소상공인 생존 전략 | 소상공인, 청년창업자, 홍보 담당자 | 브리프 한 장이 카피·영상·광고가 된다 |
| 05 | AI 문서작성 · 프롬프트 | AI자격검정 과목1(AI 작동원리·프롬프트 6요소·리서치), 과목2(업무글쓰기·보고·고객 이메일), K-뉴딜 아카데미 교안 | 신입·재직자, 공공기관 | 보고서·공문·이메일을 AI와 정확하게 |
| 06 | AI 취업 · 창업 · 사업기획 | 한림성심대 대기업반 채용 트렌드, 부산 사업개발PM(BM 설계·손익·피치·운영 시스템), 공주정보고 학생 AI 과제수행 | 취준생, 예비창업자, 고교·대학 | AI로 준비하는 채용 전형과 사업계획서 |

별도 축으로 '강사·교원 연수'(바이브코딩 교습법, KECA 전문가과정, 교원연수)가 반복된다. 이는 영역이 아니라 대상 필터(대학생 · 재직자 · 교원·강사 · 창업자)로 처리한다.

## 4. 화면 구성

메인은 9개 섹션이다. 레퍼런스의 '약속 → 신뢰 → 사례 → 서비스 → 전환' 흐름을 따르되, 프로덕트 섹션은 '모집 중 과정'으로 바꿔 B2C 신청까지 한 페이지에서 끝낸다.

| # | 섹션 · 앵커 | 레이아웃(데스크톱 / 모바일) | 콘텐츠 | DB 키 |
| --- | --- | --- | --- | --- |
| 0 | GNB | 좌 로고 · 중 메뉴 5 · 우 버튼 2 / 로고 + 햄버거 | 강의영역 · 출강사례 · 모집과정 · 인사이트 · 회사소개, 「제안 요청」 「강의 신청」 | — |
| 1 | Hero `#top` | 풀스크린, 배경 사진 5장 위 중앙 정렬 카피 / 동일, 카피 2줄 축소 | H1 2줄 + 서브 2줄 + 버튼 2(기관 제안 요청 · 모집 과정 보기) | home.hero (연동 완료) |
| 2 | 신뢰 로고 `#clients` | 1줄 무한 마키, 로고 흑백 → 호버 컬러 / 동일 | 서울시립대 · 건강보험심사평가원 · 한국전력공사 · 국립중앙의료원 · 강원소방학교 · 한양대 · CJ올리브네트웍스 · 군포청년창업센터 등 | home.clients |
| 3 | 출강 사례 `#cases` | 제목 + 「전체보기 →」 / 사진 카드 무한 가로 캐러셀(카드 폭 360px) / 카드 폭 280px, 스와이프 | 카드: 사진 · 태그 2개(기관유형 · 영역) · 제목 · 「자세히 보기 →」 | home.cases |
| 4 | 강의영역 `#areas` | 좌 탭 6개(세로) + 우 이미지 3장 + 설명 1줄 / 탭이 가로 칩 스크롤로 전환 | 3장의 6개 영역, 탭마다 대표 강의 3개와 산출물 | home.areas |
| 5 | 숫자로 보는 이룸 `#stats` | 4칸 카운트업 / 2×2 | 11년+ SK텔레콤 · 50곳+ 출강 기관 · 22개교 대학 · 30개+ AI Skill | home.stats |
| 6 | 모집 중 과정 `#courses` | 카드 2\~3장 가로 / 세로 스택 | AI 캡스톤 B코스(10/23 개강 · 모집중), A코스(진행중), 다음 기수 알림 | home.courses |
| 7 | 인사이트 `#insight` | 썸네일 무한 롤링(역방향) / 스와이프 | ax 웹진 기사 · 현장 르포 · 블로그 | home.insights |
| 8 | CTA `#contact` | 질문형 대형 카피 + 버튼 2 / 버튼 세로 | 「우리 기관 AI 교육, 무엇부터 할까요?」 · 기관 제안 요청 · 개인 수강 신청 | home.cta |
| 9 | Footer + FAB | 사이트맵 4열 · 사업자 정보 · SNS / 아코디언 | 패밀리 사이트(ax 웹진 · KECA · 올에듀잇), 우하단 상담 FAB | settings.footer |

## 5. 애니메이션 명세

모든 효과는 CSS transform·opacity만 사용하고(GPU 처리), 스크롤 등장은 IntersectionObserver 하나로 통일한다. `prefers-reduced-motion: reduce`이면 전부 즉시 표시·정지한다.

| 대상 | 효과 | 트리거 | 시간 · 이징 | 구현 |
| --- | --- | --- | --- | --- |
| GNB | 투명 → 흰 배경 + 그림자, 높이 80 → 64px | scrollY > 40 | 250ms ease | `.is-scrolled` 클래스 토글 |
| Hero 배경 | 5장 크로스페이드 + 1.0 → 1.06 줌(Ken Burns) | 로드 후 자동, 6초 간격 | 1.2s 페이드, 6s 줌 linear | CSS `@keyframes` + JS 인덱스 순환 |
| Hero 카피 | 줄 단위 아래→위 등장(fade-up 24px) | 로드 | 600ms, 줄 간격 120ms, cubic-bezier(.2,.7,.2,1) | `--delay` 변수 |
| 로고 마키 | 좌측 무한 흐름, 호버 시 일시정지 | 상시 | 40s linear infinite | 목록 2회 복제 + `translateX(-50%)` |
| 사례 캐러셀 | 좌측 무한 흐름, 호버·포커스 시 정지, 카드 호버 시 이미지 1.04 확대 | 상시 | 60s linear / 300ms | 마키와 동일 구조 |
| 섹션 제목·본문 | fade-up 32px | 뷰포트 20% 진입(1회) | 700ms | `[data-reveal]` + IO |
| 카드 그리드 | 순차 등장(stagger) | 뷰포트 진입 | 카드당 80ms 지연 | `[data-reveal-stagger]` |
| 강의영역 탭 | 탭 밑줄 슬라이드, 이미지 3장 크로스페이드 + 8px 상승 | 클릭·키보드 | 400ms | `aria-selected` 전환 |
| 숫자 카운트업 | 0 → 목표값 | 뷰포트 진입(1회) | 1.6s easeOutCubic | `requestAnimationFrame` |
| 버튼 | 화살표 4px 이동, 배경 살짝 밝아짐 | 호버·포커스 | 200ms | CSS만 |
| 인사이트 롤링 | 우측(역방향) 무한 흐름 | 상시 | 50s linear | 마키 재사용 |
| FAB | 스크롤 600px 이후 등장, 3초 후 말풍선 표시 | 스크롤 | 300ms | 클래스 토글 |

## 6. 디자인 토큰 · 컴포넌트

레퍼런스처럼 흰 바탕에 검정 타이포를 기본으로 하고, 포인트 컬러는 1개만 쓴다. 이룸 네이비(ax 웹진 #0E1626)를 다크 섹션에 써서 두 사이트를 같은 브랜드로 묶는다.

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| --bg | #FFFFFF | 기본 배경 |
| --bg-soft | #F5F6F8 | 교차 섹션 배경 |
| --ink | #111418 | 제목·본문 |
| --ink-sub | #5B6270 | 보조 텍스트 |
| --line | #E4E7EC | 구분선·카드 테두리 |
| --navy | #0E1626 | Hero 오버레이, CTA·푸터 배경 |
| --accent | #3B5BFD (대표님 확정 필요) | 버튼·탭 밑줄·배지 |
| --radius | 16px 카드 · 999px 버튼 | 둥근 모서리 |
| --shadow | 0 8px 24px rgba(17,20,24,.08) | 카드 호버 |
| --font | Pretendard Variable, system-ui | 전체 |
| --fs-hero | clamp(36px, 6vw, 72px) / 800 / 1.15 | H1 |
| --fs-h2 | clamp(28px, 3.6vw, 44px) / 700 | 섹션 제목 |
| --fs-body | 17px / 1.7 | 본문 |
| --container | 1200px, 좌우 24px | 콘텐츠 폭 |
| --section-y | clamp(80px, 12vw, 160px) | 섹션 상하 여백 |

공통 컴포넌트: `Button(primary·ghost·arrow)`, `Marquee(direction, speed)`, `CaseCard`, `AreaTabs`, `StatCounter`, `CourseCard(status 배지)`, `SectionHeader(eyebrow · title · link)`, `Fab`.

## 7. Claude Code 구현 지시서

Claude Code에는 한 번에 전부가 아니라 4단계로 나눠 넣고, 단계마다 브라우저로 확인한 뒤 다음으로 넘어간다. 먼저 이 계획안을 저장소에 `docs/main-redesign.md`로 저장해 Claude Code가 계속 참조하게 한다.

**파일 구조**

```
/index.html                 # 메인 (섹션 마크업 + 폴백 문구)
/assets/css/tokens.css      # 6장 토큰
/assets/css/main.css        # 섹션·컴포넌트 스타일
/assets/js/motion.js        # reveal · stagger · marquee · countup · hero fade
/assets/js/content.js       # Supabase site_content 조회 → 섹션 렌더
/assets/img/hero/*.webp     # 히어로 5장 (1920px, 200KB 이하)
/assets/img/clients/*.svg   # 기관 로고
/assets/img/cases/*.webp    # 출강 사례 사진
/index_backup_20261008.html # 기존 메인 백업
```

**1단계 — 기반 (토큰 · GNB · Hero)**

```
docs/main-redesign.md 를 읽고 1단계만 진행해.
- 기존 index.html 을 index_backup_20261008.html 로 백업
- 6장 토큰으로 tokens.css 작성, Pretendard Variable 적용
- GNB(스크롤 시 .is-scrolled, 모바일 햄버거 드로어)와 Hero(배경 5장 크로스페이드 + Ken Burns, 카피 줄 단위 fade-up)
- Hero 타이틀·서브는 기존 Supabase home.hero 연동 로직을 유지
- 외부 애니메이션 라이브러리 금지, prefers-reduced-motion 대응
- 끝나면 375/768/1280px 스크린샷으로 확인해줘
```

**2단계 — 섹션 마크업 (2\~9번)**

```
4장 표의 2~9번 섹션을 순서대로 만들어. 문구는 계획안 3·4장 내용으로 HTML에 직접 넣고(폴백), 이미지가 없는 곳은 회색 placeholder 로 둬.
- 강의영역 탭은 role=tablist / tab / tabpanel, 방향키 이동 지원
- 모집 과정 카드의 신청 버튼은 html/apply.html 로 연결
```

**3단계 — 모션**

```
5장 애니메이션 명세표를 motion.js 하나로 구현해.
- data-reveal, data-reveal-stagger, data-marquee(direction, speed), data-countup 속성 기반
- IntersectionObserver 1개 재사용, 마키는 목록 복제 + translateX(-50%)
- 호버·포커스 시 마키 정지, 탭 비활성 시(visibilitychange) 히어로 타이머 정지
```

**4단계 — DB 연동**

```
4장 표의 DB 키(home.clients, home.cases, home.areas, home.stats, home.courses, home.insights, home.cta, settings.footer)를 site_content 에 만들고 현재 HTML 문구를 초기값으로 넣어.
- content.js 가 페이지 로드 시 한 번에 조회해서 렌더, 실패 시 HTML 폴백 유지
- 텍스트는 이스케이프, anon 은 SELECT 만. RLS·스키마 변경 SQL 은 실행 전에 보여줘
- irumcomanysite MCP 의 허용 키 목록에 위 키 추가
```

## 8. QA · 결정 필요 사항

**착수 전 결정**

- [ ] 포인트 컬러(--accent) 확정 — 블루 계열 초안 또는 이룸 브랜드 컬러
- [ ] Hero 사진 5장과 출강 사례 사진(기관 노출 동의 여부 포함)
- [ ] 로고 마키에 넣을 기관 목록과 로고 사용 가능 여부
- [ ] 메인 성격: 기관 제안(B2B) 중심 vs 개인 수강(B2C) 중심 — 버튼 우선순위가 달라짐

**완료 검증**

- [ ] 375 / 768 / 1280px에서 레이아웃·마키·탭 정상, 가로 스크롤 없음
- [ ] reduced-motion 설정 시 모든 애니메이션 정지
- [ ] 키보드만으로 GNB·탭·캐러셀 조작, 포커스 표시 보임
- [ ] Lighthouse 성능 90+ · 접근성 95+, Hero LCP 2.5초 이내
- [ ] MCP로 home.areas 문구 수정 → 새로고침 후 반영
- [ ] DB 조회 실패 시 폴백 문구 표시
- [ ] apply.html 신청 흐름·Google 로그인 정상, 지난 과정 문구(8.15·48시간·쪼앤미) 0건

---

## 9. 현재 사이트 적용 메모 (2026-10-08 구현 기준)

이 계획안은 이미 배포된 구조(다중 과정 카탈로그·과정 상세·신청·MCP) 위에 다음과 같이 조정해 구현했다.

| 계획안 | 구현 |
| --- | --- |
| `/assets/…` 경로 | 기존 `css/ js/ images/` 사용. 신규 `css/main-home.css`, `js/motion.js`, `js/content.js`, `html/inquiry.html` |
| tokens.css 신규 | 기존 `css/tokens.css` 값을 6장 토큰으로 교체(서브페이지도 같은 톤) |
| 6번 `home.courses` | 만들지 않음. 모집·진행 중 과정은 `site_programs`(`js/programs.js`·`js/catalog.js`)가 원본 |
| 5번 `home.stats` | 기존 `home.metrics` 재사용 |
| 푸터 `settings.footer` | `site_settings.footer` 에 선택 필드 `kakao_url`, `sns[]` 추가 |
| 제안 요청 버튼 | 신규 `html/inquiry.html` → `site_applications`(기관·워크샵) / `site_inquiries`(일반·다음 기수 알림) |
| 신청방법·강사·FAQ | 신청방법은 `#courses` 안으로, 강사·FAQ 는 값(`home.instructor`/`home.faq`)이 있을 때만 표시 |
| 숫자 11년·50곳·22개교·30개+ | 사실 확인 전까지 비공개(`home.metrics` 값을 넣으면 표시) |

값이 없는 섹션(`#clients` `#cases` `#stats` `#insight` `#instructor` `#faq`)은 숨겨지고, 값이 생기면 자동으로 나타나며 상단 메뉴에도 반영된다.
