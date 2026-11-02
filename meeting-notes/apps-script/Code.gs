/**
 * @OnlyCurrentDoc
 * 회의록 동기화 웹앱 — doPost 라우터, 토큰 검증, 회의 ID 기준 upsert, 락, 멱등성.
 *
 * 스크립트 속성 (프로젝트 설정 → 스크립트 속성):
 *   SYNC_TOKEN         (필수) 웹페이지 설정에 입력할 동기화 토큰
 *   AI_ENABLED         'true'일 때만 AI 요약 사용
 *   ANTHROPIC_API_KEY  AI 요약용 Claude API 키
 *   AI_MODEL           기본 claude-opus-5-5
 *   AI_EFFORT          기본 medium (low | medium | high)
 *   AI_DAILY_LIMIT     하루 AI 요약 횟수 한도, 기본 50
 */

var SCHEMA_VERSION = 1;
var MAX_BODY_CHARS = 1000000;
var IDEMPOTENCY_TTL_SEC = 21600; // 6시간

var LIMITS = {
  title: 100, location: 100, author: 30, attendeeName: 30, affiliation: 30,
  agenda: 200, decision: 300, task: 200, owner: 30, memo: 500,
  discussion: 10000, notes: 2000, summary: 2000, listItems: 200
};

var TYPE_LABELS = { regular: '정기', adhoc: '임시', project: '프로젝트', other: '기타' };
var STATUS_LABELS = { todo: '할 일', in_progress: '진행 중', done: '완료', on_hold: '보류' };
var STATUS_LABELS_LIST = ['할 일', '진행 중', '완료', '보류'];
var PRIORITY_LABELS = { high: '높음', normal: '보통', low: '낮음' };
var SOURCES = ['manual', 'ai', 'ai_edited'];

function doGet() {
  return ContentService.createTextOutput('회의록 동기화 엔드포인트입니다. 웹페이지에서 POST로 호출합니다.');
}

function doPost(e) {
  var req = {};
  try {
    var body = (e && e.postData && e.postData.contents) || '';
    if (body.length > MAX_BODY_CHARS) return json_(fail_('PAYLOAD_TOO_LARGE', '요청이 너무 큽니다.'));
    try {
      req = JSON.parse(body);
    } catch (err) {
      return json_(fail_('BAD_REQUEST', 'JSON 형식이 아닙니다.'));
    }
    if (!req || typeof req !== 'object') return json_(fail_('BAD_REQUEST', '요청 형식이 올바르지 않습니다.'));

    var auth = checkToken_(req.token);
    if (auth === 'missing') return json_(fail_('UNAUTHORIZED', '스크립트 속성 SYNC_TOKEN이 설정되지 않았습니다.'));
    if (auth !== 'ok') return json_(fail_('UNAUTHORIZED', '동기화 토큰이 올바르지 않습니다.'));
    if (req.schemaVersion !== SCHEMA_VERSION) {
      return json_(fail_('SCHEMA_MISMATCH', '웹페이지와 스크립트의 버전이 다릅니다. 스크립트를 최신으로 다시 배포하세요.'));
    }
    if (req.requestId !== undefined && (typeof req.requestId !== 'string' || req.requestId.length > 100)) {
      return json_(fail_('BAD_REQUEST', 'requestId 형식이 올바르지 않습니다.'));
    }

    switch (req.action) {
      case 'ping':
        return json_(ping_());
      case 'upsertMeeting':
        return json_(withLock_(req, upsertMeeting_));
      case 'deleteMeeting':
        return json_(withLock_(req, deleteMeeting_));
      case 'summarize':
        return json_(summarize_(req));
      default:
        return json_(fail_('BAD_REQUEST', '지원하지 않는 action입니다.'));
    }
  } catch (err) {
    if (err && err.apiCode) return json_(fail_(err.apiCode, err.message, err.extra));
    console.error(err && err.stack ? err.stack : err);
    return json_(fail_('INTERNAL', '스크립트 오류가 발생했습니다. 잠시 후 다시 시도합니다.'));
  }
}

// ─────────────────── 공통 ───────────────────

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message, extra) {
  var out = { ok: false, code: code, message: message };
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

function apiError_(code, message, extra) {
  var err = new Error(message);
  err.apiCode = code;
  err.extra = extra || null;
  return err;
}

/** 해시끼리 비교해 길이·내용에 따른 응답 시간 차이를 줄인다. */
function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('SYNC_TOKEN');
  if (!expected) return 'missing';
  if (typeof token !== 'string' || !token) return 'bad';
  var digest = function (s) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  };
  var a = digest(token);
  var b = digest(expected);
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0 ? 'ok' : 'bad';
}

/** 시트를 쓰는 요청: 스크립트 락 + requestId 멱등성 + 로그 */
function withLock_(req, handler) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw apiError_('LOCK_TIMEOUT', '다른 저장 작업과 겹쳤습니다. 잠시 후 다시 시도합니다.');
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = req.requestId ? 'req:' + req.requestId : null;
    if (cacheKey) {
      var hit = cache.get(cacheKey);
      if (hit) return JSON.parse(hit);
    }
    ensureSchema_();
    var result = handler(req);
    SpreadsheetApp.flush();
    if (cacheKey) cache.put(cacheKey, JSON.stringify(result), IDEMPOTENCY_TTL_SEC);
    logSync_(req, 'OK', result.detail || '');
    delete result.detail;
    return result;
  } catch (err) {
    if (err && err.apiCode) logSync_(req, err.apiCode, err.message);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

function ping_() {
  ensureSchema_();
  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    features: { ai: aiEnabled_(), transcribe: false },
    serverTime: new Date().toISOString()
  };
}

// ─────────────────── 검증 ───────────────────

function str_(value, max, name, required) {
  if (value === null || value === undefined) value = '';
  if (typeof value !== 'string') throw apiError_('BAD_REQUEST', name + ' 형식이 올바르지 않습니다.');
  if (value.length > max) throw apiError_('BAD_REQUEST', name + '은(는) ' + max + '자 이하여야 합니다.');
  if (required && !value.trim()) throw apiError_('BAD_REQUEST', name + '을(를) 입력하세요.');
  return value;
}

function pattern_(value, re, name, optional) {
  if (optional && (value === null || value === undefined || value === '')) return null;
  if (typeof value !== 'string' || !re.test(value)) throw apiError_('BAD_REQUEST', name + ' 형식이 올바르지 않습니다.');
  return value;
}

function list_(value, name) {
  if (!Array.isArray(value)) throw apiError_('BAD_REQUEST', name + ' 형식이 올바르지 않습니다.');
  if (value.length > LIMITS.listItems) throw apiError_('BAD_REQUEST', name + ' 항목이 너무 많습니다.');
  return value;
}

var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
var TIME_RE = /^\d{2}:\d{2}$/;
var ISO_RE = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

function validateMeeting_(m) {
  if (!m || typeof m !== 'object') throw apiError_('BAD_REQUEST', '회의 정보가 없습니다.');
  return {
    id: pattern_(m.id, /^mtg_[\w-]{1,60}$/, '회의 ID'),
    title: str_(m.title, LIMITS.title, '회의 제목', true),
    date: pattern_(m.date, DATE_RE, '일자'),
    startTime: pattern_(m.startTime, TIME_RE, '시작 시간'),
    endTime: pattern_(m.endTime, TIME_RE, '종료 시간', true),
    location: str_(m.location, LIMITS.location, '장소'),
    type: TYPE_LABELS[m.type] ? m.type : 'other',
    author: str_(m.author, LIMITS.author, '작성자', true),
    attendees: list_(m.attendees, '참석자').map(function (a) {
      return {
        name: str_(a && a.name, LIMITS.attendeeName, '참석자 이름', true),
        affiliation: str_(a && a.affiliation, LIMITS.affiliation, '소속'),
        present: !(a && a.present === false)
      };
    }),
    agenda: list_(m.agenda, '안건').map(function (t) { return str_(t, LIMITS.agenda, '안건', true); }),
    discussion: str_(m.discussion, LIMITS.discussion, '논의 내용'),
    decisions: list_(m.decisions, '결정 사항').map(function (t) { return str_(t, LIMITS.decision, '결정 사항', true); }),
    notes: str_(m.notes, LIMITS.notes, '비고'),
    summary: str_(m.summary, LIMITS.summary, '요약'),
    hasRecording: m.hasRecording === true,
    transcriptChars: Math.max(0, Math.floor(Number(m.transcriptChars) || 0)),
    createdAt: pattern_(m.createdAt, ISO_RE, '작성 시각'),
    updatedAt: pattern_(m.updatedAt, ISO_RE, '수정 시각')
  };
}

function validateActionItems_(items) {
  var seen = {};
  return list_(items || [], '액션 아이템').map(function (a, i) {
    if (!a || typeof a !== 'object') throw apiError_('BAD_REQUEST', '액션 아이템 형식이 올바르지 않습니다.');
    var id = pattern_(a.id, /^act_[\w-]{1,60}$/, '액션 아이템 ID');
    if (seen[id]) throw apiError_('BAD_REQUEST', '액션 아이템 ID가 중복되었습니다.');
    seen[id] = true;
    return {
      id: id,
      task: str_(a.task, LIMITS.task, '할 일', true),
      owner: str_(a.owner, LIMITS.owner, '담당자'),
      dueDate: pattern_(a.dueDate, DATE_RE, '기한', true),
      status: STATUS_LABELS[a.status] ? a.status : 'todo',
      priority: PRIORITY_LABELS[a.priority] ? a.priority : 'normal',
      memo: str_(a.memo, LIMITS.memo, '메모'),
      order: i,
      source: SOURCES.indexOf(a.source) !== -1 ? a.source : 'manual',
      createdAt: pattern_(a.createdAt, ISO_RE, '작성 시각'),
      updatedAt: pattern_(a.updatedAt, ISO_RE, '수정 시각')
    };
  });
}

// ─────────────────── upsert ───────────────────

function attendeeLabel_(a) {
  return a.affiliation ? a.name + '(' + a.affiliation + ')' : a.name;
}

function upsertMeeting_(req) {
  var m = validateMeeting_(req.meeting);
  var items = validateActionItems_(req.actionItems);
  var meetings = openTable_('Meetings');
  var actions = openTable_('ActionItems');
  var now = new Date().toISOString();

  // 1) 회의 행: 낙관적 동시성 (baseVersion과 시트 version 비교)
  var index = findRowIndex_(meetings, 'meeting_id', m.id);
  var version = 1;
  if (index >= 0) {
    var current = Number(meetings.rows[index][meetings.col.version]) || 0;
    var base = req.baseVersion === null || req.baseVersion === undefined ? null : Number(req.baseVersion);
    if (!req.force && (base === null || current > base)) {
      throw apiError_('CONFLICT', '시트의 버전(' + current + ')이 이 기기의 기준 버전(' + (base === null ? '없음' : base) + ')보다 최신입니다.', {
        serverVersion: current
      });
    }
    version = current + 1;
  }

  var payloadJson = JSON.stringify({ meeting: m, actionItems: items });
  setRecord_(meetings, index, {
    meeting_id: m.id,
    title: m.title,
    date: m.date,
    start_time: m.startTime,
    end_time: m.endTime || '',
    location: m.location,
    type: TYPE_LABELS[m.type],
    author: m.author,
    attendees: m.attendees.filter(function (a) { return a.present; }).map(attendeeLabel_).join(', '),
    absentees: m.attendees.filter(function (a) { return !a.present; }).map(attendeeLabel_).join(', '),
    agenda: m.agenda.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n'),
    discussion: m.discussion,
    decisions: m.decisions.map(function (t) { return '- ' + t; }).join('\n'),
    notes: m.notes,
    action_total: items.length,
    action_open: items.filter(function (a) { return a.status !== 'done'; }).length,
    version: version,
    created_at: m.createdAt,
    updated_at: m.updatedAt,
    synced_at: now,
    client_id: String(req.clientId || '').slice(0, 60),
    deleted: false,
    payload_json: payloadJson.length <= MAX_CELL_CHARS ? payloadJson : '',
    summary: m.summary,
    has_recording: m.hasRecording,
    transcript_chars: m.transcriptChars
  });

  // 2) 액션 아이템: action_id 기준 갱신/추가, 요청에 없는 이 회의의 항목은 소프트 삭제
  var byId = {};
  actions.rows.forEach(function (row, i) { byId[String(row[actions.col.action_id])] = i; });
  var counts = { inserted: 0, updated: 0, deleted: 0 };
  var requested = {};
  items.forEach(function (a) {
    requested[a.id] = true;
    var i = byId[a.id] === undefined ? -1 : byId[a.id];
    setRecord_(actions, i, {
      action_id: a.id,
      meeting_id: m.id,
      meeting_title: m.title,
      meeting_date: m.date,
      task: a.task,
      owner: a.owner,
      due_date: a.dueDate || '',
      status: STATUS_LABELS[a.status],
      priority: PRIORITY_LABELS[a.priority],
      memo: a.memo,
      order: a.order,
      created_at: a.createdAt,
      updated_at: a.updatedAt,
      deleted: false,
      source: a.source
    });
    counts[i >= 0 ? 'updated' : 'inserted'] += 1;
  });
  actions.rows.forEach(function (row, i) {
    var id = String(row[actions.col.action_id]);
    if (String(row[actions.col.meeting_id]) !== m.id || requested[id] || isTrue_(row[actions.col.deleted])) return;
    setRecord_(actions, i, { deleted: true, updated_at: now });
    counts.deleted += 1;
  });

  commitTable_(meetings);
  commitTable_(actions);

  return {
    ok: true,
    meetingId: m.id,
    version: version,
    syncedAt: now,
    actionItems: counts,
    detail: 'v' + version + ' 액션 +' + counts.inserted + ' ~' + counts.updated + ' -' + counts.deleted
  };
}

function deleteMeeting_(req) {
  var id = pattern_(req.meetingId, /^mtg_[\w-]{1,60}$/, '회의 ID');
  var meetings = openTable_('Meetings');
  var actions = openTable_('ActionItems');
  var now = new Date().toISOString();
  var index = findRowIndex_(meetings, 'meeting_id', id);
  if (index < 0) return { ok: true, meetingId: id, deleted: 0, detail: '시트에 없음' };

  var version = (Number(meetings.rows[index][meetings.col.version]) || 0) + 1;
  setRecord_(meetings, index, { deleted: true, version: version, synced_at: now });
  var count = 0;
  actions.rows.forEach(function (row, i) {
    if (String(row[actions.col.meeting_id]) !== id || isTrue_(row[actions.col.deleted])) return;
    setRecord_(actions, i, { deleted: true, updated_at: now });
    count += 1;
  });
  commitTable_(meetings);
  commitTable_(actions);
  return { ok: true, meetingId: id, version: version, syncedAt: now, deleted: count, detail: '액션 ' + count + '건 숨김' };
}
