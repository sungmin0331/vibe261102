import { EyeIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PostSummary } from "@/lib/board";
import { formatDate, formatNumber } from "@/lib/format";

function CommentCount({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 text-xs font-semibold text-primary">[{count}]</span>
  );
}

/** 넓은 화면에서는 표, 좁은 화면에서는 카드형 목록으로 보여 줍니다. */
export function PostList({ posts }: { posts: PostSummary[] }) {
  return (
    <>
      <div className="hidden md:block">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-center">번호</TableHead>
              <TableHead>제목</TableHead>
              <TableHead className="w-32">작성자</TableHead>
              <TableHead className="w-28 text-center">작성일</TableHead>
              <TableHead className="w-20 text-right">조회</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {posts.map((post) => (
              <TableRow key={post.id}>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {post.id}
                </TableCell>
                <TableCell className="max-w-0 whitespace-normal">
                  <Link
                    href={`/posts/${post.id}`}
                    className="line-clamp-1 font-medium hover:underline"
                  >
                    {post.title}
                    <CommentCount count={post.commentCount} />
                  </Link>
                </TableCell>
                <TableCell className="truncate">{post.author}</TableCell>
                <TableCell className="text-center text-muted-foreground tabular-nums">
                  {formatDate(post.createdAt)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums">
                  {formatNumber(post.views)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y md:hidden">
        {posts.map((post) => (
          <li key={post.id}>
            <Link
              href={`/posts/${post.id}`}
              className="flex flex-col gap-1 py-3 hover:bg-muted/50"
            >
              <span className="line-clamp-2 font-medium">
                {post.title}
                <CommentCount count={post.commentCount} />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{post.author}</span>
                <span className="tabular-nums">
                  {formatDate(post.createdAt)}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <EyeIcon className="size-3" />
                  {formatNumber(post.views)}
                </span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <MessageSquareIcon className="size-3" />
                  {post.commentCount}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
