import { MessagesSquareIcon, PenSquareIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { AccountMenu } from "@/components/account-menu";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, isAdmin } from "@/lib/auth/session";
import { board } from "@/lib/board";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 px-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold"
        >
          <MessagesSquareIcon className="size-5 text-primary" />
          <span className="hidden sm:inline">DemoWeb 게시판</span>
        </Link>
        <div className="ml-auto flex items-center gap-1.5">
          {/* 로그인 정보는 요청마다 읽으므로 이 부분만 따로 스트리밍합니다. */}
          <Suspense fallback={<Skeleton className="h-7 w-32" />}>
            <UserNav />
          </Suspense>
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}

async function UserNav() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/login">로그인</Link>
        </Button>
        <Button size="sm" asChild>
          <Link href="/signup">회원가입</Link>
        </Button>
      </>
    );
  }

  const admin = isAdmin(user);
  const pendingCount = admin ? await board.countUsers("pending") : 0;

  return (
    <>
      <Button size="sm" asChild>
        <Link href="/posts/new">
          <PenSquareIcon data-icon="inline-start" />
          글쓰기
        </Link>
      </Button>
      <AccountMenu
        displayName={user.displayName}
        username={user.username}
        isAdmin={admin}
        pendingCount={pendingCount}
      />
    </>
  );
}
