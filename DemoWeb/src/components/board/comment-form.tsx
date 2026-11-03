"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { createCommentAction, type CommentFormState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({ postId }: { postId: number }) {
  const [state, formAction, pending] = useActionState<
    CommentFormState,
    FormData
  >(createCommentAction.bind(null, postId), {});
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.ok) toast.success("댓글을 등록했습니다.");
    else if (state.message) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="comment-author" className="sr-only">
          작성자
        </Label>
        <Input
          id="comment-author"
          name="author"
          maxLength={20}
          placeholder="이름"
          defaultValue={values.author}
          aria-invalid={!!errors.author}
          className="sm:max-w-xs"
        />
        {errors.author && (
          <p className="text-sm text-destructive">{errors.author}</p>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="comment-content" className="sr-only">
          댓글
        </Label>
        <Textarea
          id="comment-content"
          name="content"
          maxLength={500}
          rows={3}
          placeholder="댓글을 입력하세요"
          defaultValue={values.content}
          aria-invalid={!!errors.content}
        />
        {errors.content && (
          <p className="text-sm text-destructive">{errors.content}</p>
        )}
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "등록 중…" : "댓글 등록"}
        </Button>
      </div>
    </form>
  );
}
