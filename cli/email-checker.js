#!/usr/bin/env bun

/**
 * ============================================================================
 * RESEND EMAIL CHECKER CLI
 * ============================================================================
 *
 * A command-line tool to verify and inspect emails using Resend API.
 * Designed to be AI-friendly with clear documentation and JSON output.
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
 * 1. Bun runtime (https://bun.sh) - Install with: curl -fsSL https://bun.sh/install | bash
 * 2. Environment variable: RESEND_API_KEY
 * 3. A verified domain in Resend with email receiving enabled
 *
 * No external dependencies required - uses native fetch API.
 *
 * ============================================================================
 * ENVIRONMENT SETUP
 * ============================================================================
 *
 * Create a .env file in your project root or export the variable:
 *
 *   # Option 1: .env file (Bun loads it automatically)
 *   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 *   # Option 2: Export in terminal
 *   export RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *
 * Get your API key at: https://resend.com/api-keys
 *
 * ============================================================================
 * USAGE
 * ============================================================================
 *
 * Run with Bun:
 *   bun email-checker.js <command> [options]
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
 * EXAMPLES FOR AI
 * ============================================================================
 *
 * # Check if any emails arrived in the inbox
 * bun email-checker.js inbox --limit 5
 *
 * # Read a specific email content
 * bun email-checker.js read a39999a6-88e3-48b1-888b-beaabcde1b33
 *
 * # Verify if a sent email was delivered
 * bun email-checker.js status 4ef9a417-02e9-4d39-ad75-9611e0fcc33c
 *
 * # Search for emails from a specific sender
 * bun email-checker.js search "noreply@github.com" --field from
 *
 * # Search for emails with specific subject
 * bun email-checker.js search "Password Reset"
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
 * 3. Check inbox: bun email-checker.js inbox --limit 1
 * 4. Read email content: bun email-checker.js read <id-from-step-3>
 * 5. Verify the content matches what was expected
 *
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION & VALIDATION
// ============================================================================

const API_BASE_URL = 'https://api.resend.com';
const API_KEY = process.env.RESEND_API_KEY;

function validateEnvironment() {
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
      hint: "Resend API keys start with 're_'. Check your key at https://resend.com/api-keys",
    });
    process.exit(1);
  }
}

// ============================================================================
// HTTP CLIENT
// ============================================================================

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || data.error || `API error: ${response.status}`);
  }

  return data;
}

// ============================================================================
// OUTPUT HELPERS
// ============================================================================

function output(data) {
  console.log(JSON.stringify(data, null, 2));
}

function errorExit(message, hint = null) {
  const error = { success: false, error: message };
  if (hint) error.hint = hint;
  output(error);
  process.exit(1);
}

// ============================================================================
// ARGUMENT PARSER
// ============================================================================

function parseArgs(args) {
  const result = {
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
      } else {
        result.options[key] = true;
        i += 1;
      }
    } else {
      result.positional.push(arg);
      i += 1;
    }
  }

  return result;
}

// ============================================================================
// COMMANDS
// ============================================================================

async function commandInbox(options) {
  const params = new URLSearchParams();

  if (options.limit) {
    const limit = parseInt(options.limit);
    if (isNaN(limit) || limit < 1 || limit > 100) {
      errorExit('Invalid --limit value', 'Must be a number between 1 and 100');
    }
    params.set('limit', limit.toString());
  }

  if (options.after) params.set('after', options.after);
  if (options.before) params.set('before', options.before);

  const queryString = params.toString();
  const endpoint = `/emails/receiving${queryString ? `?${queryString}` : ''}`;

  try {
    const response = await apiRequest(endpoint);

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
  } catch (err) {
    errorExit(err.message, 'Check your API key and domain configuration');
  }
}

async function commandRead(positional) {
  const emailId = positional[0];

  if (!emailId) {
    errorExit(
      'Missing email ID',
      'Usage: bun email-checker.js read <email-id>\nGet the ID from: bun email-checker.js inbox'
    );
  }

  try {
    const email = await apiRequest(`/emails/receiving/${emailId}`);

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
  } catch (err) {
    errorExit(
      err.message,
      'Make sure the email ID exists. List emails with: bun email-checker.js inbox'
    );
  }
}

async function commandStatus(positional) {
  const emailId = positional[0];

  if (!emailId) {
    errorExit(
      'Missing email ID',
      "Usage: bun email-checker.js status <email-id>\nThis ID comes from Resend's send API response"
    );
  }

  try {
    const email = await apiRequest(`/emails/${emailId}`);

    const successStatuses = ['delivered', 'opened', 'clicked'];
    const isDelivered = successStatuses.includes(email.last_event);

    output({
      success: true,
      command: 'status',
      data: {
        id: email.id,
        to: email.to,
        from: email.from,
        subject: email.subject,
        status: email.last_event,
        isDelivered: isDelivered,
        sentAt: email.created_at,
        scheduledAt: email.scheduled_at,
      },
      statusExplanation:
        {
          sent: 'Email accepted by Resend servers',
          delivered: "Email delivered to recipient's mail server",
          bounced: 'Email bounced - address may be invalid',
          complained: 'Recipient marked email as spam',
          opened: 'Recipient opened the email',
          clicked: 'Recipient clicked a link in the email',
        }[email.last_event] || 'Unknown status',
    });
  } catch (err) {
    errorExit(err.message, "Make sure this is a SENT email ID from Resend's send API response");
  }
}

async function commandAttachments(positional) {
  const emailId = positional[0];

  if (!emailId) {
    errorExit('Missing email ID', 'Usage: bun email-checker.js attachments <email-id>');
  }

  try {
    const response = await apiRequest(`/emails/receiving/${emailId}/attachments`);

    output({
      success: true,
      command: 'attachments',
      data: {
        emailId: emailId,
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
  } catch (err) {
    errorExit(err.message, 'Make sure the email ID exists and has attachments');
  }
}

async function commandDownload(positional) {
  const emailId = positional[0];
  const attachmentId = positional[1];

  if (!emailId || !attachmentId) {
    errorExit(
      'Missing email ID or attachment ID',
      'Usage: bun email-checker.js download <email-id> <attachment-id>\nGet IDs from: bun email-checker.js attachments <email-id>'
    );
  }

  try {
    const response = await apiRequest(`/emails/receiving/${emailId}/attachments/${attachmentId}`);

    output({
      success: true,
      command: 'download',
      data: {
        emailId: emailId,
        attachmentId: attachmentId,
        filename: response.filename,
        contentType: response.content_type,
        content: response.content,
      },
    });
  } catch (err) {
    errorExit(err.message, 'Make sure both email ID and attachment ID are valid');
  }
}

async function commandSearch(positional, options) {
  const query = positional[0];

  if (!query) {
    errorExit(
      'Missing search query',
      'Usage: bun email-checker.js search <query> [--field from|subject]'
    );
  }

  const field = options.field || 'subject';
  const limit = parseInt(options.limit) || 50;

  if (!['from', 'subject'].includes(field)) {
    errorExit('Invalid --field value', "Must be 'from' or 'subject'");
  }

  try {
    const response = await apiRequest(`/emails/receiving?limit=${Math.min(limit, 100)}`);
    const emails = response.data || [];

    const queryLower = query.toLowerCase();
    const matches = emails.filter(email => {
      const value = (email[field] || '').toLowerCase();
      return value.includes(queryLower);
    });

    output({
      success: true,
      command: 'search',
      data: {
        query: query,
        field: field,
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
  } catch (err) {
    errorExit(err.message, 'Check your API key and try again');
  }
}

function commandHelp() {
  const helpText = `
RESEND EMAIL CHECKER CLI
========================

A tool to verify and inspect emails using Resend API.
All output is JSON for easy parsing by AI and scripts.

SETUP:
  1. Set environment variable: export RESEND_API_KEY=re_xxxxxxxxx
  2. Or create .env file with: RESEND_API_KEY=re_xxxxxxxxx

COMMANDS:

  inbox [--limit N]              List received emails
                                 Example: bun email-checker.js inbox --limit 5

  read <email-id>                Read full email content (html, text, headers)
                                 Example: bun email-checker.js read abc123

  status <email-id>              Check if a SENT email was delivered
                                 Example: bun email-checker.js status xyz789

  attachments <email-id>         List attachments of an email
                                 Example: bun email-checker.js attachments abc123

  download <email-id> <att-id>   Download attachment (base64)
                                 Example: bun email-checker.js download abc123 att456

  search <query> [--field F]     Search inbox by subject or sender
                                 Example: bun email-checker.js search "welcome" --field subject

  help                           Show this help message

DOCUMENTATION:
  - Resend API:      https://resend.com/docs/api-reference/introduction
  - Receiving API:   https://resend.com/docs/api-reference/emails/list-received-emails
  - Get API Key:     https://resend.com/api-keys

TYPICAL WORKFLOW:
  1. Your app sends email to inbox@your-domain.com
  2. Run: bun email-checker.js inbox --limit 1
  3. Run: bun email-checker.js read <id-from-step-2>
  4. Verify content matches expectations
`;

  console.log(helpText);
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main() {
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
          "Run 'bun email-checker.js help' to see available commands"
        );
    }
  } catch (err) {
    errorExit(`Unexpected error: ${err.message}`, 'Check your network connection and API key');
  }
}

main();
