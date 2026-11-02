// 상태 관리 + localStorage 저장/로드. 상태 변경은 dispatch로만 한다.
import * as Todo from './todo.js';
import { toDateKey } from './date.js';

const TODOS_KEY = 'todolist:v1:todos';
const SETTINGS_KEY = 'todolist:v1:settings';
const FILTERS = ['all', 'active', 'done'];

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function checkStorage() {
  try {
    const probe = '__todolist_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function load(today) {
  const storedTodos = readJSON(TODOS_KEY);
  const settings = readJSON(SETTINGS_KEY) ?? {};
  const todos = Array.isArray(storedTodos) ? storedTodos.filter(Todo.isValidTodo) : [];
  const pruned = Todo.pruneOld(todos, today);
  return {
    today,
    todos: pruned,
    filter: FILTERS.includes(settings.filter) ? settings.filter : 'all',
    lastDeleted: null,
    carryOverCount: Todo.pendingFromPast(pruned, today).length,
    storageAvailable: checkStorage(),
  };
}

function reducer(state, action) {
  const { today } = state;
  switch (action.type) {
    case 'ADD':
      return { ...state, todos: Todo.addTodo(state.todos, action.text, today) };
    case 'TOGGLE':
      return { ...state, todos: Todo.toggleTodo(state.todos, action.id) };
    case 'EDIT':
      return { ...state, todos: Todo.editTodo(state.todos, action.id, action.text) };
    case 'DELETE': {
      const deleted = state.todos.find((t) => t.id === action.id);
      if (!deleted) return state;
      return { ...state, todos: Todo.deleteTodo(state.todos, action.id), lastDeleted: deleted };
    }
    case 'UNDO_DELETE':
      return { ...state, todos: Todo.restoreTodo(state.todos, state.lastDeleted), lastDeleted: null };
    case 'FORGET_DELETED':
      return { ...state, lastDeleted: null };
    case 'SET_PRIORITY':
      return { ...state, todos: Todo.cyclePriority(state.todos, action.id) };
    case 'REORDER':
      return { ...state, todos: Todo.moveTodo(state.todos, today, action.id, action.toIndex) };
    case 'CLEAR_DONE':
      return { ...state, todos: Todo.clearDone(state.todos, today) };
    case 'SET_FILTER':
      return FILTERS.includes(action.filter) ? { ...state, filter: action.filter } : state;
    case 'CARRY_OVER':
      return { ...state, todos: Todo.carryOver(state.todos, today), carryOverCount: 0 };
    case 'DISCARD_PAST':
      return { ...state, todos: Todo.discardPast(state.todos, today), carryOverCount: 0 };
    case 'DAY_CHANGED': {
      const todos = Todo.pruneOld(state.todos, action.today);
      return {
        ...state,
        today: action.today,
        todos,
        carryOverCount: Todo.pendingFromPast(todos, action.today).length,
      };
    }
    default:
      return state;
  }
}

export function createStore(today = toDateKey()) {
  let state = load(today);
  const listeners = new Set();

  const persist = () => {
    const ok =
      writeJSON(TODOS_KEY, state.todos) &&
      writeJSON(SETTINGS_KEY, { filter: state.filter, lastOpenedDate: state.today });
    if (!ok && state.storageAvailable) state = { ...state, storageAvailable: false };
  };

  persist();

  return {
    getState: () => state,
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      persist();
      listeners.forEach((fn) => fn(state, action));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
