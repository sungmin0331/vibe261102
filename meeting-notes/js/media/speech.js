// Web Speech API 래퍼: 확정 문장을 세그먼트로 넘기고, 무음·네트워크로 끊기면 자동으로 다시 시작한다.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const isSpeechSupported = () => Boolean(Recognition);

const FATAL = {
  'not-allowed': '마이크 권한이 없어 받아쓰기를 중지했습니다.',
  'service-not-allowed': '이 브라우저에서 음성 인식 서비스를 사용할 수 없습니다.',
  'audio-capture': '마이크를 찾지 못해 받아쓰기를 중지했습니다.',
  'language-not-supported': '한국어 음성 인식을 지원하지 않는 브라우저입니다.',
};

/** callbacks: onFinal(text), onInterim(text), onState(active), onError(message) */
export function createSpeech(callbacks = {}) {
  let recognition = null;
  let active = false;
  let failures = 0;
  let restartTimer = null;

  function launch() {
    recognition = new Recognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
      failures = 0;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0].transcript.trim();
        if (result.isFinal) {
          if (text) callbacks.onFinal?.(text);
        } else {
          interim += result[0].transcript;
        }
      }
      callbacks.onInterim?.(interim.trim());
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (FATAL[e.error]) {
        active = false;
        callbacks.onError?.(FATAL[e.error]);
        return;
      }
      failures += 1;
      if (failures >= 5) {
        active = false;
        callbacks.onError?.('음성 인식 서버에 연결할 수 없어 받아쓰기를 중지했습니다. 네트워크를 확인하세요.');
      }
    };

    recognition.onend = () => {
      callbacks.onInterim?.('');
      if (active) {
        restartTimer = setTimeout(launch, failures ? 1000 * failures : 250);
      } else {
        callbacks.onState?.(false);
      }
    };

    try {
      recognition.start();
    } catch {
      /* 이미 시작된 경우 */
    }
  }

  return {
    get active() {
      return active;
    },
    start() {
      if (!Recognition || active) return;
      active = true;
      failures = 0;
      callbacks.onState?.(true);
      launch();
    },
    stop() {
      active = false;
      clearTimeout(restartTimer);
      try {
        recognition?.stop();
      } catch {
        /* 이미 멈춤 */
      }
      callbacks.onState?.(false);
    },
  };
}
