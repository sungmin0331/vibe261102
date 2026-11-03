# DemoWeb 게시판

Next.js(App Router) + TypeScript + shadcn/ui로 만든 웹 게시판 데모입니다. 데이터는 [Neon](https://neon.tech)(PostgreSQL)에 저장하며, DB 연결 정보가 없으면 로컬 JSON 파일로 대신 실행됩니다.

## 기능

- 회원가입(아이디·이름·비밀번호)과 로그인/로그아웃
- 관리자 회원 관리(`/admin`): 가입 승인·거절, 승인 취소, 관리자 지정·해제
- 글·댓글 작성은 승인된 회원만, 수정·삭제는 작성자 본인이나 관리자만 가능 (읽기는 누구나)
- 게시글 목록: 번호·제목(댓글 수)·작성자·작성일·조회수, 10개씩 페이지네이션
- 검색: 제목+내용 / 제목 / 내용 (검색 조건은 URL에 남아 새로고침·공유해도 유지)
- 게시글 상세(열 때 조회수 증가), 작성, 수정, 삭제(확인 다이얼로그)
- 게시글별 댓글 작성/삭제(삭제 확인 다이얼로그)
- 반응형 레이아웃: 넓은 화면은 표, 좁은 화면은 카드형 목록
- 라이트 / 다크 / 시스템 테마 전환
- 첫 실행 시 테이블을 만들고 샘플 게시글 23개와 댓글 10개를 자동으로 시드

## 실행 방법

Node.js 20.9 이상이 필요합니다. (개발 시 Node 24, npm 11에서 확인)

```bash
cd DemoWeb
npm install
cp .env.example .env.local   # DATABASE_URL에 Neon 연결 문자열 입력
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 포트를 바꾸려면 `npm run dev -- --port 5176`처럼 실행합니다.

Claude 데스크톱 앱의 미리보기에서는 저장소 루트 `.claude/launch.json`의 `demoweb` 설정(포트 5176)을 사용합니다.

### 프로덕션 빌드

```bash
npm run build
npm run start
```

### 린트

```bash
npm run lint
```

## 회원과 관리자

1. `/signup`에서 가입 신청하면 `승인 대기` 상태가 되고, 관리자가 승인해야 로그인할 수 있습니다.
2. 관리자는 오른쪽 위 계정 메뉴 → `회원 관리`(`/admin`)에서 신청을 승인·거절하고, 다른 회원을 관리자로 지정할 수 있습니다. 승인 대기 중인 신청이 있으면 계정 메뉴에 빨간 점이 표시됩니다.
3. 첫 관리자는 가입 신청 후 명령으로 지정합니다. (`.env.local`의 DB에 적용됩니다)

```bash
npm run set-admin -- <아이디>
```

메뉴 구성(오른쪽 위 계정 메뉴):

| 메뉴        | 주소           | 대상      | 내용                                                                                    |
| ----------- | -------------- | --------- | --------------------------------------------------------------------------------------- |
| 내 정보     | `/account`     | 모든 회원 | 이름 변경(이미 쓴 글·댓글 작성자명도 함께 변경), 비밀번호 변경(다른 기기 로그인은 해제) |
| 회원 관리   | `/admin`       | 관리자    | 가입 승인·거절, 승인 취소, 관리자 지정·해제, 비밀번호 초기화(임시 비밀번호 발급)        |
| 게시글 관리 | `/admin/posts` | 관리자    | 글 검색, 여러 글을 골라 한 번에 삭제                                                    |

관리 화면 위쪽의 `게시판으로`를 누르면 목록으로 돌아갑니다.

- 비밀번호는 scrypt로 해시해 저장하고, 로그인 세션은 httpOnly 쿠키(30일)와 DB의 세션 기록(토큰 해시)으로 관리합니다.
- 회원 기능 이전에 쓴 글(샘플 글 등)은 작성 회원 정보가 없어 관리자만 수정·삭제할 수 있습니다.

## 데이터 저장

### Neon(PostgreSQL) — 기본

- `.env.local`의 `DATABASE_URL`에 Neon 연결 문자열을 넣으면 Neon에 저장합니다. (`.env.local`은 커밋되지 않습니다)
- 서버가 처음 DB를 쓸 때 `board_posts`, `board_comments`, `board_users`, `board_sessions` 테이블을 만들고(`CREATE TABLE IF NOT EXISTS`), 게시글이 하나도 없으면 샘플 데이터를 넣습니다. 따로 마이그레이션을 실행할 필요가 없습니다.
- 댓글은 게시글이 삭제되면 함께 삭제됩니다(`ON DELETE CASCADE`).
- 처음 상태로 되돌리려면 테이블을 지운 뒤 서버를 다시 시작하세요.

```sql
DROP TABLE board_sessions, board_comments, board_posts, board_users;
```

- 배포할 때는 호스팅 서비스의 환경 변수에 `DATABASE_URL`을 설정합니다.

### 로컬 JSON 파일 — DB 없이 실행

- `DATABASE_URL`이 없으면 `DemoWeb/data/board.json`에 저장합니다. 파일이 없으면 샘플 데이터로 새로 만듭니다.
- 다른 위치를 쓰려면 환경 변수 `BOARD_DATA_FILE`에 파일 경로를 지정합니다.
- `data/` 폴더는 `.gitignore`에 들어 있어 커밋되지 않습니다.

## 구조

```
src/
  app/
    page.tsx                 목록 + 검색 + 페이지네이션
    posts/new/page.tsx       글쓰기
    posts/[id]/page.tsx      상세 + 댓글
    posts/[id]/edit/page.tsx 수정
    signup/, login/          회원가입, 로그인
    admin/page.tsx           회원 관리(관리자 전용)
    actions.ts               서버 액션(작성·수정·삭제·댓글·조회수)
    auth-actions.ts          서버 액션(가입·로그인·로그아웃·회원 관리)
  components/
    board/                   게시판 화면 컴포넌트
    ui/                      shadcn/ui 컴포넌트
  lib/auth/                  비밀번호 해시, 세션, 권한 확인
  lib/board/
    types.ts                 Post, Comment 등 타입
    repository.ts            BoardRepository 인터페이스
    postgres-repository.ts   Neon(PostgreSQL) 구현
    json-repository.ts       JSON 파일 구현
    seed.ts                  샘플 데이터
    index.ts                 DATABASE_URL 유무로 구현을 고르는 곳
```

### 저장소 교체하기

페이지와 서버 액션은 `BoardRepository` 인터페이스에만 의존합니다. SQLite나 다른 DB로 바꾸려면 `BoardRepository`를 구현한 객체를 만들고 `src/lib/board/index.ts`에서 내보내는 `board`만 바꾸면 됩니다.

## 참고

- JSON 파일 저장소는 한 서버 프로세스 안에서 요청을 순서대로 처리하므로 여러 인스턴스로 띄울 때는 Neon을 사용하세요.
- Next.js 16의 Cache Components가 켜져 있어 정적 셸을 먼저 보내고 게시판 데이터는 요청 시점에 스트리밍됩니다.
