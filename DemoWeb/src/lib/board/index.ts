import path from "node:path";

import { createJsonRepository } from "./json-repository";
import type { BoardRepository } from "./repository";

export type { BoardRepository } from "./repository";
export * from "./types";

// 저장소를 바꾸려면 BoardRepository를 구현한 다른 객체를 여기서 내보내면 됩니다.
export const board: BoardRepository = createJsonRepository(
  process.env.BOARD_DATA_FILE ?? path.join(process.cwd(), "data", "board.json"),
);
