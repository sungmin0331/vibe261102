// DOM 생성 헬퍼. 사용자 입력은 항상 텍스트 노드/속성으로만 넣는다 (innerHTML 사용 금지).
export const $ = (id) => document.getElementById(id);

const BOOLEAN_PROPS = new Set(['checked', 'selected', 'hidden', 'disabled', 'required', 'open']);

export function h(tag, props = {}, ...children) {
  // 속성 없이 자식부터 넘긴 경우: h('tr', h('td'), ...)
  if (props == null || props instanceof Node || Array.isArray(props) || typeof props !== 'object') {
    children.unshift(props);
    props = {};
  }
  const el = document.createElement(tag);
  let value;
  for (const [key, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (key === 'class') el.className = v;
    else if (key === 'text') el.textContent = v;
    else if (key === 'dataset') Object.assign(el.dataset, v);
    else if (key === 'value') value = v;
    else if (BOOLEAN_PROPS.has(key)) el[key] = true;
    else el.setAttribute(key, v === true ? '' : String(v));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  // select는 option이 붙은 뒤에 값을 지정해야 반영된다
  if (value !== undefined) el.value = value;
  return el;
}

/** 다시 그리는 동안 포커스·커서 위치를 data-key 기준으로 유지한다. */
export function preserveFocus(container, render, focusKey = null) {
  const active = document.activeElement;
  const key = focusKey ?? (container.contains(active) ? active?.dataset?.key : null);
  let selection = null;
  if (!focusKey && key && typeof active.selectionStart === 'number') {
    try {
      selection = [active.selectionStart, active.selectionEnd];
    } catch {
      selection = null;
    }
  }
  render();
  if (!key) return;
  const target = container.querySelector(`[data-key="${CSS.escape(key)}"]`);
  if (!target) return;
  target.focus({ preventScroll: !focusKey });
  if (selection) {
    try {
      target.setSelectionRange(...selection);
    } catch {
      /* date/time 입력 등은 선택 영역이 없다 */
    }
  }
}

export function debounce(fn, ms) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}
