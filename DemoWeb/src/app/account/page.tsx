import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { PasswordForm, ProfileForm } from "@/components/auth/account-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isAdmin, requireUser } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "내 정보" };

export default async function AccountPage() {
  const user = await requireUser("/account");

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeftIcon data-icon="inline-start" />
            게시판으로
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">내 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">아이디</dt>
            <dd>@{user.username}</dd>
            <dt className="text-muted-foreground">권한</dt>
            <dd>
              {isAdmin(user) ? <Badge>관리자</Badge> : <span>일반 회원</span>}
            </dd>
            <dt className="text-muted-foreground">가입 신청일</dt>
            <dd className="tabular-nums">{formatDateTime(user.createdAt)}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle>이름 변경</CardTitle>
          <CardDescription>
            이미 쓴 글과 댓글의 작성자 이름도 함께 바뀝니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm displayName={user.displayName} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle>비밀번호 변경</CardTitle>
          <CardDescription>
            바꾸면 다른 기기의 로그인은 모두 해제되고, 지금 기기만 로그인 상태로
            남습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
