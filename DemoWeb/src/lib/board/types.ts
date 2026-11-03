export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  /** 작성한 회원. 회원 기능 이전의 글(샘플 등)은 null입니다. */
  authorId: number | null;
  createdAt: string;
  updatedAt: string;
  views: number;
}

export interface Comment {
  id: number;
  postId: number;
  author: string;
  authorId: number | null;
  content: string;
  createdAt: string;
}

export type PostSummary = Omit<Post, "content" | "authorId"> & {
  commentCount: number;
};

export type SearchField = "all" | "title" | "content";

export interface ListPostsParams {
  query?: string;
  field?: SearchField;
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PostInput {
  title: string;
  content: string;
  author: string;
  authorId: number;
}

export type PostUpdate = Pick<PostInput, "title" | "content">;

export interface CommentInput {
  author: string;
  authorId: number;
  content: string;
}

export type UserRole = "admin" | "user";

/** 가입 신청은 pending으로 시작하고, 관리자가 승인(approved)하거나 거절(rejected)합니다. */
export type UserStatus = "pending" | "approved" | "rejected";

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  approvedAt: string | null;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface NewUser {
  username: string;
  displayName: string;
  passwordHash: string;
}

export type UserUpdate = Partial<Pick<User, "role" | "status">>;
