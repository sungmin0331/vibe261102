// 회의록 작성 폼. 구조가 바뀔 때만 다시 그리고, 타이핑은 DOM을 그대로 둔 채 store에만 반영한다.
import { h, preserveFocus } from './dom.js';
import { LIMITS, MEETING_TYPES, STATUSES, PRIORITIES, timeWarning } from '../meeting.js';

const fieldKey = (field) => field;
const rowKey = (section, rowId, field) => `${section}:${rowId}:${field}`;

function errorSlot(key) {
  return h('p', { class: 'field__error', 'data-error-for': key, hidden: true, id: `err-${key}` });
}

function field(label, control, { key, hint = '', required = false, wide = false } = {}) {
  return h(
    'div',
    { class: `field${wide ? ' field--wide' : ''}` },
    h('label', { class: 'field__label', for: control.id }, label, required ? h('span', { class: 'req', 'aria-hidden': 'true', text: '*' }) : null),
    control,
    hint ? h('p', { class: 'field__hint', text: hint }) : null,
    key ? errorSlot(key) : null,
  );
}

function input(fieldName, value, props = {}) {
  return h('input', {
    id: `f-${fieldName}`,
    class: 'input',
    type: 'text',
    'data-field': fieldName,
    'data-key': fieldKey(fieldName),
    'aria-describedby': `err-${fieldName}`,
    value: value ?? '',
    ...props,
  });
}

function textarea(fieldName, value, props = {}) {
  return h('textarea', {
    id: `f-${fieldName}`,
    class: 'input textarea',
    'data-field': fieldName,
    'data-key': fieldKey(fieldName),
    value: value ?? '',
    ...props,
  });
}

function select(attrs, options, value) {
  return h(
    'select',
    { class: 'input select', ...attrs, value },
    Object.entries(options).map(([v, label]) => h('option', { value: v, text: label })),
  );
}

function iconButton(action, label, icon, data = {}) {
  return h('button', {
    type: 'button',
    class: 'btn btn--icon',
    'data-action': action,
    dataset: data,
    'aria-label': label,
    title: label,
    text: icon,
  });
}

const aiBadge = (row) => (row.source === 'ai' ? h('span', { class: 'ai-badge', title: 'AI 초안에서 가져온 항목', text: 'AI' }) : null);

function renderAttendees(m) {
  return h(
    'fieldset',
    { class: 'card' },
    h('legend', { class: 'card__title' }, '참석자', h('span', { class: 'req', 'aria-hidden': 'true', text: '*' })),
    h(
      'ul',
      { class: 'chips', 'aria-label': '참석자 목록' },
      m.attendees.map((a) =>
        h(
          'li',
          { class: `chip${a.present ? '' : ' chip--absent'}` },
          h('span', { class: 'chip__name', text: a.affiliation ? `${a.name}(${a.affiliation})` : a.name }),
          h('button', {
            type: 'button',
            class: 'chip__toggle',
            'data-action': 'toggle-attendee',
            'data-attendee': a.id,
            'aria-pressed': String(!a.present),
            title: a.present ? '불참으로 표시' : '참석으로 표시',
            text: a.present ? '참석' : '불참',
          }),
          h('button', {
            type: 'button',
            class: 'chip__remove',
            'data-action': 'remove-attendee',
            'data-attendee': a.id,
            'aria-label': `${a.name} 삭제`,
            text: '×',
          }),
        ),
      ),
    ),
    h(
      'div',
      { class: 'inline' },
      h('input', {
        id: 'f-attendees',
        class: 'input',
        type: 'text',
        'data-key': 'attendees',
        'data-attendee-input': '',
        placeholder: '이름(소속) 입력 후 Enter — 쉼표로 여러 명',
        'aria-label': '참석자 추가',
        'aria-describedby': 'err-attendees',
        maxlength: 200,
      }),
      h('button', { type: 'button', class: 'btn', 'data-action': 'add-attendee', text: '추가' }),
    ),
    errorSlot('attendees'),
  );
}

function renderTextRows(m, section, { title, placeholder, max, numbered }) {
  const rows = m[section];
  const list = h(
    numbered ? 'ol' : 'ul',
    { class: 'rows' },
    rows.map((row, i) =>
      h(
        'li',
        { class: 'row', 'data-row-id': row.id },
        h('span', { class: 'row__num', 'aria-hidden': 'true', text: numbered ? `${i + 1}.` : '•' }),
        h('input', {
          class: 'input',
          type: 'text',
          value: row.text,
          maxlength: max,
          placeholder,
          'aria-label': `${title} ${i + 1}`,
          'data-section': section,
          'data-row': row.id,
          'data-field': 'text',
          'data-key': rowKey(section, row.id, 'text'),
        }),
        aiBadge(row),
        iconButton('move-row', '위로', '▲', { section, row: row.id, delta: '-1' }),
        iconButton('move-row', '아래로', '▼', { section, row: row.id, delta: '1' }),
        iconButton('remove-row', '삭제', '🗑', { section, row: row.id }),
      ),
    ),
  );
  return h(
    'fieldset',
    { class: 'card' },
    h('legend', { class: 'card__title', text: title }),
    list,
    h('button', { type: 'button', class: 'btn btn--ghost', 'data-action': 'add-row', 'data-section': section, text: `+ ${title} 추가` }),
  );
}

function renderActionItems(m) {
  const names = m.attendees.map((a) => a.name);
  return h(
    'fieldset',
    { class: 'card' },
    h('legend', { class: 'card__title', text: '액션 아이템' }),
    h('datalist', { id: 'owner-list' }, names.map((n) => h('option', { value: n }))),
    h(
      'ol',
      { class: 'actions' },
      m.actionItems.map((a, i) => {
        const data = (fieldName) => ({
          'data-section': 'actionItems',
          'data-row': a.id,
          'data-field': fieldName,
          'data-key': rowKey('actionItems', a.id, fieldName),
        });
        return h(
          'li',
          { class: 'action', 'data-row-id': a.id },
          h(
            'div',
            { class: 'action__main' },
            h('span', { class: 'row__num', 'aria-hidden': 'true', text: `${i + 1}.` }),
            h('input', {
              class: 'input action__task',
              type: 'text',
              value: a.task,
              maxlength: LIMITS.task,
              placeholder: '할 일',
              'aria-label': `액션 아이템 ${i + 1} 할 일`,
              'aria-describedby': `err-${rowKey('actionItems', a.id, 'task')}`,
              ...data('task'),
            }),
            aiBadge(a),
            iconButton('remove-row', '액션 아이템 삭제', '🗑', { section: 'actionItems', row: a.id }),
          ),
          errorSlot(rowKey('actionItems', a.id, 'task')),
          h(
            'div',
            { class: 'action__meta' },
            h('input', {
              class: 'input',
              type: 'text',
              value: a.owner,
              maxlength: LIMITS.owner,
              placeholder: '담당자',
              list: 'owner-list',
              'aria-label': '담당자',
              ...data('owner'),
            }),
            h('input', { class: 'input', type: 'date', value: a.dueDate ?? '', 'aria-label': '기한', ...data('dueDate') }),
            select({ 'aria-label': '상태', ...data('status') }, STATUSES, a.status),
            select({ 'aria-label': '우선순위', ...data('priority') }, PRIORITIES, a.priority),
          ),
          h('input', {
            class: 'input action__memo',
            type: 'text',
            value: a.memo,
            maxlength: LIMITS.memo,
            placeholder: '메모 (선택)',
            'aria-label': '메모',
            ...data('memo'),
          }),
        );
      }),
    ),
    h('button', { type: 'button', class: 'btn btn--ghost', 'data-action': 'add-row', 'data-section': 'actionItems', text: '+ 액션 아이템 추가' }),
  );
}

export function renderForm(form, m, focusKey = null) {
  preserveFocus(
    form,
    () => {
      form.replaceChildren(
        h(
          'fieldset',
          { class: 'card' },
          h('legend', { class: 'card__title', text: '기본 정보' }),
          field('회의 제목', input('title', m.title, { maxlength: LIMITS.title, placeholder: '예: 주간 개발 회의', required: true }), {
            key: 'title',
            required: true,
            wide: true,
          }),
          h(
            'div',
            { class: 'grid' },
            field('일자', input('date', m.date, { type: 'date', required: true }), { key: 'date', required: true }),
            field('시작', input('startTime', m.startTime, { type: 'time', required: true }), { key: 'startTime', required: true }),
            field('종료', input('endTime', m.endTime ?? '', { type: 'time' }), { key: 'endTime' }),
          ),
          h('p', { class: 'field__warn', id: 'time-warning', text: timeWarning(m), hidden: !timeWarning(m) }),
          h(
            'div',
            { class: 'grid' },
            field('장소', input('location', m.location, { maxlength: LIMITS.location, placeholder: '예: 3층 회의실, Zoom' })),
            field('유형', select({ id: 'f-type', 'data-field': 'type', 'data-key': 'type' }, MEETING_TYPES, m.type)),
            field('작성자', input('author', m.author, { maxlength: LIMITS.author, required: true }), { key: 'author', required: true }),
          ),
        ),
        renderAttendees(m),
        h(
          'fieldset',
          { class: 'card' },
          h('legend', { class: 'card__title', text: '회의 요약' }),
          textarea('summary', m.summary, {
            rows: 3,
            maxlength: LIMITS.summary,
            placeholder: '직접 쓰거나 ✨ AI 요약에서 가져올 수 있습니다.',
            'aria-label': '회의 요약',
          }),
        ),
        renderTextRows(m, 'agenda', { title: '안건', placeholder: '안건', max: LIMITS.agenda, numbered: true }),
        h(
          'fieldset',
          { class: 'card' },
          h('legend', { class: 'card__title', text: '논의 내용' }),
          textarea('discussion', m.discussion, {
            rows: 8,
            maxlength: LIMITS.discussion,
            placeholder: "줄바꿈은 그대로, '- '로 시작하는 줄은 목록으로 표시됩니다.",
            'aria-label': '논의 내용',
            'aria-describedby': 'discussion-count',
          }),
          h('p', { class: 'field__hint counter', id: 'discussion-count', text: `${m.discussion.length.toLocaleString()} / ${LIMITS.discussion.toLocaleString()}자` }),
        ),
        renderTextRows(m, 'decisions', { title: '결정 사항', placeholder: '결정 사항', max: LIMITS.decision, numbered: false }),
        renderActionItems(m),
        h(
          'fieldset',
          { class: 'card' },
          h('legend', { class: 'card__title', text: '비고 / 다음 회의' }),
          textarea('notes', m.notes, { rows: 3, maxlength: LIMITS.notes, 'aria-label': '비고 / 다음 회의' }),
        ),
      );
    },
    focusKey,
  );
}

export function showErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((el) => {
    el.hidden = true;
    el.textContent = '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  for (const { key, message } of errors) {
    const slot = form.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
    if (slot) {
      slot.textContent = message;
      slot.hidden = false;
    }
    form.querySelector(`[data-key="${CSS.escape(key)}"]`)?.setAttribute('aria-invalid', 'true');
  }
  const first = errors[0] && form.querySelector(`[data-key="${CSS.escape(errors[0].key)}"]`);
  if (first) {
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    first.focus({ preventScroll: true });
  }
}

function clearError(form, key) {
  const control = form.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!control?.hasAttribute('aria-invalid')) return;
  control.removeAttribute('aria-invalid');
  const slot = form.querySelector(`[data-error-for="${CSS.escape(key)}"]`);
  if (slot) slot.hidden = true;
}

/**
 * handlers: onField(field, value), onRow(section, rowId, field, value), onAddRow(section, afterId),
 * onRemoveRow(section, rowId), onMoveRow(section, rowId, delta), onAddAttendees(raw),
 * onRemoveAttendee(id), onToggleAttendee(id)
 */
export function bindForm(form, handlers) {
  const onValue = (e) => {
    const el = e.target;
    if (el.dataset.key) clearError(form, el.dataset.key);
    if (el.matches('[data-attendee-input]')) {
      if (/[,，]$/.test(el.value)) {
        handlers.onAddAttendees(el.value);
        el.value = '';
      }
      return;
    }
    if (el.dataset.section && el.dataset.row) {
      handlers.onRow(el.dataset.section, el.dataset.row, el.dataset.field, el.value);
      // 사용자가 고친 AI 항목은 배지를 뗀다
      el.closest('[data-row-id]')?.querySelector('.ai-badge')?.remove();
    } else if (el.dataset.field) {
      handlers.onField(el.dataset.field, el.value);
      if (el.dataset.field === 'discussion') {
        form.querySelector('#discussion-count').textContent = `${el.value.length.toLocaleString()} / ${LIMITS.discussion.toLocaleString()}자`;
      }
    }
  };
  form.addEventListener('input', onValue);
  form.addEventListener('change', onValue);
  form.addEventListener('submit', (e) => e.preventDefault());

  form.addEventListener('keydown', (e) => {
    const el = e.target;
    if (e.key !== 'Enter' || e.isComposing) return;
    if (el.matches('[data-attendee-input]')) {
      e.preventDefault();
      if (el.value.trim()) handlers.onAddAttendees(el.value);
      el.value = '';
      return;
    }
    const isRowText = el.dataset.section && (el.dataset.field === 'text' || el.dataset.field === 'task');
    if (isRowText) {
      e.preventDefault();
      handlers.onAddRow(el.dataset.section, el.dataset.row);
    }
  });

  form.addEventListener('focusout', (e) => {
    // 쉼표·Enter 없이 포커스를 옮겨도 입력한 참석자를 놓치지 않는다
    const el = e.target;
    if (el.matches('[data-attendee-input]') && el.value.trim() && !e.relatedTarget?.matches('[data-action="add-attendee"]')) {
      handlers.onAddAttendees(el.value);
      el.value = '';
    }
  });

  form.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, section, row, delta, attendee } = btn.dataset;
    if (action === 'add-row') handlers.onAddRow(section, null);
    else if (action === 'remove-row') handlers.onRemoveRow(section, row);
    else if (action === 'move-row') handlers.onMoveRow(section, row, Number(delta));
    else if (action === 'remove-attendee') handlers.onRemoveAttendee(attendee);
    else if (action === 'toggle-attendee') handlers.onToggleAttendee(attendee);
    else if (action === 'add-attendee') {
      const field = form.querySelector('[data-attendee-input]');
      if (field.value.trim()) handlers.onAddAttendees(field.value);
      field.value = '';
      field.focus();
    }
  });
}
