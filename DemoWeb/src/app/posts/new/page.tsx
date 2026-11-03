import type { Metadata } from "next";

import { PostForm } from "@/components/board/post-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "글쓰기" };

export default async function NewPostPage() {
  const user = await requireUser("/posts/new");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">글쓰기</CardTitle>
      </CardHeader>
      <CardContent>
        <PostForm authorName={user.displayName} />
      </CardContent>
    </Card>
  );
}
