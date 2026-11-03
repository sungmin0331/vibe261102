import { ArrowLeftIcon, FileTextIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sections = [
  { value: "users", href: "/admin", label: "회원 관리", icon: UsersIcon },
  {
    value: "posts",
    href: "/admin/posts",
    label: "게시글 관리",
    icon: FileTextIcon,
  },
] as const;

/** 관리자 화면 위쪽: 게시판으로 돌아가기와 관리 메뉴 */
export function AdminHeader({
  current,
  pendingCount,
}: {
  current: (typeof sections)[number]["value"];
  pendingCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/">
          <ArrowLeftIcon data-icon="inline-start" />
          게시판으로
        </Link>
      </Button>
      <nav
        className="flex gap-1 rounded-lg bg-muted p-1"
        aria-label="관리 메뉴"
      >
        {sections.map(({ value, href, label, icon: Icon }) => (
          <Link
            key={value}
            href={href}
            aria-current={value === current ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground",
              value === current &&
                "bg-background font-medium text-foreground shadow-sm",
            )}
          >
            <Icon className="size-4" />
            {label}
            {value === "users" && pendingCount > 0 && (
              <Badge variant="destructive">{pendingCount}</Badge>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
