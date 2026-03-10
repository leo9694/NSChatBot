import { EventEmitter } from "node:events";

export interface MessageSavedEvent {
  accountJid: string;
  conversationId: string;
  messageId: string;
  direction: "inbound" | "outbound";
  createdAt: string;
  message?: Record<string, unknown>;
}

export interface RealtimeEventEnvelope {
  type: "message_saved" | "message_status";
  payload: MessageSavedEvent;
  seq: number;
}

const realtimeEmitter = new EventEmitter();
realtimeEmitter.setMaxListeners(200);
let nextRealtimeSeq = 1;
const realtimeBacklog: RealtimeEventEnvelope[] = [];
const REALTIME_BACKLOG_LIMIT = 500;

const MESSAGE_SAVED_EVENT = "message_saved";
const MESSAGE_STATUS_EVENT = "message_status";

export function publishMessageSaved(event: MessageSavedEvent): void {
  const envelope: RealtimeEventEnvelope = {
    type: "message_saved",
    payload: event,
    seq: nextRealtimeSeq++,
  };
  realtimeBacklog.push(envelope);
  if (realtimeBacklog.length > REALTIME_BACKLOG_LIMIT) {
    realtimeBacklog.splice(0, realtimeBacklog.length - REALTIME_BACKLOG_LIMIT);
  }
  realtimeEmitter.emit(MESSAGE_SAVED_EVENT, event);
}

export function onMessageSaved(listener: (event: MessageSavedEvent) => void): () => void {
  realtimeEmitter.on(MESSAGE_SAVED_EVENT, listener);
  return () => {
    realtimeEmitter.off(MESSAGE_SAVED_EVENT, listener);
  };
}

export function publishMessageStatus(event: MessageSavedEvent): void {
  const envelope: RealtimeEventEnvelope = {
    type: "message_status",
    payload: event,
    seq: nextRealtimeSeq++,
  };
  realtimeBacklog.push(envelope);
  if (realtimeBacklog.length > REALTIME_BACKLOG_LIMIT) {
    realtimeBacklog.splice(0, realtimeBacklog.length - REALTIME_BACKLOG_LIMIT);
  }
  realtimeEmitter.emit(MESSAGE_STATUS_EVENT, event);
}

export function onMessageStatus(listener: (event: MessageSavedEvent) => void): () => void {
  realtimeEmitter.on(MESSAGE_STATUS_EVENT, listener);
  return () => {
    realtimeEmitter.off(MESSAGE_STATUS_EVENT, listener);
  };
}

export function waitForRealtimeEvent(accountJid: string, sinceSeq = 0, timeoutMs = 25_000): Promise<RealtimeEventEnvelope | null> {
  return new Promise((resolve) => {
    let settled = false;

    const buffered = realtimeBacklog.find((event) => event.seq > sinceSeq && (!accountJid || event.payload.accountJid === accountJid));
    if (buffered) {
      resolve(buffered);
      return;
    }

    const done = (value: RealtimeEventEnvelope | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      offSaved();
      offStatus();
      resolve(value);
    };

    const offSaved = onMessageSaved((event) => {
      if (accountJid && event.accountJid !== accountJid) {
        return;
      }
      done({
        type: "message_saved",
        payload: event,
        seq: nextRealtimeSeq - 1,
      });
    });

    const offStatus = onMessageStatus((event) => {
      if (accountJid && event.accountJid !== accountJid) {
        return;
      }
      done({
        type: "message_status",
        payload: event,
        seq: nextRealtimeSeq - 1,
      });
    });

    const timer = setTimeout(() => done(null), timeoutMs);
  });
}
