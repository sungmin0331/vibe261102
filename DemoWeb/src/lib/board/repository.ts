import type {
  Comment,
  CommentInput,
  ListPostsParams,
  Paginated,
  Post,
  PostInput,
  PostSummary,
  PostUpdate,
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
  /** 조회수를 1 올리고 새 조회수를 돌려줍니다. 글이 없으면 null. */
  incrementViews(id: number): Promise<number | null>;

  listComments(postId: number): Promise<Comment[]>;
  createComment(postId: number, input: CommentInput): Promise<Comment | null>;
  deleteComment(postId: number, commentId: number): Promise<boolean>;
}
