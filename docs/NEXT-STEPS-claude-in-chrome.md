# 내일 할 일 — Claude in Chrome 프롬프트 (site-mcp 연결 마무리)

> 상태 요약: OAuth 서버 ON, 앱 `claude-site-editor` 생성됨, `site-mcp` 함수 배포됨, 동의 화면 라이브.
> 남은 것: Claude 커스텀 커넥터(rumcomanysite)에 OAuth Client ID/Secret 입력 → 연결 → 승인.
> 시크릿은 채팅/문서에 절대 붙여넣지 않는다. 비밀번호·시크릿 입력은 사용자가 직접 한다.

---

## 프롬프트 A — Supabase에서 Client ID 확인 + 시크릿 재발급 가능 여부 (읽기 위주)

```
Supabase 대시보드(https://supabase.com/dashboard/project/tdayexcmksjfryhthyfz)에서 아래만 해줘.
이 프로젝트의 Auth는 다른 회원 시스템과 공유하니까 지시하지 않은 설정은 절대 바꾸지 마.
로그인·비밀번호 입력 화면이 나오면 멈추고 나한테 알려줘.

1. Authentication > OAuth Apps에서 앱 "claude-site-editor"를 열어,
   - Client ID가 화면에 보이는지, Client Secret을 다시 볼 수 있는지/재발급(regenerate) 메뉴가 있는지만 알려줘.
   - Client ID와 Secret 값은 채팅에 쓰지 말고 화면에 그대로 둬. 내가 직접 복사할 거야.
2. 시크릿 재발급 메뉴가 있으면 "있다"고만 알려주고, 누르지는 마. 내가 확인하고 직접 누를게.
3. Authentication > Users에서 사용자 목록의 이메일만 읽어서 알려줘(수정 금지).
   그중 어느 계정이 관리자인지는 모르니 추측하지 말고 목록만 보고해줘.
4. 앱의 Redirect URI가 https://claude.ai/api/mcp/auth_callback 인지 확인만 해줘.
```

## 프롬프트 B — Claude 커넥터 편집 화면까지 안내 (입력은 사용자가 직접)

```
Claude 웹(https://claude.ai) 설정 > 커넥터에서 커스텀 커넥터 "rumcomanysite"의 편집 화면까지만 열어줘.
- 고급 설정(Advanced settings)을 펼쳐서 OAuth Client ID / Client Secret 입력란이 있는지만 알려줘.
- 입력란에 값을 쓰지는 마. 내가 직접 붙여넣을게.
- 입력란이 없다면 화면에 보이는 입력란 이름과 버튼을 그대로 적어서 알려줘.
```

## 사용자가 직접 할 일

1. 프롬프트 A 결과 화면에서 **Client ID(와 Secret)** 를 복사한다.
2. 커넥터 편집 화면(프롬프트 B)에 직접 붙여넣고 저장 → **연결** → 브라우저 승인 화면에서 관리자 로그인 → `claude-site-editor` 확인 후 **승인**.
3. 채팅에서 "사이트 편집 현황 보여줘"로 첫 도구 호출 시험.
4. 오류가 나면 문구를 그대로 Claude Code에게 알려주기.

## Claude Code(이 세션)가 이어서 할 일 — 브라우저 불필요

- `feat/site-content-mcp` 브랜치 푸시 + PR (사이트 DB 연동, 관리자 편집 탭)
- 연결 후 MCP 도구 end-to-end 시험(문구 변경 → 확인 → rollback)
- 관리자 편집 탭 저장 동작 확인(관리자 로그인 필요)
