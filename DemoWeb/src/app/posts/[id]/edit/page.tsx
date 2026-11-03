import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PostForm } from "@/components/board/post-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canManage, requireUser } from "@/lib/auth/session";
import { getPostOrNotFound } from "@/lib/board/params";

export const metadata: Metadata = { title: "글 수정" };

export default async function EditPostPage({
  params,
}: PageProps<"/posts/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser(`/posts/${id}/edit`);
  const post = await getPostOrNotFound(id);
  if (!canManage(user, post.authorId)) redirect(`/posts/${post.id}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">글 수정</CardTitle>
      </CardHeader>
      <CardContent>
        <PostForm post={post} authorName={user.displayName} />
      </CardContent>
    </Card>
  );
}
