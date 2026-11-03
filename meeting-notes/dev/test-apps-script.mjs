// Apps Script 백엔드 스모크 테스트: node dev/test-apps-script.mjs
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createEmulator } from './gas-emulator.mjs';

const scriptDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps-script');
const TOKEN = 'test-token-1234';
let claudeCalls = [];

const gas = createEmulator({
  scriptDir,
  properties: { SYNC_TOKEN: TOKEN, AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'sk-test', AI_DAILY_LIMIT: '3' },
  fetchHandler: (url, options) => {
    claudeCalls.push({ url, options, payload: JSON.parse(options.payload) });
    return {
      status: 200,
      body: {
        model: 'claude-opus-5-5',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1200, output_tokens: 300 },
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              summary: '릴리스를 11/14로 연기했다.',
              agenda: ['릴리스 일정'],
              discussion: '- QA 지연',
              decisions: ['릴리스 11/14'],
              actionItems: [{ task: '체크리스트 작성', owner: '이영희', dueDate: '2026-11-07', status: 'todo', evidence: '영희 님이 금요일까지' }],
              openQuestions: [],
            }),
          },
        ],
      },
    };
  },
});

const base = { token: TOKEN, clientId: 'client-1', schemaVersion: 1 };
const now = new Date().toISOString();
const meeting = (patch = {}) => ({
  id: 'mtg_11111111-2222-3333-4444-555555555555',
  title: '주간 개발 회의',
  date: '2026-11-02',
  startTime: '14:00',
  endTime: '15:00',
  location: '3층 회의실',
  type: 'regular',
  author: '김철수',
  attendees: [
    { name: '김철수', affiliation: '개발', present: true },
    { name: '박민수', affiliation: '', present: false },
  ],
  agenda: ['지난주 점검', '릴리스 일정'],
  discussion: '- QA 지연',
  decisions: ['릴리스일 11/14'],
  notes: '',
  summary: '',
  hasRecording: true,
  transcriptChars: 120,
  createdAt: now,
  updatedAt: now,
  ...patch,
});
const action = (id, patch = {}) => ({
  id: `act_${id}`,
  task: `할 일 ${id}`,
  owner: '이영희',
  dueDate: '2026-11-07',
  status: 'todo',
  priority: 'normal',
  memo: '',
  order: 0,
  source: 'manual',
  createdAt: now,
  updatedAt: now,
  ...patch,
});

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}\n  ${err.message}`);
    console.error(gas.logs.slice(-5).join('\n'));
    process.exitCode = 1;
  }
}

test('토큰이 틀리면 UNAUTHORIZED', () => {
  const res = gas.post({ ...base, token: 'wrong', action: 'ping' });
  assert.equal(res.code, 'UNAUTHORIZED');
});

test('ping이 시트를 만들고 기능 정보를 돌려준다', () => {
  const res = gas.post({ ...base, action: 'ping', requestId: 'r0' });
  assert.equal(res.ok, true);
  assert.deepEqual(res.features, { ai: true, transcribe: false });
  assert.ok(gas.sheet('Meetings') && gas.sheet('ActionItems') && gas.sheet('_SyncLog'));
});

test('새 회의 저장 → Meetings 1행, ActionItems 2행', () => {
  const res = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r1', baseVersion: null, meeting: meeting(), actionItems: [action('a'), action('b')] });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.version, 1);
  assert.deepEqual(res.actionItems, { inserted: 2, updated: 0, deleted: 0 });
  const [row] = gas.sheet('Meetings').records();
  assert.equal(row.attendees, '김철수(개발)');
  assert.equal(row.absentees, '박민수');
  assert.equal(row.agenda, '1. 지난주 점검\n2. 릴리스 일정');
  assert.equal(row.type, '정기');
  assert.ok(row.date instanceof Date || typeof row.date === 'object');
  assert.equal(gas.sheet('ActionItems').records().length, 2);
});

test('같은 requestId 재전송은 중복 없이 같은 결과', () => {
  const res = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r1', baseVersion: null, meeting: meeting(), actionItems: [action('a'), action('b')] });
  assert.equal(res.version, 1);
  assert.equal(gas.sheet('Meetings').records().length, 1);
});

test('수정 저장 → 같은 행 갱신, version+1, 빠진 액션은 deleted', () => {
  const res = gas.post({
    ...base,
    action: 'upsertMeeting',
    requestId: 'r2',
    baseVersion: 1,
    meeting: meeting({ title: '주간 회의(수정)' }),
    actionItems: [action('a', { status: 'done' }), action('c')],
  });
  assert.equal(res.version, 2);
  assert.deepEqual(res.actionItems, { inserted: 1, updated: 1, deleted: 1 });
  const meetings = gas.sheet('Meetings').records();
  assert.equal(meetings.length, 1);
  assert.equal(meetings[0].title, '주간 회의(수정)');
  assert.equal(meetings[0].action_open, 1);
  const items = Object.fromEntries(gas.sheet('ActionItems').records().map((r) => [r.action_id, r]));
  assert.equal(items.act_a.status, '완료');
  assert.equal(items.act_b.deleted, true);
  assert.equal(items.act_c.meeting_title, '주간 회의(수정)');
});

test('기준 버전이 낡으면 CONFLICT, force면 덮어쓰기', () => {
  const conflict = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r3', baseVersion: 1, meeting: meeting(), actionItems: [] });
  assert.equal(conflict.code, 'CONFLICT');
  assert.equal(conflict.serverVersion, 2);
  const forced = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r4', baseVersion: 1, force: true, meeting: meeting(), actionItems: [] });
  assert.equal(forced.version, 3);
});

test('수식 주입 방지: =로 시작하는 값은 문자열', () => {
  for (const s of ['=SUM(A1:A9)', '+1', '-2', '@x']) assert.equal(gas.call('safeText_', s), `'${s}`);
  assert.equal(gas.call('safeText_', '일반 텍스트'), '일반 텍스트');
  const res = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r5', baseVersion: 3, meeting: meeting({ title: '=SUM(A1:A9)' }), actionItems: [] });
  assert.equal(res.ok, true);
});

test('필수값 누락은 BAD_REQUEST', () => {
  const res = gas.post({ ...base, action: 'upsertMeeting', requestId: 'r6', meeting: meeting({ title: '' }), actionItems: [] });
  assert.equal(res.code, 'BAD_REQUEST');
});

test('삭제 → 회의·액션 deleted', () => {
  const res = gas.post({ ...base, action: 'deleteMeeting', requestId: 'r7', meetingId: meeting().id });
  assert.equal(res.ok, true);
  assert.equal(gas.sheet('Meetings').records()[0].deleted, true);
});

test('AI 요약: 구조화 출력 요청 + 초안 반환 + 사용량 기록', () => {
  const transcriptText = '[14:01:00] 이영희: QA 일정이 3일 밀립니다. '.repeat(5);
  const res = gas.post({
    ...base,
    action: 'summarize',
    meetingId: meeting().id,
    meeting: { title: '주간 회의', date: '2026-11-02', attendees: ['김철수', '이영희'], agenda: [] },
    notesText: '',
    transcriptText,
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.draft.actionItems[0].owner, '이영희');
  const call = claudeCalls.at(-1);
  assert.equal(call.options.headers['x-api-key'], 'sk-test');
  assert.equal(call.payload.output_config.format.type, 'json_schema');
  assert.equal(call.payload.fallbacks, 'default');
  assert.match(call.payload.messages[0].content, /<transcript>/);
  assert.equal(gas.sheet('_AiUsage').records().at(-1).result, 'OK');
});

test('AI 요약: 같은 회의 30초 쿨다운', () => {
  const res = gas.post({ ...base, action: 'summarize', meetingId: meeting().id, meeting: {}, notesText: 'x'.repeat(100), transcriptText: '' });
  assert.equal(res.code, 'AI_QUOTA_EXCEEDED');
});

test('AI 요약: 꺼져 있으면 AI_DISABLED', () => {
  gas.props.set('AI_ENABLED', 'false');
  const res = gas.post({ ...base, action: 'summarize', meetingId: 'mtg_other', meeting: {}, notesText: 'x'.repeat(100), transcriptText: '' });
  assert.equal(res.code, 'AI_DISABLED');
  gas.props.set('AI_ENABLED', 'true');
});
