// Todo 배열을 다루는 순수 함수 모음. 입력 배열은 변경하지 않는다.
import { daysBetween } from './date.js';

export const MAX_LENGTH = 200;
export const PRIORITIES = ['high', 'normal', 'low'];
export const RETENTION_DAYS = 7;

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function normalizeText(text) {
  return String(text ?? '').trim().slice(0, MAX_LENGTH);
}

export function byOrder(a, b) {
  return a.order - b.order;
}

export function todosForDate(todos, date) {
  return todos.filter((t) => t.date === date).sort(byOrder);
}

function nextOrder(todos, date) {
  return todos.reduce((max, t) => (t.date === date ? Math.max(max, t.order) : max), -1) + 1;
}

export function addTodo(todos, text, date) {
  const clean = normalizeText(text);
  if (!clean) return todos;
  const todo = {
    id: newId(),
    text: clean,
    completed: false,
    priority: 'normal',
    order: nextOrder(todos, date),
    date,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  return [...todos, todo];
}

export function toggleTodo(todos, id) {
  return todos.map((t) =>
    t.id === id
      ? { ...t, completed: !t.completed, completedAt: t.completed ? null : new Date().toISOString() }
      : t,
  );
}

export function editTodo(todos, id, text) {
  const clean = normalizeText(text);
  if (!clean) return todos;
  return todos.map((t) => (t.id === id ? { ...t, text: clean } : t));
}

export function deleteTodo(todos, id) {
  return todos.filter((t) => t.id !== id);
}

/** 삭제했던 항목을 원래 order 그대로 복원 */
export function restoreTodo(todos, todo) {
  if (!todo || todos.some((t) => t.id === todo.id)) return todos;
  return [...todos, todo];
}

export function cyclePriority(todos, id) {
  return todos.map((t) => {
    if (t.id !== id) return t;
    const next = PRIORITIES[(PRIORITIES.indexOf(t.priority) + 1) % PRIORITIES.length];
    return { ...t, priority: next };
  });
}

/** 해당 날짜 목록 안에서 id 항목을 toIndex 위치로 옮기고 order를 다시 매긴다 */
export function moveTodo(todos, date, id, toIndex) {
  const list = todosForDate(todos, date);
  const from = list.findIndex((t) => t.id === id);
  if (from < 0) return todos;
  const target = Math.max(0, Math.min(list.length - 1, toIndex));
  if (from === target) return todos;
  const [item] = list.splice(from, 1);
  list.splice(target, 0, item);
  const orders = new Map(list.map((t, i) => [t.id, i]));
  return todos.map((t) => (orders.has(t.id) ? { ...t, order: orders.get(t.id) } : t));
}

export function clearDone(todos, date) {
  return todos.filter((t) => !(t.date === date && t.completed));
}

/** 오늘 이전 날짜의 미완료 항목 */
export function pendingFromPast(todos, today) {
  return todos.filter((t) => !t.completed && t.date < today);
}

/** 지난 미완료 항목을 오늘 목록 끝으로 옮긴다 */
export function carryOver(todos, today) {
  let order = nextOrder(todos, today);
  const past = pendingFromPast(todos, today).sort((a, b) => a.date.localeCompare(b.date) || byOrder(a, b));
  const moved = new Map(past.map((t) => [t.id, { ...t, date: today, order: order++ }]));
  return todos.map((t) => moved.get(t.id) ?? t);
}

/** 지난 미완료 항목 버리기 */
export function discardPast(todos, today) {
  return todos.filter((t) => !(!t.completed && t.date < today));
}

/** 보관 기간이 지난 항목 정리 */
export function pruneOld(todos, today, days = RETENTION_DAYS) {
  return todos.filter((t) => daysBetween(t.date, today) <= days);
}

/** 저장소에서 읽은 값이 올바른 Todo인지 검사 */
export function isValidTodo(t) {
  return (
    t &&
    typeof t.id === 'string' &&
    typeof t.text === 'string' &&
    typeof t.completed === 'boolean' &&
    PRIORITIES.includes(t.priority) &&
    typeof t.order === 'number' &&
    /^\d{4}-\d{2}-\d{2}$/.test(t.date)
  );
}
