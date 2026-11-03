import { notFound } from "next/navigation";

import { board } from ".";

/** URL의 id 세그먼트로 글을 찾고, 없으면 404 페이지를 보여 줍니다. */
export async function getPostOrNotFound(rawId: string) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const post = await board.getPost(id);
  if (!post) notFound();
  return post;
}
