"use client";

import { CircleCheckIcon } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { signupAction, type SignupFormState } from "@/app/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<
    SignupFormState,
    FormData
  >(signupAction, {});
  const values = state.values ?? {};
  const errors = state.errors ?? {};

  if (state.done) {
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CircleCheckIcon className="size-10 text-primary" />
        <p className="font-medium">가입 신청이 완료되었습니다.</p>
        <p className="text-sm text-muted-foreground">
          아이디 <strong className="text-foreground">{values.username}</strong>
          는 관리자가 승인한 뒤 로그인할 수 있습니다.
        </p>
        <Button variant="outline" asChild>
          <Link href="/">목록으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field
        id="username"
        label="아이디"
        error={errors.username}
        hint="영문 소문자, 숫자, _로 4~20자"
      >
        <Input
          id="username"
          name="username"
          autoComplete="username"
          maxLength={20}
          defaultValue={values.username}
          aria-invalid={!!errors.username}
        />
      </Field>
      <Field
        id="displayName"
        label="이름"
        error={errors.displayName}
        hint="글과 댓글에 작성자로 표시됩니다."
      >
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          maxLength={20}
          defaultValue={values.displayName}
          aria-invalid={!!errors.displayName}
        />
      </Field>
      <Field
        id="password"
        label="비밀번호"
        error={errors.password}
        hint="8자 이상"
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
        />
      </Field>
      <Field
        id="passwordConfirm"
        label="비밀번호 확인"
        error={errors.passwordConfirm}
      >
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.passwordConfirm}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "신청 중…" : "가입 신청"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="text-foreground underline">
          로그인
        </Link>
      </p>
    </form>
  );
}

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}
