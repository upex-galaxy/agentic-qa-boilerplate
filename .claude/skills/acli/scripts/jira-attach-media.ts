#!/usr/bin/env bun
/**
 * Embed an uploaded image / video inline in a Jira Cloud ADF field.
 *
 * Bundled with the acli skill. ADF media is NOT plain Markdown — `![](path)`
 * does not work, because a media node needs the opaque media-services UUID of an
 * uploaded file, which the public attachments API does not return directly. This
 * helper performs the verified 3-step recipe so callers do not have to:
 *
 *   1. Upload the file as a Jira attachment
 *        POST /rest/api/3/issue/{key}/attachments  (header X-Atlassian-Token: no-check)
 *      → returns a NUMERIC attachment id (unusable in a media node) + a `content` URL.
 *   2. Resolve the media-services UUID
 *        GET {content-url} with redirect disabled → the 302 `Location` is
 *        https://api.media.atlassian.com/file/<UUID>/binary?... → extract <UUID>.
 *   3. Build the ADF node
 *        mediaSingle > media{ type:"file", id:<UUID>, collection:"", width, height }
 *      Jira ignores the `collection` input and stores it as "" — verified empirically.
 *
 * Image dimensions are auto-detected for PNG / JPEG / GIF (zero-dependency header
 * reads); pass --width / --height to override or for formats / videos we cannot size.
 *
 * Credentials come from the shell env (loaded from .env by the project tooling):
 *   ATLASSIAN_URL · ATLASSIAN_EMAIL · ATLASSIAN_API_TOKEN
 *
 * CLI:
 *   bun jira-attach-media.ts <ISSUE-KEY> <file>                 # print the mediaSingle node JSON
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --doc           # wrap in a full ADF doc
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --publish       # post a comment with the image
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --publish --caption "Repro step 3"
 *   bun jira-attach-media.ts <ISSUE-KEY> <file> --width 800 --height 600 --layout wide
 *
 * Module:
 *   import { uploadAttachment, resolveMediaId, buildMediaNode } from "./jira-attach-media.ts";
 */

type MediaNode = {
  type: "mediaSingle";
  attrs: { layout: string };
  content: Array<{ type: "media"; attrs: Record<string, unknown> }>;
};

type Attachment = { id: string; content: string; filename: string; mimeType: string };

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `missing env var ${name} — load it from .env (bun claude / bun opencode / direnv) and retry`,
    );
  }
  return v;
}

function authHeader(): string {
  return "Basic " + btoa(`${env("ATLASSIAN_EMAIL")}:${env("ATLASSIAN_API_TOKEN")}`);
}

// Zero-dependency intrinsic-size read for the common raster formats. Returns null
// when the format is unknown (video, SVG, etc.) — the caller then omits width/height.
function imageSize(buf: Uint8Array): { width: number; height: number } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // PNG: \x89PNG, IHDR width@16 height@20 (big-endian uint32)
  if (buf.length >= 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  // GIF: GIF8, width@6 height@8 (little-endian uint16)
  if (buf.length >= 10 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
    return { width: dv.getUint16(6, true), height: dv.getUint16(8, true) };
  }
  // JPEG: scan for a Start-Of-Frame marker, height@+5 width@+7 (big-endian)
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 9 < buf.length) {
      if (buf[off] !== 0xff) {
        off++;
        continue;
      }
      const marker = buf[off + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: dv.getUint16(off + 7), height: dv.getUint16(off + 5) };
      }
      off += 2 + dv.getUint16(off + 2);
    }
  }
  return null;
}

async function uploadAttachment(issueKey: string, filePath: string): Promise<Attachment> {
  const base = env("ATLASSIAN_URL");
  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  const name = filePath.split("/").pop() || "attachment";
  const form = new FormData();
  form.append("file", new File([bytes], name));
  const res = await fetch(`${base}/rest/api/3/issue/${issueKey}/attachments`, {
    method: "POST",
    headers: { Authorization: authHeader(), "X-Atlassian-Token": "no-check" },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`attachment upload failed: HTTP ${res.status} — ${await res.text()}`);
  }
  const arr = (await res.json()) as Attachment[];
  if (!Array.isArray(arr) || !arr[0]?.content) {
    throw new Error(`unexpected attachments response: ${JSON.stringify(arr)}`);
  }
  return arr[0];
}

// Follow (without downloading) the attachment content URL to read the media-services
// UUID out of the 302 redirect to api.media.atlassian.com.
async function resolveMediaId(contentUrl: string): Promise<string> {
  const res = await fetch(contentUrl, {
    method: "GET",
    headers: { Authorization: authHeader() },
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  if (!loc) {
    throw new Error(`no redirect from ${contentUrl} (HTTP ${res.status}) — cannot resolve media id`);
  }
  const m = /\/file\/([0-9a-f-]+)\//i.exec(loc);
  if (!m) {
    throw new Error(`could not parse media UUID from redirect Location: ${loc}`);
  }
  return m[1];
}

function buildMediaNode(
  mediaId: string,
  opts: { width?: number; height?: number; alt?: string; layout?: string } = {},
): MediaNode {
  const attrs: Record<string, unknown> = { type: "file", id: mediaId, collection: "" };
  if (opts.width) attrs.width = opts.width;
  if (opts.height) attrs.height = opts.height;
  if (opts.alt) attrs.alt = opts.alt;
  return {
    type: "mediaSingle",
    attrs: { layout: opts.layout || "center" },
    content: [{ type: "media", attrs }],
  };
}

export { uploadAttachment, resolveMediaId, buildMediaNode, imageSize };

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(name);
  const positional = argv.filter((a, i) => !a.startsWith("--") && !argv[i - 1]?.startsWith("--"));
  const [issueKey, filePath] = positional;

  if (!issueKey || !filePath) {
    console.error("usage: bun jira-attach-media.ts <ISSUE-KEY> <file> [--publish] [--doc] [--caption TEXT] [--width N --height N --layout center|wide|full-width]");
    process.exit(2);
  }

  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  const detected = imageSize(bytes);
  const width = flag("--width") ? Number(flag("--width")) : detected?.width;
  const height = flag("--height") ? Number(flag("--height")) : detected?.height;

  const att = await uploadAttachment(issueKey, filePath);
  const mediaId = await resolveMediaId(att.content);
  const node = buildMediaNode(mediaId, {
    width,
    height,
    alt: flag("--alt") || att.filename,
    layout: flag("--layout"),
  });

  const caption = flag("--caption");
  const docContent: unknown[] = [];
  if (caption) docContent.push({ type: "paragraph", content: [{ type: "text", text: caption }] });
  docContent.push(node);
  const doc = { type: "doc", version: 1, content: docContent };

  if (has("--publish")) {
    const res = await fetch(`${env("ATLASSIAN_URL")}/rest/api/3/issue/${issueKey}/comment`, {
      method: "POST",
      headers: { Authorization: authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ body: doc }),
    });
    if (!res.ok) {
      console.error(`comment publish failed: HTTP ${res.status} — ${await res.text()}`);
      process.exit(1);
    }
    console.error(`✓ published image comment on ${issueKey} (attachment ${att.id}, media ${mediaId})`);
  } else if (has("--doc")) {
    process.stdout.write(JSON.stringify(doc, null, 2));
  } else {
    process.stdout.write(JSON.stringify(node, null, 2));
  }
}
