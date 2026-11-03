import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin/admin-header";
import { UserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isAdmin, requireUser } from "@/lib/auth/session";
import { board, type UserStatus } from "@/lib/board";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "회원 관리" };

const tabs: Array<{ value: UserStatus | "all"; label: string }> = [
  { value: "pending", label: "승인 대기" },
  { value: "approved", label: "승인됨" },
  { value: "rejected", label: "거절됨" },
  { value: "all", label: "전체" },
];

const statusLabel: Record<UserStatus, string> = {
  pending: "승인 대기",
  approved: "승인됨",
  rejected: "거절됨",
};

const statusVariant = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
} as const;

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { status } = await searchParams;
  const user = await requireUser("/admin");
  if (!isAdmin(user)) notFound();

  const current = tabs.find((tab) => tab.value === status)?.value ?? "pending";
  const [users, pendingCount] = await Promise.all([
    board.listUsers(current === "all" ? undefined : current),
    board.countUsers("pending"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader current="users" pendingCount={pendingCount} />
      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="text-xl">회원 관리</CardTitle>
          <CardDescription>
            가입 신청을 승인하면 그 회원이 로그인해 글과 댓글을 쓸 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <nav className="flex flex-wrap gap-1" aria-label="회원 상태">
            {tabs.map((tab) => (
              <Link
                key={tab.value}
                href={`/admin?status=${tab.value}`}
                aria-current={tab.value === current ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted",
                  tab.value === current &&
                    "bg-muted font-medium text-foreground",
                )}
              >
                {tab.label}
                {tab.value === "pending" && pendingCount > 0 && (
                  <Badge variant="destructive">{pendingCount}</Badge>
                )}
              </Link>
            ))}
          </nav>

          {users.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {current === "pending"
                ? "승인을 기다리는 가입 신청이 없습니다."
                : "해당하는 회원이 없습니다."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>회원</TableHead>
                  <TableHead className="hidden sm:table-cell">상태</TableHead>
                  <TableHead className="hidden md:table-cell">
                    가입 신청일
                  </TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5 font-medium">
                        {member.displayName}
                        {member.role === "admin" && <Badge>관리자</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        @{member.username}
                        <span className="sm:hidden">
                          {" "}
                          · {statusLabel[member.status]}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant={statusVariant[member.status]}>
                        {statusLabel[member.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums md:table-cell">
                      {formatDateTime(member.createdAt)}
                    </TableCell>
                    <TableCell>
                      <UserActions
                        user={member}
                        isSelf={member.id === user.id}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
