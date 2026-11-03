import {
  ArrowLeftIcon,
  CalendarIcon,
  EyeIcon,
  PencilIcon,
  UserIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { CommentForm } from "@/components/board/comment-form";
import { DeleteCommentButton } from "@/components/board/delete-comment-button";
import { DeletePostButton } from "@/components/board/delete-post-button";
import { ViewCounter } from "@/components/board/view-counter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { canManage, getCurrentUser } from "@/lib/auth/session";
import { board } from "@/lib/board";
import { getPostOrNotFound } from "@/lib/board/params";
import { formatDateTime } from "@/lib/format";

export async function generateMetadata({
  params,
}: PageProps<"/posts/[id]">): Promise<Metadata> {
  const { id } = await params;
  const post = await board.getPost(Number(id));
  return { title: post?.title ?? "글을 찾을 수 없습니다" };
}

export default async function PostPage({ params }: PageProps<"/posts/[id]">) {
  const { id } = await params;
  const post = await getPostOrNotFound(id);
  const [comments, user] = await Promise.all([
    board.listComments(post.id),
    getCurrentUser(),
  ]);
  const edited = post.updatedAt !== post.createdAt;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-xl leading-snug break-words sm:text-2xl">
            {post.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <UserIcon className="size-3.5" />
              {post.author}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <CalendarIcon className="size-3.5" />
              {formatDateTime(post.createdAt)}
              {edited && <span>(수정됨)</span>}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <EyeIcon className="size-3.5" />
              조회 <ViewCounter postId={post.id} initial={post.views} />
            </span>
          </div>
        </CardHeader>
        <Separator />
        <CardContent>
          <div className="min-h-40 py-2 leading-relaxed break-words whitespace-pre-wrap">
            {post.content}
          </div>
        </CardContent>
        <CardFooter className="flex-wrap justify-between gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <ArrowLeftIcon data-icon="inline-start" />
              목록
            </Link>
          </Button>
          {canManage(user, post.authorId) && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/posts/${post.id}/edit`}>
                  <PencilIcon data-icon="inline-start" />
                  수정
                </Link>
              </Button>
              <DeletePostButton postId={post.id} />
            </div>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>댓글 {comments.length}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {comments.length > 0 ? (
            <ul className="divide-y">
              {comments.map((comment) => (
                <li key={comment.id} className="flex gap-3 py-3 first:pt-0">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="font-medium">{comment.author}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {formatDateTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm break-words whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                  {canManage(user, comment.authorId) && (
                    <DeleteCommentButton
                      postId={post.id}
                      commentId={comment.id}
                    />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              첫 댓글을 남겨 보세요.
            </p>
          )}
          <Separator />
          {user ? (
            <CommentForm postId={post.id} authorName={user.displayName} />
          ) : (
            <p className="text-sm text-muted-foreground">
              댓글을 쓰려면{" "}
              <Link
                href={`/login?next=/posts/${post.id}`}
                className="text-foreground underline"
              >
                로그인
              </Link>
              하세요.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
