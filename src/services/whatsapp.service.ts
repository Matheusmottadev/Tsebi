export type WhatsAppSendResult = {
  ok: boolean;
  error?: string;
  status?: number;
};

export type WhatsAppTemplatePayload = {
  templateName: string;
  variables?: string[];
  languageCode?: string;
};

export type WhatsAppVipBroadcastResult = {
  ok: boolean;
  quantity: number;
  costEstimateCents: number;
};

/**
 * Reference-only interface for the WhatsApp Cloud API service.
 * Runtime implementation lives in `server/lib/whatsapp-service.js`.
 */
export interface WhatsAppService {
  canSendFreeMessage(phone: string): Promise<boolean>;
  sendReply(phone: string, message: string): Promise<WhatsAppSendResult>;
  sendTemplate(phone: string, payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult>;
  sendNewCollectionToVIP(collectionName: string, message: string): Promise<WhatsAppVipBroadcastResult>;
}
