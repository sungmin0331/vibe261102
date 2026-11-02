// Apps Script 웹앱 API 호출. 모든 결과를 { ok: true, ... } 또는 { ok: false, code, message }로 돌려준다.

export const SCHEMA_VERSION = 1;
export const MAX_ATTEMPTS = 5;

/** 다시 보내면 성공할 수 있는 오류 */
export const RETRYABLE = new Set(['NETWORK', 'TIMEOUT', 'BAD_RESPONSE', 'LOCK_TIMEOUT', 'INTERNAL', 'UPSTREAM_ERROR']);

export const ERROR_MESSAGES = {
  NETWORK: '네트워크에 연결할 수 없습니다.',
  TIMEOUT: '응답 시간이 초과되었습니다.',
  BAD_RESPONSE: '서버 응답을 해석할 수 없습니다. 웹앱 URL과 배포 설정(액세스: 모든 사용자)을 확인하세요.',
  UNAUTHORIZED: '동기화 토큰이 올바르지 않습니다.',
  NOT_CONFIGURED: '시트 연결을 먼저 설정하세요.',
  ABORTED: '요청을 취소했습니다.',
};

export const errorMessage = (res) => res.message || ERROR_MESSAGES[res.code] || `오류가 발생했습니다 (${res.code}).`;

export async function postJson(url, body, { timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onAbort = () => controller.abort('user');
  signal?.addEventListener('abort', onAbort);
  try {
    // text/plain은 CORS preflight가 없는 단순 요청이다. Apps Script의 302 리다이렉트는 fetch가 따라간다.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
      credentials: 'omit',
    });
    const text = await res.text();
    try {
      const data = JSON.parse(text);
      if (data && typeof data.ok === 'boolean') return data;
    } catch {
      /* 아래에서 BAD_RESPONSE */
    }
    return { ok: false, code: 'BAD_RESPONSE', message: `${ERROR_MESSAGES.BAD_RESPONSE} (HTTP ${res.status})` };
  } catch {
    const reason = controller.signal.reason;
    if (reason === 'user') return { ok: false, code: 'ABORTED', message: ERROR_MESSAGES.ABORTED };
    if (reason === 'timeout') return { ok: false, code: 'TIMEOUT', message: ERROR_MESSAGES.TIMEOUT };
    return { ok: false, code: 'NETWORK', message: ERROR_MESSAGES.NETWORK };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** getConfig() → { endpointUrl, token, clientId } */
export function createClient(getConfig) {
  const call = (action, extra = {}, options = {}) => {
    const { endpointUrl, token, clientId } = getConfig();
    if (!endpointUrl || !token) return Promise.resolve({ ok: false, code: 'NOT_CONFIGURED', message: ERROR_MESSAGES.NOT_CONFIGURED });
    return postJson(
      endpointUrl,
      { action, token, clientId, schemaVersion: SCHEMA_VERSION, requestId: extra.requestId ?? crypto.randomUUID(), ...extra },
      options,
    );
  };

  return {
    isConfigured: () => Boolean(getConfig().endpointUrl && getConfig().token),
    ping: (override) => {
      if (!override) return call('ping');
      const { clientId } = getConfig();
      return postJson(override.endpointUrl, {
        action: 'ping',
        token: override.token,
        clientId,
        schemaVersion: SCHEMA_VERSION,
        requestId: crypto.randomUUID(),
      });
    },
    /** entry: 아웃박스 항목, baseVersion: 보내는 시점의 서버 버전 */
    send(entry, baseVersion) {
      if (entry.action === 'deleteMeeting') {
        return call('deleteMeeting', { requestId: entry.requestId, meetingId: entry.meetingId, baseVersion, force: true });
      }
      return call('upsertMeeting', {
        requestId: entry.requestId,
        baseVersion,
        force: entry.force,
        meeting: entry.payload.meeting,
        actionItems: entry.payload.actionItems,
      });
    },
    summarize(body, { signal } = {}) {
      return call('summarize', body, { timeoutMs: 90000, signal });
    },
  };
}

