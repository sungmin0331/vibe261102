// 연결 설정 모달: 웹앱 URL·동기화 토큰·연결 테스트, 받아쓰기/AI 옵션
import { $, h } from './dom.js';
import { errorMessage } from '../sync/client.js';

const isExecUrl = (url) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec\/?$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url);

export function openSettings({ store, client, onSaved }) {
  const { settings, token } = store.getState();
  const dialog = $('settings-dialog');

  const endpoint = h('input', { id: 's-endpoint', class: 'input', type: 'url', value: settings.endpointUrl, placeholder: 'https://script.google.com/macros/s/…/exec', required: true });
  const tokenInput = h('input', { id: 's-token', class: 'input', type: 'password', value: token, autocomplete: 'off', required: true });
  const showToken = h('button', { type: 'button', class: 'btn btn--icon', 'aria-label': '토큰 보기', 'aria-pressed': 'false', text: '👁' });
  const remember = h('input', { type: 'checkbox', id: 's-remember', checked: settings.rememberToken });
  const sheetUrl = h('input', { id: 's-sheet', class: 'input', type: 'url', value: settings.spreadsheetUrl, placeholder: 'https://docs.google.com/spreadsheets/d/…' });
  const autoSync = h('input', { type: 'checkbox', id: 's-autosync', checked: settings.autoSync });
  const live = h('input', { type: 'checkbox', id: 's-live', checked: settings.liveTranscription });
  const testResult = h('p', { class: 'test-result', role: 'status', 'aria-live': 'polite' });
  let features = settings.features;

  showToken.addEventListener('click', () => {
    const visible = tokenInput.type === 'text';
    tokenInput.type = visible ? 'password' : 'text';
    showToken.setAttribute('aria-pressed', String(!visible));
  });

  const testBtn = h('button', { type: 'button', class: 'btn', text: '연결 테스트' });
  testBtn.addEventListener('click', async () => {
    const url = endpoint.value.trim();
    if (!isExecUrl(url)) {
      testResult.className = 'test-result test-result--error';
      testResult.textContent = '웹앱 URL은 https://script.google.com/macros/s/…/exec 형식이어야 합니다.';
      return;
    }
    testBtn.disabled = true;
    testResult.className = 'test-result';
    testResult.textContent = '확인 중…';
    const res = await client.ping({ endpointUrl: url, token: tokenInput.value.trim() });
    testBtn.disabled = false;
    if (res.ok) {
      features = res.features ?? null;
      testResult.className = 'test-result test-result--ok';
      testResult.textContent = `✅ 연결됨 · 스키마 v${res.schemaVersion} · 시트 확인${features?.ai ? ' · AI 요약 사용 가능' : ' · AI 요약 꺼짐'}`;
    } else {
      testResult.className = 'test-result test-result--error';
      testResult.textContent = `❌ ${errorMessage(res)}`;
    }
  });

  const form = h(
    'form',
    { method: 'dialog', class: 'dialog dialog--wide' },
    h('div', { class: 'dialog__head' }, h('h2', { class: 'dialog__title', text: '구글 스프레드시트 연결' }), h('button', { type: 'submit', value: 'cancel', class: 'btn btn--icon', 'aria-label': '닫기', text: '×', formnovalidate: true })),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 's-endpoint' }, 'Apps Script 웹앱 URL', h('span', { class: 'req', text: '*' })), endpoint),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 's-token' }, '동기화 토큰', h('span', { class: 'req', text: '*' })), h('div', { class: 'inline' }, tokenInput, showToken), h('p', { class: 'field__hint', text: '스크립트 속성 SYNC_TOKEN에 넣은 값과 같아야 합니다. 주소(URL)에는 넣지 마세요.' })),
    h('label', { class: 'check' }, remember, h('span', { text: '이 기기에 토큰 기억하기 (끄면 탭을 닫을 때 지워집니다)' })),
    h('div', { class: 'field' }, h('label', { class: 'field__label', for: 's-sheet', text: '스프레드시트 URL (보기 링크용, 선택)' }), sheetUrl),
    h('div', { class: 'inline' }, testBtn, testResult),
    h('hr'),
    h('label', { class: 'check' }, autoSync, h('span', { text: '자동 동기화: 편집 후 30초 동안 변경이 없으면 시트에 저장' })),
    h('label', { class: 'check' }, live, h('span', { text: '녹음을 시작하면 실시간 받아쓰기도 켜기' })),
    h(
      'details',
      { class: 'notice' },
      h('summary', { text: 'ⓘ 데이터가 어디로 전송되나요?' }),
      h(
        'ul',
        h('li', { text: '회의록 내용과 액션 아이템은 연결한 구글 스프레드시트에 저장됩니다. 참석자 이름도 포함됩니다.' }),
        h('li', { text: '실시간 받아쓰기(Chrome·Edge 등)는 음성을 브라우저 제공사의 음성 인식 서버로 보냅니다.' }),
        h('li', { text: 'AI 요약은 받아쓰기·메모 텍스트를 Apps Script를 거쳐 Anthropic(Claude) API로 보냅니다.' }),
        h('li', { text: '녹음 파일은 이 기기(브라우저 저장소)에만 남고 어디에도 업로드되지 않습니다.' }),
      ),
    ),
    h('p', { class: 'field__hint' }, '설치 방법은 ', h('code', { text: 'apps-script/README.md' }), '를 참고하세요.'),
    h(
      'div',
      { class: 'dialog__actions' },
      h('button', { type: 'submit', value: 'cancel', class: 'btn', text: '취소', formnovalidate: true }),
      h('button', { type: 'submit', value: 'save', class: 'btn btn--primary', text: '저장' }),
    ),
  );

  form.addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'save') return;
    const url = endpoint.value.trim();
    if (url && !isExecUrl(url)) {
      e.preventDefault();
      testResult.className = 'test-result test-result--error';
      testResult.textContent = '웹앱 URL 형식을 확인하세요.';
      endpoint.focus();
      return;
    }
    store.dispatch({
      type: 'SET_SETTINGS',
      patch: {
        endpointUrl: url,
        spreadsheetUrl: sheetUrl.value.trim(),
        rememberToken: remember.checked,
        autoSync: autoSync.checked,
        liveTranscription: live.checked,
        features: url === settings.endpointUrl || features !== settings.features ? features : null,
      },
    });
    store.dispatch({ type: 'SET_TOKEN', token: tokenInput.value.trim() });
    store.flush();
    onSaved?.();
  });

  dialog.replaceChildren(form);
  dialog.showModal();
  (settings.endpointUrl ? tokenInput : endpoint).focus();
}
