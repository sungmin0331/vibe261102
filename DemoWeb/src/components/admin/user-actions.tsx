"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resetPasswordAction, updateUserAction } from "@/app/auth-actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { User, UserUpdate } from "@/lib/board";

/** 회원 한 명에 대한 승인·거절·관리자 지정 버튼 */
export function UserActions({ user, isSelf }: { user: User; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  if (isSelf) {
    return <p className="text-right text-xs text-muted-foreground">본인</p>;
  }

  function run(update: UserUpdate, done: string) {
    startTransition(async () => {
      const result = await updateUserAction(user.id, update);
      if (result.ok) toast.success(done);
      else toast.error(result.message);
    });
  }

  const name = `${user.displayName}(${user.username})`;

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {user.status !== "approved" && (
        <Button
          size="xs"
          disabled={pending}
          onClick={() =>
            run({ status: "approved" }, `${name} 님을 승인했습니다.`)
          }
        >
          승인
        </Button>
      )}
      {user.status === "pending" && (
        <Button
          size="xs"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run({ status: "rejected" }, `${name} 님을 거절했습니다.`)
          }
        >
          거절
        </Button>
      )}
      {user.status === "approved" && (
        <>
          <Button
            size="xs"
            variant="outline"
            disabled={pending}
            onClick={() =>
              user.role === "admin"
                ? run(
                    { role: "user" },
                    `${name} 님의 관리자 권한을 해제했습니다.`,
                  )
                : run({ role: "admin" }, `${name} 님을 관리자로 지정했습니다.`)
            }
          >
            {user.role === "admin" ? "관리자 해제" : "관리자 지정"}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={pending}
            className="text-destructive"
            onClick={() =>
              run({ status: "rejected" }, `${name} 님의 승인을 취소했습니다.`)
            }
          >
            승인 취소
          </Button>
          <ResetPasswordButton user={user} name={name} />
        </>
      )}
    </div>
  );
}

/** 비밀번호를 잊은 회원에게 줄 임시 비밀번호를 만듭니다. */
function ResetPasswordButton({ user, name }: { user: User; name: string }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState<string | null>(null);

  function reset() {
    startTransition(async () => {
      const result = await resetPasswordAction(user.id);
      if (result.ok) setPassword(result.password);
      else toast.error(result.message);
    });
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setPassword(null)}>
      <AlertDialogTrigger asChild>
        <Button size="xs" variant="ghost">
          비밀번호 초기화
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        {password ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>임시 비밀번호를 만들었습니다</AlertDialogTitle>
              <AlertDialogDescription>
                {name} 님에게 아래 비밀번호를 전달해 주세요. 로그인한 뒤 내
                정보에서 새 비밀번호로 바꾸도록 안내해 주세요. 이 창을 닫으면
                다시 볼 수 없습니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <code className="rounded-lg bg-muted px-3 py-2 text-center font-mono text-lg tracking-wider select-all">
              {password}
            </code>
            <AlertDialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  navigator.clipboard
                    .writeText(password)
                    .then(() => toast.success("복사했습니다."))
                }
              >
                복사
              </Button>
              <AlertDialogCancel>닫기</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {name} 님의 비밀번호를 초기화할까요?
              </AlertDialogTitle>
              <AlertDialogDescription>
                지금 비밀번호는 더 이상 쓸 수 없고, 로그인된 기기에서도
                로그아웃됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                disabled={pending}
                onClick={(event) => {
                  // 결과를 같은 창에 보여 주도록 창이 닫히지 않게 합니다.
                  event.preventDefault();
                  reset();
                }}
              >
                {pending ? "초기화 중…" : "초기화"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
