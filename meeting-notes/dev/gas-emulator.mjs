// 개발용: apps-script/*.gs를 Node에서 실행하기 위한 최소한의 Google Apps Script 에뮬레이터.
// 메모리 안의 스프레드시트·캐시·속성을 흉내 내며, 실제 Google 서비스와는 동작이 다를 수 있다.
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import path from 'node:path';

class Range {
  constructor(sheet, row, col, rows, cols) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    if (values.length !== this.rows || values.some((v) => v.length !== this.cols)) {
      throw new Error(`setValues 크기 불일치: ${values.length}x${values[0]?.length} → ${this.rows}x${this.cols}`);
    }
    values.forEach((line, r) => line.forEach((v, c) => this.sheet.set(this.row + r, this.col + c, v)));
    return this;
  }
  setFontWeight() { return this; }
  setBackground() { return this; }
  setNumberFormat() { return this; }
  setDataValidation() { return this; }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.hidden = false;
    this.rules = [];
  }
  cell(r, c) {
    const v = this.data[r - 1]?.[c - 1];
    return v === undefined ? '' : v;
  }
  set(r, c, v) {
    while (this.data.length < r) this.data.push([]);
    // 시트처럼 앞의 '는 텍스트 표시용으로 보고 값에서는 뺀다
    this.data[r - 1][c - 1] = typeof v === 'string' && v.startsWith("'") ? v.slice(1) : v;
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.data.length; r > 0; r--) if (this.data[r - 1].some((v) => v !== '' && v !== undefined)) return r;
    return 0;
  }
  getLastColumn() {
    return this.data.reduce((max, row) => {
      for (let c = row.length; c > 0; c--) if (row[c - 1] !== '' && row[c - 1] !== undefined) return Math.max(max, c);
      return max;
    }, 0);
  }
  getMaxRows() { return Math.max(1000, this.data.length); }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  appendRow(values) {
    const r = this.getLastRow() + 1;
    values.forEach((v, i) => this.set(r, i + 1, v));
  }
  deleteRows(start, count) { this.data.splice(start - 1, count); }
  setFrozenRows() {}
  hideSheet() { this.hidden = true; }
  isSheetHidden() { return this.hidden; }
  getConditionalFormatRules() { return this.rules; }
  setConditionalFormatRules(rules) { this.rules = rules; }
  /** 디버그용: 헤더 기준 객체 배열 */
  records() {
    const [head = [], ...rows] = this.data;
    return rows.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i] ?? ''])));
  }
}

const builder = () => {
  const b = new Proxy({}, { get: (_, key) => (key === 'build' ? () => ({}) : () => b) });
  return b;
};

export function createEmulator({ scriptDir, properties = {}, fetchHandler = null } = {}) {
  const sheets = new Map();
  const spreadsheet = {
    getSheetByName: (name) => sheets.get(name) ?? null,
    insertSheet: (name) => {
      const s = new Sheet(name);
      sheets.set(name, s);
      return s;
    },
  };
  const cache = new Map();
  const props = new Map(Object.entries(properties));
  const logs = [];

  const globals = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      flush() {},
      newDataValidation: builder,
      newConditionalFormatRule: builder,
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => {
          const hit = cache.get(k);
          return hit && hit.until > Date.now() ? hit.value : null;
        },
        put: (k, value, ttl = 600) => cache.set(k, { value, until: Date.now() + ttl * 1000 }),
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, waitLock() {}, releaseLock() {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => props.set(k, String(v)),
        deleteProperty: (k) => props.delete(k),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => [...createHash(alg).update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d) => d.toISOString().slice(0, 10).replace(/-/g, ''),
    },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return this.text; } }),
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        if (!fetchHandler) throw new Error('UrlFetchApp: 연결 없음');
        const { status, body } = fetchHandler(url, options);
        return { getResponseCode: () => status, getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body)) };
      },
    },
    Logger: { log: (...a) => logs.push(a.join(' ')) },
    console: { log: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(`ERROR ${a.join(' ')}`) },
  };

  const context = vm.createContext(globals);
  for (const file of readdirSync(scriptDir).filter((f) => f.endsWith('.gs')).sort()) {
    vm.runInContext(readFileSync(path.join(scriptDir, file), 'utf8'), context, { filename: file });
  }

  return {
    /** doPost를 호출하고 JSON 응답 객체를 돌려준다 */
    post(body) {
      const out = context.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } });
      return JSON.parse(out.getContent());
    },
    run: (fn) => context[fn](),
    sheet: (name) => sheets.get(name),
    props,
    cache,
    logs,
  };
}
