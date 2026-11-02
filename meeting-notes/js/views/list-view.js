// 회의록 목록 화면
import { h } from './dom.js';
import { filledRows, openActionCount } from '../meeting.js';
import { formatDateShort, formatClock } from '../date.js';

/** 동기화 상태 → 배지 문구·색. 색만으로 구분하지 않도록 아이콘을 함께 쓴다. */
export function syncBadge(sync, { configured = true, online = navigator.onLine } = {}) {
  switch (sync.status) {
    case 'synced':
      return { tone: 'ok', label: `✅ 저장됨${sync.syncedAt ? ` · ${formatClock(sync.syncedAt)}` : ''}` };
    case 'dirty':
      return { tone: 'warn', label: '● 변경됨(미반영)' };
    case 'queued':
      if (sync.retry) return { tone: 'warn', label: `⏳ 재시도 대기 (${sync.retry.attempt}/${sync.retry.max})` };
      return { tone: 'warn', label: online ? '⏳ 대기 중' : '⏳ 대기 중(오프라인)' };
    case 'syncing':
      return { tone: 'info', label: '↻ 저장 중…' };
    case 'failed':
      return { tone: 'error', label: '❌ 실패' };
    case 'conflict':
      return { tone: 'error', label: '⚠ 충돌' };
    default:
      return { tone: 'muted', label: configured ? '미저장' : '로컬 전용' };
  }
}

function matches(m, query) {
  if (!query) return true;
  const haystack = [
    m.title,
    m.location,
    m.discussion,
    m.summary,
    m.notes,
    ...m.attendees.map((a) => a.name),
    ...m.agenda.map((r) => r.text),
    ...m.decisions.map((r) => r.text),
    ...m.actionItems.map((r) => `${r.task} ${r.owner}`),
  ]
    .join('\n')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const FILTERS = {
  all: () => true,
  failed: (m) => ['failed', 'conflict', 'queued'].includes(m.sync.status),
  open: (m) => openActionCount(m) > 0,
};

export function renderList(container, meetings, { query = '', filter = 'all', configured = true } = {}) {
  const visible = meetings
    .filter((m) => (FILTERS[filter] ?? FILTERS.all)(m) && matches(m, query))
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`) || b.updatedAt.localeCompare(a.updatedAt));

  if (!meetings.length) {
    container.replaceChildren(
      h(
        'div',
        { class: 'empty' },
        h('p', { class: 'empty__icon', 'aria-hidden': 'true', text: '📝' }),
        h('p', { text: '아직 작성한 회의록이 없어요' }),
        h('a', { href: '#/new', class: 'btn btn--primary', text: '+ 새 회의록' }),
      ),
    );
    return;
  }
  if (!visible.length) {
    container.replaceChildren(h('p', { class: 'empty', text: '조건에 맞는 회의록이 없어요' }));
    return;
  }

  container.replaceChildren(
    h(
      'ul',
      { class: 'meeting-list' },
      visible.map((m) => {
        const badge = syncBadge(m.sync, { configured });
        const actions = filledRows(m.actionItems, 'task');
        const open = openActionCount(m);
        const retryable = ['failed', 'conflict'].includes(m.sync.status);
        return h(
          'li',
          { class: 'meeting-item', 'data-id': m.id },
          h(
            'div',
            { class: 'meeting-item__main' },
            h('span', { class: 'meeting-item__date', text: formatDateShort(m.date) }),
            h('a', { href: `#/edit/${m.id}`, class: 'meeting-item__title', text: m.title.trim() || '제목 없는 회의' }),
            h(
              'p',
              { class: 'meeting-item__meta' },
              `참석 ${m.attendees.filter((a) => a.present).length}명 · 액션 ${open}/${actions.length} 미완료`,
              m.recordings.length ? ' · 🎙 녹음' : '',
              m.transcript?.segments.length ? ' · 받아쓰기' : '',
            ),
          ),
          h(
            'div',
            { class: 'meeting-item__side' },
            h('span', { class: `badge badge--${badge.tone}`, text: badge.label, title: m.sync.lastError?.message ?? '' }),
            h(
              'div',
              { class: 'meeting-item__actions' },
              retryable ? h('button', { type: 'button', class: 'btn btn--small', 'data-list-action': 'retry', text: '재시도' }) : null,
              h('button', { type: 'button', class: 'btn btn--small', 'data-list-action': 'duplicate', text: '복제' }),
              h('button', { type: 'button', class: 'btn btn--small btn--danger-ghost', 'data-list-action': 'delete', text: '삭제' }),
            ),
          ),
        );
      }),
    ),
  );
}
