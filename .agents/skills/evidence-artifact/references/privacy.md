# What may go into an evidence artifact, and who sees it

## Sharing

- An artifact publishes private to the owner. The owner shares it with the organization from the
  page's Share menu. A session never shares it and never makes a public link; it says so in the
  hand-off message to the owner: "Published private: share it from the page's Share menu before
  the links in the tracker and in chat work for the team."
- Everyone in the organization may see ordinary product data in a screenshot: account names,
  configuration, figures. Those stay as captured.
- Mask very personal data: customer or contact email addresses, phone numbers, people's names
  (and a reference number when it sits next to a person's name). A QA test login (the users in
  `.env`) is not personal data.

## Masking means burning, not covering

An annotation box drawn over a value does not mask it: the page still carries the original pixels and
anyone can toggle the marks off. Masking happens to the pixels before encoding:

- In the pack, give the image `"redact": [[x, y, w, h], ...]` in the screenshot's own pixels
  (`playwright-cli eval` on the element returns them, `workflow.md` §2). The build paints those
  boxes solid before it encodes the JPEG, so the page never holds the original pixels. Two image keys
  on the same file burn the union of their boxes, so no key can inline an unredacted copy. The same
  boxes are burned into the tracker thumbnail.
- Text items (API, SQL, notes) are masked at write time: replace the value, e.g. `"g***@example.com"`
  or `<redacted>`. The build warns on any email address it finds in text so a session looks twice.

## Never in a page

Tokens, cookies, `Authorization` values (write `<redacted>`; an env variable such as `$API_TOKEN` in a
curl line is fine), API keys and passwords, Playwright traces, HAR files, raw console or network
dumps, `.auth/*` or browser storage state. The build refuses, and names the field (never the value):

- bearer tokens, JWTs, private keys, cloud access keys and common vendor token shapes;
- any `Authorization:` header whatever its scheme, a `Cookie:` or `Set-Cookie:` header anywhere in a
  line (a curl `-H` included);
- a token or signature in a URL (`access_token=`, `token=`, `refresh_token=`, `sig=`, `code=`), a
  subscription-key header, a storage `AccountKey=`;
- `key=` / `password=` / `secret=` values in any text (JSON bodies such as `"password": "..."`
  included), and any value under a key whose name holds a secret word (`newPassword`,
  `X-Auth-Token`, `service_role_key`), in objects, header lists and JSON kept as strings;
- any SQL cell under a column named that way. A NUMBER under a name that measures something
  (`token_count`, `session_ttl`, `password_length`) passes: a count is not a secret.

A value counts as masked only when at most a few clear characters remain (`<redacted>`, `***`,
`ab****`, and `Bearer <redacted>`: one auth scheme word is ignored); `RealValue***` is still refused. A `redact` box is burned in on every image, a screenshot
recovered with `extract` included. Image files outside the repo, in an `.auth` folder, or that are a
HAR, trace, archive or state file are refused, and an image is accepted only when its bytes are PNG
or JPEG.

Known limit: a secret written as plain prose ("the password is ...") has no shape to detect;
mask it before it reaches the pack.

A trace bundles every network response the run captured, which can include unrelated customer data;
it stays on the machine (`agentic-qa-core/references/evidence-conventions.md` §1).

## Why everything is built locally

QA evidence holds real product and customer data, so it never goes to an external image service
(upload, resize, OCR, generation, hosting), whatever the chat authorises: such a service is an
exfiltration path and can expose files publicly. The build runs on this machine with Python and
Pillow and makes no network call; the only places evidence leaves the machine are the private
claude.ai artifact the owner then shares inside the organization, and the one thumbnail per bug the
tracker embeds.

## Retention

Delete an evidence artifact 6 months after its ticket reached Done. Done by a periodic
list-and-review (Artifact `action: "list"`, matched against the tickets' Done dates in the tracker),
with the owner confirming each delete; the session never deletes on its own. No automation yet.
