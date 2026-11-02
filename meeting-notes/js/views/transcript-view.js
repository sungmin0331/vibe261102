// 받아쓰기 패널: 세그먼트 목록(편집·삭제·화자 지정), 인식 중 문장, 녹음 파일 목록
import { h } from './dom.js';
import { formatClockSec, formatDuration, formatBytes, formatClock } from '../date.js';

const editableMode = (() => {
  const probe = document.createElement('div');
  probe.contentEditable = 'plaintext-only';
  return probe.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
})();

function segmentNode(s) {
  return h(
    'li',
    { class: 'segment', 'data-segment': s.id },
    h('span', { class: 'segment__time', text: formatClockSec(s.at) }),
    h('select', { class: 'segment__speaker', 'aria-label': '화자', 'data-segment-field': 'speaker' }),
    h('p', {
      class: 'segment__text',
      contenteditable: editableMode,
      role: 'textbox',
      'aria-label': `${formatClockSec(s.at)} 받아쓰기`,
      'data-segment-field': 'text',
      'data-key': `segment:${s.id}`,
      spellcheck: 'false',
    }),
    h('button', { type: 'button', class: 'btn btn--icon', 'data-segment-action': 'remove', 'aria-label': '삭제', title: '삭제', text: '🗑' }),
  );
}

function fillSpeakers(select, names, current) {
  const options = ['', ...names];
  if (current && !names.includes(current)) options.push(current);
  const signature = options.join('\u0001');
  if (select.dataset.signature !== signature) {
    select.replaceChildren(...options.map((n) => h('option', { value: n, text: n || '화자 미지정' })));
    select.dataset.signature = signature;
  }
  select.value = current ?? '';
}

/** 기존 노드를 재사용해 편집 중인 세그먼트의 커서가 튀지 않게 한다. */
export function renderTranscript(list, segments, { interim = '', attendeeNames = [] } = {}) {
  const existing = new Map([...list.querySelectorAll('[data-segment]')].map((el) => [el.dataset.segment, el]));
  const nodes = segments.map((s) => {
    const node = existing.get(s.id) ?? segmentNode(s);
    existing.delete(s.id);
    const text = node.querySelector('.segment__text');
    if (document.activeElement !== text && text.textContent !== s.text) text.textContent = s.text;
    fillSpeakers(node.querySelector('.segment__speaker'), attendeeNames, s.speaker);
    node.classList.toggle('segment--edited', Boolean(s.edited));
    return node;
  });
  existing.forEach((el) => el.remove());

  let interimNode = list.querySelector('.segment--interim');
  if (interim) {
    interimNode ??= h('li', { class: 'segment segment--interim', 'aria-hidden': 'true' });
    interimNode.textContent = `${interim} (인식 중)`;
    nodes.push(interimNode);
  } else {
    interimNode?.remove();
  }

  const wasAtBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
  nodes.forEach((node, i) => {
    if (list.children[i] !== node) list.insertBefore(node, list.children[i] ?? null);
  });
  if (wasAtBottom) list.scrollTop = list.scrollHeight;

  list.closest('.transcript')?.classList.toggle('transcript--empty', !segments.length && !interim);
}

/** handlers: onEdit(segmentId, patch), onRemove(segmentId) */
export function bindTranscript(list, handlers) {
  list.addEventListener('focusout', (e) => {
    const el = e.target;
    if (el.dataset.segmentField !== 'text') return;
    const id = el.closest('[data-segment]').dataset.segment;
    handlers.onEdit(id, { text: el.textContent.replace(/\s+/g, ' ').trim() });
  });
  list.addEventListener('keydown', (e) => {
    if (e.target.dataset.segmentField === 'text' && e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      e.target.blur();
    }
  });
  list.addEventListener('change', (e) => {
    if (e.target.dataset.segmentField !== 'speaker') return;
    handlers.onEdit(e.target.closest('[data-segment]').dataset.segment, { speaker: e.target.value || null });
  });
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-segment-action="remove"]');
    if (btn) handlers.onRemove(btn.closest('[data-segment]').dataset.segment);
  });
}

export function renderRecordings(container, recordings, activeId) {
  const done = recordings.filter((r) => r.id !== activeId);
  container.hidden = !done.length;
  container.replaceChildren(
    h('h3', { class: 'recordings__title', text: '녹음 파일' }),
    h(
      'ol',
      { class: 'recordings__list' },
      done.map((r) =>
        h(
          'li',
          { class: 'recording', 'data-recording': r.id },
          h(
            'span',
            { class: 'recording__label' },
            `${formatClock(r.startedAt)} · ${formatDuration(r.durationSec)} · ${formatBytes(r.sizeBytes)}`,
            r.status !== 'complete' ? h('span', { class: 'badge badge--warn', text: '중단됨' }) : null,
          ),
          h('button', { type: 'button', class: 'btn btn--small', 'data-recording-action': 'play', text: '▶ 재생' }),
          h('button', { type: 'button', class: 'btn btn--small', 'data-recording-action': 'download', text: '⬇ 내려받기' }),
          h('button', { type: 'button', class: 'btn btn--small btn--danger-ghost', 'data-recording-action': 'delete', text: '삭제' }),
        ),
      ),
    ),
    h('audio', { class: 'recordings__player', controls: true, hidden: true, preload: 'none' }),
  );
}
