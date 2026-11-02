/**
 * 시트 구조 정의 · 생성(setup) · 헤더 이름 기반 읽기/쓰기.
 * 열은 위치가 아니라 1행 헤더 이름으로 찾는다. 사용자가 열 순서를 바꾸거나 오른쪽에 열을 추가해도 동작한다.
 */

var SHEETS = {
  Meetings: [
    'meeting_id', 'title', 'date', 'start_time', 'end_time', 'location', 'type', 'author',
    'attendees', 'absentees', 'agenda', 'discussion', 'decisions', 'notes',
    'action_total', 'action_open', 'version', 'created_at', 'updated_at', 'synced_at',
    'client_id', 'deleted', 'payload_json', 'summary', 'has_recording', 'transcript_chars'
  ],
  ActionItems: [
    'action_id', 'meeting_id', 'meeting_title', 'meeting_date', 'task', 'owner', 'due_date',
    'status', 'priority', 'memo', 'order', 'created_at', 'updated_at', 'deleted', 'source'
  ],
  _SyncLog: ['received_at', 'request_id', 'action', 'meeting_id', 'client_id', 'result', 'detail'],
  _AiUsage: ['at', 'meeting_id', 'client_id', 'model', 'input_tokens', 'output_tokens', 'result'],
  _Meta: ['key', 'value']
};

/** 날짜로 표시할 열 */
var DATE_COLUMNS = ['date', 'meeting_date', 'due_date'];
/** 시트가 자동으로 시간·날짜로 바꾸지 않도록 일반 텍스트로 둘 열 */
var TEXT_COLUMNS = ['start_time', 'end_time', 'created_at', 'updated_at', 'synced_at', 'received_at', 'at'];

var SYNC_LOG_KEEP = 5000;

/** 편집기에서 한 번 실행해 권한을 승인하고 시트를 만든다. */
function setup() {
  ensureSchema_(true);
  Logger.log('시트 준비 완료: ' + Object.keys(SHEETS).join(', '));
}

/** 필요한 시트·헤더가 없으면 만든다. 10분 동안은 확인을 건너뛴다. */
function ensureSchema_(force) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'schema:v' + SCHEMA_VERSION;
  if (!force && cache.get(cacheKey)) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    var created = false;
    if (!sheet) {
      sheet = ss.insertSheet(name);
      created = true;
    }
    var headers = SHEETS[name];
    var lastCol = sheet.getLastColumn();
    var existing = lastCol ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    var missing = headers.filter(function (h) { return existing.indexOf(h) === -1; });
    if (missing.length) {
      var start = existing.length + 1;
      sheet.getRange(1, start, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#f3f4f6');
      sheet.setFrozenRows(1);
      missing.forEach(function (h, i) { formatColumn_(sheet, h, start + i); });
    }
    if (created) {
      if (name === 'ActionItems') decorateActionItems_(sheet);
      if (name.charAt(0) === '_') sheet.hideSheet();
    }
  });

  var meta = ss.getSheetByName('_Meta');
  if (meta.getLastRow() < 2) {
    meta.getRange(2, 1, 2, 2).setValues([
      ['schema_version', SCHEMA_VERSION],
      ['created_at', new Date().toISOString()]
    ]);
  }
  cache.put(cacheKey, '1', 600);
}

function formatColumn_(sheet, header, col) {
  var rows = Math.max(sheet.getMaxRows() - 1, 1);
  var range = sheet.getRange(2, col, rows, 1);
  if (DATE_COLUMNS.indexOf(header) !== -1) range.setNumberFormat('yyyy-mm-dd');
  if (TEXT_COLUMNS.indexOf(header) !== -1) range.setNumberFormat('@');
}

/** 상태 드롭다운 + 기한 지난 미완료 항목 빨간색 */
function decorateActionItems_(sheet) {
  var headers = SHEETS.ActionItems;
  var col = function (h) { return headers.indexOf(h) + 1; };
  var letter = function (h) { return columnLetter_(col(h)); };
  var rows = Math.max(sheet.getMaxRows() - 1, 1);

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(STATUS_LABELS_LIST, true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, col('status'), rows, 1).setDataValidation(statusRule);

  var formula = '=AND($' + letter('due_date') + '2<>"", $' + letter('due_date') + '2<TODAY(), $' +
    letter('status') + '2<>"완료", $' + letter('deleted') + '2<>TRUE)';
  var overdue = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground('#fdecee')
    .setFontColor('#b42318')
    .setRanges([sheet.getRange(2, 1, rows, headers.length)])
    .build();
  sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat([overdue]));
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 시트 전체를 한 번 읽어 헤더 → 열 번호 맵과 데이터 행을 돌려준다. */
function openTable_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw apiError_('SCHEMA_MISMATCH', '"' + name + '" 시트가 없습니다. 편집기에서 setup을 실행하세요.');
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var values = lastRow && lastCol ? sheet.getRange(1, 1, lastRow, lastCol).getValues() : [[]];
  var col = {};
  values[0].forEach(function (h, i) { if (h !== '') col[String(h)] = i; });
  SHEETS[name].forEach(function (h) {
    if (!(h in col)) throw apiError_('SCHEMA_MISMATCH', '"' + name + '" 시트에 "' + h + '" 열이 없습니다. setup을 다시 실행하세요.');
  });
  return { sheet: sheet, col: col, width: lastCol, rows: values.slice(1), dirty: {}, appends: [] };
}

function findRowIndex_(table, header, value) {
  var c = table.col[header];
  for (var i = 0; i < table.rows.length; i++) {
    if (String(table.rows[i][c]) === value) return i;
  }
  return -1;
}

/** record의 값을 기존 행(또는 새 행)에 덮어쓴다. 사용자가 추가한 다른 열은 그대로 둔다. */
function setRecord_(table, index, record) {
  var row = index >= 0 ? table.rows[index].slice() : emptyRow_(table.width);
  Object.keys(record).forEach(function (key) {
    if (key in table.col) row[table.col[key]] = toCell_(key, record[key]);
  });
  if (index >= 0) {
    table.rows[index] = row;
    table.dirty[index] = true;
  } else {
    table.appends.push(row);
  }
}

function emptyRow_(width) {
  var row = [];
  for (var i = 0; i < width; i++) row.push('');
  return row;
}

/** 바뀐 행과 새 행을 기록한다. 바뀐 행이 많으면 본문 전체를 한 번에 쓴다. */
function commitTable_(table) {
  var dirty = Object.keys(table.dirty).map(Number);
  if (dirty.length > 10) {
    table.sheet.getRange(2, 1, table.rows.length, table.width).setValues(table.rows);
  } else {
    dirty.forEach(function (i) {
      table.sheet.getRange(i + 2, 1, 1, table.width).setValues([table.rows[i]]);
    });
  }
  if (table.appends.length) {
    var start = table.sheet.getLastRow() + 1;
    table.sheet.getRange(start, 1, table.appends.length, table.width).setValues(table.appends);
  }
}

var MAX_CELL_CHARS = 49000;

function toCell_(key, value) {
  if (value === null || value === undefined) return '';
  if (DATE_COLUMNS.indexOf(key) !== -1) return toSheetDate_(value);
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  return safeText_(String(value));
}

/** 수식 주입 방지: =, +, -, @로 시작하면 앞에 '를 붙여 문자열로 저장한다. */
function safeText_(text) {
  var s = text.length > MAX_CELL_CHARS ? text.slice(0, MAX_CELL_CHARS) : text;
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function toSheetDate_(key) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

function isTrue_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function logSync_(req, result, detail) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('_SyncLog');
    if (!sheet) return;
    sheet.appendRow([
      new Date().toISOString(),
      String(req.requestId || ''),
      String(req.action || ''),
      String((req.meeting && req.meeting.id) || req.meetingId || ''),
      String(req.clientId || ''),
      result,
      safeText_(String(detail || ''))
    ]);
    var excess = sheet.getLastRow() - 1 - SYNC_LOG_KEEP;
    if (excess > 500) sheet.deleteRows(2, excess);
  } catch (err) {
    console.error('로그 기록 실패', err);
  }
}
