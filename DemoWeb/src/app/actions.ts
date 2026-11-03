"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canManage, getCurrentUser, isAdmin } from "@/lib/auth/session";
import { board } from "@/lib/board";
import { check, field, hasErrors, type FormState } from "@/lib/form";

export type PostFormState = FormState<"title" | "content">;
export type CommentFormState = FormState<"content"> & { ok?: boolean };

const LIMITS = {
  title: 100,
  content: 5000,
  comment: 500,
};

const LOGIN_REQUIRED = "로그인이 필요합니다. 다시 로그인해 주세요.";
const FORBIDDEN = "작성자 본인이나 관리자만 할 수 있습니다.";

/** 새 글 작성(postId가 null) 또는 기존 글 수정. 작성자는 로그인한 회원입니다. */
export async function savePostAction(
  postId: number | null,
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const values = {
    title: field(formData, "title"),
    content: field(formData, "content"),
  };
  const user = await getCurrentUser();
  if (!user) return { message: LOGIN_REQUIRED, values };

  const errors = {
    title: check(values.title, "제목", LIMITS.title),
    content: check(values.content, "내용", LIMITS.content),
  };
  if (hasErrors(errors)) return { errors, values };

  let id: number;
  if (postId === null) {
    const post = await board.createPost({
      ...values,
      author: user.displayName,
      authorId: user.id,
    });
    id = post.id;
  } else {
    const post = await board.getPost(postId);
    if (!post) return { message: "글을 찾을 수 없습니다.", values };
    if (!canManage(user, post.authorId)) return { message: FORBIDDEN, values };
    await board.updatePost(postId, values);
    id = postId;
  }

  revalidatePath("/");
  revalidatePath(`/posts/${id}`);
  redirect(`/posts/${id}`);
}

export async function deletePostAction(postId: number) {
  const user = await getCurrentUser();
  const post = await board.getPost(postId);
  if (post && canManage(user, post.authorId)) {
    await board.deletePost(postId);
  }
  revalidatePath("/");
  redirect("/");
}

/** 관리자 전용: 게시글 관리 화면에서 고른 글들을 지웁니다. */
export async function deletePostsAction(postIds: number[]) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) {
    return { ok: false as const, message: "관리자만 할 수 있습니다." };
  }
  const count = await board.deletePosts(postIds);
  revalidatePath("/", "layout");
  return { ok: true as const, count };
}

export async function recordViewAction(postId: number) {
  return board.incrementViews(postId);
}

export async function createCommentAction(
  postId: number,
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const values = { content: field(formData, "content") };
  const user = await getCurrentUser();
  if (!user) return { message: LOGIN_REQUIRED, values };

  const errors = { content: check(values.content, "댓글", LIMITS.comment) };
  if (hasErrors(errors)) return { errors, values };

  const comment = await board.createComment(postId, {
    ...values,
    author: user.displayName,
    authorId: user.id,
  });
  if (!comment) return { message: "글을 찾을 수 없습니다.", values };

  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  return { ok: true };
}

export async function deleteCommentAction(postId: number, commentId: number) {
  const user = await getCurrentUser();
  const comment = await board.getComment(postId, commentId);
  if (!comment || !canManage(user, comment.authorId)) return false;

  const deleted = await board.deleteComment(postId, commentId);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  return deleted;
}
