#!/usr/bin/env bun

/**
 * ============================================================================
 * RESEND CLI - Email Verification & Inspection Tool
 * ============================================================================
 *
 * A command-line interface for verifying and inspecting emails using the
 * Resend API. Designed for test automation workflows where email verification
 * is needed (e.g., registration flows, password resets, notifications).
 *
 * OFFICIAL DOCUMENTATION:
 *   - Resend API Reference: https://resend.com/docs/api-reference/introduction
 *   - Receiving Emails:     https://resend.com/docs/api-reference/emails/list-received-emails
 *   - Email Status:         https://resend.com/docs/api-reference/emails/retrieve-email
 *
 * ============================================================================
 * REQUIREMENTS
 * ============================================================================
 *
 * 1. Bun runtime (https://bun.sh)
 * 2. Environment variable: RESEND_API_KEY
 * 3. A verified domain in Resend with email receiving enabled
 *
 * No external dependencies required - uses native fetch API.
 *
 * ============================================================================
 * ENVIRONMENT SETUP
 * ============================================================================
 *
 * Create a .env file in your project root:
 *
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Or export in terminal:
 *
 *   export RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Get your API key at: https://resend.com/api-keys
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Run with Bun:
 *   bun cli/resend.ts <command> [options]
 *
 * Or via package.json script:
 *   bun run resend <command> [options]
 *
 * COMMANDS:
 *
 *   inbox                     List received emails in your inbox
 *     --limit <n>             Number of emails to fetch (default: 10, max: 100)
 *     --after <id>            Cursor: get emails after this ID
 *     --before <id>           Cursor: get emails before this ID
 *
 *   read <email-id>           Read full content of a received email
 *                             Returns: from, to, subject, html, text, headers
 *
 *   status <email-id>         Check delivery status of a SENT email
 *                             Returns: last_event (delivered, bounced, etc.)
 *
 *   attachments <email-id>    List attachments of a received email
 *
 *   download <email-id> <attachment-id>
 *                             Download a specific attachment (base64)
 *
 *   search <query>            Search inbox by subject or sender
 *     --field <from|subject>  Field to search in (default: subject)
 *     --limit <n>             Max results (default: 20)
 *
 *   help                      Show this help message
 *
 * ============================================================================
 * OUTPUT FORMAT
 * ============================================================================
 *
 * All responses are JSON for easy parsing:
 *
 * SUCCESS:
 *   {
 *     "success": true,
 *     "command": "inbox",
 *     "data": { ... }
 *   }
 *
 * ERROR:
 *   {
 *     "success": false,
 *     "error": "Error message",
 *     "hint": "How to fix it"
 *   }
 *
 * ============================================================================
 * EXAMPLES
 * ============================================================================
 *
 * # Check inbox for recent emails
 * bun run resend inbox --limit 5
 *
 * # Read a specific email content
 * bun run resend read a39999a6-88e3-48b1-888b-beaabcde1b33
 *
 * # Verify if a sent email was delivered
 * bun run resend status 4ef9a417-02e9-4d39-ad75-9611e0fcc33c
 *
 * # Search for emails from a specific sender
 * bun run resend search "noreply@github.com" --field from
 *
 * # Search for emails with specific subject
 * bun run resend search "Password Reset"
 *
 * ============================================================================
 * EMAIL STATUS VALUES (for 'status' command)
 * ============================================================================
 *
 * When checking sent email status, the 'last_event' field can be:
 *
 *   - "sent"       : Email accepted by Resend
 *   - "delivered"  : Email delivered to recipient's mail server
 *   - "bounced"    : Email bounced (invalid address or rejected)
 *   - "complained" : Recipient marked as spam
 *   - "opened"     : Recipient opened the email (if tracking enabled)
 *   - "clicked"    : Recipient clicked a link (if tracking enabled)
 *
 * ============================================================================
 * TYPICAL TESTING WORKFLOW
 * ============================================================================
 *
 * 1. Your application sends an email to: inbox@your-verified-domain.com
 * 2. Wait 2-5 seconds for delivery
 * 3. Check inbox: bun run resend inbox --limit 1
 * 4. Read email content: bun run resend read <id-from-step-3>
 * 5. Verify the content matches what was expected
 *
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

interface ParsedArgs {
  command: string
  positional: string[]
  options: Record<string, string | boolean>
}

interface ApiResponse {
  data?: unknown[]
  has_more?: boolean
  message?: string
  error?: string
  [key: string]: unknown
}

interface EmailListItem {
  id: string
  from: string
  to: string
  subject: string
  created_at: string
  attachments?: Array<{ id: string, filename: string, content_type: string, size: number }>
}

interface EmailDetail {
  id: string
  from: string
  to: string
  subject: string
  created_at: string
  message_id?: string
  reply_to?: string
  cc?: string
  bcc?: string
  headers?: Record<string, string>
  html?: string
  text?: string
  attachments?: Array<{ id: string, filename: string, content_type: string, size: number }>
}

interface SentEmailStatus {
  id: string
  to: string
  from: string
  subject: string
  last_event: string
  created_at: string
  scheduled_at?: string
}

interface AttachmentDetail {
  id: string
  filename: string
  content_type: string
  size: number
}

interface AttachmentDownload {
  filename: string
  content_type: string
  content: string
}

interface OutputSuccess {
  success: true
  command: string
  data: unknown
  statusExplanation?: string
}

interface OutputError {
  success: false
  error: string
  hint?: string
  docs?: string
}

type Output = OutputSuccess | OutputError;

// ============================================================================
// CONFIGURATION & VALIDATION
// ============================================================================

const API_BASE_URL = 'https://api.resend.com';
const API_KEY = process.env.RESEND_API_KEY;

function validateEnvironment(): void {
  if (!API_KEY) {
    output({
      success: false,
      error: 'Missing RESEND_API_KEY environment variable',
      hint: 'Set it in your .env file or export it: export RESEND_API_KEY=re_xxxxxxxxx',
      docs: 'https://resend.com/api-keys',
    });
    process.exit(1);
  }

  if (!API_KEY.startsWith('re_')) {
    output({
      success: false,
      error: 'Invalid RESEND_API_KEY format',
      hint: 'Resend API keys start with \'re_\'. Check your key at https://resend.com/api-keys',
    });
    process.exit(1);
  }
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function apiRequest<T = ApiResponse>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = (await response.json()) as T & { message?: string, error?: string };

  if (!response.ok) {
    throw new Error(data.message || data.error || `API error: ${response.status}`);
  }

  return data;
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

function output(data: Output): void {
  console.log(JSON.stringify(data, null, 2));
}

function errorExit(message: string, hint?: string): never {
  const error: OutputError = { success: false, error: message };
  if (hint) {
    error.hint = hint;
  }
  output(error);
  process.exit(1);
}

// ============================================================================
// ARGUMENT PARSER
// ============================================================================

function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: args[0] || 'help',
    positional: [],
    options: {},
  };

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];

      if (next && !next.startsWith('--')) {
        result.options[key] = next;
        i += 2;
      }
      else {
        result.options[key] = true;
        i += 1;
      }
    }
    else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function commandInbox(options: Record<string, string | boolean>): Promise<void> {
  const params = new URLSearchParams();

  if (options.limit) {
    const limit = Number.parseInt(options.limit as string);
    if (Number.isNaN(limit) || limit < 1 || limit > 100) {
      errorExit('Invalid --limit value', 'Must be a number between 1 and 100');
    }
    params.set('limit', limit.toString());
  }

  if (options.after) {
    params.set('after', options.after as string);
  }
  if (options.before) {
    params.set('before', options.before as string);
  }

  const queryString = params.toString();
  const endpoint = `/emails/receiving${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await apiRequest<{ data?: EmailListItem[], has_more?: boolean }>(endpoint);

    output({
      success: true,
      command: 'inbox',
      data: {
        count: response.data?.length || 0,
        hasMore: response.has_more || false,
        emails: (response.data || []).map(email => ({
          id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          receivedAt: email.created_at,
          hasAttachments: (email.attachments?.length || 0) > 0,
          attachmentCount: email.attachments?.length || 0,
        })),
      },
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(message, 'Check your API key and domain configuration');
  }
}

async function commandRead(positional: string[]): Promise<void> {
  const emailId = positional[0];

  if (!emailId) {
    errorExit(
      'Missing email ID',
      'Usage: bun run resend read <email-id>\nGet the ID from: bun run resend inbox',
    );
  }

  try {
    const email = await apiRequest<EmailDetail>(`/emails/receiving/${emailId}`);

    output({
      success: true,
      command: 'read',
      data: {
        id: email.id,
        from: email.from,
        to: email.to,
        subject: email.subject,
        receivedAt: email.created_at,
        messageId: email.message_id,
        replyTo: email.reply_to,
        cc: email.cc,
        bcc: email.bcc,
        headers: email.headers,
        html: email.html,
        text: email.text,
        attachments: email.attachments?.map(att => ({
          id: att.id,
          filename: att.filename,
          contentType: att.content_type,
          size: att.size,
        })),
      },
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(
      message,
      'Make sure the email ID exists. List emails with: bun run resend inbox',
    );
  }
}

async function commandStatus(positional: string[]): Promise<void> {
  const emailId = positional[0];

  if (!emailId) {
    errorExit(
      'Missing email ID',
      'Usage: bun run resend status <email-id>\nThis ID comes from Resend\'s send API response',
    );
  }

  try {
    const email = await apiRequest<SentEmailStatus>(`/emails/${emailId}`);

    const successStatuses = ['delivered', 'opened', 'clicked'];
    const isDelivered = successStatuses.includes(email.last_event);

    const statusExplanations: Record<string, string> = {
      sent: 'Email accepted by Resend servers',
      delivered: 'Email delivered to recipient\'s mail server',
      bounced: 'Email bounced - address may be invalid',
      complained: 'Recipient marked email as spam',
      opened: 'Recipient opened the email',
      clicked: 'Recipient clicked a link in the email',
    };

    output({
      success: true,
      command: 'status',
      data: {
        id: email.id,
        to: email.to,
        from: email.from,
        subject: email.subject,
        status: email.last_event,
        isDelivered,
        sentAt: email.created_at,
        scheduledAt: email.scheduled_at,
      },
      statusExplanation: statusExplanations[email.last_event] || 'Unknown status',
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(message, 'Make sure this is a SENT email ID from Resend\'s send API response');
  }
}

async function commandAttachments(positional: string[]): Promise<void> {
  const emailId = positional[0];

  if (!emailId) {
    errorExit('Missing email ID', 'Usage: bun run resend attachments <email-id>');
  }

  try {
    const response = await apiRequest<{ data?: AttachmentDetail[] }>(
      `/emails/receiving/${emailId}/attachments`,
    );

    output({
      success: true,
      command: 'attachments',
      data: {
        emailId,
        count: response.data?.length || 0,
        attachments: (response.data || []).map(att => ({
          id: att.id,
          filename: att.filename,
          contentType: att.content_type,
          size: att.size,
          sizeHuman: formatBytes(att.size),
        })),
      },
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(message, 'Make sure the email ID exists and has attachments');
  }
}

async function commandDownload(positional: string[]): Promise<void> {
  const emailId = positional[0];
  const attachmentId = positional[1];

  if (!emailId || !attachmentId) {
    errorExit(
      'Missing email ID or attachment ID',
      'Usage: bun run resend download <email-id> <attachment-id>\nGet IDs from: bun run resend attachments <email-id>',
    );
  }

  try {
    const response = await apiRequest<AttachmentDownload>(
      `/emails/receiving/${emailId}/attachments/${attachmentId}`,
    );

    output({
      success: true,
      command: 'download',
      data: {
        emailId,
        attachmentId,
        filename: response.filename,
        contentType: response.content_type,
        content: response.content,
      },
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(message, 'Make sure both email ID and attachment ID are valid');
  }
}

async function commandSearch(
  positional: string[],
  options: Record<string, string | boolean>,
): Promise<void> {
  const query = positional[0];

  if (!query) {
    errorExit(
      'Missing search query',
      'Usage: bun run resend search <query> [--field from|subject]',
    );
  }

  const field = (options.field as string) || 'subject';
  const limit = Number.parseInt((options.limit as string) || '50');

  if (!['from', 'subject'].includes(field)) {
    errorExit('Invalid --field value', 'Must be \'from\' or \'subject\'');
  }

  try {
    const response = await apiRequest<{ data?: EmailListItem[] }>(
      `/emails/receiving?limit=${Math.min(limit, 100)}`,
    );
    const emails = response.data || [];

    const queryLower = query.toLowerCase();
    const matches = emails.filter((email) => {
      const value = (field === 'from' ? email.from : email.subject) || '';
      return value.toLowerCase().includes(queryLower);
    });

    output({
      success: true,
      command: 'search',
      data: {
        query,
        field,
        scanned: emails.length,
        matchCount: matches.length,
        matches: matches.map(email => ({
          id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          receivedAt: email.created_at,
        })),
      },
    });
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(message, 'Check your API key and try again');
  }
}

function commandHelp(): void {
  const helpText = `
RESEND CLI - Email Verification & Inspection Tool
==================================================

A tool to verify and inspect emails using Resend API.
All output is JSON for easy parsing by AI and scripts.

SETUP:
  1. Set environment variable: export RESEND_API_KEY=re_xxxxxxxxx
  2. Or create .env file with: RESEND_API_KEY=re_xxxxxxxxx

COMMANDS:

  inbox [--limit N]              List received emails
                                 Example: bun run resend inbox --limit 5

  read <email-id>                Read full email content (html, text, headers)
                                 Example: bun run resend read abc123

  status <email-id>              Check if a SENT email was delivered
                                 Example: bun run resend status xyz789

  attachments <email-id>         List attachments of an email
                                 Example: bun run resend attachments abc123

  download <email-id> <att-id>   Download attachment (base64)
                                 Example: bun run resend download abc123 att456

  search <query> [--field F]     Search inbox by subject or sender
                                 Example: bun run resend search "welcome" --field subject

  help                           Show this help message

DOCUMENTATION:
  - Resend API:      https://resend.com/docs/api-reference/introduction
  - Receiving API:   https://resend.com/docs/api-reference/emails/list-received-emails
  - Get API Key:     https://resend.com/api-keys

TYPICAL WORKFLOW:
  1. Your app sends email to inbox@your-domain.com
  2. Run: bun run resend inbox --limit 1
  3. Run: bun run resend read <id-from-step-2>
  4. Verify content matches expectations
`;

  console.log(helpText);
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === 'help' || args.options.help || args.options.h) {
    commandHelp();
    return;
  }

  validateEnvironment();

  try {
    switch (args.command) {
      case 'inbox':
        await commandInbox(args.options);
        break;
      case 'read':
        await commandRead(args.positional);
        break;
      case 'status':
        await commandStatus(args.positional);
        break;
      case 'attachments':
        await commandAttachments(args.positional);
        break;
      case 'download':
        await commandDownload(args.positional);
        break;
      case 'search':
        await commandSearch(args.positional, args.options);
        break;
      default:
        errorExit(
          `Unknown command: ${args.command}`,
          'Run \'bun run resend help\' to see available commands',
        );
    }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errorExit(`Unexpected error: ${message}`, 'Check your network connection and API key');
  }
}

await main();
