// 진입점: 이벤트를 store 액션으로 연결한다.
import { createStore } from './store.js';
import { render, showToast, hideToast, $ } from './view.js';
import { todosForDate, MAX_LENGTH } from './todo.js';
import { toDateKey } from './date.js';

const store = createStore();
const listEl = $('todo-list');
const input = $('add-input');

store.subscribe((state, action) => {
  // 토스트 만료는 화면 변화가 없으므로 다시 그리지 않는다 (수정 중인 입력창 보호)
  if (action.type !== 'FORGET_DELETED') render(state);
});
render(store.getState());

const itemId = (node) => node.closest('.todo')?.dataset.id;

function indexInToday(id) {
  const { todos, today } = store.getState();
  return todosForDate(todos, today).findIndex((t) => t.id === id);
}

// ---- 추가 ----
$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!input.value.trim()) {
    input.value = '';
    return;
  }
  store.dispatch({ type: 'ADD', text: input.value });
  input.value = '';
  input.focus();
});

// ---- 삭제 (+ 되돌리기) ----
function remove(id) {
  // 삭제 후 키보드 포커스를 옆 항목으로 옮긴다
  const li = listEl.querySelector(`[data-id="${CSS.escape(id)}"]`);
  const neighborId = (li?.nextElementSibling ?? li?.previousElementSibling)?.dataset.id;

  store.dispatch({ type: 'DELETE', id });
  showToast('할일을 삭제했습니다', () => store.dispatch({ type: 'FORGET_DELETED' }));

  const neighbor = neighborId && listEl.querySelector(`[data-id="${CSS.escape(neighborId)}"] [data-action="delete"]`);
  (neighbor || input).focus();
}

$('toast').addEventListener('click', (e) => {
  if (e.target.closest('[data-action="undo"]')) {
    hideToast();
    store.dispatch({ type: 'UNDO_DELETE' });
  }
});

// ---- 인라인 수정 ----
function startEdit(li) {
  const id = li.dataset.id;
  const todo = store.getState().todos.find((t) => t.id === id);
  const textEl = li.querySelector('.todo__text');
  if (!todo || !textEl) return;

  const editor = document.createElement('input');
  editor.type = 'text';
  editor.className = 'input todo__edit';
  editor.maxLength = MAX_LENGTH;
  editor.value = todo.text;
  editor.setAttribute('aria-label', '할일 수정');
  editor.dataset.focus = 'edit';
  li.draggable = false;
  textEl.replaceWith(editor);
  editor.focus();
  editor.select();

  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const value = editor.value.trim();
    if (!save || value === todo.text) {
      render(store.getState());
      return;
    }
    if (value) {
      store.dispatch({ type: 'EDIT', id, text: value });
    } else if (confirm('내용이 비어 있습니다. 이 할일을 삭제할까요?')) {
      remove(id);
    } else {
      render(store.getState());
    }
  };

  editor.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 한글 조합 중 Enter 무시
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  editor.addEventListener('blur', () => finish(true));
}

// ---- 목록 이벤트 위임 ----
listEl.addEventListener('change', (e) => {
  if (e.target.matches('[data-action="toggle"]')) {
    store.dispatch({ type: 'TOGGLE', id: itemId(e.target) });
  }
});

listEl.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const id = itemId(button);
  switch (button.dataset.action) {
    case 'priority':
      store.dispatch({ type: 'SET_PRIORITY', id });
      break;
    case 'edit':
      startEdit(button.closest('.todo'));
      break;
    case 'delete':
      remove(id);
      break;
    case 'up':
    case 'down':
      store.dispatch({ type: 'REORDER', id, toIndex: indexInToday(id) + (button.dataset.action === 'up' ? -1 : 1) });
      break;
  }
});

listEl.addEventListener('dblclick', (e) => {
  if (e.target.closest('.todo__text')) startEdit(e.target.closest('.todo'));
});

// ---- 드래그 앤 드롭 정렬 ----
let dragId = null;

const clearDropMarks = () =>
  listEl.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));

listEl.addEventListener('dragstart', (e) => {
  const li = e.target.closest?.('.todo');
  if (!li?.draggable) return;
  dragId = li.dataset.id;
  li.classList.add('is-dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});

listEl.addEventListener('dragover', (e) => {
  const li = e.target.closest('.todo');
  if (!dragId || !li || li.dataset.id === dragId) return;
  e.preventDefault();
  const after = e.clientY > li.getBoundingClientRect().top + li.offsetHeight / 2;
  clearDropMarks();
  li.classList.add(after ? 'drop-after' : 'drop-before');
});

listEl.addEventListener('drop', (e) => {
  const li = e.target.closest('.todo');
  if (!dragId || !li || li.dataset.id === dragId) return;
  e.preventDefault();
  const from = indexInToday(dragId);
  const target = indexInToday(li.dataset.id);
  const insertAt = li.classList.contains('drop-after') ? target + 1 : target;
  store.dispatch({ type: 'REORDER', id: dragId, toIndex: from < insertAt ? insertAt - 1 : insertAt });
});

listEl.addEventListener('dragend', () => {
  dragId = null;
  clearDropMarks();
  listEl.querySelector('.is-dragging')?.classList.remove('is-dragging');
});

// ---- 필터 ----
document.querySelector('.filters').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-filter]');
  if (tab) store.dispatch({ type: 'SET_FILTER', filter: tab.dataset.filter });
});

// ---- 완료 항목 지우기 ----
document.querySelector('[data-action="clear-done"]').addEventListener('click', () => {
  const { todos, today } = store.getState();
  const count = todosForDate(todos, today).filter((t) => t.completed).length;
  if (count && confirm(`완료한 할일 ${count}개를 지울까요?`)) {
    store.dispatch({ type: 'CLEAR_DONE' });
  }
});

// ---- 지난 할일 이월 ----
$('carry-banner').addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'carry-accept') store.dispatch({ type: 'CARRY_OVER' });
  else if (action === 'carry-dismiss') store.dispatch({ type: 'DISCARD_PAST' });
});

// ---- 자정이 지나면 오늘 날짜 갱신 ----
function checkDayChange() {
  const today = toDateKey();
  if (today !== store.getState().today) store.dispatch({ type: 'DAY_CHANGED', today });
}
setInterval(checkDayChange, 60_000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDayChange();
});

input.focus();
