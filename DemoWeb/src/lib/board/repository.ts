import type {
  Comment,
  CommentInput,
  ListPostsParams,
  NewUser,
  Paginated,
  Post,
  PostInput,
  PostSummary,
  PostUpdate,
  User,
  UserStatus,
  UserUpdate,
  UserWithPassword,
} from "./types";

/**
 * 게시판 저장소 인터페이스. 페이지와 서버 액션은 이 인터페이스에만 의존하므로
 * JSON 파일 구현을 SQLite·Postgres 등 다른 구현으로 바꿔도 화면 코드는 그대로입니다.
 */
export interface BoardRepository {
  listPosts(params: ListPostsParams): Promise<Paginated<PostSummary>>;
  getPost(id: number): Promise<Post | null>;
  createPost(input: PostInput): Promise<Post>;
  updatePost(id: number, input: PostUpdate): Promise<Post | null>;
  deletePost(id: number): Promise<boolean>;
  /** 여러 글을 한 번에 지우고 실제로 지운 개수를 돌려줍니다. */
  deletePosts(ids: number[]): Promise<number>;
  /** 조회수를 1 올리고 새 조회수를 돌려줍니다. 글이 없으면 null. */
  incrementViews(id: number): Promise<number | null>;

  listComments(postId: number): Promise<Comment[]>;
  getComment(postId: number, commentId: number): Promise<Comment | null>;
  createComment(postId: number, input: CommentInput): Promise<Comment | null>;
  deleteComment(postId: number, commentId: number): Promise<boolean>;

  /** 새 회원을 pending 상태로 만듭니다. 아이디가 이미 있으면 null. */
  createUser(input: NewUser): Promise<User | null>;
  findUserByUsername(username: string): Promise<UserWithPassword | null>;
  getUser(id: number): Promise<User | null>;
  /** 최근 가입 순. status를 주면 그 상태만 돌려줍니다. */
  listUsers(status?: UserStatus): Promise<User[]>;
  countUsers(status: UserStatus): Promise<number>;
  updateUser(id: number, update: UserUpdate): Promise<User | null>;
  /** 이름을 바꾸고, 그 회원이 쓴 글·댓글의 작성자 이름도 함께 바꿉니다. */
  updateDisplayName(id: number, displayName: string): Promise<User | null>;
  /** 비밀번호를 바꾸고 그 회원의 모든 세션을 지웁니다. 회원이 없으면 false. */
  updatePassword(id: number, passwordHash: string): Promise<boolean>;

  createSession(
    tokenHash: string,
    userId: number,
    expiresAt: Date,
  ): Promise<void>;
  /** 만료되지 않은 세션의 회원을 돌려줍니다. */
  findSessionUser(tokenHash: string): Promise<User | null>;
  deleteSession(tokenHash: string): Promise<void>;
}
