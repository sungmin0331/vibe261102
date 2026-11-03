import type { Metadata } from "next";

import { PostForm } from "@/components/board/post-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPostOrNotFound } from "@/lib/board/params";

export const metadata: Metadata = { title: "글 수정" };

export default async function EditPostPage({
  params,
}: PageProps<"/posts/[id]/edit">) {
  const { id } = await params;
  const post = await getPostOrNotFound(id);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">글 수정</CardTitle>
      </CardHeader>
      <CardContent>
        <PostForm post={post} />
      </CardContent>
    </Card>
  );
}
