// DOM 렌더링. 사용자 입력은 항상 textContent로만 넣는다 (innerHTML 금지).
import { todosForDate } from './todo.js';
import { formatKoreanDate, fromDateKey } from './date.js';

const PRIORITY_LABEL = { high: '높음', normal: '보통', low: '낮음' };

const EMPTY_TEXT = {
  all: '오늘 할 일을 추가해보세요',
  active: '진행중인 할일이 없어요',
  done: '완료한 할일이 없어요',
};

export const $ = (id) => document.getElementById(id);

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('aria-') || key === 'role') node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

function iconButton(action, label, content, extra = {}) {
  return el(
    'button',
    { type: 'button', className: 'icon-btn', title: label, 'aria-label': label, dataset: { action, focus: action }, ...extra },
    [content],
  );
}

function renderItem(todo, index, count, canReorder) {
  const li = el('li', {
    className: `todo${todo.completed ? ' is-done' : ''}`,
    draggable: canReorder,
    dataset: { id: todo.id },
  });

  const handle = el('span', { className: 'icon-btn todo__handle', 'aria-hidden': 'true', title: '드래그해서 순서 변경' }, ['⋮⋮']);
  if (!canReorder) handle.style.visibility = 'hidden';

  const check = el('input', {
    type: 'checkbox',
    className: 'todo__check',
    checked: todo.completed,
    'aria-label': `완료: ${todo.text}`,
    dataset: { action: 'toggle', focus: 'toggle' },
  });

  const priority = iconButton(
    'priority',
    `우선순위 ${PRIORITY_LABEL[todo.priority]} (눌러서 변경)`,
    el('i', { className: `dot dot--${todo.priority}` }),
  );

  const text = el('span', { className: 'todo__text', title: '더블클릭해서 수정' }, [todo.text]);

  const move = el('div', { className: 'todo__move' }, [
    iconButton('up', '위로 이동', '▲', { disabled: !canReorder || index === 0 }),
    iconButton('down', '아래로 이동', '▼', { disabled: !canReorder || index === count - 1 }),
  ]);

  li.append(
    handle,
    check,
    priority,
    text,
    iconButton('edit', '수정', '✏️'),
    move,
    iconButton('delete', '삭제', '🗑', { className: 'icon-btn icon-btn--danger' }),
  );
  return li;
}

/** 렌더 전후로 포커스를 유지하기 위해 현재 포커스 위치를 기억 */
function captureFocus() {
  const active = document.activeElement;
  const li = active?.closest?.('.todo');
  if (!li || !active.dataset.focus) return null;
  return { id: li.dataset.id, key: active.dataset.focus };
}

function restoreFocus(saved, listEl) {
  if (!saved) return;
  const li = listEl.querySelector(`[data-id="${CSS.escape(saved.id)}"]`);
  const target = li?.querySelector(`[data-focus="${saved.key}"]`);
  if (target && !target.disabled) target.focus();
  else li?.querySelector('[data-focus="toggle"]')?.focus();
}

export function render(state) {
  const today = todosForDate(state.todos, state.today);
  const total = today.length;
  const done = today.filter((t) => t.completed).length;
  const visible = today.filter((t) =>
    state.filter === 'active' ? !t.completed : state.filter === 'done' ? t.completed : true,
  );
  const canReorder = state.filter === 'all';

  $('today').textContent = formatKoreanDate(fromDateKey(state.today));
  $('storage-banner').hidden = state.storageAvailable;

  // 지난 할일 이월 안내
  $('carry-banner').hidden = state.carryOverCount === 0;
  $('carry-text').textContent = `지난 날 끝내지 못한 할일 ${state.carryOverCount}개를 오늘로 가져올까요?`;

  // 진행률
  const percent = total ? Math.round((done / total) * 100) : 0;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-fill').parentElement.setAttribute('aria-valuenow', String(percent));
  const progressText = $('progress-text');
  const allDone = total > 0 && done === total;
  progressText.classList.toggle('is-complete', allDone);
  progressText.textContent = total === 0
    ? '아직 할일이 없어요'
    : allDone
      ? `오늘 할일 완료! 🎉 (${done} / ${total})`
      : `${done} / ${total} 완료`;

  // 필터 탭
  document.querySelectorAll('.filters__tab').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.filter === state.filter));
  });

  // 목록
  const listEl = $('todo-list');
  const focus = captureFocus();
  listEl.replaceChildren(...visible.map((t, i) => renderItem(t, i, visible.length, canReorder)));
  restoreFocus(focus, listEl);

  $('empty').hidden = visible.length > 0;
  $('empty-text').textContent = total === 0 ? EMPTY_TEXT.all : EMPTY_TEXT[state.filter];

  // 푸터
  $('remaining').textContent = `남은 할일 ${total - done}개`;
  document.querySelector('[data-action="clear-done"]').disabled = done === 0;
}

let toastTimer = null;

export function showToast(message, onExpire) {
  clearTimeout(toastTimer);
  $('toast-text').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => {
    hideToast();
    onExpire?.();
  }, 5000);
}

export function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}
