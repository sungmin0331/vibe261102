"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { updateUserAction } from "@/app/auth-actions";
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
        </>
      )}
    </div>
  );
}
