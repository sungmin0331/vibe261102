import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { board, type User } from "@/lib/board";

const COOKIE_NAME = "board_session";
const SESSION_DAYS = 30;

// DB에는 토큰 원문 대신 해시만 저장해, DB가 유출돼도 세션을 가로챌 수 없게 합니다.
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function startSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await board.createSession(hashToken(token), userId, expiresAt);
  (await cookies()).set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) await board.deleteSession(hashToken(token));
  store.delete(COOKIE_NAME);
}

/**
 * 로그인한 회원을 돌려줍니다. 승인된 회원만 로그인 상태로 봅니다.
 * 한 요청 안에서는 여러 번 불러도 한 번만 조회합니다.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await board.findSessionUser(hashToken(token));
  return user?.status === "approved" ? user : null;
});

/** 로그인이 필요한 페이지에서 사용합니다. 로그인하지 않았으면 로그인 페이지로 보냅니다. */
export async function requireUser(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export function isAdmin(user: User | null) {
  return user?.role === "admin";
}

/** 글·댓글을 고치거나 지울 수 있는지: 작성자 본인 또는 관리자 */
export function canManage(user: User | null, authorId: number | null) {
  if (!user) return false;
  return isAdmin(user) || (authorId !== null && authorId === user.id);
}
