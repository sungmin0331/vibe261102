export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  views: number;
}

export interface Comment {
  id: number;
  postId: number;
  author: string;
  content: string;
  createdAt: string;
}

export type PostSummary = Omit<Post, "content"> & { commentCount: number };

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
}

export type PostUpdate = Omit<PostInput, "author">;

export interface CommentInput {
  author: string;
  content: string;
}
