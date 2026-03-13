import { getUserSelectedWhatsAppAccountWithDetails } from "../repositories/accounts.repository";
import { getCurrentWhatsAppAccount } from "./whatsapp.service";

export interface ActiveWhatsAppContextInput {
  userId?: string | null;
}

export interface ActiveWhatsAppContext {
  connected: {
    waJid: string;
    displayName: string | null;
  } | null;
  selected: {
    accountId: string;
    waJid: string;
    displayName: string | null;
  } | null;
  effective: {
    accountId: string | null;
    waJid: string;
    displayName: string | null;
  } | null;
}

export class WhatsAppAccountContextError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function resolveActiveWhatsAppContext(input: ActiveWhatsAppContextInput): Promise<ActiveWhatsAppContext> {
  const userId = String(input.userId || "").trim();
  const selectedRow = userId ? await getUserSelectedWhatsAppAccountWithDetails(userId) : null;
  const connected = getCurrentWhatsAppAccount(selectedRow?.wa_jid || null);

  const connectedContext = connected.waJid
    ? {
        waJid: connected.waJid,
        displayName: connected.displayName || null,
      }
    : null;

  const selectedContext = selectedRow?.selected_account_id && selectedRow.wa_jid
    ? {
        accountId: selectedRow.selected_account_id,
        waJid: selectedRow.wa_jid,
        displayName: selectedRow.display_name || null,
      }
    : null;

  if (selectedRow?.selected_account_id && !selectedRow.wa_jid) {
    throw new WhatsAppAccountContextError("WHATSAPP_SELECTED_ACCOUNT_NOT_FOUND", "A conta WhatsApp selecionada nao existe mais.");
  }

  if (selectedContext) {
    if (!connectedContext) {
      throw new WhatsAppAccountContextError("WHATSAPP_NOT_CONNECTED", "Nenhuma conta WhatsApp esta conectada no momento.");
    }
    if (connectedContext.waJid !== selectedContext.waJid) {
      throw new WhatsAppAccountContextError(
        "WHATSAPP_SELECTED_ACCOUNT_NOT_CONNECTED",
        "A conta WhatsApp selecionada ainda nao esta conectada. Troque a conta ativa ou reconecte o numero correto.",
      );
    }

    return {
      connected: connectedContext,
      selected: selectedContext,
      effective: {
        accountId: selectedContext.accountId,
        waJid: selectedContext.waJid,
        displayName: selectedContext.displayName,
      },
    };
  }

  return {
    connected: connectedContext,
    selected: null,
    effective: connectedContext
      ? {
          accountId: null,
          waJid: connectedContext.waJid,
          displayName: connectedContext.displayName,
        }
      : null,
  };
}

export async function requireActiveWhatsAppAccount(userId?: string | null) {
  const context = await resolveActiveWhatsAppContext({ userId });
  if (!context.effective?.waJid) {
    throw new WhatsAppAccountContextError("WHATSAPP_NOT_CONNECTED", "Nenhuma conta WhatsApp esta conectada no momento.");
  }
  return context;
}
