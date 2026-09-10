import { getTranscript, loadRoomLog } from "../../log/store";
import type { MessageEnvelope } from "../../log/types";

/**
 * How many messages `room.get_transcript` returns when the caller does not say.
 *
 * There has to be a default, and this is the reason: the caller that existed
 * before this parameter did was passing only `since_seq`, and a cold attach at
 * `since_seq: 0` shipped the entire transcript as one text block — 3.8 MB in the
 * room the backlog measured. The consumer on the management path is a language
 * model, so that is not slow CPU, it is a context window. An opt-in limit would
 * leave every existing caller shipping the whole room.
 *
 * 200 is a page a model can read in one go and a page the TUI never notices: it
 * polls once a second with a cursor, so it is only ever asking for what has
 * arrived since the last poll.
 */
export const DEFAULT_TRANSCRIPT_LIMIT = 200;

/**
 * A page of the transcript, with the two facts a caller needs to know whether
 * it has the whole answer.
 *
 * It used to be a bare array, which cannot express "there is more" — and a
 * truncated list that looks complete is exactly the defect this project keeps
 * re-filing. `has_more` says whether another call will return anything, and
 * `next_seq` is the cursor to pass as `since_seq` for it, so the caller does not
 * re-derive the cursor from whichever message happened to arrive last.
 */
export interface TranscriptPage {
  messages: MessageEnvelope[];
  has_more: boolean;
  next_seq: number;
}

/** MCP tool `room.get_transcript`: messages with seq > sinceSeq, at most `limit`. Read-only. */
export function getTranscriptTool(
  logPath: string,
  sinceSeq: number,
  limit: number = DEFAULT_TRANSCRIPT_LIMIT,
): TranscriptPage {
  const { messages } = loadRoomLog(logPath);
  const after = getTranscript(messages, sinceSeq);
  const page = after.slice(0, Math.max(0, limit));
  return {
    messages: page,
    has_more: after.length > page.length,
    // The cursor advances only over messages actually returned. Advancing it to
    // the last message in the *log* would skip everything the page did not
    // carry, and the log is append-only: nothing would ever fetch it again.
    next_seq: page.length > 0 ? (page[page.length - 1] as MessageEnvelope).seq : sinceSeq,
  };
}
