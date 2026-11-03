"use client";

import Link from "next/link";
import { useActionState } from "react";

import { savePostAction, type PostFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Post } from "@/lib/board";

interface PostFormProps {
  /** 수정할 글. 없으면 새 글 작성 폼입니다. */
  post?: Post;
}

export function PostForm({ post }: PostFormProps) {
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(
    savePostAction.bind(null, post?.id ?? null),
    {},
  );
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="author">작성자</Label>
        {post ? (
          <Input
            id="author"
            value={post.author}
            disabled
            className="sm:max-w-xs"
          />
        ) : (
          <Input
            id="author"
            name="author"
            maxLength={20}
            placeholder="이름을 입력하세요"
            defaultValue={values.author}
            aria-invalid={!!errors.author}
            aria-describedby={errors.author ? "author-error" : undefined}
            className="sm:max-w-xs"
          />
        )}
        <FieldError id="author-error" message={errors.author} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="title">제목</Label>
        <Input
          id="title"
          name="title"
          maxLength={100}
          placeholder="제목을 입력하세요"
          defaultValue={values.title ?? post?.title}
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
        />
        <FieldError id="title-error" message={errors.title} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="content">내용</Label>
        <Textarea
          id="content"
          name="content"
          maxLength={5000}
          rows={12}
          placeholder="내용을 입력하세요"
          defaultValue={values.content ?? post?.content}
          aria-invalid={!!errors.content}
          aria-describedby={errors.content ? "content-error" : undefined}
          className="min-h-64"
        />
        <FieldError id="content-error" message={errors.content} />
      </div>

      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" asChild>
          <Link href={post ? `/posts/${post.id}` : "/"}>취소</Link>
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중…" : post ? "수정 완료" : "등록"}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  );
}
