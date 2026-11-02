// Meeting / ActionItem 생성·수정·검증 순수 함수. 상태를 직접 바꾸지 않고 새 객체를 돌려준다.
import { toDateKey, toTime } from './date.js';

export const LIMITS = {
  title: 100,
  location: 100,
  author: 30,
  attendeeName: 30,
  affiliation: 30,
  agenda: 200,
  decision: 300,
  task: 200,
  owner: 30,
  memo: 500,
  discussion: 10000,
  notes: 2000,
  summary: 2000,
  segment: 2000,
};

export const MEETING_TYPES = { regular: '정기', adhoc: '임시', project: '프로젝트', other: '기타' };
export const STATUSES = { todo: '할 일', in_progress: '진행 중', done: '완료', on_hold: '보류' };
export const PRIORITIES = { high: '높음', normal: '보통', low: '낮음' };
export const SECTIONS = ['agenda', 'decisions', 'actionItems'];

const FIELD_LIMITS = {
  title: LIMITS.title,
  location: LIMITS.location,
  author: LIMITS.author,
  discussion: LIMITS.discussion,
  notes: LIMITS.notes,
  summary: LIMITS.summary,
  date: 10,
  startTime: 5,
  endTime: 5,
  type: 10,
};

const ROW_LIMITS = {
  agenda: { text: LIMITS.agenda },
  decisions: { text: LIMITS.decision },
  actionItems: {
    task: LIMITS.task,
    owner: LIMITS.owner,
    dueDate: 10,
    status: 12,
    priority: 6,
    memo: LIMITS.memo,
  },
};

const uuid = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();
const clamp = (value, max) => String(value ?? '').slice(0, max);

export function createSyncMeta() {
  return { status: 'local', serverVersion: null, syncedAt: null, syncedHash: null, lastError: null, retry: null };
}

export function createMeeting({ author = '' } = {}) {
  const now = new Date();
  const rounded = new Date(now);
  rounded.setMinutes(Math.floor(now.getMinutes() / 30) * 30, 0, 0);
  const created = now.toISOString();
  return {
    id: `mtg_${uuid()}`,
    title: '',
    date: toDateKey(now),
    startTime: toTime(rounded),
    endTime: null,
    location: '',
    type: 'regular',
    author: clamp(author, LIMITS.author),
    attendees: [],
    agenda: [createRow('agenda')],
    discussion: '',
    decisions: [createRow('decisions')],
    actionItems: [createRow('actionItems')],
    notes: '',
    summary: '',
    recordings: [],
    transcript: null,
    aiSummary: null,
    recordingConsentAt: null,
    createdAt: created,
    updatedAt: created,
    sync: createSyncMeta(),
  };
}

export function createRow(section, fields = {}) {
  const base = { id: '', order: 0, source: 'manual' };
  if (section === 'actionItems') {
    const now = nowIso();
    return {
      ...base,
      id: `act_${uuid()}`,
      task: '',
      owner: '',
      dueDate: null,
      status: 'todo',
      priority: 'normal',
      memo: '',
      createdAt: now,
      updatedAt: now,
      ...fields,
    };
  }
  return { ...base, id: uuid(), text: '', ...fields };
}

const renumber = (rows) => rows.map((row, i) => (row.order === i ? row : { ...row, order: i }));
const touch = (m) => ({ ...m, updatedAt: nowIso() });

export function updateField(m, field, value) {
  if (!(field in FIELD_LIMITS)) return m;
  let next = value;
  if (field === 'endTime') next = value ? clamp(value, 5) : null;
  else if (field === 'type') next = value in MEETING_TYPES ? value : 'regular';
  else next = clamp(value, FIELD_LIMITS[field]);
  if (m[field] === next) return m;
  return touch({ ...m, [field]: next });
}

export function addRow(m, section, fields = {}, afterId = null) {
  if (!SECTIONS.includes(section)) return m;
  const rows = [...m[section]];
  const index = afterId ? rows.findIndex((r) => r.id === afterId) + 1 : rows.length;
  rows.splice(index > 0 ? index : rows.length, 0, createRow(section, fields));
  return touch({ ...m, [section]: renumber(rows) });
}

export function updateRow(m, section, rowId, field, value) {
  const limits = ROW_LIMITS[section];
  if (!limits || !(field in limits)) return m;
  let next = value;
  if (field === 'dueDate') next = value ? clamp(value, 10) : null;
  else if (field === 'status') next = value in STATUSES ? value : 'todo';
  else if (field === 'priority') next = value in PRIORITIES ? value : 'normal';
  else next = clamp(value, limits[field]);

  let changed = false;
  const rows = m[section].map((row) => {
    if (row.id !== rowId || row[field] === next) return row;
    changed = true;
    const updated = { ...row, [field]: next, source: row.source === 'ai' ? 'ai_edited' : row.source };
    if (section === 'actionItems') updated.updatedAt = nowIso();
    return updated;
  });
  return changed ? touch({ ...m, [section]: rows }) : m;
}

export function removeRow(m, section, rowId) {
  const index = m[section]?.findIndex((r) => r.id === rowId) ?? -1;
  if (index < 0) return { meeting: m, removed: null };
  const rows = m[section].filter((r) => r.id !== rowId);
  return {
    meeting: touch({ ...m, [section]: renumber(rows) }),
    removed: { section, row: m[section][index], index },
  };
}

export function restoreRow(m, { section, row, index }) {
  if (!SECTIONS.includes(section) || m[section].some((r) => r.id === row.id)) return m;
  const rows = [...m[section]];
  rows.splice(Math.min(index, rows.length), 0, row);
  return touch({ ...m, [section]: renumber(rows) });
}

export function moveRow(m, section, rowId, delta) {
  const rows = [...(m[section] ?? [])];
  const from = rows.findIndex((r) => r.id === rowId);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= rows.length) return m;
  const [row] = rows.splice(from, 1);
  rows.splice(to, 0, row);
  return touch({ ...m, [section]: renumber(rows) });
}

/** '김철수(개발), 이영희' → 참석자 추가. 이미 있는 이름은 건너뛴다. */
export function addAttendees(m, raw) {
  const names = new Set(m.attendees.map((a) => a.name));
  const added = [];
  for (const part of String(raw).split(/[,，\n]/)) {
    const match = /^\s*([^()]+?)\s*(?:\(([^)]*)\))?\s*$/.exec(part);
    if (!match) continue;
    const name = clamp(match[1].trim(), LIMITS.attendeeName);
    if (!name || names.has(name)) continue;
    names.add(name);
    added.push({ id: uuid(), name, affiliation: clamp((match[2] || '').trim(), LIMITS.affiliation), present: true });
  }
  return added.length ? touch({ ...m, attendees: [...m.attendees, ...added] }) : m;
}

export function removeAttendee(m, attendeeId) {
  const attendees = m.attendees.filter((a) => a.id !== attendeeId);
  return attendees.length === m.attendees.length ? m : touch({ ...m, attendees });
}

export function toggleAttendeePresent(m, attendeeId) {
  return touch({
    ...m,
    attendees: m.attendees.map((a) => (a.id === attendeeId ? { ...a, present: !a.present } : a)),
  });
}

export function duplicateMeeting(m) {
  const copy = createMeeting({ author: m.author });
  return {
    ...copy,
    title: clamp(`${m.title || '제목 없음'} (사본)`, LIMITS.title),
    date: m.date,
    startTime: m.startTime,
    endTime: m.endTime,
    location: m.location,
    type: m.type,
    attendees: m.attendees.map((a) => ({ ...a, id: uuid() })),
    agenda: m.agenda.map((r) => createRow('agenda', { text: r.text, order: r.order })),
    discussion: m.discussion,
    decisions: m.decisions.map((r) => createRow('decisions', { text: r.text, order: r.order })),
    actionItems: m.actionItems.map((r) =>
      createRow('actionItems', {
        task: r.task,
        owner: r.owner,
        dueDate: r.dueDate,
        status: r.status,
        priority: r.priority,
        memo: r.memo,
        order: r.order,
      }),
    ),
    notes: m.notes,
    summary: m.summary,
  };
}

// ── 받아쓰기 ──
export function addSegment(m, segment) {
  const transcript = m.transcript ?? { segments: [], language: 'ko-KR', updatedAt: nowIso() };
  return touch({
    ...m,
    transcript: { ...transcript, segments: [...transcript.segments, segment], updatedAt: nowIso() },
  });
}

export function editSegment(m, segmentId, patch) {
  if (!m.transcript) return m;
  const segments = m.transcript.segments.map((s) => {
    if (s.id !== segmentId) return s;
    const next = { ...s, ...patch };
    if ('text' in patch) next.text = clamp(patch.text, LIMITS.segment);
    if ('text' in patch && patch.text !== s.text) next.edited = true;
    return next;
  });
  return touch({ ...m, transcript: { ...m.transcript, segments, updatedAt: nowIso() } });
}

export function removeSegment(m, segmentId) {
  if (!m.transcript) return m;
  const segments = m.transcript.segments.filter((s) => s.id !== segmentId);
  return touch({ ...m, transcript: { ...m.transcript, segments, updatedAt: nowIso() } });
}

export function transcriptChars(m) {
  return (m.transcript?.segments ?? []).reduce((sum, s) => sum + s.text.length, 0);
}

// ── 조회·검증 ──
export const filledRows = (rows, key = 'text') => rows.filter((r) => String(r[key] ?? '').trim());

export function openActionCount(m) {
  return filledRows(m.actionItems, 'task').filter((a) => a.status !== 'done').length;
}

export function isOverdue(item, today = toDateKey()) {
  return Boolean(item.dueDate) && item.dueDate < today && item.status !== 'done';
}

/** 저장·내보내기 전 검증. key는 폼 컨트롤의 data-key와 같다. */
export function validate(m) {
  const errors = [];
  if (!m.title.trim()) errors.push({ key: 'title', message: '회의 제목을 입력하세요.' });
  if (!m.date) errors.push({ key: 'date', message: '회의 일자를 입력하세요.' });
  if (!m.startTime) errors.push({ key: 'startTime', message: '시작 시간을 입력하세요.' });
  if (!m.author.trim()) errors.push({ key: 'author', message: '작성자를 입력하세요.' });
  if (!m.attendees.length) errors.push({ key: 'attendees', message: '참석자를 1명 이상 추가하세요.' });
  for (const item of m.actionItems) {
    if (!item.task.trim() && (item.owner.trim() || item.dueDate || item.memo.trim())) {
      errors.push({ key: `actionItems:${item.id}:task`, message: '할 일을 입력하세요.' });
    }
  }
  return errors;
}

export function timeWarning(m) {
  return m.startTime && m.endTime && m.endTime < m.startTime ? '종료 시간이 시작 시간보다 빠릅니다.' : '';
}

export function isValidMeeting(m) {
  return (
    m &&
    typeof m.id === 'string' &&
    typeof m.title === 'string' &&
    Array.isArray(m.attendees) &&
    Array.isArray(m.agenda) &&
    Array.isArray(m.decisions) &&
    Array.isArray(m.actionItems)
  );
}

/** 이전 버전 데이터나 일부 필드가 빠진 데이터를 현재 형태로 채운다. */
export function normalizeMeeting(m) {
  return {
    ...createMeeting(),
    ...m,
    summary: m.summary ?? '',
    recordings: Array.isArray(m.recordings) ? m.recordings : [],
    transcript: m.transcript ?? null,
    aiSummary: m.aiSummary ?? null,
    recordingConsentAt: m.recordingConsentAt ?? null,
    decisions: m.decisions.map((r) => ({ source: 'manual', ...r })),
    actionItems: m.actionItems.map((r) => ({ source: 'manual', priority: 'normal', memo: '', ...r })),
    sync: { ...createSyncMeta(), ...(m.sync ?? {}) },
  };
}
