const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const pad = (n) => String(n).padStart(2, '0');

/** 로컬 타임존 기준 'YYYY-MM-DD' */
export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' → 로컬 자정 Date */
export function fromDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 예: 2026년 11월 2일 (월) */
export function formatKoreanDate(date = new Date()) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
}

/** b - a 일수 */
export function daysBetween(aKey, bKey) {
  return Math.round((fromDateKey(bKey) - fromDateKey(aKey)) / 86400000);
}
