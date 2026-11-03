// 개발용 서버: 정적 파일 + Apps Script 에뮬레이터 엔드포인트(/mock/exec)
//   node dev/dev-server.mjs [port]
// 웹페이지 설정에 URL http://localhost:<port>/mock/exec, 토큰 dev-token 을 넣으면 실제 시트 없이 동기화·AI 요약을 시험할 수 있다.
// 테스트용: GET /mock/fail?n=3 → 다음 저장 3번을 INTERNAL 오류로 실패시킨다. GET /mock/sheets → 에뮬레이터 시트 내용.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmulator } from './gas-emulator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 5174);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

/** Claude API 대신 받아쓰기에서 문장을 골라 그럴듯한 초안을 만든다 (실제 모델 호출 아님). */
function fakeClaude(url, options) {
  const content = JSON.parse(options.payload).messages[0].content;
  const attendees = (/- 참석자: (.*)/.exec(content)?.[1] ?? '').split(', ').filter((n) => n && n !== '(없음)');
  const lines = content
    .split('\n')
    .filter((l) => /^\[\d/.test(l))
    .map((l) => l.replace(/^\[[^\]]*\]\s*(\S+:\s*)?/, '').trim())
    .filter(Boolean);
  const owner = (l) => attendees.find((n) => l.includes(n.slice(1)) || l.includes(n)) ?? null;
  const draft = {
    summary: `(개발용 가짜 요약) ${lines.slice(0, 2).join(' ')}`.slice(0, 300),
    agenda: [...new Set(lines.filter((l) => /안건|일정|논의/.test(l)).map((l) => l.slice(0, 30)))].slice(0, 3),
    discussion: lines.slice(0, 5).map((l) => `- ${l}`).join('\n'),
    decisions: lines.filter((l) => /하기로|결정|확정/.test(l)).slice(0, 5),
    actionItems: lines
      .filter((l) => /까지|담당|하겠습니다|해 주세요/.test(l))
      .slice(0, 5)
      .map((l) => ({ task: l.slice(0, 60), owner: owner(l), dueDate: null, status: 'todo', evidence: l.slice(0, 80) })),
    openQuestions: lines.filter((l) => /\?|미정/.test(l)).slice(0, 3),
  };
  return {
    status: 200,
    body: { model: 'mock-claude', stop_reason: 'end_turn', usage: { input_tokens: content.length, output_tokens: 200 }, content: [{ type: 'text', text: JSON.stringify(draft) }] },
  };
}

const gas = createEmulator({
  scriptDir: path.join(root, 'apps-script'),
  properties: { SYNC_TOKEN: 'dev-token', AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'dev-key', AI_DAILY_LIMIT: '1000' },
  fetchHandler: fakeClaude,
});
let failNext = 0;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname === '/mock/exec' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    const action = (() => {
      try {
        return JSON.parse(body).action;
      } catch {
        return '';
      }
    })();
    let out;
    if (failNext > 0 && action === 'upsertMeeting') {
      failNext -= 1;
      out = { ok: false, code: 'INTERNAL', message: '(개발용) 강제 실패' };
    } else {
      out = gas.post(body);
    }
    // 실제 Apps Script처럼 약간 늦게 응답한다
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    }, action === 'summarize' ? 1500 : 400);
    return;
  }
  if (url.pathname === '/mock/fail') {
    failNext = Number(url.searchParams.get('n') || 1);
    res.end(`다음 저장 ${failNext}번 실패`);
    return;
  }
  if (url.pathname === '/mock/sheets') {
    const names = ['Meetings', 'ActionItems', '_SyncLog', '_AiUsage'];
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(Object.fromEntries(names.map((n) => [n, gas.sheet(n)?.records() ?? []])), null, 2));
    return;
  }
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(root, rel);
  if (!file.startsWith(root) || rel.includes('/dev/') || rel.includes('/apps-script/')) {
    res.writeHead(404).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(port, () => {
  console.log(`회의록 개발 서버: http://localhost:${port}`);
  console.log(`설정 → 웹앱 URL http://localhost:${port}/mock/exec · 토큰 dev-token`);
});
