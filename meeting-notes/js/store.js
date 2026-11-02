// 상태 관리 + localStorage 저장/로드. 상태 변경은 dispatch로만 한다.
import * as M from './meeting.js';
import { payloadHash } from './sync/mapper.js';
import { applyDraft } from './ai/apply-draft.js';

const KEYS = {
  meetings: 'meetingnotes:v1:meetings',
  outbox: 'meetingnotes:v1:outbox',
  settings: 'meetingnotes:v1:settings',
  token: 'meetingnotes:v1:token',
};

export const DEFAULT_SETTINGS = {
  endpointUrl: '',
  spreadsheetUrl: '',
  rememberToken: false,
  autoSync: false,
  lastAuthor: '',
  clientId: '',
  liveTranscription: true,
  aiNoticeAcknowledged: false,
  features: null, // ping 응답의 { ai, transcribe }
};

function readJSON(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function checkStorage() {
  try {
    localStorage.setItem('__meetingnotes_probe__', '1');
    localStorage.removeItem('__meetingnotes_probe__');
    return true;
  } catch {
    return false;
  }
}

function readToken() {
  try {
    return sessionStorage.getItem(KEYS.token) || localStorage.getItem(KEYS.token) || '';
  } catch {
    return '';
  }
}

function load() {
  const meetings = (readJSON(localStorage, KEYS.meetings) ?? []).filter(M.isValidMeeting).map(M.normalizeMeeting);
  const outbox = readJSON(localStorage, KEYS.outbox);
  const settings = { ...DEFAULT_SETTINGS, ...(readJSON(localStorage, KEYS.settings) ?? {}) };
  if (!settings.clientId) settings.clientId = crypto.randomUUID();
  return {
    meetings,
    outbox: Array.isArray(outbox) ? outbox : [],
    settings,
    token: readToken(),
    storageAvailable: checkStorage(),
  };
}

/** 내용이 마지막 저장본과 같은지에 따라 synced ↔ dirty를 맞춘다. */
function refreshDirty(m) {
  const { status, syncedHash } = m.sync;
  if (status !== 'synced' && status !== 'dirty') return m;
  const next = payloadHash(m) === syncedHash ? 'synced' : 'dirty';
  return next === status ? m : { ...m, sync: { ...m.sync, status: next } };
}

const setSync = (m, patch) => ({ ...m, sync: { ...m.sync, ...patch } });

/** 회의 1건을 대상으로 하는 액션 → 새 회의 객체 (또는 그대로) */
function meetingReducer(m, action, state) {
  switch (action.type) {
    case 'UPDATE_FIELD':
      return M.updateField(m, action.field, action.value);
    case 'ADD_ROW':
      return M.addRow(m, action.section, action.fields, action.afterId);
    case 'UPDATE_ROW':
      return M.updateRow(m, action.section, action.rowId, action.field, action.value);
    case 'REMOVE_ROW':
      return M.removeRow(m, action.section, action.rowId).meeting;
    case 'RESTORE_ROW':
      return M.restoreRow(m, action.removed);
    case 'MOVE_ROW':
      return M.moveRow(m, action.section, action.rowId, action.delta);
    case 'ADD_ATTENDEES':
      return M.addAttendees(m, action.raw);
    case 'REMOVE_ATTENDEE':
      return M.removeAttendee(m, action.attendeeId);
    case 'TOGGLE_ATTENDEE':
      return M.toggleAttendeePresent(m, action.attendeeId);

    case 'RECORDING_CONSENT':
      return { ...m, recordingConsentAt: new Date().toISOString() };
    case 'RECORDING_ADDED':
      return { ...m, recordings: [...m.recordings, action.recording] };
    case 'RECORDING_UPDATED':
      return {
        ...m,
        recordings: m.recordings.map((r) => (r.id === action.recordingId ? { ...r, ...action.patch } : r)),
      };
    case 'RECORDING_REMOVED':
      return { ...m, recordings: m.recordings.filter((r) => r.id !== action.recordingId) };

    case 'TRANSCRIPT_SEGMENT_ADDED':
      return M.addSegment(m, action.segment);
    case 'TRANSCRIPT_SEGMENT_EDITED':
      return M.editSegment(m, action.segmentId, action.patch);
    case 'TRANSCRIPT_SEGMENT_REMOVED':
      return M.removeSegment(m, action.segmentId);
    case 'TRANSCRIPT_TO_DISCUSSION': {
      const text = (m.transcript?.segments ?? []).map((s) => s.text).join('\n');
      if (!text) return m;
      return M.updateField(m, 'discussion', m.discussion ? `${m.discussion}\n\n${text}` : text);
    }

    case 'AI_SUMMARY_RECEIVED':
      return { ...m, aiSummary: action.aiSummary };
    case 'AI_SUMMARY_DISMISSED':
      return { ...m, aiSummary: null };
    case 'APPLY_AI_DRAFT':
      if (!m.aiSummary) return m;
      return {
        ...applyDraft(m, m.aiSummary.draft, action.selection),
        aiSummary: { ...m.aiSummary, appliedAt: new Date().toISOString() },
      };

    case 'SYNC_QUEUED':
      return setSync(m, { status: m.sync.status === 'syncing' ? 'syncing' : 'queued' });
    case 'SYNC_STARTED':
      return setSync(m, { status: 'syncing' });
    case 'SYNC_SUCCEEDED': {
      const stillQueued = state.outbox.some((e) => e.meetingId === m.id);
      const synced = setSync(m, {
        serverVersion: action.version,
        syncedAt: action.syncedAt,
        syncedHash: action.hash,
        lastError: null,
        retry: null,
        status: 'synced',
      });
      return stillQueued ? setSync(synced, { status: 'queued' }) : synced;
    }
    case 'SYNC_RETRYING':
      return setSync(m, { status: 'queued', lastError: action.error, retry: action.retry });
    case 'SYNC_FAILED':
      return setSync(m, { status: 'failed', lastError: action.error, retry: null });
    case 'SYNC_CONFLICT':
      return setSync(m, { status: 'conflict', lastError: action.error, retry: null });
    default:
      return m;
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'CREATE_MEETING':
      return { ...state, meetings: [action.meeting, ...state.meetings] };
    case 'DELETE_MEETING':
      return {
        ...state,
        meetings: state.meetings.filter((m) => m.id !== action.id),
        // 아직 보내지 않은 저장 요청은 의미가 없으므로 버린다 (삭제 요청은 남긴다)
        outbox: state.outbox.filter((e) => !(e.meetingId === action.id && e.action === 'upsertMeeting')),
      };
    case 'OUTBOX_PUT': {
      const { entry, keepRequestId } = action;
      const rest = state.outbox.filter((e) => e.meetingId !== entry.meetingId || e.requestId === keepRequestId);
      return { ...state, outbox: [...rest, entry] };
    }
    case 'OUTBOX_UPDATE':
      return {
        ...state,
        outbox: state.outbox.map((e) => (e.requestId === action.requestId ? { ...e, ...action.patch } : e)),
      };
    case 'OUTBOX_REMOVE':
      return { ...state, outbox: state.outbox.filter((e) => e.requestId !== action.requestId) };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'SET_TOKEN':
      return { ...state, token: action.token };
    default: {
      if (!action.id) return state;
      let changed = false;
      const meetings = state.meetings.map((m) => {
        if (m.id !== action.id) return m;
        const next = meetingReducer(m, action, state);
        if (next === m) return m;
        changed = true;
        return action.type.startsWith('SYNC_') ? next : refreshDirty(next);
      });
      return changed ? { ...state, meetings } : state;
    }
  }
}

export function createStore() {
  let state = load();
  const listeners = new Set();
  let saveTimer = null;
  let lastSavedAt = null;
  let onSaved = () => {};

  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    const { token, features, ...rest } = { ...state.settings, token: state.token };
    let ok =
      writeJSON(localStorage, KEYS.meetings, state.meetings) &&
      writeJSON(localStorage, KEYS.outbox, state.outbox) &&
      writeJSON(localStorage, KEYS.settings, { ...rest, features });
    try {
      // 토큰은 "기억하기"일 때만 localStorage, 아니면 탭이 닫히면 사라지는 sessionStorage
      localStorage.removeItem(KEYS.token);
      sessionStorage.removeItem(KEYS.token);
      if (token) (state.settings.rememberToken ? localStorage : sessionStorage).setItem(KEYS.token, token);
    } catch {
      ok = false;
    }
    if (ok) lastSavedAt = new Date();
    if (!ok && state.storageAvailable) {
      state = { ...state, storageAvailable: false };
      listeners.forEach((fn) => fn(state, { type: 'STORAGE_FAILED' }));
    }
    onSaved(lastSavedAt, ok);
  };

  return {
    getState: () => state,
    getMeeting: (id) => state.meetings.find((m) => m.id === id) ?? null,
    getLastSavedAt: () => lastSavedAt,
    setOnSaved(fn) {
      onSaved = fn;
    },
    dispatch(action) {
      const next = reducer(state, action);
      if (next === state) return;
      state = next;
      // 입력 중에는 300ms 디바운스로 저장
      if (!saveTimer) saveTimer = setTimeout(persist, 300);
      listeners.forEach((fn) => fn(state, action));
    },
    flush() {
      if (saveTimer) persist();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
