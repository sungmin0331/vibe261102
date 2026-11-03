// 회원을 관리자로 지정하고 가입을 승인합니다.
// 사용법: npm run set-admin -- <아이디>
// DATABASE_URL이 있으면 Neon(PostgreSQL)을, 없으면 data/board.json을 수정합니다.
import { promises as fs } from "node:fs";
import path from "node:path";

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error("사용법: npm run set-admin -- <아이디>");
  process.exit(1);
}

async function withPostgres(url) {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const rows = await sql`
    UPDATE board_users
       SET role = 'admin', status = 'approved',
           approved_at = COALESCE(approved_at, now())
     WHERE username = ${username}
    RETURNING username, display_name`;
  return rows[0] ? `${rows[0].display_name}(${rows[0].username})` : null;
}

async function withJson(file) {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  const user = data.users?.find((u) => u.username === username);
  if (!user) return null;
  user.role = "admin";
  user.status = "approved";
  user.approvedAt ??= new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  return `${user.displayName}(${user.username})`;
}

const result = process.env.DATABASE_URL
  ? await withPostgres(process.env.DATABASE_URL)
  : await withJson(
      process.env.BOARD_DATA_FILE ??
        path.join(process.cwd(), "data", "board.json"),
    );

if (!result) {
  console.error(
    `'${username}' 회원을 찾을 수 없습니다. 먼저 /signup에서 가입 신청하세요.`,
  );
  process.exit(1);
}
console.log(`${result} 님을 관리자로 지정했습니다.`);
