import path from "node:path";

import { createJsonRepository } from "./json-repository";
import { createPostgresRepository } from "./postgres-repository";
import type { BoardRepository } from "./repository";

export type { BoardRepository } from "./repository";
export * from "./types";

// DATABASE_URL이 있으면 Neon(PostgreSQL)을, 없으면 로컬 JSON 파일을 씁니다.
// 다른 저장소로 바꾸려면 BoardRepository를 구현한 객체를 여기서 내보내면 됩니다.
export const board: BoardRepository = process.env.DATABASE_URL
  ? createPostgresRepository(process.env.DATABASE_URL)
  : createJsonRepository(
      process.env.BOARD_DATA_FILE ??
        path.join(process.cwd(), "data", "board.json"),
    );
