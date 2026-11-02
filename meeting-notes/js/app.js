// 진입점: 라우팅(#/list, #/new, #/edit/:id), 이벤트를 store 액션·동기화·녹음·AI 요약으로 연결한다.
import { createStore } from './store.js';
import * as M from './meeting.js';
import { $, debounce } from './views/dom.js';
import { renderForm, bindForm, showErrors } from './views/form-view.js';
import { renderDocument } from './views/preview.js';
import { renderList, syncBadge } from './views/list-view.js';
import { showToast, initToast, showBanner, hideBanner, confirmDialog } from './views/ui.js';
import { openSettings } from './views/settings-view.js';
import { updateRecorderBar, setLevel } from './views/recorder-bar.js';
import { renderTranscript, bindTranscript, renderRecordings } from './views/transcript-view.js';
import { renderAiReview, readSelection, selectionCount } from './views/ai-review-view.js';
import { createClient, errorMessage, RETRYABLE } from './sync/client.js';
import { createOutbox } from './sync/outbox.js';
import { createRecorder, isRecordingSupported, micErrorMessage } from './media/recorder.js';
import * as audioStore from './media/audio-store.js';
import { createSpeech, isSpeechSupported } from './media/speech.js';
import { requestSummary, inputChars, MIN_INPUT_CHARS, MAX_INPUT_CHARS } from './ai/summarize.js';
import { printMeeting, downloadHtml, copyHtml, fileBaseName } from './export.js';
import { formatClock } from './date.js';

const store = createStore();
const client = createClient(() => {
  const { settings, token } = store.getState();
  return { endpointUrl: settings.endpointUrl, token, clientId: settings.clientId };
});
const outbox = createOutbox(store, client, {
  onSuccess: (id) => {
    if (id !== ui.meetingId) return;
    const { spreadsheetUrl } = store.getState().settings;
    showToast('시트에 저장했어요', spreadsheetUrl ? { actionLabel: '시트에서 보기', onAction: () => window.open(spreadsheetUrl, '_blank', 'noopener') } : {});
  },
  onConflict: async (id, res) => {
    const m = store.getMeeting(id);
    if (!m) return;
    const { value } = await confirmDialog({
      title: '시트의 내용이 더 최신입니다',
      message: `"${m.title || '제목 없는 회의'}" — ${res.message ?? '다른 곳에서 먼저 저장된 내용이 있습니다.'}`,
      details: ['덮어쓰면 시트의 해당 회의 내용이 지금 화면의 내용으로 바뀝니다.'],
      confirmLabel: '내 내용으로 덮어쓰기',
      danger: true,
    });
    if (value === 'confirm') outbox.enqueueUpsert(id, { force: true });
  },
  onFinalError: (id, res) => {
    if (res.code === 'UNAUTHORIZED' || res.code === 'NOT_CONFIGURED') {
      showToast(errorMessage(res), { actionLabel: '설정 열기', onAction: showSettings, duration: 8000 });
    } else {
      showToast(`시트 저장 실패: ${errorMessage(res)}`, { actionLabel: '재시도', onAction: () => outbox.enqueueUpsert(id), duration: 8000 });
    }
  },
});

const ui = {
  view: 'list',
  meetingId: null,
  query: '',
  filter: 'all',
  tab: 'form',
  interim: '',
  ai: { meetingId: null, busy: false, error: '', abort: null, hidden: new Set() },
  autoSyncTimers: new Map(),
  audioUrl: null,
};

const form = $('meeting-form');
const current = () => (ui.meetingId ? store.getMeeting(ui.meetingId) : null);
const configured = () => client.isConfigured();
const rowTextField = (section) => (section === 'actionItems' ? 'task' : 'text');
const focusKey = (key) => form.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();

// ─────────────────────────── 렌더링 ───────────────────────────

function renderListView() {
  const { meetings, outbox: queue } = store.getState();
  renderList($('meeting-list'), meetings, { query: ui.query, filter: ui.filter, configured: configured() });
  const failed = meetings.filter((m) => ['failed', 'conflict'].includes(m.sync.status)).length;
  const waiting = queue.length + failed;
  $('outbox-status').hidden = !waiting;
  $('outbox-text').textContent = `⚠ 동기화 대기·실패 ${waiting}건`;
}

const renderPreview = debounce(() => {
  const m = current();
  if (!m) return;
  const badge = syncBadge(m.sync, { configured: configured() });
  $('preview').replaceChildren(renderDocument(m, { footerNote: `시트 동기화: ${badge.label.replace(/^\S+\s/, '')}` }));
}, 150);

function renderStatus() {
  const m = current();
  if (!m) return;
  $('edit-title').textContent = m.title.trim() || '제목 없는 회의';
  const badge = syncBadge(m.sync, { configured: configured() });
  const el = $('sync-badge');
  el.className = `badge badge--${badge.tone}`;
  el.textContent = badge.label;
  el.title = m.sync.lastError?.message ?? '';
  const link = $('sheet-link');
  const { spreadsheetUrl } = store.getState().settings;
  link.hidden = !(spreadsheetUrl && m.sync.status === 'synced');
  if (spreadsheetUrl) link.href = spreadsheetUrl;
  $('btn-save').disabled = m.sync.status === 'syncing';
}

function renderTranscriptPanel() {
  const m = current();
  if (!m) return;
  renderTranscript($('transcript-list'), m.transcript?.segments ?? [], {
    interim: speechMeetingId === m.id ? ui.interim : '',
    attendeeNames: m.attendees.map((a) => a.name),
  });
  $('transcript-to-discussion').disabled = !m.transcript?.segments.length;
}

function renderRecordingsList() {
  const m = current();
  if (m) renderRecordings($('recordings'), m.recordings, recorder.state !== 'idle' ? recorder.recordingId : null);
}

function aiVisible() {
  return configured() && store.getState().settings.features?.ai === true;
}

function renderAi() {
  const m = current();
  if (!m) return;
  const mine = ui.ai.meetingId === m.id;
  const panel = $('ai-panel');
  if (ui.ai.hidden.has(m.id) && !(mine && ui.ai.busy)) {
    panel.hidden = true;
    panel.replaceChildren();
    return;
  }
  renderAiReview(panel, m, { busy: mine && ui.ai.busy, error: mine ? ui.ai.error : '' });
}

function updateBar() {
  const m = current();
  updateRecorderBar({
    recState: recMeetingId && recMeetingId === m?.id ? recorder.state : 'idle',
    elapsed: recorder.state !== 'idle' ? recorder.elapsed() : 0,
    speechActive: speech.active && speechMeetingId === m?.id,
    speechSupported: isSpeechSupported(),
    recordingSupported: isRecordingSupported(),
    aiVisible: aiVisible(),
    aiBusy: ui.ai.busy && ui.ai.meetingId === m?.id,
  });
}

function updateTimeWarning(m) {
  const warning = M.timeWarning(m);
  const el = $('time-warning');
  if (!el) return;
  el.textContent = warning;
  el.hidden = !warning;
}

function setTab(tab) {
  ui.tab = tab;
  $('workspace').dataset.tab = tab;
  document.querySelectorAll('[data-tab][role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
}

// ─────────────────────────── 라우팅 ───────────────────────────

function showList() {
  ui.view = 'list';
  ui.meetingId = null;
  $('view-edit').hidden = true;
  $('view-list').hidden = false;
  document.title = recorder.state !== 'idle' ? '● 녹음 중 — 회의록' : '회의록';
  renderListView();
}

function showEdit(id) {
  const switching = ui.meetingId !== id;
  ui.view = 'edit';
  ui.meetingId = id;
  $('view-list').hidden = true;
  $('view-edit').hidden = false;
  const m = current();
  renderForm(form, m);
  renderPreview();
  renderStatus();
  renderTranscriptPanel();
  renderRecordingsList();
  renderAi();
  updateBar();
  if (switching) {
    setTab('form');
    window.scrollTo(0, 0);
    if (!m.title) focusKey('title');
  }
}

async function route() {
  const hash = location.hash || '#/list';
  if (hash === '#/new') {
    const m = M.createMeeting({ author: store.getState().settings.lastAuthor });
    store.dispatch({ type: 'CREATE_MEETING', meeting: m });
    location.replace(`#/edit/${m.id}`);
    return;
  }
  const match = /^#\/edit\/(.+)$/.exec(hash);
  const id = match ? decodeURIComponent(match[1]) : null;
  // 다른 회의로 옮기면 진행 중인 녹음·받아쓰기는 원래 회의에 저장하고 멈춘다
  if (recMeetingId && recMeetingId !== id) {
    await stopRecording();
    showToast('화면을 옮겨 녹음을 중지하고 저장했습니다.');
  }
  if (speech.active && speechMeetingId !== id) speech.stop();
  if (id && store.getMeeting(id)) showEdit(id);
  else {
    if (id) showToast('회의록을 찾을 수 없습니다.');
    if (location.hash !== '#/list') history.replaceState(null, '', '#/list');
    showList();
  }
}

// ─────────────────────────── store 구독 ───────────────────────────

const STRUCTURAL = new Set([
  'ADD_ROW',
  'REMOVE_ROW',
  'RESTORE_ROW',
  'MOVE_ROW',
  'ADD_ATTENDEES',
  'REMOVE_ATTENDEE',
  'TOGGLE_ATTENDEE',
  'APPLY_AI_DRAFT',
  'TRANSCRIPT_TO_DISCUSSION',
]);
const CONTENT_ACTIONS = new Set([...STRUCTURAL, 'UPDATE_FIELD', 'UPDATE_ROW']);

store.subscribe((state, action) => {
  if (action.type === 'STORAGE_FAILED' || !state.storageAvailable) {
    showBanner('storage', '이 브라우저에서는 자동 저장되지 않습니다. 창을 닫으면 내용이 사라질 수 있습니다.', { tone: 'error' });
  }
  if (CONTENT_ACTIONS.has(action.type)) scheduleAutoSync(action.id);

  if (ui.view === 'list') {
    renderListView();
    return;
  }
  const m = current();
  if (!m) {
    if (action.type === 'DELETE_MEETING') location.hash = '#/list';
    return;
  }
  if (action.id && action.id !== m.id && action.type !== 'SET_SETTINGS') return;

  if (STRUCTURAL.has(action.type)) renderForm(form, m);
  if (action.type === 'UPDATE_FIELD' && (action.field === 'startTime' || action.field === 'endTime')) updateTimeWarning(m);
  if (action.type.startsWith('TRANSCRIPT_') || action.type === 'ADD_ATTENDEES' || action.type === 'REMOVE_ATTENDEE') renderTranscriptPanel();
  if (action.type.startsWith('RECORDING_')) renderRecordingsList();
  if (action.type.startsWith('AI_') || action.type === 'APPLY_AI_DRAFT') renderAi();
  if (action.type === 'SET_SETTINGS') updateBar();
  renderStatus();
  renderPreview();
});

store.setOnSaved((at, ok) => {
  $('autosave').textContent = ok && at ? `자동 저장됨 · ${formatClock(at.toISOString())}` : '자동 저장 실패';
});

// ─────────────────────────── 폼 입력 ───────────────────────────

bindForm(form, {
  onField(field, value) {
    store.dispatch({ type: 'UPDATE_FIELD', id: ui.meetingId, field, value });
    if (field === 'author' && value.trim()) store.dispatch({ type: 'SET_SETTINGS', patch: { lastAuthor: value.trim() } });
  },
  onRow(section, rowId, field, value) {
    store.dispatch({ type: 'UPDATE_ROW', id: ui.meetingId, section, rowId, field, value });
  },
  onAddRow(section, afterId) {
    store.dispatch({ type: 'ADD_ROW', id: ui.meetingId, section, afterId });
    const rows = current()[section];
    const index = afterId ? rows.findIndex((r) => r.id === afterId) + 1 : rows.length - 1;
    const row = rows[index];
    if (row) focusKey(`${section}:${row.id}:${rowTextField(section)}`);
  },
  onRemoveRow(section, rowId) {
    const m = current();
    const { removed } = M.removeRow(m, section, rowId);
    if (!removed) return;
    store.dispatch({ type: 'REMOVE_ROW', id: m.id, section, rowId });
    const rows = current()[section];
    const neighbor = rows[Math.min(removed.index, rows.length - 1)];
    if (neighbor) focusKey(`${section}:${neighbor.id}:${rowTextField(section)}`);
    else form.querySelector(`[data-action="add-row"][data-section="${section}"]`)?.focus();
    const hasContent = Object.entries(removed.row).some(([k, v]) => ['text', 'task', 'owner', 'memo'].includes(k) && String(v ?? '').trim());
    if (hasContent) {
      showToast('항목을 삭제했습니다', {
        actionLabel: '되돌리기',
        onAction: () => store.dispatch({ type: 'RESTORE_ROW', id: m.id, removed }),
        duration: 5000,
      });
    }
  },
  onMoveRow(section, rowId, delta) {
    store.dispatch({ type: 'MOVE_ROW', id: ui.meetingId, section, rowId, delta });
    form.querySelector(`[data-action="move-row"][data-row="${CSS.escape(rowId)}"][data-delta="${delta}"]`)?.focus();
  },
  onAddAttendees(raw) {
    store.dispatch({ type: 'ADD_ATTENDEES', id: ui.meetingId, raw });
    focusKey('attendees');
  },
  onRemoveAttendee(attendeeId) {
    store.dispatch({ type: 'REMOVE_ATTENDEE', id: ui.meetingId, attendeeId });
    focusKey('attendees');
  },
  onToggleAttendee(attendeeId) {
    store.dispatch({ type: 'TOGGLE_ATTENDEE', id: ui.meetingId, attendeeId });
    form.querySelector(`[data-action="toggle-attendee"][data-attendee="${CSS.escape(attendeeId)}"]`)?.focus();
  },
});

// ─────────────────────────── 시트 저장 ───────────────────────────

function checkRequired() {
  const m = current();
  const errors = M.validate(m);
  if (!errors.length) return true;
  setTab('form');
  showErrors(form, errors);
  showToast(`필수 항목을 확인하세요 (${errors.length}개)`);
  return false;
}

function showSettings() {
  openSettings({
    store,
    client,
    onSaved: () => {
      refreshFeatures();
      outbox.process();
      if (ui.view === 'edit') {
        renderStatus();
        updateBar();
      } else renderListView();
      showToast('설정을 저장했습니다');
    },
  });
}

function saveToSheet() {
  const m = current();
  if (!m || !checkRequired()) return;
  if (!configured()) {
    showToast('시트 연결을 먼저 설정하세요', { actionLabel: '설정 열기', onAction: showSettings, duration: 6000 });
    return;
  }
  clearTimeout(ui.autoSyncTimers.get(m.id));
  outbox.enqueueUpsert(m.id);
  if (!navigator.onLine) showToast('오프라인 — 연결되면 자동으로 저장합니다');
}

/** 자동 동기화: 마지막 편집 후 30초 동안 변경이 없으면 저장 */
function scheduleAutoSync(id) {
  if (!id || !store.getState().settings.autoSync || !configured()) return;
  clearTimeout(ui.autoSyncTimers.get(id));
  ui.autoSyncTimers.set(
    id,
    setTimeout(() => {
      ui.autoSyncTimers.delete(id);
      const m = store.getMeeting(id);
      if (m && ['local', 'dirty', 'failed'].includes(m.sync.status) && !M.validate(m).length) outbox.enqueueUpsert(id);
    }, 30_000),
  );
}

async function refreshFeatures() {
  if (!configured()) return;
  const res = await client.ping();
  if (res.ok) store.dispatch({ type: 'SET_SETTINGS', patch: { features: res.features ?? null } });
  else if (res.code === 'UNAUTHORIZED') store.dispatch({ type: 'SET_SETTINGS', patch: { features: null } });
}

$('btn-save').addEventListener('click', saveToSheet);
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-settings]')) showSettings();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && ui.view === 'edit') {
    e.preventDefault();
    saveToSheet();
  }
});

// ─────────────────────────── 내보내기 ───────────────────────────

$('btn-print').addEventListener('click', () => {
  if (!checkRequired()) return;
  renderPreview.cancel();
  $('preview').replaceChildren(renderDocument(current()));
  printMeeting();
});
$('btn-download').addEventListener('click', async () => {
  if (!checkRequired()) return;
  await downloadHtml(current());
  showToast('HTML 파일을 내려받았습니다');
});
$('btn-copy').addEventListener('click', async () => {
  if (!checkRequired()) return;
  try {
    await copyHtml(current());
    showToast('회의록을 복사했습니다. 메일 본문에 붙여넣으세요.');
  } catch {
    showToast('클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.');
  }
});

// ─────────────────────────── 목록 ───────────────────────────

$('list-search').addEventListener('input', (e) => {
  ui.query = e.target.value;
  renderListView();
});
$('list-filter').addEventListener('change', (e) => {
  ui.filter = e.target.value;
  renderListView();
});
$('outbox-retry').addEventListener('click', () => {
  // 충돌은 사용자가 덮어쓸지 정해야 하므로 실패한 항목만 다시 넣는다
  for (const m of store.getState().meetings) {
    if (m.sync.status === 'failed') outbox.enqueueUpsert(m.id);
  }
  outbox.retryNow();
});

$('meeting-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-list-action]');
  if (!btn) return;
  const id = btn.closest('[data-id]').dataset.id;
  const m = store.getMeeting(id);
  if (!m) return;
  const action = btn.dataset.listAction;
  if (action === 'retry') {
    if (!configured()) showSettings();
    else outbox.enqueueUpsert(id);
  } else if (action === 'duplicate') {
    const copy = M.duplicateMeeting(m);
    store.dispatch({ type: 'CREATE_MEETING', meeting: copy });
    location.hash = `#/edit/${copy.id}`;
  } else if (action === 'delete') {
    deleteMeeting(m);
  }
});

async function deleteMeeting(m) {
  const synced = m.sync.serverVersion != null;
  const { value, option } = await confirmDialog({
    title: '회의록을 삭제할까요?',
    message: `"${m.title || '제목 없는 회의'}" 회의록을 이 기기에서 삭제합니다.`,
    details: [m.recordings.length ? `녹음 파일 ${m.recordings.length}개도 함께 삭제됩니다.` : null, '삭제한 회의록은 되돌릴 수 없습니다.'].filter(Boolean),
    option: synced ? { label: '시트에서도 삭제 (숨김 처리)', checked: true } : null,
    confirmLabel: '삭제',
    danger: true,
  });
  if (value !== 'confirm') return;
  if (recMeetingId === m.id) await stopRecording();
  if (speechMeetingId === m.id) speech.stop();
  await Promise.all(m.recordings.map((r) => audioStore.deleteRecording(r.id).catch(() => {})));
  store.dispatch({ type: 'DELETE_MEETING', id: m.id });
  if (synced && option) outbox.enqueueDelete(m.id, m.sync.serverVersion);
  showToast('회의록을 삭제했습니다');
}

// ─────────────────────────── 녹음 ───────────────────────────

let recMeetingId = null;
let speechByRecording = false;

const recorder = createRecorder({
  onTick: () => updateBar(),
  onLevel: setLevel,
  onError: (message) => showToast(message, { duration: 8000 }),
  onAutoStop: async (message) => {
    await stopRecording();
    showToast(message, { duration: 8000 });
  },
});

/** 외부 전송(음성 인식·AI) 고지는 처음 한 번만 확인받는다. */
async function ensureNotice() {
  if (store.getState().settings.aiNoticeAcknowledged) return true;
  const { value } = await confirmDialog({
    title: '외부 서비스로 데이터가 전송됩니다',
    details: [
      '실시간 받아쓰기: 음성이 브라우저 제공사(Google·Microsoft·Apple 등)의 음성 인식 서버로 전송됩니다.',
      'AI 요약: 받아쓰기와 메모 텍스트가 Apps Script를 거쳐 Anthropic(Claude) API로 전송됩니다.',
      '민감한 회의라면 이 기능을 사용하지 마세요.',
    ],
    requireCheck: '내용을 확인했습니다',
    confirmLabel: '계속',
  });
  if (value !== 'confirm') return false;
  store.dispatch({ type: 'SET_SETTINGS', patch: { aiNoticeAcknowledged: true } });
  return true;
}

async function startRecording() {
  const m = current();
  if (!m || recorder.state !== 'idle') return;
  const withSpeech = store.getState().settings.liveTranscription && isSpeechSupported();
  if (!m.recordingConsentAt) {
    const { value } = await confirmDialog({
      title: '녹음을 시작할까요?',
      message: '녹음하기 전에 참석자 전원에게 녹음 사실을 알려야 합니다.',
      details: [
        '녹음 파일은 이 기기의 브라우저 저장소에만 저장되고 어디에도 업로드되지 않습니다.',
        withSpeech ? '실시간 받아쓰기가 함께 켜지며, 음성이 브라우저 제공사의 음성 인식 서버로 전송됩니다.' : null,
      ].filter(Boolean),
      requireCheck: '참석자 전원에게 녹음 사실을 알렸습니다',
      confirmLabel: '녹음 시작',
    });
    if (value !== 'confirm') return;
    store.dispatch({ type: 'RECORDING_CONSENT', id: m.id });
    if (withSpeech) store.dispatch({ type: 'SET_SETTINGS', patch: { aiNoticeAcknowledged: true } });
  }
  try {
    const ref = await recorder.start(m.id);
    recMeetingId = m.id;
    hideBanner('mic');
    store.dispatch({ type: 'RECORDING_ADDED', id: m.id, recording: ref });
    audioStore.requestPersistence();
    checkStorageQuota();
    if (withSpeech && !speech.active) {
      speechByRecording = await startSpeech();
    }
  } catch (err) {
    showBanner('mic', micErrorMessage(err), { tone: 'error', actions: [{ label: '닫기', onClick: () => hideBanner('mic') }] });
  }
  updateBar();
}

async function stopRecording() {
  if (recorder.state === 'idle') return;
  const id = recMeetingId;
  if (speechByRecording) speech.stop();
  speechByRecording = false;
  try {
    const ref = await recorder.stop();
    if (ref && id) {
      store.dispatch({
        type: 'RECORDING_UPDATED',
        id,
        recordingId: ref.id,
        patch: { durationSec: ref.durationSec, sizeBytes: ref.sizeBytes, status: 'complete' },
      });
    }
  } catch {
    showToast('녹음을 저장하지 못했습니다. 다음 실행 시 복구를 시도합니다.');
  }
  recMeetingId = null;
  updateBar();
  renderRecordingsList();
}

async function checkStorageQuota() {
  const estimate = await audioStore.storageEstimate();
  if (!estimate?.quota) return;
  const freeMb = (estimate.quota - estimate.usage) / (1024 * 1024);
  const usedMb = estimate.usage / (1024 * 1024);
  if (freeMb < 200) showToast(`저장 공간이 부족합니다 (남은 용량 약 ${Math.round(freeMb)}MB). 오래된 녹음을 정리하세요.`, { duration: 8000 });
  else if (usedMb > 500) showToast(`녹음이 ${Math.round(usedMb)}MB를 차지하고 있습니다. 필요 없는 녹음은 삭제하세요.`, { duration: 6000 });
}

$('rec-start').addEventListener('click', startRecording);
$('rec-stop').addEventListener('click', stopRecording);
$('rec-pause').addEventListener('click', () => {
  if (recorder.state === 'recording') {
    recorder.pause();
    if (speechByRecording) speech.stop();
  } else if (recorder.state === 'paused') {
    recorder.resume();
    if (speechByRecording) speech.start();
  }
  updateBar();
});

/** 중단된 녹음(탭이 닫힌 경우) 복구 안내 */
async function recoverInterrupted() {
  if (!audioStore.isAudioStoreAvailable()) return;
  let interrupted = [];
  try {
    interrupted = await audioStore.listInterrupted(recorder.recordingId);
  } catch {
    return;
  }
  for (const rec of interrupted) {
    const m = store.getMeeting(rec.meetingId);
    if (!m) {
      audioStore.deleteRecording(rec.id).catch(() => {});
      continue;
    }
    const key = `rec-${rec.id}`;
    showBanner(key, `중단된 녹음이 있습니다 — "${m.title || '제목 없는 회의'}" ${formatClock(rec.startedAt)} 시작`, {
      actions: [
        {
          label: '복구',
          onClick: async () => {
            hideBanner(key);
            const done = await audioStore.finalize(rec.id);
            if (!done) return;
            const patch = { durationSec: done.durationSec, sizeBytes: done.sizeBytes, status: 'complete' };
            if (m.recordings.some((r) => r.id === rec.id)) store.dispatch({ type: 'RECORDING_UPDATED', id: m.id, recordingId: rec.id, patch });
            else {
              const { blob, ...ref } = done;
              store.dispatch({ type: 'RECORDING_ADDED', id: m.id, recording: ref });
            }
            showToast('녹음을 복구했습니다');
          },
        },
        {
          label: '삭제',
          onClick: async () => {
            hideBanner(key);
            await audioStore.deleteRecording(rec.id);
            store.dispatch({ type: 'RECORDING_REMOVED', id: m.id, recordingId: rec.id });
          },
        },
      ],
    });
  }
}

const RECORDING_EXT = { 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };

$('recordings').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-recording-action]');
  if (!btn) return;
  const m = current();
  const id = btn.closest('[data-recording]').dataset.recording;
  const action = btn.dataset.recordingAction;
  if (action === 'delete') {
    const { value } = await confirmDialog({ title: '녹음을 삭제할까요?', message: '삭제한 녹음은 되돌릴 수 없습니다.', confirmLabel: '삭제', danger: true });
    if (value !== 'confirm') return;
    await audioStore.deleteRecording(id).catch(() => {});
    store.dispatch({ type: 'RECORDING_REMOVED', id: m.id, recordingId: id });
    return;
  }
  const rec = await audioStore.getRecording(id).catch(() => null);
  if (!rec?.blob) {
    showToast('녹음 파일을 찾을 수 없습니다. 중단된 녹음이면 새로고침 후 복구하세요.');
    return;
  }
  if (ui.audioUrl) URL.revokeObjectURL(ui.audioUrl);
  ui.audioUrl = URL.createObjectURL(rec.blob);
  if (action === 'play') {
    const player = $('recordings').querySelector('audio');
    player.hidden = false;
    player.src = ui.audioUrl;
    player.play().catch(() => {});
  } else if (action === 'download') {
    const index = m.recordings.findIndex((r) => r.id === id) + 1;
    const ext = RECORDING_EXT[rec.mimeType.split(';')[0]] ?? 'webm';
    const a = document.createElement('a');
    a.href = ui.audioUrl;
    a.download = `${fileBaseName(m)}_${index}.${ext}`;
    document.body.append(a);
    a.click();
    a.remove();
  }
});

// ─────────────────────────── 받아쓰기 ───────────────────────────

let speechMeetingId = null;

const speech = createSpeech({
  onFinal(text) {
    if (!speechMeetingId || !store.getMeeting(speechMeetingId)) return;
    const recording = recMeetingId === speechMeetingId && recorder.state !== 'idle';
    store.dispatch({
      type: 'TRANSCRIPT_SEGMENT_ADDED',
      id: speechMeetingId,
      segment: {
        id: crypto.randomUUID(),
        recordingId: recording ? recorder.recordingId : null,
        offsetSec: recording ? Math.round(recorder.elapsed()) : null,
        at: new Date().toISOString(),
        speaker: null,
        text: text.slice(0, M.LIMITS.segment),
        engine: 'webspeech',
        edited: false,
      },
    });
  },
  onInterim(text) {
    ui.interim = text;
    if (speechMeetingId === ui.meetingId) renderTranscriptPanel();
  },
  onState: () => updateBar(),
  onError: (message) => showToast(message, { duration: 8000 }),
});

async function startSpeech() {
  const m = current();
  if (!m || !isSpeechSupported()) return false;
  if (!(await ensureNotice())) return false;
  speechMeetingId = m.id;
  speech.start();
  updateBar();
  return true;
}

$('speech-toggle').addEventListener('click', async () => {
  if (speech.active) {
    speech.stop();
    speechByRecording = false;
  } else {
    await startSpeech();
  }
  updateBar();
});

bindTranscript($('transcript-list'), {
  onEdit: (segmentId, patch) => {
    if (patch.text === '') store.dispatch({ type: 'TRANSCRIPT_SEGMENT_REMOVED', id: ui.meetingId, segmentId });
    else store.dispatch({ type: 'TRANSCRIPT_SEGMENT_EDITED', id: ui.meetingId, segmentId, patch });
  },
  onRemove: (segmentId) => store.dispatch({ type: 'TRANSCRIPT_SEGMENT_REMOVED', id: ui.meetingId, segmentId }),
});

$('transcript-to-discussion').addEventListener('click', () => {
  store.dispatch({ type: 'TRANSCRIPT_TO_DISCUSSION', id: ui.meetingId });
  setTab('form');
  showToast('받아쓰기를 논의 내용 끝에 붙였습니다');
});

$('transcript-collapse').addEventListener('click', (e) => {
  const body = $('transcript-body');
  body.hidden = !body.hidden;
  e.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
  e.currentTarget.textContent = body.hidden ? '펼치기 ▾' : '접기 ▴';
});

// ─────────────────────────── AI 요약 ───────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function summarize() {
  const m = current();
  if (!m || ui.ai.busy) return;
  // 이미 만든 초안이 숨겨져 있으면 먼저 다시 보여준다
  if (m.aiSummary && ui.ai.hidden.has(m.id)) {
    ui.ai.hidden.delete(m.id);
    renderAi();
    $('ai-panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
    return;
  }
  const chars = inputChars(m);
  if (chars < MIN_INPUT_CHARS) {
    showToast(`받아쓰기나 논의 내용 메모가 ${MIN_INPUT_CHARS}자 이상 있어야 요약할 수 있습니다 (현재 ${chars}자).`, { duration: 6000 });
    return;
  }
  if (chars > MAX_INPUT_CHARS) {
    showToast('내용이 너무 깁니다. 받아쓰기 일부를 정리한 뒤 다시 시도하세요.', { duration: 6000 });
    return;
  }
  if (!navigator.onLine) {
    showToast('오프라인 상태에서는 AI 요약을 쓸 수 없습니다.');
    return;
  }
  if (!(await ensureNotice())) return;

  Object.assign(ui.ai, { meetingId: m.id, busy: true, error: '', abort: new AbortController() });
  ui.ai.hidden.delete(m.id);
  renderAi();
  updateBar();
  setTab('form');

  let res;
  for (let attempt = 1; attempt <= 2; attempt++) {
    res = await requestSummary(client, store.getMeeting(m.id) ?? m, { signal: ui.ai.abort.signal });
    if (res.ok || !RETRYABLE.has(res.code) || attempt === 2) break;
    await sleep(2000);
  }
  Object.assign(ui.ai, { busy: false, abort: null, error: '' });
  if (res.ok) {
    store.dispatch({ type: 'AI_SUMMARY_RECEIVED', id: m.id, aiSummary: res.aiSummary });
  } else if (res.code !== 'ABORTED') {
    ui.ai.error = errorMessage(res);
    if (res.code === 'AI_DISABLED') store.dispatch({ type: 'SET_SETTINGS', patch: { features: { ...store.getState().settings.features, ai: false } } });
  }
  renderAi();
  updateBar();
}

$('ai-summarize').addEventListener('click', summarize);

$('ai-panel').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-ai-action]');
  if (!btn) return;
  const m = current();
  const action = btn.dataset.aiAction;
  if (action === 'cancel') {
    ui.ai.abort?.abort();
  } else if (action === 'close') {
    ui.ai.error = '';
    ui.ai.hidden.add(m.id);
    renderAi();
  } else if (action === 'regenerate') {
    ui.ai.hidden.delete(m.id);
    store.dispatch({ type: 'AI_SUMMARY_DISMISSED', id: m.id });
    summarize();
  } else if (action === 'apply') {
    const selection = readSelection($('ai-panel'));
    const count = selectionCount(selection);
    if (!count) {
      showToast('적용할 항목을 선택하세요');
      return;
    }
    const replacing = Object.entries(selection.mode).filter(([section, mode]) => {
      if (mode !== 'replace') return false;
      const picked = Array.isArray(selection[section]) ? selection[section].length : selection[section];
      return picked && (Array.isArray(m[section]) ? m[section].some((r) => (r.text ?? r.task ?? '').trim()) : m[section].trim());
    });
    if (replacing.length) {
      const { value } = await confirmDialog({
        title: '기존 내용을 교체할까요?',
        message: '교체를 고른 섹션의 기존 내용이 AI 초안으로 바뀝니다.',
        confirmLabel: '교체하고 적용',
        danger: true,
      });
      if (value !== 'confirm') return;
    }
    store.dispatch({ type: 'APPLY_AI_DRAFT', id: m.id, selection });
    ui.ai.hidden.add(m.id);
    renderAi();
    showToast(`${count}개 항목을 회의록에 적용했습니다`);
  }
});

// ─────────────────────────── 탭·전역 이벤트 ───────────────────────────

document.querySelectorAll('[role="tab"][data-tab]').forEach((tab) => tab.addEventListener('click', () => setTab(tab.dataset.tab)));

window.addEventListener('hashchange', route);
window.addEventListener('online', () => {
  hideBanner('offline');
  outbox.process();
  if (ui.view === 'edit') renderStatus();
});
window.addEventListener('offline', () => {
  showBanner('offline', '오프라인 — 작성 내용은 이 기기에 저장되고, 연결되면 시트에 자동으로 저장합니다.', { tone: 'info' });
  if (ui.view === 'edit') renderStatus();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') outbox.process();
  else store.flush();
});
window.addEventListener('pagehide', () => store.flush());
window.addEventListener('beforeunload', (e) => {
  store.flush();
  if (recorder.state !== 'idle' || outbox.isBusy()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ─────────────────────────── 시작 ───────────────────────────

initToast();
if (!store.getState().storageAvailable) {
  showBanner('storage', '이 브라우저에서는 자동 저장되지 않습니다. 창을 닫으면 내용이 사라질 수 있습니다.', { tone: 'error' });
}
if (!navigator.onLine) showBanner('offline', '오프라인 — 작성 내용은 이 기기에 저장되고, 연결되면 시트에 자동으로 저장합니다.', { tone: 'info' });
route();
outbox.process();
refreshFeatures().then(() => updateBar());
recoverInterrupted();
