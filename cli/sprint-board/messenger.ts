export interface DraftRequest { id: string, to: string, lang: 'en' | 'es', text: string, tickets: string[], attach: string[] }
export type DraftResult = { ok: true, link?: string, ref?: string } | { ok: false, error: string };

export interface Messenger {
  id: string
  createDraft: (request: DraftRequest) => Promise<DraftResult>
}

export const NO_MESSENGER = 'no messenger is configured, so there is no draft to approve: copy the message, send it yourself, then mark it sent';

export function resolveMessenger(): Messenger | null {
  return null;
}
