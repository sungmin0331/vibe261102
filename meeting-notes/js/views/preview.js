// Meeting → 회의록 문서 DOM. 미리보기·HTML 내보내기·클립보드 복사가 같은 함수를 쓴다.
import { h } from './dom.js';
import { MEETING_TYPES, STATUSES, filledRows, isOverdue } from '../meeting.js';
import { formatDateKo, formatDateTime, formatMonthDay, toDateKey } from '../date.js';

const LIST_LINE = /^\s*[-•*]\s+/;

/** 평문 → 문단/목록. 빈 줄은 문단 구분, '- '로 시작하는 줄은 목록. */
export function formatText(text) {
  const fragment = document.createDocumentFragment();
  const blocks = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .filter((b) => b.trim());
  for (const block of blocks) {
    let paragraph = null;
    let list = null;
    for (const line of block.split('\n')) {
      if (LIST_LINE.test(line)) {
        paragraph = null;
        list ??= fragment.appendChild(h('ul'));
        list.append(h('li', { text: line.replace(LIST_LINE, '') }));
      } else if (line.trim()) {
        list = null;
        if (paragraph) paragraph.append(h('br'), line);
        else paragraph = fragment.appendChild(h('p', { text: line }));
      }
    }
  }
  return fragment;
}

const attendeeLabel = (a) => (a.affiliation ? `${a.name}(${a.affiliation})` : a.name);

function section(title, ...content) {
  return h('section', { class: 'mn-section' }, h('h2', { text: title }), ...content);
}

export function renderDocument(m, { footerNote = '', today = toDateKey() } = {}) {
  const present = m.attendees.filter((a) => a.present);
  const absent = m.attendees.filter((a) => !a.present);
  const agenda = filledRows(m.agenda);
  const decisions = filledRows(m.decisions);
  const actions = filledRows(m.actionItems, 'task');
  const time = [m.startTime, m.endTime].filter(Boolean).join('~');

  const infoRows = [
    ['일시', [formatDateKo(m.date), time].filter(Boolean).join(' ')],
    ['장소', m.location],
    ['작성자', m.author],
    ['참석', present.map(attendeeLabel).join(', ')],
    ['불참', absent.map(attendeeLabel).join(', ')],
  ].filter(([, v]) => v);

  return h(
    'article',
    { class: 'mn-doc' },
    h(
      'header',
      { class: 'mn-doc__head' },
      h('h1', { text: m.title.trim() || '제목 없는 회의' }),
      h('span', { class: 'mn-badge', text: MEETING_TYPES[m.type] ?? '' }),
    ),
    infoRows.length
      ? h('table', { class: 'mn-info' }, h('tbody', infoRows.map(([k, v]) => h('tr', h('th', { scope: 'row', text: k }), h('td', { text: v })))))
      : null,
    m.summary.trim() ? h('section', { class: 'mn-section mn-summary' }, h('h2', { text: '요약' }), formatText(m.summary)) : null,
    agenda.length ? section('안건', h('ol', agenda.map((r) => h('li', { text: r.text })))) : null,
    m.discussion.trim() ? section('논의 내용', h('div', { class: 'mn-text' }, formatText(m.discussion))) : null,
    decisions.length
      ? section('결정 사항', h('ul', { class: 'mn-checks' }, decisions.map((r) => h('li', { text: r.text }))))
      : null,
    actions.length
      ? section(
          '액션 아이템',
          h(
            'table',
            { class: 'mn-actions' },
            h(
              'thead',
              h('tr', ['#', '할 일', '담당자', '기한', '상태'].map((t) => h('th', { scope: 'col', text: t }))),
            ),
            h(
              'tbody',
              actions.map((a, i) => {
                const overdue = isOverdue(a, today);
                return h(
                  'tr',
                  { class: overdue ? 'mn-overdue' : null },
                  h('td', { text: i + 1 }),
                  h('td', { text: a.task }, a.memo ? h('div', { class: 'mn-memo', text: a.memo }) : null),
                  h('td', { text: a.owner }),
                  h('td', { text: formatMonthDay(a.dueDate) }),
                  h('td', { text: `${STATUSES[a.status] ?? ''}${overdue ? ' (지연)' : ''}` }),
                );
              }),
            ),
          ),
        )
      : null,
    m.notes.trim() ? section('비고 / 다음 회의', h('div', { class: 'mn-text' }, formatText(m.notes))) : null,
    h(
      'footer',
      { class: 'mn-doc__foot' },
      [`회의 ID ${m.id.slice(0, 12)}…`, `최종 수정 ${formatDateTime(m.updatedAt)}`, footerNote].filter(Boolean).join(' · '),
    ),
  );
}
