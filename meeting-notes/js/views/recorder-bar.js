// 녹음 바: 녹음 상태·경과 시간·레벨 미터·받아쓰기 토글·AI 요약 버튼
import { $ } from './dom.js';
import { formatDuration } from '../date.js';

/**
 * view: { recState: 'idle'|'recording'|'paused', elapsed, speechActive, speechSupported,
 *         recordingSupported, aiVisible, aiBusy }
 */
export function updateRecorderBar(view) {
  const recording = view.recState !== 'idle';
  const bar = $('recorder-bar');
  bar.dataset.state = view.recState;

  $('rec-start').hidden = recording;
  $('rec-start').disabled = !view.recordingSupported;
  $('rec-start').title = view.recordingSupported ? '' : '이 브라우저에서는 녹음을 지원하지 않습니다.';
  $('rec-pause').hidden = !recording;
  $('rec-pause').textContent = view.recState === 'paused' ? '▶ 재개' : '❚❚ 일시정지';
  $('rec-stop').hidden = !recording;
  $('rec-status').hidden = !recording;
  $('rec-status-label').textContent = view.recState === 'paused' ? '일시정지' : '● 녹음 중';
  $('rec-time').textContent = formatDuration(view.elapsed);

  const speech = $('speech-toggle');
  speech.disabled = !view.speechSupported;
  speech.setAttribute('aria-pressed', String(view.speechActive));
  speech.textContent = view.speechActive ? '받아쓰기 끄기' : '받아쓰기 켜기';
  speech.title = view.speechSupported ? '' : 'Chrome·Edge·Safari에서 지원됩니다';

  const ai = $('ai-summarize');
  ai.hidden = !view.aiVisible;
  ai.disabled = view.aiBusy;
  ai.textContent = view.aiBusy ? '요약 중…' : '✨ AI 요약';

  document.title = recording ? `● 녹음 중 — 회의록` : '회의록';
}

export function setLevel(value) {
  $('rec-level').style.setProperty('--level', String(value));
}
