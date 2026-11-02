// AI 초안 → 회의록 반영 (순수 함수). 사용자가 고른 항목만, 고른 방식(추가/교체)으로 반영한다.
import { createRow, filledRows, LIMITS } from '../meeting.js';

const now = () => new Date().toISOString();
const clamp = (v, max) => String(v ?? '').slice(0, max);

function mergeText(current, incoming, mode, max) {
  if (!incoming) return current;
  if (mode === 'replace' || !current.trim()) return clamp(incoming, max);
  return clamp(`${current}\n\n${incoming}`, max);
}

function mergeRows(current, keyField, incoming, mode) {
  const kept = mode === 'replace' ? [] : filledRows(current, keyField);
  const rows = [...kept, ...incoming];
  return rows.map((r, i) => ({ ...r, order: i }));
}

/**
 * @param selection {{
 *   summary?: boolean, discussion?: boolean,
 *   agenda?: number[], decisions?: number[], actionItems?: number[],
 *   mode?: Record<string, 'append'|'replace'>, owners?: Record<number, string>
 * }}
 */
export function applyDraft(m, draft, selection) {
  const mode = selection.mode ?? {};
  const pick = (list, indexes) => (indexes ?? []).filter((i) => list?.[i] != null).map((i) => [i, list[i]]);
  let next = { ...m };

  if (selection.summary && draft.summary) {
    next.summary = mergeText(m.summary, draft.summary, mode.summary, LIMITS.summary);
  }
  if (selection.discussion && draft.discussion) {
    next.discussion = mergeText(m.discussion, draft.discussion, mode.discussion, LIMITS.discussion);
  }

  const agenda = pick(draft.agenda, selection.agenda).map(([, text]) =>
    createRow('agenda', { text: clamp(text, LIMITS.agenda) }),
  );
  if (agenda.length) next.agenda = mergeRows(m.agenda, 'text', agenda, mode.agenda);

  const decisions = pick(draft.decisions, selection.decisions).map(([, text]) =>
    createRow('decisions', { text: clamp(text, LIMITS.decision), source: 'ai' }),
  );
  if (decisions.length) next.decisions = mergeRows(m.decisions, 'text', decisions, mode.decisions);

  const actions = pick(draft.actionItems, selection.actionItems).map(([i, item]) =>
    createRow('actionItems', {
      task: clamp(item.task, LIMITS.task),
      owner: clamp(selection.owners?.[i] ?? item.owner ?? '', LIMITS.owner),
      dueDate: item.dueDate || null,
      status: item.status || 'todo',
      source: 'ai',
    }),
  );
  if (actions.length) next.actionItems = mergeRows(m.actionItems, 'task', actions, mode.actionItems);

  return { ...next, updatedAt: now() };
}
