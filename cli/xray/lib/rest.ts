/**
 * Xray CLI - REST API Module
 *
 * REST API client for Xray Cloud imports.
 */

import { XRAY_API_BASE } from '../types/index.js';
import { getValidToken } from './graphql.js';

// ============================================================================
// REST API CLIENT
// ============================================================================

export async function restApi<T = unknown>(
  endpoint: string,
  options: {
    method?: string
    body?: unknown
    contentType?: string
  } = {},
): Promise<T> {
  const token = await getValidToken();
  const { method = 'POST', body, contentType = 'application/json' } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  const response = await fetch(`${XRAY_API_BASE}${endpoint}`, {
    method,
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`REST API error: ${response.status} - ${text}`);
  }

  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  }
  catch {
    return text as T;
  }
}
