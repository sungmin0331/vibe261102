export interface FormState<Field extends string> {
  errors?: Partial<Record<Field, string>>;
  message?: string;
  values?: Partial<Record<Field, string>>;
}

export function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** 마지막 글자에 받침이 있는지에 따라 조사를 고릅니다. (예: 제목을, 작성자를) */
export function josa(word: string, withFinal: string, withoutFinal: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

export function check(value: string, label: string, max: number) {
  if (!value) return `${josa(label, "을", "를")} 입력해 주세요.`;
  if (value.length > max)
    return `${josa(label, "은", "는")} ${max}자 이하로 입력해 주세요.`;
  return undefined;
}

export function hasErrors(errors: Record<string, string | undefined>) {
  return Object.values(errors).some(Boolean);
}

/** 로그인 후 돌아갈 주소. 다른 사이트로 보내는 주소는 받지 않습니다. */
export function safeNext(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}
