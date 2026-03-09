import { EventEmitter } from "node:events";

export interface MessageSavedEvent {
  accountJid: string;
  conversationId: string;
  messageId: string;
  direction: "inbound" | "outbound";
  createdAt: string;
}

const realtimeEmitter = new EventEmitter();
realtimeEmitter.setMaxListeners(200);

const MESSAGE_SAVED_EVENT = "message_saved";
const MESSAGE_STATUS_EVENT = "message_status";

export function publishMessageSaved(event: MessageSavedEvent): void {
  realtimeEmitter.emit(MESSAGE_SAVED_EVENT, event);
}

export function onMessageSaved(listener: (event: MessageSavedEvent) => void): () => void {
  realtimeEmitter.on(MESSAGE_SAVED_EVENT, listener);
  return () => {
    realtimeEmitter.off(MESSAGE_SAVED_EVENT, listener);
  };
}

export function publishMessageStatus(event: MessageSavedEvent): void {
  realtimeEmitter.emit(MESSAGE_STATUS_EVENT, event);
}

export function onMessageStatus(listener: (event: MessageSavedEvent) => void): () => void {
  realtimeEmitter.on(MESSAGE_STATUS_EVENT, listener);
  return () => {
    realtimeEmitter.off(MESSAGE_STATUS_EVENT, listener);
  };
}
