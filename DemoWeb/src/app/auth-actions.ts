"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  endSession,
  getCurrentUser,
  isAdmin,
  startSession,
} from "@/lib/auth/session";
import { board, type UserUpdate } from "@/lib/board";
import { check, field, hasErrors, safeNext, type FormState } from "@/lib/form";

export type SignupFormState = FormState<
  "username" | "displayName" | "password" | "passwordConfirm"
> & { done?: boolean };
export type LoginFormState = FormState<"username" | "password">;

const USERNAME_PATTERN = /^[a-z0-9_]{4,20}$/;
const PASSWORD_MIN = 8;

export async function signupAction(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  const username = field(formData, "username").toLowerCase();
  const displayName = field(formData, "displayName");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const values = { username, displayName };

  const errors = {
    username: !username
      ? "아이디를 입력해 주세요."
      : USERNAME_PATTERN.test(username)
        ? undefined
        : "아이디는 영문 소문자, 숫자, _로 4~20자여야 합니다.",
    displayName: check(displayName, "이름", 20),
    password:
      password.length < PASSWORD_MIN
        ? `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다.`
        : password.length > 100
          ? "비밀번호가 너무 깁니다."
          : undefined,
    passwordConfirm:
      password === passwordConfirm ? undefined : "비밀번호가 서로 다릅니다.",
  };
  if (hasErrors(errors)) return { errors, values };

  const user = await board.createUser({
    username,
    displayName,
    passwordHash: await hashPassword(password),
  });
  if (!user) {
    return {
      errors: { username: "이미 사용 중인 아이디입니다." },
      values,
    };
  }

  revalidatePath("/admin");
  return { done: true, values };
}

export async function loginAction(
  next: string,
  _prev: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const username = field(formData, "username").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { username };

  const user = username ? await board.findUserByUsername(username) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { message: "아이디 또는 비밀번호가 올바르지 않습니다.", values };
  }
  if (user.status === "pending") {
    return {
      message:
        "관리자의 가입 승인을 기다리고 있습니다. 승인 후 로그인할 수 있어요.",
      values,
    };
  }
  if (user.status === "rejected") {
    return { message: "가입이 승인되지 않은 계정입니다.", values };
  }

  await startSession(user.id);
  revalidatePath("/", "layout");
  redirect(safeNext(next));
}

export async function logoutAction() {
  await endSession();
  revalidatePath("/", "layout");
  redirect("/");
}

/** 관리자 전용: 가입 승인/거절, 관리자 지정/해제 */
export async function updateUserAction(userId: number, update: UserUpdate) {
  const admin = await getCurrentUser();
  if (!isAdmin(admin)) {
    return { ok: false, message: "관리자만 할 수 있습니다." };
  }
  if (admin!.id === userId) {
    return {
      ok: false,
      message: "자기 자신의 권한이나 상태는 바꿀 수 없습니다.",
    };
  }

  const user = await board.updateUser(userId, update);
  revalidatePath("/admin");
  return user
    ? { ok: true }
    : { ok: false, message: "회원을 찾을 수 없습니다." };
}
