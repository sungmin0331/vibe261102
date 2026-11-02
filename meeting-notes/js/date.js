// 날짜·시간 포맷 유틸 (사용자 로컬 타임존 기준)
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n) => String(n).padStart(2, '0');

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTime(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 'YYYY-MM-DD' → 로컬 Date (자정) */
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** '2026년 11월 2일 (월)' */
export function formatDateKo(key) {
  const d = parseDateKey(key);
  if (!d) return '';
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
}

/** '2026-11-02 (월)' */
export function formatDateShort(key) {
  const d = parseDateKey(key);
  return d ? `${key} (${WEEKDAYS[d.getDay()]})` : '';
}

/** '11/07' */
export function formatMonthDay(key) {
  const d = parseDateKey(key);
  return d ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}` : '';
}

/** ISO → 'HH:mm' */
export function formatClock(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? toTime(d) : '';
}

/** ISO → 'HH:mm:ss' */
export function formatClockSec(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${toTime(d)}:${pad(d.getSeconds())}` : '';
}

/** 초 → '00:42:13' */
export function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

/** ISO → '2026-11-02 14:35' */
export function formatDateTime(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${toDateKey(d)} ${toTime(d)}` : '';
}

export function formatBytes(bytes) {
  if (!bytes) return '0KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
