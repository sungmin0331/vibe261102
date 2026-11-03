"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { board } from "@/lib/board";

export interface FormState<Field extends string> {
  errors?: Partial<Record<Field, string>>;
  message?: string;
  values?: Partial<Record<Field, string>>;
}

export type PostFormState = FormState<"title" | "content" | "author">;
export type CommentFormState = FormState<"author" | "content"> & {
  ok?: boolean;
};

const LIMITS = {
  title: 100,
  content: 5000,
  author: 20,
  comment: 500,
};

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** 마지막 글자에 받침이 있는지에 따라 조사를 고릅니다. (예: 제목을, 작성자를) */
function josa(word: string, withFinal: string, withoutFinal: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

function check(value: string, label: string, max: number) {
  if (!value) return `${josa(label, "을", "를")} 입력해 주세요.`;
  if (value.length > max)
    return `${josa(label, "은", "는")} ${max}자 이하로 입력해 주세요.`;
  return undefined;
}

function hasErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

/** 새 글 작성(postId가 null) 또는 기존 글 수정. */
export async function savePostAction(
  postId: number | null,
  _prev: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const values = {
    title: field(formData, "title"),
    content: field(formData, "content"),
    author: field(formData, "author"),
  };
  const errors = {
    title: check(values.title, "제목", LIMITS.title),
    content: check(values.content, "내용", LIMITS.content),
    author:
      postId === null
        ? check(values.author, "작성자", LIMITS.author)
        : undefined,
  };
  if (hasErrors(errors)) return { errors, values };

  let id: number;
  if (postId === null) {
    id = (await board.createPost(values)).id;
  } else {
    const updated = await board.updatePost(postId, {
      title: values.title,
      content: values.content,
    });
    if (!updated) return { message: "글을 찾을 수 없습니다.", values };
    id = updated.id;
  }

  revalidatePath("/");
  revalidatePath(`/posts/${id}`);
  redirect(`/posts/${id}`);
}

export async function deletePostAction(postId: number) {
  await board.deletePost(postId);
  revalidatePath("/");
  redirect("/");
}

export async function recordViewAction(postId: number) {
  return board.incrementViews(postId);
}

export async function createCommentAction(
  postId: number,
  _prev: CommentFormState,
  formData: FormData,
): Promise<CommentFormState> {
  const values = {
    author: field(formData, "author"),
    content: field(formData, "content"),
  };
  const errors = {
    author: check(values.author, "작성자", LIMITS.author),
    content: check(values.content, "댓글", LIMITS.comment),
  };
  if (hasErrors(errors)) return { errors, values };

  const comment = await board.createComment(postId, values);
  if (!comment) return { message: "글을 찾을 수 없습니다.", values };

  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  // 작성자 이름은 남겨 두고 내용만 비웁니다.
  return { ok: true, values: { author: values.author } };
}

export async function deleteCommentAction(postId: number, commentId: number) {
  const deleted = await board.deleteComment(postId, commentId);
  revalidatePath("/");
  revalidatePath(`/posts/${postId}`);
  return deleted;
}
