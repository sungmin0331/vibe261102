import type { Comment, Post } from "./types";

export interface BoardData {
  posts: Post[];
  comments: Comment[];
  nextPostId: number;
  nextCommentId: number;
}

const samples: Array<Pick<Post, "title" | "author" | "content">> = [
  {
    title: "DemoWeb 게시판에 오신 것을 환영합니다",
    author: "관리자",
    content:
      "Next.js App Router와 shadcn/ui로 만든 데모 게시판입니다.\n\n글 목록, 검색, 페이지네이션, 글쓰기·수정·삭제, 댓글 기능을 자유롭게 사용해 보세요.\n데이터는 data/board.json 파일에 저장되며, 파일을 지우면 이 샘플 데이터로 다시 시작합니다.",
  },
  {
    title: "게시판 이용 규칙 안내",
    author: "관리자",
    content:
      "1. 서로 존중하는 표현을 사용해 주세요.\n2. 광고성 글은 예고 없이 삭제될 수 있습니다.\n3. 개인정보(전화번호, 주소 등)는 올리지 마세요.",
  },
  {
    title: "Next.js 16에서 바뀐 캐싱 정리",
    author: "김개발",
    content:
      "cacheComponents를 켜면 데이터 요청이 기본적으로 동적이고, 캐시하고 싶은 부분에만 'use cache'를 붙입니다.\n정적 셸은 먼저 보내고 동적 부분은 Suspense로 스트리밍됩니다.",
  },
  {
    title: "shadcn/ui 컴포넌트 커스터마이징 팁",
    author: "이디자인",
    content:
      "shadcn/ui는 컴포넌트 코드를 프로젝트에 복사해 주기 때문에 마음껏 수정할 수 있습니다.\n색상은 globals.css의 CSS 변수만 바꿔도 라이트/다크 테마 모두에 반영됩니다.",
  },
  {
    title: "다크 모드 지원 방법",
    author: "이디자인",
    content:
      "next-themes로 html 요소에 dark 클래스를 붙이고, Tailwind의 dark 변형으로 스타일을 나눕니다.\n오른쪽 위 버튼으로 라이트, 다크, 시스템 설정을 바꿀 수 있어요.",
  },
  {
    title: "점심 메뉴 추천 받습니다",
    author: "박직장",
    content:
      "회사 근처에서 먹을 만한 곳 추천 부탁드려요. 국밥, 칼국수 다 좋아합니다!",
  },
  {
    title: "TypeScript 타입 좁히기 질문",
    author: "최주니어",
    content:
      "유니온 타입에서 in 연산자로 좁히는 것과 판별 속성(discriminant)을 두는 것 중 어떤 방식을 더 많이 쓰시나요?",
  },
  {
    title: "주말 등산 모임 모집",
    author: "정산악",
    content:
      "이번 토요일 오전 8시에 북한산 갑니다. 초보도 환영이에요. 댓글로 신청해 주세요.",
  },
  {
    title: "React 19 Server Actions 써 보니",
    author: "김개발",
    content:
      "폼 action에 서버 함수를 바로 넘길 수 있어서 API 라우트를 따로 만들 일이 줄었습니다.\nuseActionState로 검증 오류를 돌려주는 패턴이 깔끔하네요.",
  },
  {
    title: "모니터 두 대 vs 울트라와이드",
    author: "박직장",
    content: "개발용으로 어떤 구성이 더 편한지 경험 공유 부탁드립니다.",
  },
  {
    title: "Tailwind CSS v4 마이그레이션 후기",
    author: "이디자인",
    content:
      "설정 파일 없이 CSS에서 @theme로 토큰을 정의하는 방식이 처음엔 낯설었는데 익숙해지니 훨씬 간단합니다.",
  },
  {
    title: "스터디원 모집 (알고리즘)",
    author: "최주니어",
    content:
      "주 2회 온라인으로 알고리즘 문제 풀이 스터디 하실 분 구합니다. 난이도는 실버~골드 정도입니다.",
  },
  {
    title: "Git 커밋 메시지 컨벤션 어떻게 쓰세요?",
    author: "한리뷰",
    content:
      "Conventional Commits를 팀에 도입하려고 하는데, 실제로 써 보신 분들 장단점이 궁금합니다.",
  },
  {
    title: "사무실 화분 키우기",
    author: "정산악",
    content:
      "스투키랑 몬스테라 키우는 중인데 겨울철 물 주기는 얼마나 하시나요?",
  },
  {
    title: "SQLite로 저장소 바꾸려면?",
    author: "한리뷰",
    content:
      "이 게시판은 BoardRepository 인터페이스만 구현하면 저장소를 교체할 수 있게 되어 있습니다.\nsrc/lib/board/index.ts에서 내보내는 구현만 바꾸면 됩니다.",
  },
  {
    title: "VS Code 확장 추천",
    author: "최주니어",
    content:
      "ESLint, Prettier, Tailwind CSS IntelliSense 말고 요즘 잘 쓰시는 확장 있으면 알려 주세요.",
  },
  {
    title: "회의록 작성 템플릿 공유",
    author: "박직장",
    content:
      "안건 / 논의 내용 / 결정 사항 / 할 일(담당자, 기한) 네 칸으로 쓰니 정리가 잘 됩니다.",
  },
  {
    title: "접근성 체크리스트",
    author: "이디자인",
    content:
      "버튼에는 이름을, 이미지에는 대체 텍스트를, 색 대비는 4.5:1 이상을 지켜 주세요.\n키보드만으로 모든 기능을 쓸 수 있는지도 꼭 확인합시다.",
  },
  {
    title: "가을 워크숍 장소 투표",
    author: "관리자",
    content:
      "가평, 양평, 강릉 중 원하는 곳을 댓글로 남겨 주세요. 다음 주 금요일에 마감합니다.",
  },
  {
    title: "코드 리뷰할 때 신경 쓰는 점",
    author: "한리뷰",
    content:
      "동작보다 의도가 잘 드러나는지, 테스트로 보호되는지, 이름이 정확한지를 먼저 봅니다.",
  },
  {
    title: "키보드 축 추천해 주세요",
    author: "김개발",
    content:
      "적축 쓰다가 갈축으로 넘어갈까 고민 중입니다. 타건감 좋은 축 추천 부탁드려요.",
  },
  {
    title: "신규 입사자 온보딩 자료",
    author: "관리자",
    content:
      "개발 환경 설정, 배포 절차, 코드 리뷰 규칙을 정리한 문서를 위키에 올려 두었습니다.",
  },
  {
    title: "반응형 레이아웃 확인 부탁",
    author: "이디자인",
    content:
      "모바일에서는 표 대신 카드 목록으로 보이도록 바꿨습니다. 휴대폰에서 한번 확인해 주세요!",
  },
];

const sampleComments: Array<{ post: number; author: string; content: string }> =
  [
    { post: 1, author: "김개발", content: "깔끔하네요! 잘 쓰겠습니다." },
    { post: 1, author: "최주니어", content: "다크 모드 좋아요 👍" },
    {
      post: 3,
      author: "한리뷰",
      content: "정리 감사합니다. Suspense 경계 위치가 중요하더라고요.",
    },
    { post: 6, author: "정산악", content: "역 앞 칼국수집 추천합니다." },
    { post: 6, author: "이디자인", content: "저는 순대국이요!" },
    {
      post: 7,
      author: "김개발",
      content: "판별 속성 쪽이 읽기 쉬워서 선호합니다.",
    },
    { post: 8, author: "박직장", content: "저 참여할게요." },
    {
      post: 13,
      author: "최주니어",
      content: "자동 changelog 만들 때 편하더라고요.",
    },
    { post: 19, author: "정산악", content: "강릉 한 표!" },
    { post: 23, author: "박직장", content: "아이폰에서 잘 보입니다." },
  ];

/** 샘플 게시글과 댓글을 만듭니다. 날짜는 오래된 글부터 하루씩 간격을 둡니다. */
export function createSeedData(now = new Date()): BoardData {
  const day = 24 * 60 * 60 * 1000;
  const posts: Post[] = samples.map((sample, index) => {
    const createdAt = new Date(
      now.getTime() - (samples.length - index) * day + index * 37 * 60 * 1000,
    ).toISOString();
    return {
      id: index + 1,
      ...sample,
      createdAt,
      updatedAt: createdAt,
      views: ((index * 37) % 120) + 5,
    };
  });

  const comments: Comment[] = sampleComments.map((comment, index) => {
    const post = posts[comment.post - 1];
    return {
      id: index + 1,
      postId: post.id,
      author: comment.author,
      content: comment.content,
      createdAt: new Date(
        new Date(post.createdAt).getTime() + (index + 1) * 45 * 60 * 1000,
      ).toISOString(),
    };
  });

  return {
    posts,
    comments,
    nextPostId: posts.length + 1,
    nextCommentId: comments.length + 1,
  };
}
