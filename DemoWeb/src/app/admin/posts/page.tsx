import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminPostTable } from "@/components/admin/admin-post-table";
import { BoardPagination } from "@/components/board/board-pagination";
import { SearchForm } from "@/components/board/search-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isAdmin, requireUser } from "@/lib/auth/session";
import { board, type SearchField } from "@/lib/board";

export const metadata: Metadata = { title: "게시글 관리" };

const PAGE_SIZE = 20;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function parseField(value: string): SearchField {
  return value === "title" || value === "content" ? value : "all";
}

export default async function AdminPostsPage({
  searchParams,
}: PageProps<"/admin/posts">) {
  const params = await searchParams;
  const user = await requireUser("/admin/posts");
  if (!isAdmin(user)) notFound();

  const query = first(params.q).trim();
  const field = parseField(first(params.field));
  const page = Number.parseInt(first(params.page), 10) || 1;

  const [result, pendingCount] = await Promise.all([
    board.listPosts({ query, field, page, pageSize: PAGE_SIZE }),
    board.countUsers("pending"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <AdminHeader current="posts" pendingCount={pendingCount} />
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1">
            <CardTitle className="text-xl">게시글 관리</CardTitle>
            <CardDescription>
              {query
                ? `‘${query}’ 검색 결과 ${result.total}건`
                : `전체 글 ${result.total}개 · 글을 골라 한 번에 삭제할 수 있습니다.`}
            </CardDescription>
          </div>
          <SearchForm query={query} field={field} action="/admin/posts" />
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {result.items.length > 0 ? (
            // 페이지가 바뀌면 선택을 비우도록 key를 줍니다.
            <AdminPostTable
              key={`${result.page}-${query}-${field}`}
              posts={result.items}
            />
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {query ? "검색 결과가 없습니다." : "작성된 글이 없습니다."}
            </p>
          )}
          <BoardPagination
            page={result.page}
            totalPages={result.totalPages}
            searchParams={query ? { field, q: query } : {}}
            basePath="/admin/posts"
          />
        </CardContent>
      </Card>
    </div>
  );
}
