"use client";

import { LogOutIcon, ShieldCheckIcon, UserIcon } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";

import { logoutAction } from "@/app/auth-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({
  displayName,
  username,
  isAdmin,
  pendingCount,
}: {
  displayName: string;
  username: string;
  isAdmin: boolean;
  pendingCount: number;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative max-w-36">
          <UserIcon data-icon="inline-start" />
          <span className="truncate">{displayName}</span>
          {pendingCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-destructive"
              aria-label={`승인 대기 ${pendingCount}명`}
            />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <div className="font-medium">{displayName}</div>
          <div className="text-xs text-muted-foreground">
            @{username}
            {isAdmin && " · 관리자"}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <ShieldCheckIcon />
              회원 관리
              {pendingCount > 0 && (
                <Badge variant="destructive" className="ml-auto">
                  {pendingCount}
                </Badge>
              )}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={pending}
          onSelect={() => startTransition(() => logoutAction())}
        >
          <LogOutIcon />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
