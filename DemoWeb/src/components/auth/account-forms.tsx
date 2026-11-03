"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import {
  changePasswordAction,
  updateProfileAction,
  type PasswordFormState,
  type ProfileFormState,
} from "@/app/auth-actions";
import { Field } from "@/components/auth/signup-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, formAction, pending] = useActionState<
    ProfileFormState,
    FormData
  >(updateProfileAction, {});

  useEffect(() => {
    if (state.done) toast.success("이름을 바꿨습니다.");
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <Field id="displayName" label="이름" error={state.errors?.displayName}>
        <Input
          id="displayName"
          name="displayName"
          autoComplete="nickname"
          maxLength={20}
          defaultValue={state.values?.displayName ?? displayName}
          aria-invalid={!!state.errors?.displayName}
        />
      </Field>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" className="self-end" disabled={pending}>
        {pending ? "저장 중…" : "이름 저장"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<
    PasswordFormState,
    FormData
  >(changePasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state.errors ?? {};

  useEffect(() => {
    if (state.done) {
      toast.success("비밀번호를 바꿨습니다.");
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
    >
      <Field
        id="currentPassword"
        label="현재 비밀번호"
        error={errors.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          aria-invalid={!!errors.currentPassword}
        />
      </Field>
      <Field
        id="password"
        label="새 비밀번호"
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
        label="새 비밀번호 확인"
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
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" className="self-end" disabled={pending}>
        {pending ? "변경 중…" : "비밀번호 변경"}
      </Button>
    </form>
  );
}
