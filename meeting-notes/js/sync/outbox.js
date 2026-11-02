// 아웃박스 큐: 저장 요청을 localStorage에 쌓아 두고 한 번에 1건씩 보낸다.
// 재시도 가능한 오류는 지수 백오프(2s→4s→…→32s, ±20%)로 최대 5회 다시 보낸다. 같은 requestId를 유지해 서버가 중복을 걸러낸다.
import { toSheetPayload, payloadHash } from './mapper.js';
import { RETRYABLE, MAX_ATTEMPTS, errorMessage } from './client.js';

const backoffMs = (attempt) => 2000 * 2 ** (attempt - 1) * (0.8 + Math.random() * 0.4);

/** events: onSuccess(meetingId), onConflict(meetingId, res), onFinalError(meetingId, res) */
export function createOutbox(store, client, events = {}) {
  let inflight = null;
  let timer = null;

  function schedule() {
    clearTimeout(timer);
    const { outbox } = store.getState();
    if (!outbox.length) return;
    const next = Math.min(...outbox.map((e) => Date.parse(e.nextAttemptAt) || 0));
    timer = setTimeout(process, Math.max(0, next - Date.now()));
  }

  function markWaiting() {
    for (const e of store.getState().outbox) {
      if (e.action === 'upsertMeeting') store.dispatch({ type: 'SYNC_QUEUED', id: e.meetingId });
    }
  }

  async function process() {
    clearTimeout(timer);
    if (inflight) return;
    if (!navigator.onLine || !client.isConfigured()) {
      markWaiting();
      return;
    }
    const now = Date.now();
    const due = store
      .getState()
      .outbox.filter((e) => (Date.parse(e.nextAttemptAt) || 0) <= now)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!due) {
      schedule();
      return;
    }

    inflight = due;
    const meeting = store.getMeeting(due.meetingId);
    if (due.action === 'upsertMeeting') store.dispatch({ type: 'SYNC_STARTED', id: due.meetingId });
    // 앞선 저장으로 서버 버전이 올라갔을 수 있으므로 기준 버전은 보내는 시점에 읽는다
    const baseVersion = meeting ? meeting.sync.serverVersion : due.baseVersion;
    const res = await client.send(due, baseVersion);
    inflight = null;

    const error = res.ok ? null : { code: res.code, message: errorMessage(res), at: new Date().toISOString() };
    if (res.ok) {
      store.dispatch({ type: 'OUTBOX_REMOVE', requestId: due.requestId });
      if (due.action === 'upsertMeeting') {
        store.dispatch({ type: 'SYNC_SUCCEEDED', id: due.meetingId, version: res.version, syncedAt: res.syncedAt, hash: due.hash });
        events.onSuccess?.(due.meetingId, res);
      }
    } else if (res.code === 'CONFLICT') {
      store.dispatch({ type: 'OUTBOX_REMOVE', requestId: due.requestId });
      store.dispatch({ type: 'SYNC_CONFLICT', id: due.meetingId, error });
      events.onConflict?.(due.meetingId, res);
    } else if (RETRYABLE.has(res.code) && due.attempts < MAX_ATTEMPTS) {
      const attempt = due.attempts + 1;
      const nextAttemptAt = new Date(Date.now() + backoffMs(attempt)).toISOString();
      store.dispatch({ type: 'OUTBOX_UPDATE', requestId: due.requestId, patch: { attempts: attempt, nextAttemptAt } });
      store.dispatch({ type: 'SYNC_RETRYING', id: due.meetingId, error, retry: { attempt, max: MAX_ATTEMPTS, nextAttemptAt } });
    } else {
      store.dispatch({ type: 'OUTBOX_REMOVE', requestId: due.requestId });
      store.dispatch({ type: 'SYNC_FAILED', id: due.meetingId, error });
      events.onFinalError?.(due.meetingId, res);
    }
    process();
  }

  return {
    /** 현재 회의 내용을 스냅샷으로 떠서 큐에 넣는다. 같은 회의의 대기 항목은 최신본으로 교체한다. */
    enqueueUpsert(meetingId, { force = false } = {}) {
      const meeting = store.getMeeting(meetingId);
      if (!meeting) return;
      const now = new Date().toISOString();
      store.dispatch({
        type: 'OUTBOX_PUT',
        keepRequestId: inflight?.meetingId === meetingId ? inflight.requestId : null,
        entry: {
          requestId: crypto.randomUUID(),
          action: 'upsertMeeting',
          meetingId,
          payload: toSheetPayload(meeting),
          hash: payloadHash(meeting),
          baseVersion: meeting.sync.serverVersion,
          force,
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
        },
      });
      store.dispatch({ type: 'SYNC_QUEUED', id: meetingId });
      process();
    },
    enqueueDelete(meetingId, baseVersion) {
      const now = new Date().toISOString();
      store.dispatch({
        type: 'OUTBOX_PUT',
        keepRequestId: inflight?.meetingId === meetingId ? inflight.requestId : null,
        entry: {
          requestId: crypto.randomUUID(),
          action: 'deleteMeeting',
          meetingId,
          payload: null,
          hash: null,
          baseVersion,
          force: true,
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
        },
      });
      process();
    },
    /** 대기 중인 항목을 바로 보낸다 ([모두 재시도]) */
    retryNow() {
      const now = new Date().toISOString();
      for (const e of store.getState().outbox) {
        store.dispatch({ type: 'OUTBOX_UPDATE', requestId: e.requestId, patch: { nextAttemptAt: now } });
      }
      process();
    },
    isBusy: () => Boolean(inflight) || store.getState().outbox.length > 0,
    process,
  };
}
