"use client";

import Link from "next/link";
import { useActionState } from "react";

import { loginAction, type LoginFormState } from "@/app/auth-actions";
import { Field } from "@/components/auth/signup-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginFormState, FormData>(
    loginAction.bind(null, next),
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field id="username" label="아이디">
        <Input
          id="username"
          name="username"
          autoComplete="username"
          maxLength={20}
          defaultValue={state.values?.username}
        />
      </Field>
      <Field id="password" label="비밀번호">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
        />
      </Field>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        계정이 없나요?{" "}
        <Link href="/signup" className="text-foreground underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}
