const formatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function parts(iso: string) {
  const map = Object.fromEntries(
    formatter.formatToParts(new Date(iso)).map((p) => [p.type, p.value]),
  );
  return map as Record<"year" | "month" | "day" | "hour" | "minute", string>;
}

/** 2026.11.03 */
export function formatDate(iso: string) {
  const { year, month, day } = parts(iso);
  return `${year}.${month}.${day}`;
}

/** 2026.11.03 14:05 */
export function formatDateTime(iso: string) {
  const { year, month, day, hour, minute } = parts(iso);
  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function formatNumber(value: number) {
  return value.toLocaleString("ko-KR");
}
