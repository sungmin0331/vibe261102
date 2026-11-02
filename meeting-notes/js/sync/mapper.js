// Meeting ↔ Apps Script 요청 payload 변환, 변경 감지용 해시.
import { filledRows, transcriptChars } from '../meeting.js';

/** 시트에 저장할 내용만 추린다. 받아쓰기 전문·AI 초안·녹음 파일은 보내지 않는다. */
export function toSheetPayload(m) {
  return {
    meeting: {
      id: m.id,
      title: m.title.trim(),
      date: m.date,
      startTime: m.startTime,
      endTime: m.endTime,
      location: m.location.trim(),
      type: m.type,
      author: m.author.trim(),
      attendees: m.attendees.map(({ name, affiliation, present }) => ({ name, affiliation, present })),
      agenda: filledRows(m.agenda).map((r) => r.text.trim()),
      discussion: m.discussion,
      decisions: filledRows(m.decisions).map((r) => r.text.trim()),
      notes: m.notes,
      summary: m.summary,
      hasRecording: m.recordings.some((r) => r.status === 'complete'),
      transcriptChars: transcriptChars(m),
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    },
    actionItems: filledRows(m.actionItems, 'task').map((a, i) => ({
      id: a.id,
      task: a.task.trim(),
      owner: a.owner.trim(),
      dueDate: a.dueDate,
      status: a.status,
      priority: a.priority,
      memo: a.memo,
      order: i,
      source: a.source,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    })),
  };
}

/** FNV-1a 32bit. 수정 시각은 제외해 "내용이 같으면 같은 해시"가 되게 한다. */
export function payloadHash(m) {
  const { meeting, actionItems } = toSheetPayload(m);
  const text = JSON.stringify({
    meeting: { ...meeting, updatedAt: undefined },
    actionItems: actionItems.map((a) => ({ ...a, updatedAt: undefined })),
  });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
