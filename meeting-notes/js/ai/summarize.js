// AI 요약 요청 조립 · 응답 검증
import { filledRows, STATUSES, LIMITS } from '../meeting.js';
import { formatClockSec } from '../date.js';

export const MIN_INPUT_CHARS = 200;
export const MAX_INPUT_CHARS = 200_000;

export function buildTranscriptText(m) {
  return (m.transcript?.segments ?? [])
    .filter((s) => s.text.trim())
    .map((s) => `[${formatClockSec(s.at)}] ${s.speaker ? `${s.speaker}: ` : ''}${s.text.trim()}`)
    .join('\n');
}

export function buildNotesText(m) {
  return [m.discussion.trim(), m.notes.trim()].filter(Boolean).join('\n\n');
}

export function inputChars(m) {
  return buildTranscriptText(m).length + buildNotesText(m).length;
}

export function buildSummarizeRequest(m) {
  return {
    meetingId: m.id,
    meeting: {
      title: m.title.trim(),
      date: m.date,
      startTime: m.startTime,
      endTime: m.endTime,
      location: m.location.trim(),
      attendees: m.attendees.filter((a) => a.present).map((a) => a.name),
      agenda: filledRows(m.agenda).map((r) => r.text.trim()),
    },
    notesText: buildNotesText(m),
    transcriptText: buildTranscriptText(m),
  };
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strList = (v, max) => (Array.isArray(v) ? v.map((x) => str(x, max)).filter(Boolean) : []);
const isDateKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** 서버가 이미 검증하지만, 화면에 넣기 전에 한 번 더 모양과 길이를 맞춘다. */
export function normalizeDraft(raw, attendeeNames = []) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    summary: str(d.summary, LIMITS.summary),
    agenda: strList(d.agenda, LIMITS.agenda),
    discussion: str(d.discussion, LIMITS.discussion),
    decisions: strList(d.decisions, LIMITS.decision),
    actionItems: (Array.isArray(d.actionItems) ? d.actionItems : [])
      .map((a) => {
        const owner = str(a?.owner, LIMITS.owner) || null;
        return {
          task: str(a?.task, LIMITS.task),
          owner,
          ownerMatched: owner ? attendeeNames.includes(owner) : false,
          dueDate: isDateKey(a?.dueDate) ? a.dueDate : null,
          status: a?.status in STATUSES ? a.status : 'todo',
          evidence: str(a?.evidence, 300),
        };
      })
      .filter((a) => a.task),
    openQuestions: strList(d.openQuestions, 300),
  };
}

export async function requestSummary(client, m, { signal } = {}) {
  const res = await client.summarize(buildSummarizeRequest(m), { signal });
  if (!res.ok) return res;
  return {
    ok: true,
    aiSummary: {
      draft: normalizeDraft(res.draft, m.attendees.map((a) => a.name)),
      model: res.model ?? '',
      generatedAt: new Date().toISOString(),
      inputChars: inputChars(m),
      appliedAt: null,
    },
  };
}
