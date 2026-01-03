# Irum Academy

HTML + JavaScript + CSS 기반 온라인 강의 플랫폼

## 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **Styling**: Custom CSS
- **JavaScript Libraries**: jQuery
- **Icons**: Emoji & Unicode
- **Font**: Noto Sans KR (Google Fonts)

## 프로젝트 구조

```
irumacademy/
├── html/                    # HTML 페이지
│   ├── index.html           # 홈 페이지
│   ├── courses.html         # 강의 목록
│   ├── courses/             # 강의 상세 페이지
│   ├── instructor-growth.html # 강사 성장 프로그램
│   ├── apply.html           # 강의 신청
│   ├── community.html       # 커뮤니티
│   └── auth/                # 인증 페이지
├── css/                     # 스타일시트
│   ├── main.css            # 메인 스타일
│   └── animations.css      # 애니메이션
├── js/                      # JavaScript 파일
│   ├── main.js             # 메인 스크립트
│   ├── components.js       # 컴포넌트 생성
│   ├── courses.js          # 강의 관련
│   ├── courses-data.js     # 강의 데이터
│   └── animations.js       # 애니메이션
├── data/                    # 데이터 파일
│   └── courses.json        # 강의 데이터
└── images/                  # 이미지 파일
```

## 주요 기능

### 페이지

- `/html/index.html` - 홈
- `/html/courses.html` - 강의 목록
- `/html/courses/[course-name].html` - 강의 상세
- `/html/instructor-growth.html` - 강사 성장 프로그램
- `/html/apply.html` - 강의 신청 (결제 기능 포함)
- `/html/pay/checkout.html` - 결제 페이지
- `/html/pay/success.html` - 결제 성공 페이지
- `/html/pay/fail.html` - 결제 실패 페이지
- `/html/community.html` - 커뮤니티
- `/html/auth/login.html` - 로그인
- `/html/auth/signup.html` - 회원가입

### 결제 시스템

- **토스페이먼츠 결제 연동**: 카드 결제 지원
- **가격 변조 방지**: 서버에서 결제 금액 검증
- **결제 승인 API**: 서버 사이드 결제 승인 처리
- **웹훅 지원**: 결제 상태 변경 자동 처리

자세한 내용은 [토스페이먼츠_결제_연동_가이드.md](./토스페이먼츠_결제_연동_가이드.md)를 참고하세요.

### 주요 기능

- 반응형 디자인
- 동적 콘텐츠 로딩
- 스크롤 애니메이션
- 강의 상세 정보 표시
- 커뮤니티 기능

## 사용 방법

### 로컬 개발 환경

1. 의존성 설치
```bash
npm install
```

2. 환경 변수 설정
```bash
cp .env.example .env
# .env 파일을 편집하여 필요한 설정 추가
```

3. 서버 실행
```bash
npm start
# 또는 개발 모드
npm run dev
```

4. 브라우저에서 접속
```
http://localhost:3000
```

### 프로덕션 배포

1. 환경 변수 설정 (운영용 키 사용)
2. 서버 실행
3. HTTPS 설정 (결제 기능 사용 시 필수)

## 스타일링

### CSS 구조

- `main.css`: 전역 스타일, 레이아웃, 컴포넌트 스타일
- `animations.css`: 애니메이션 효과

### 반응형 디자인

모바일 우선 접근 방식으로 구현되어 있습니다.

## 접근성

- 시맨틱 HTML 사용
- 키보드 네비게이션 지원
- 반응형 디자인

## 라이선스

MIT
