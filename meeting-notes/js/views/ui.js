// 토스트·상단 배너·확인 대화상자
import { $, h } from './dom.js';

let toastTimer = null;
let toastAction = null;

export function showToast(message, { actionLabel = '', onAction = null, duration = 4000, onExpire = null } = {}) {
  const toast = $('toast');
  clearTimeout(toastTimer);
  toastAction = onAction;
  toast.replaceChildren(
    h('span', { text: message }),
    actionLabel ? h('button', { type: 'button', class: 'btn btn--link', 'data-toast-action': '', text: actionLabel }) : null,
  );
  toast.hidden = false;
  toastTimer = setTimeout(() => {
    hideToast();
    onExpire?.();
  }, duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastAction = null;
  $('toast').hidden = true;
}

export function initToast() {
  $('toast').addEventListener('click', (e) => {
    if (!e.target.closest('[data-toast-action]')) return;
    const action = toastAction;
    hideToast();
    action?.();
  });
}

const banners = new Map();

/** 같은 key의 배너는 내용만 바꾼다. tone: info | warn | error */
export function showBanner(key, message, { tone = 'warn', actions = [] } = {}) {
  const container = $('banners');
  const el = h(
    'div',
    { class: `banner banner--${tone}`, role: tone === 'error' ? 'alert' : 'status' },
    h('span', { class: 'banner__text', text: message }),
    actions.map((a, i) => h('button', { type: 'button', class: 'btn btn--small', 'data-banner-action': i, text: a.label })),
  );
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-banner-action]');
    if (btn) actions[Number(btn.dataset.bannerAction)]?.onClick();
  });
  const old = banners.get(key);
  if (old) old.replaceWith(el);
  else container.append(el);
  banners.set(key, el);
}

export function hideBanner(key) {
  banners.get(key)?.remove();
  banners.delete(key);
}

/**
 * 확인 대화상자.
 * requireCheck: 체크해야 확인 버튼이 활성화되는 동의 문구
 * option: 선택 체크박스 { label, checked }
 * buttons: 확인 버튼 외 추가 버튼 [{ value, label }]
 * @returns Promise<{ value: 'confirm'|'cancel'|string, option: boolean }>
 */
export function confirmDialog({
  title,
  message = '',
  details = [],
  confirmLabel = '확인',
  cancelLabel = '취소',
  danger = false,
  requireCheck = '',
  option = null,
  buttons = [],
}) {
  const dialog = $('confirm-dialog');
  const requireBox = requireCheck ? h('input', { type: 'checkbox', id: 'confirm-require' }) : null;
  const optionBox = option ? h('input', { type: 'checkbox', id: 'confirm-option', checked: option.checked }) : null;
  const confirmBtn = h('button', {
    type: 'submit',
    value: 'confirm',
    class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
    text: confirmLabel,
    disabled: Boolean(requireCheck),
  });

  dialog.replaceChildren(
    h(
      'form',
      { method: 'dialog', class: 'dialog' },
      h('h2', { class: 'dialog__title', text: title }),
      message ? h('p', { text: message }) : null,
      details.length ? h('ul', { class: 'dialog__list' }, details.map((d) => h('li', { text: d }))) : null,
      requireBox ? h('label', { class: 'check' }, requireBox, h('span', { text: requireCheck })) : null,
      optionBox ? h('label', { class: 'check' }, optionBox, h('span', { text: option.label })) : null,
      h(
        'div',
        { class: 'dialog__actions' },
        h('button', { type: 'submit', value: 'cancel', class: 'btn', text: cancelLabel }),
        buttons.map((b) => h('button', { type: 'submit', value: b.value, class: 'btn', text: b.label })),
        confirmBtn,
      ),
    ),
  );
  requireBox?.addEventListener('change', () => {
    confirmBtn.disabled = !requireBox.checked;
  });

  return new Promise((resolve) => {
    dialog.addEventListener(
      'close',
      () => resolve({ value: dialog.returnValue || 'cancel', option: Boolean(optionBox?.checked) }),
      { once: true },
    );
    dialog.returnValue = '';
    dialog.showModal();
    (requireBox ?? confirmBtn).focus();
  });
}
