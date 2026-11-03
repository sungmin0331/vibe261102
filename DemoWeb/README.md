# DemoWeb 게시판

Next.js(App Router) + TypeScript + shadcn/ui로 만든 웹 게시판 데모입니다. 별도 DB 서버 없이 로컬 JSON 파일에 데이터를 저장하므로 설치 후 바로 실행할 수 있습니다.

## 기능

- 게시글 목록: 번호·제목(댓글 수)·작성자·작성일·조회수, 10개씩 페이지네이션
- 검색: 제목+내용 / 제목 / 내용 (검색 조건은 URL에 남아 새로고침·공유해도 유지)
- 게시글 상세(열 때 조회수 증가), 작성, 수정, 삭제(확인 다이얼로그)
- 게시글별 댓글 작성/삭제(삭제 확인 다이얼로그)
- 반응형 레이아웃: 넓은 화면은 표, 좁은 화면은 카드형 목록
- 라이트 / 다크 / 시스템 테마 전환
- 첫 실행 시 샘플 게시글 23개와 댓글 몇 개를 자동으로 시드

## 실행 방법

Node.js 20.9 이상이 필요합니다. (개발 시 Node 24, npm 11에서 확인)

```bash
cd DemoWeb
npm install
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

## 데이터 저장

- 데이터는 `DemoWeb/data/board.json`에 저장됩니다. 파일이 없으면 샘플 데이터로 새로 만듭니다.
- 처음 상태로 되돌리려면 서버를 끄고 `data/board.json`을 지운 뒤 다시 실행하세요.
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
    actions.ts               서버 액션(작성·수정·삭제·댓글·조회수)
  components/
    board/                   게시판 화면 컴포넌트
    ui/                      shadcn/ui 컴포넌트
  lib/board/
    types.ts                 Post, Comment 등 타입
    repository.ts            BoardRepository 인터페이스
    json-repository.ts       JSON 파일 구현
    seed.ts                  샘플 데이터
    index.ts                 사용할 구현을 고르는 곳
```

### 저장소 교체하기

페이지와 서버 액션은 `BoardRepository` 인터페이스에만 의존합니다. SQLite나 다른 DB로 바꾸려면 `BoardRepository`를 구현한 객체를 만들고 `src/lib/board/index.ts`에서 내보내는 `board`만 바꾸면 됩니다.

## 참고

- 로그인 기능이 없는 데모이므로 누구나 글과 댓글을 수정·삭제할 수 있습니다.
- JSON 파일 저장소는 한 서버 프로세스 안에서 요청을 순서대로 처리합니다. 여러 인스턴스로 띄우는 운영 환경에는 DB 구현으로 교체하세요.
- Next.js 16의 Cache Components가 켜져 있어 정적 셸을 먼저 보내고 게시판 데이터는 요청 시점에 스트리밍됩니다.
