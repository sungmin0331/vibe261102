# 회의록 작성 & 구글 스프레드시트 동기화

회의록을 정해진 양식으로 작성하고, HTML 문서로 미리보기·인쇄·내보내기하며, 구글 스프레드시트에 저장하는 웹페이지입니다. 녹음·실시간 받아쓰기·AI 요약도 지원합니다. 설계는 [prd.md](prd.md)를 참고하세요.

## 실행

ES 모듈을 쓰므로 파일을 직접 열지 말고 로컬 서버로 엽니다. 마이크는 `localhost` 또는 HTTPS 주소에서만 동작합니다.

```bash
python -m http.server 8000 --directory meeting-notes
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 구글 스프레드시트 연결

[apps-script/README.md](apps-script/README.md)대로 스프레드시트에 스크립트를 배포한 뒤, 웹페이지의 **⚙ 설정**에 웹앱 URL과 동기화 토큰을 입력합니다. 연결하지 않아도 작성·미리보기·인쇄·녹음·받아쓰기는 모두 쓸 수 있습니다(로컬 전용).

## 시트 없이 시험하기 (개발용)

Node.js가 있으면 Apps Script 코드를 그대로 돌리는 에뮬레이터 서버로 동기화·재시도·AI 요약 흐름을 시험할 수 있습니다.

```bash
node meeting-notes/dev/dev-server.mjs 5174
```

설정에 URL `http://localhost:5174/mock/exec`, 토큰 `dev-token`을 넣습니다.

- `http://localhost:5174/mock/fail?n=2` — 다음 저장 2번을 실패시켜 재시도 동작 확인
- `http://localhost:5174/mock/sheets` — 에뮬레이터 시트 내용 보기
- `node meeting-notes/dev/test-apps-script.mjs` — 백엔드 스모크 테스트

## 브라우저 지원

| 기능 | 지원 |
|---|---|
| 작성·미리보기·인쇄·내보내기·동기화 | Chrome, Edge, Safari, Firefox 최신 버전 |
| 녹음 | 위 브라우저 (HTTPS 또는 localhost) |
| 실시간 받아쓰기 | Chrome, Edge, Safari (Firefox 미지원) |

## 데이터는 어디에 저장되나요

- 회의록: 이 브라우저의 `localStorage` (자동 저장) + 연결한 구글 스프레드시트
- 녹음 파일: 이 브라우저의 IndexedDB에만 저장되며 업로드하지 않습니다
- 실시간 받아쓰기: 음성이 브라우저 제공사의 음성 인식 서버로 전송됩니다
- AI 요약: 받아쓰기·메모 텍스트가 Apps Script를 거쳐 Anthropic(Claude) API로 전송됩니다
