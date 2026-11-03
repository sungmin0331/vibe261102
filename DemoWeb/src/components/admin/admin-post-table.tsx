"use client";

import { Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deletePostsAction } from "@/app/actions";
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

const checkboxClass = "size-4 accent-primary align-middle";

/** 관리자용 게시글 표. 여러 글을 골라 한 번에 지우거나 한 글씩 지울 수 있습니다. */
export function AdminPostTable({ posts }: { posts: PostSummary[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const allSelected = selected.size === posts.length;

  function toggle(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function remove(ids: number[]) {
    startTransition(async () => {
      const result = await deletePostsAction(ids);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`글 ${result.count}개를 삭제했습니다.`);
      setSelected(new Set());
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className={checkboxClass}
            checked={allSelected}
            onChange={() =>
              setSelected(
                allSelected ? new Set() : new Set(posts.map((p) => p.id)),
              )
            }
          />
          {selected.size > 0 ? `${selected.size}개 선택됨` : "전체 선택"}
        </label>
        <ConfirmDelete
          title={`선택한 글 ${selected.size}개를 삭제할까요?`}
          disabled={pending || selected.size === 0}
          onConfirm={() => remove([...selected])}
        >
          <Button
            variant="destructive"
            size="sm"
            disabled={pending || selected.size === 0}
          >
            <Trash2Icon data-icon="inline-start" />
            선택 삭제
          </Button>
        </ConfirmDelete>
      </div>

      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead className="hidden w-14 text-center sm:table-cell">
              번호
            </TableHead>
            <TableHead>제목</TableHead>
            <TableHead className="hidden w-28 md:table-cell">작성자</TableHead>
            <TableHead className="hidden w-24 text-center md:table-cell">
              작성일
            </TableHead>
            <TableHead className="hidden w-16 text-right sm:table-cell">
              조회
            </TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => (
            <TableRow
              key={post.id}
              data-state={selected.has(post.id) ? "selected" : undefined}
            >
              <TableCell>
                <input
                  type="checkbox"
                  className={checkboxClass}
                  aria-label={`${post.title} 선택`}
                  checked={selected.has(post.id)}
                  onChange={() => toggle(post.id)}
                />
              </TableCell>
              <TableCell className="hidden text-center text-muted-foreground tabular-nums sm:table-cell">
                {post.id}
              </TableCell>
              <TableCell>
                <Link
                  href={`/posts/${post.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {post.title}
                  {post.commentCount > 0 && (
                    <span className="ml-1.5 text-xs font-semibold text-primary">
                      [{post.commentCount}]
                    </span>
                  )}
                </Link>
                <div className="truncate text-xs text-muted-foreground md:hidden">
                  {post.author} · {formatDate(post.createdAt)}
                </div>
              </TableCell>
              <TableCell className="hidden truncate md:table-cell">
                {post.author}
              </TableCell>
              <TableCell className="hidden text-center text-muted-foreground tabular-nums md:table-cell">
                {formatDate(post.createdAt)}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">
                {formatNumber(post.views)}
              </TableCell>
              <TableCell className="text-right">
                <ConfirmDelete
                  title="이 글을 삭제할까요?"
                  disabled={pending}
                  onConfirm={() => remove([post.id])}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive"
                    disabled={pending}
                    aria-label={`${post.title} 삭제`}
                  >
                    <Trash2Icon />
                  </Button>
                </ConfirmDelete>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ConfirmDelete({
  title,
  disabled,
  onConfirm,
  children,
}: {
  title: string;
  disabled: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            삭제한 글과 달린 댓글은 되돌릴 수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={disabled}
            onClick={onConfirm}
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
