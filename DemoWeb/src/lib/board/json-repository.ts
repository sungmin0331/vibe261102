import { promises as fs } from "node:fs";
import path from "node:path";

import type { BoardRepository } from "./repository";
import { createSeedData, type BoardData } from "./seed";
import type { PostSummary } from "./types";

/**
 * 로컬 JSON 파일 하나에 게시글과 댓글을 저장하는 구현입니다.
 * 파일이 없으면 샘플 데이터로 새로 만듭니다. 한 프로세스 안에서 모든 읽기/쓰기를
 * 순서대로 처리해 동시 요청이 서로의 변경을 덮어쓰지 않게 합니다.
 */
export function createJsonRepository(filePath: string): BoardRepository {
  let queue: Promise<unknown> = Promise.resolve();

  async function load(): Promise<BoardData> {
    try {
      return JSON.parse(await fs.readFile(filePath, "utf8")) as BoardData;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const data = createSeedData();
      await save(data);
      return data;
    }
  }

  async function save(data: BoardData) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
  }

  function run<T>(
    task: (data: BoardData) => T,
    { write = false }: { write?: boolean } = {},
  ): Promise<T> {
    const result = queue.then(async () => {
      const data = await load();
      const value = task(data);
      if (write) await save(data);
      return value;
    });
    queue = result.catch(() => undefined);
    return result;
  }

  const now = () => new Date().toISOString();

  return {
    listPosts({ query = "", field = "all", page = 1, pageSize = 10 }) {
      return run((data) => {
        const needle = query.trim().toLowerCase();
        const matched = data.posts
          .filter((post) => {
            if (!needle) return true;
            const inTitle = post.title.toLowerCase().includes(needle);
            const inContent = post.content.toLowerCase().includes(needle);
            if (field === "title") return inTitle;
            if (field === "content") return inContent;
            return inTitle || inContent;
          })
          .sort((a, b) => b.id - a.id);

        const total = matched.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const current = Math.min(Math.max(1, page), totalPages);
        const items: PostSummary[] = matched
          .slice((current - 1) * pageSize, current * pageSize)
          .map((post) => ({
            id: post.id,
            title: post.title,
            author: post.author,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt,
            views: post.views,
            commentCount: data.comments.filter((c) => c.postId === post.id)
              .length,
          }));

        return { items, total, page: current, pageSize, totalPages };
      });
    },

    getPost(id) {
      return run((data) => data.posts.find((p) => p.id === id) ?? null);
    },

    createPost(input) {
      return run(
        (data) => {
          const timestamp = now();
          const post = {
            id: data.nextPostId++,
            ...input,
            createdAt: timestamp,
            updatedAt: timestamp,
            views: 0,
          };
          data.posts.push(post);
          return post;
        },
        { write: true },
      );
    },

    updatePost(id, input) {
      return run(
        (data) => {
          const post = data.posts.find((p) => p.id === id);
          if (!post) return null;
          Object.assign(post, input, { updatedAt: now() });
          return post;
        },
        { write: true },
      );
    },

    deletePost(id) {
      return run(
        (data) => {
          const before = data.posts.length;
          data.posts = data.posts.filter((p) => p.id !== id);
          data.comments = data.comments.filter((c) => c.postId !== id);
          return data.posts.length !== before;
        },
        { write: true },
      );
    },

    incrementViews(id) {
      return run(
        (data) => {
          const post = data.posts.find((p) => p.id === id);
          if (!post) return null;
          post.views += 1;
          return post.views;
        },
        { write: true },
      );
    },

    listComments(postId) {
      return run((data) =>
        data.comments
          .filter((c) => c.postId === postId)
          .sort((a, b) => a.id - b.id),
      );
    },

    createComment(postId, input) {
      return run(
        (data) => {
          if (!data.posts.some((p) => p.id === postId)) return null;
          const comment = {
            id: data.nextCommentId++,
            postId,
            ...input,
            createdAt: now(),
          };
          data.comments.push(comment);
          return comment;
        },
        { write: true },
      );
    },

    deleteComment(postId, commentId) {
      return run(
        (data) => {
          const before = data.comments.length;
          data.comments = data.comments.filter(
            (c) => !(c.postId === postId && c.id === commentId),
          );
          return data.comments.length !== before;
        },
        { write: true },
      );
    },
  };
}
