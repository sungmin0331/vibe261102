// AI 초안 검토 패널: 섹션별·항목별로 골라 폼에 반영한다.
import { h } from './dom.js';
import { STATUSES } from '../meeting.js';
import { formatClock, formatMonthDay } from '../date.js';

function modeSelect(section, hasExisting) {
  return h(
    'select',
    { class: 'input select select--small', 'data-mode': section, 'aria-label': '적용 방식', value: 'append' },
    h('option', { value: 'append', text: hasExisting ? '기존 내용에 추가' : '채우기' }),
    h('option', { value: 'replace', text: '기존 내용 교체' }),
  );
}

function block(title, section, hasExisting, ...content) {
  return h(
    'section',
    { class: 'ai-block' },
    h('div', { class: 'ai-block__head' }, h('h3', { text: title }), modeSelect(section, hasExisting)),
    ...content,
  );
}

const check = (section, index, label, extra = null) =>
  h(
    'li',
    h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: true, 'data-pick': section, 'data-index': index }), h('span', { text: label })),
    extra,
  );

/** state: { busy, error } */
export function renderAiReview(panel, m, { busy = false, error = '' } = {}) {
  const ai = m.aiSummary;
  panel.hidden = !busy && !error && !ai;
  if (panel.hidden) {
    panel.replaceChildren();
    return;
  }
  if (busy) {
    panel.replaceChildren(
      h(
        'div',
        { class: 'ai-panel__busy', role: 'status' },
        h('span', { class: 'spinner', 'aria-hidden': 'true' }),
        h('span', { text: '요약 중… (최대 1분)' }),
        h('button', { type: 'button', class: 'btn btn--small', 'data-ai-action': 'cancel', text: '취소' }),
      ),
    );
    return;
  }
  if (error && !ai) {
    panel.replaceChildren(
      h(
        'div',
        { class: 'ai-panel__error', role: 'alert' },
        h('span', { text: `AI 요약 실패: ${error}` }),
        h('button', { type: 'button', class: 'btn btn--small', 'data-ai-action': 'close', text: '닫기' }),
      ),
    );
    return;
  }

  const d = ai.draft;
  const names = m.attendees.map((a) => a.name);
  const has = {
    summary: Boolean(m.summary.trim()),
    discussion: Boolean(m.discussion.trim()),
    agenda: m.agenda.some((r) => r.text.trim()),
    decisions: m.decisions.some((r) => r.text.trim()),
    actionItems: m.actionItems.some((r) => r.task.trim()),
  };
  const empty = !d.summary && !d.discussion && !d.agenda.length && !d.decisions.length && !d.actionItems.length;

  panel.replaceChildren(
    h(
      'div',
      { class: 'ai-panel__head' },
      h('h2', { class: 'ai-panel__title', text: `✨ AI 요약 초안` }),
      h('span', { class: 'muted', text: `${ai.model} · ${formatClock(ai.generatedAt)} 생성${ai.appliedAt ? ' · 적용함' : ''}` }),
      h('button', { type: 'button', class: 'btn btn--small', 'data-ai-action': 'regenerate', text: '다시 생성' }),
      h('button', { type: 'button', class: 'btn btn--icon', 'data-ai-action': 'close', 'aria-label': '초안 닫기', text: '×' }),
    ),
    h('p', { class: 'ai-panel__notice', text: 'ⓘ AI가 만든 초안입니다. 원문과 다를 수 있으니 확인 후 필요한 항목만 적용하세요.' }),
    error ? h('p', { class: 'field__error', text: `다시 생성 실패: ${error}` }) : null,
    empty ? h('p', { class: 'muted', text: '요약할 내용을 찾지 못했습니다. 받아쓰기나 메모를 더 채운 뒤 다시 생성하세요.' }) : null,
    d.summary
      ? block('요약', 'summary', has.summary, h('ul', { class: 'ai-items' }, check('summary', 0, d.summary)))
      : null,
    d.agenda.length ? block('안건', 'agenda', has.agenda, h('ul', { class: 'ai-items' }, d.agenda.map((t, i) => check('agenda', i, t)))) : null,
    d.discussion
      ? block('논의 내용', 'discussion', has.discussion, h('ul', { class: 'ai-items' }, check('discussion', 0, d.discussion)))
      : null,
    d.decisions.length
      ? block('결정 사항', 'decisions', has.decisions, h('ul', { class: 'ai-items' }, d.decisions.map((t, i) => check('decisions', i, t))))
      : null,
    d.actionItems.length
      ? block(
          '액션 아이템',
          'actionItems',
          has.actionItems,
          h(
            'ul',
            { class: 'ai-items' },
            d.actionItems.map((a, i) => {
              const ownerOptions = [...new Set(['', a.owner ?? '', ...names])];
              const owner = h(
                'select',
                { class: `input select select--small${a.owner && !a.ownerMatched ? ' is-warn' : ''}`, 'data-owner': i, 'aria-label': '담당자', value: a.owner ?? '' },
                ownerOptions.map((n) => h('option', { value: n, text: n ? (n === a.owner && !a.ownerMatched ? `⚠ ${n}? (참석자 확인)` : n) : '담당자 미정' })),
              );
              return check(
                'actionItems',
                i,
                a.task,
                h(
                  'div',
                  { class: 'ai-items__meta' },
                  owner,
                  h('span', { class: a.dueDate ? '' : 'is-warn', text: a.dueDate ? `기한 ${formatMonthDay(a.dueDate)}` : '기한 확인 필요' }),
                  h('span', { text: STATUSES[a.status] }),
                  a.evidence ? h('q', { class: 'ai-items__evidence', text: a.evidence }) : null,
                ),
              );
            }),
          ),
        )
      : null,
    d.openQuestions.length
      ? h('section', { class: 'ai-block' }, h('h3', { text: '미해결 질문' }), h('ul', { class: 'ai-questions' }, d.openQuestions.map((q) => h('li', { text: q }))))
      : null,
    empty
      ? null
      : h(
          'div',
          { class: 'ai-panel__actions' },
          h('button', { type: 'button', class: 'btn', 'data-ai-action': 'close', text: '취소' }),
          h('button', { type: 'button', class: 'btn btn--primary', 'data-ai-action': 'apply', text: '선택 항목 적용' }),
        ),
  );
}

export function readSelection(panel) {
  const selection = { summary: false, discussion: false, agenda: [], decisions: [], actionItems: [], mode: {}, owners: {} };
  panel.querySelectorAll('[data-pick]').forEach((box) => {
    if (!box.checked) return;
    const { pick, index } = box.dataset;
    if (pick === 'summary' || pick === 'discussion') selection[pick] = true;
    else selection[pick].push(Number(index));
  });
  panel.querySelectorAll('[data-mode]').forEach((sel) => {
    selection.mode[sel.dataset.mode] = sel.value;
  });
  panel.querySelectorAll('[data-owner]').forEach((sel) => {
    selection.owners[Number(sel.dataset.owner)] = sel.value;
  });
  return selection;
}

export function selectionCount(sel) {
  return Number(sel.summary) + Number(sel.discussion) + sel.agenda.length + sel.decisions.length + sel.actionItems.length;
}
