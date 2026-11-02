// MediaRecorder 래퍼: 시작/일시정지/재개/중지, 10초 청크 저장, 입력 레벨 측정
import * as audioStore from './audio-store.js';

const CHUNK_MS = 10_000;
export const MAX_RECORDING_SEC = 3 * 60 * 60;

export function isRecordingSupported() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder && audioStore.isAudioStoreAvailable());
}

function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return candidates.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

/** getUserMedia 오류 → 사용자 안내 문구 */
export function micErrorMessage(err) {
  if (!window.isSecureContext) return '마이크는 HTTPS 또는 localhost 주소에서만 사용할 수 있습니다.';
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return '마이크 권한이 필요합니다 — 주소창의 🔒 아이콘에서 마이크를 허용하세요.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '사용할 수 있는 마이크를 찾지 못했습니다.';
    case 'NotReadableError':
      return '다른 프로그램이 마이크를 사용 중입니다.';
    default:
      return `녹음을 시작하지 못했습니다. (${err?.message ?? err})`;
  }
}

/** callbacks: onTick(elapsedSec), onLevel(0..1), onError(message), onAutoStop() */
export function createRecorder(callbacks = {}) {
  let media = null;
  let stream = null;
  let meta = null;
  let seq = 0;
  let pendingWrites = [];
  let state = 'idle';
  let accumulated = 0; // 일시정지 전까지 누적 초
  let resumedAt = 0;
  let ticker = null;
  let audioCtx = null;
  let levelFrame = null;

  const elapsed = () => accumulated + (state === 'recording' ? (Date.now() - resumedAt) / 1000 : 0);

  function startLevelMeter() {
    try {
      audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        callbacks.onLevel?.(state === 'recording' ? Math.min(1, peak / 64) : 0);
        levelFrame = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      /* 레벨 미터는 부가 기능 */
    }
  }

  function cleanup() {
    clearInterval(ticker);
    cancelAnimationFrame(levelFrame);
    audioCtx?.close().catch(() => {});
    stream?.getTracks().forEach((t) => t.stop());
    media = stream = audioCtx = null;
    callbacks.onLevel?.(0);
  }

  return {
    get state() {
      return state;
    },
    get recordingId() {
      return meta?.id ?? null;
    },
    elapsed,

    /** @returns 녹음 메타데이터 (RecordingRef) */
    async start(meetingId) {
      if (state !== 'idle') throw new Error('이미 녹음 중입니다.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mimeType = pickMimeType();
      media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      meta = {
        id: `rec_${crypto.randomUUID()}`,
        meetingId,
        startedAt: new Date().toISOString(),
        durationSec: 0,
        mimeType: media.mimeType || mimeType || 'audio/webm',
        sizeBytes: 0,
        status: 'recording',
      };
      seq = 0;
      pendingWrites = [];
      await audioStore.putMeta(meta);

      media.ondataavailable = (e) => {
        if (!e.data?.size) return;
        const write = audioStore.putChunk(meta.id, seq++, e.data).catch(() => callbacks.onError?.('녹음 조각을 저장하지 못했습니다. 저장 공간을 확인하세요.'));
        pendingWrites.push(write);
      };
      media.onerror = (e) => callbacks.onError?.(`녹음 중 오류가 발생했습니다. (${e.error?.name ?? 'unknown'})`);
      // 마이크가 뽑히는 등 트랙이 끝나면 녹음을 정리한다
      stream.getAudioTracks()[0]?.addEventListener('ended', () => callbacks.onAutoStop?.('마이크 연결이 끊겨 녹음을 중지했습니다.'));

      media.start(CHUNK_MS);
      state = 'recording';
      accumulated = 0;
      resumedAt = Date.now();
      ticker = setInterval(() => {
        const sec = elapsed();
        callbacks.onTick?.(sec);
        if (sec >= MAX_RECORDING_SEC) callbacks.onAutoStop?.('최대 녹음 시간(3시간)에 도달해 녹음을 중지했습니다.');
      }, 500);
      startLevelMeter();
      return { ...meta };
    },

    pause() {
      if (state !== 'recording') return;
      media.pause();
      accumulated = elapsed();
      state = 'paused';
      callbacks.onTick?.(accumulated);
    },

    resume() {
      if (state !== 'paused') return;
      media.resume();
      resumedAt = Date.now();
      state = 'recording';
    },

    /** @returns 완료된 녹음 메타데이터 (blob 제외) */
    async stop() {
      if (state === 'idle') return null;
      const durationSec = Math.round(elapsed());
      state = 'idle';
      const stopped = new Promise((resolve) => {
        media.onstop = resolve;
      });
      if (media.state !== 'inactive') media.stop();
      await stopped;
      await Promise.all(pendingWrites);
      cleanup();
      const done = await audioStore.finalize(meta.id, { durationSec });
      meta = null;
      if (!done) return null;
      const { blob, ...ref } = done;
      return ref;
    },
  };
}
