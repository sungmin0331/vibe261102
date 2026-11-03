import { BoardPagination } from "@/components/board/board-pagination";
import { PostList } from "@/components/board/post-list";
import { SearchForm } from "@/components/board/search-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { board, type SearchField } from "@/lib/board";
import Link from "next/link";

const PAGE_SIZE = 10;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function parseField(value: string): SearchField {
  return value === "title" || value === "content" ? value : "all";
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const query = first(params.q).trim();
  const field = parseField(first(params.field));
  const page = Number.parseInt(first(params.page), 10) || 1;

  const result = await board.listPosts({
    query,
    field,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <CardTitle className="text-xl">자유게시판</CardTitle>
          <CardDescription>
            {query
              ? `‘${query}’ 검색 결과 ${result.total}건`
              : `전체 글 ${result.total}개`}
          </CardDescription>
        </div>
        <SearchForm query={query} field={field} />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {result.items.length > 0 ? (
          <PostList posts={result.items} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <p>
              {query ? "검색 결과가 없습니다." : "아직 작성된 글이 없습니다."}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={query ? "/" : "/posts/new"}>
                {query ? "전체 목록 보기" : "첫 글 쓰기"}
              </Link>
            </Button>
          </div>
        )}
        <BoardPagination
          page={result.page}
          totalPages={result.totalPages}
          searchParams={query ? { field, q: query } : {}}
        />
      </CardContent>
    </Card>
  );
}
