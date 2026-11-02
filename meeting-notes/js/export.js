// 인쇄, 단독 HTML 파일 다운로드, 클립보드 복사
import { renderDocument } from './views/preview.js';

let documentCss = null;

async function loadDocumentCss() {
  if (documentCss === null) {
    try {
      documentCss = await (await fetch('css/document.css')).text();
    } catch {
      documentCss = '';
    }
  }
  return documentCss;
}

export function fileBaseName(m) {
  const title = (m.title.trim() || '회의록').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
  return `회의록_${m.date}_${title}`;
}

export function printMeeting() {
  window.print();
}

const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** 외부 리소스·스크립트 없이 열리는 단독 HTML 문서 */
export async function buildStandaloneHtml(m) {
  const css = await loadDocumentCss();
  const doc = renderDocument(m);
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(m.title.trim() || '회의록')}</title>
<style>
body { margin: 0; background: #f4f4f5; }
.mn-page { max-width: 820px; margin: 24px auto; background: #fff; padding: 40px 48px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
@media print { body { background: #fff; } .mn-page { margin: 0; padding: 0; box-shadow: none; max-width: none; } }
${css}
</style>
</head>
<body>
<div class="mn-page">${doc.outerHTML}</div>
</body>
</html>
`;
}

export async function downloadHtml(m) {
  const html = await buildStandaloneHtml(m);
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileBaseName(m)}.html`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 메일 본문에 붙여넣을 수 있도록 text/html + text/plain을 함께 복사한다. */
export async function copyHtml(m) {
  const css = await loadDocumentCss();
  const doc = renderDocument(m);
  const html = `<style>${css}</style>${doc.outerHTML}`;
  // innerText는 화면에 붙어 있어야 줄바꿈이 살아나므로 잠깐 붙였다 뗀다
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px';
  holder.append(doc);
  document.body.append(holder);
  const text = doc.innerText;
  holder.remove();

  if (window.ClipboardItem && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(text);
  }
}
