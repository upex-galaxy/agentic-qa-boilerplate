#!/usr/bin/env python3
"""Render an evidence pack (JSON) into ONE self-contained evidence artifact page (HTML).

Owned by the `evidence-artifact` skill. A session writes the pack while it tests, then runs one
command; it never edits the template or this script per ticket. `bun run evidence build` calls it
with the project's ticket key pattern (`board.ticket_key_pattern`); it can also run directly:

    # the page (one pack; several packs give a pack switcher, used only for reviews)
    python3 .agents/skills/evidence-artifact/scripts/build.py \
        --pack <PBI>/evidence/evidence-pack.json --out <PBI>/evidence/evidence-artifact/index.html

    # the ONE tracker thumbnail of a bug: its first defect screenshot with the marks burned in
    python3 .agents/skills/evidence-artifact/scripts/build.py \
        --pack <PBI>/evidence/evidence-pack-<BUG>.json --thumb <PBI>/evidence/evidence-artifact/<BUG>/<BUG>-thumbnail.png

    # recover a pack from a published page (retest on a machine without the local pack)
    python3 .agents/skills/evidence-artifact/scripts/build.py --extract page.html --out evidence-pack.json

What the build does: validates the pack and names the field when something is wrong; burns each
image's `redact` boxes into the pixels BEFORE encoding (an overlay mark never redacts; two keys on
one file burn the union of their boxes); inlines every screenshot at native size as a JPEG q88 data
URI (never downscaled); converts `coords: "px"` annotations to fractions; marks earlier retest rounds
as history (`round` < `currentRound`) and fills the BEFORE FIX / AFTER FIX compare labels from
`rounds[]`; refuses credentials in text (tokens, JWTs, cookies, any Authorization value, values under
secret-named keys or SQL columns); and stops when the page would pass --max-mb (default 14, under the
16 MB artifact limit).

Dependency: Pillow (`python3 -m pip install pillow`; a Homebrew Python: `brew install pillow` or a
venv; Windows: `py -m pip install pillow`); Python 3.9+. Nothing leaves the
machine: no network call, no external service.
"""
import argparse, base64, copy, html as htmllib, io, json, os, re, subprocess, sys

# Same hint per platform as cli/lib/evidence-page/python.ts: a Homebrew or distro Python
# refuses a bare `pip install` outside a venv (PEP 668).
if sys.platform == "win32":
    PILLOW_INSTALL = "py -m pip install pillow"
elif sys.platform == "darwin":
    PILLOW_INSTALL = "python3 -m pip install pillow (Homebrew Python: brew install pillow, or a venv)"
else:
    PILLOW_INSTALL = "python3 -m pip install pillow (a distro Python: your package manager's python3-pil, or a venv)"

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("build.py needs Pillow: " + PILLOW_INSTALL)

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATES = os.path.join(HERE, "..", "templates")
# The ONE status enum, shared with the TypeScript side and the Sprint Board (ADR-0022)
STATUSES_JSON = os.path.join(HERE, "..", "..", "..", "..", "cli", "lib", "evidence-page", "statuses.json")
SCHEMAS = {"evidence-pack/2.0"}
REPLACED = {"evidence-pack/1.0": "evidence-pack/1.0 was replaced by evidence-pack/2.0 (evidence-artifact skill, references/pack-schema.md); rewrite the pack in the new shape"}
GENERIC_KEY = r"^[A-Z][A-Z0-9]+-\d+$"   # a board-less project: Xray Test keys share the project key
KINDS = {"story", "bug"}
with open(STATUSES_JSON) as _f:
    _ST = json.load(_f)
VERDICTS = set(_ST["verdicts"])
CASE_STATUSES = list(_ST["caseStatuses"])        # tcs[]
BUG_STATUSES = list(_ST["bugStatuses"])          # bugs[]
CASE_KINDS = {None, "tc", "repro", "retest"}
ITEM_TYPES = {"image", "api", "sql", "timeline", "note"}
SHAPES = {"rect", "ellipse", "arrow", "path", "bubble"}
TONES = {None, "defect", "ok", "note"}
SIDE_TONES = {None, "defect", "ok", "note", "before"}
RESULTS = {None, "defect", "pass", "info"}
STATES = {"ok", "req", "wait", "bad"}
QUALITY = 88                       # q85+ keeps annotation targets crisp
MB = 1e6                           # decimal megabytes: the conservative reading of the limit
HARD_MAX_MB = 16                   # the hosted artifact limit; --max-mb cannot exceed it

# Unknown fields are refused: a typo such as `evidance` would otherwise drop evidence silently.
# The builder's own fields (hist, histRound, short, src, w, h, bytes) are accepted so an --extract-ed pack builds again.
TOP_FIELDS = {"schema", "kind", "ticket", "env", "summary", "repro", "images", "tcs", "bugs", "artifact", "currentRound", "rounds"}
TICKET_FIELDS = {"id", "title", "module", "verdict", "verdictNote", "severity", "priority", "bugs", "parent", "parentTitle", "case", "assignee", "qa", "date", "atp", "atr", "deferral"}
DEFERRAL_FIELDS = {"label", "ok"}
OK_FIELDS = {"by", "at", "pointer", "record", "cases"}
DEFERRED_PASS = "PASSED WITH DEFERRALS"
IN_SESSION = "owner OK given in session"      # the words shift-right-deferral.md §3 prescribes for an in-session record
OK_POINTER = re.compile(r"(?:https?://[^\s/]+\S*|board:\S+)", re.I)
OK_TIME = re.compile(r"\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?")
CASE_FIELDS = {"id", "title", "note", "status", "kind", "round", "date", "severity", "priority", "from", "url", "evidence", "compare", "hist", "histRound"}
ITEM_COMMON = {"type", "label", "caption", "result", "round", "flags", "note", "alt", "hist", "histRound"}
ITEM_FIELDS = {"image": {"ref", "annotations", "coords"}, "api": {"method", "url", "status", "ms", "request", "response", "curl"},
               "sql": {"db", "when", "query", "columns", "rows", "hl", "okRows"}, "timeline": {"title", "events", "source"}, "note": {"title", "body"}}
SIDE_FIELDS = {"image", "label", "detail", "annotations", "coords", "round", "tone", "short"}
ANN_FIELDS = {"n", "shape", "tone", "title", "explain", "layer", "text", "x", "y", "w", "h", "cx", "cy", "rx", "ry", "x1", "y1", "x2", "y2", "pts"}
GEOMETRY = {"rect": ("x", "y", "w", "h"), "ellipse": ("cx", "cy", "rx", "ry"), "arrow": ("x1", "y1", "x2", "y2"), "path": (), "bubble": ("x", "y")}
IMAGE_FIELDS = {"file", "redact", "src", "w", "h", "bytes"}
DATA_IMAGE = re.compile(r"^data:image/(png|jpeg);base64,([A-Za-z0-9+/]+=*)$")

# ------------------------------------------------------------------ secrets ----
# Credentials never reach a page (privacy.md). A refusal names the path and the rule, never the value.
MAX_CLEAR = 4                      # clear characters a masked value may keep (`ab****`, `****1234`)
MASK_WORDS = re.compile(r"^(?:\[?redacted\]?|<redacted>|\[?masked\]?|\[?hidden\]?|null|none|n/a)$", re.I)
ENV_REF = re.compile(r"^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?$")      # `$API_TOKEN_X` in a curl line is fine
SECRET_KEY_WORDS = re.compile(r"password|passwd|pwd|secret|token|apikey|authorization|cookie|session|credential|signature|(?:role|private|access|service|signing|encryption|master|client|auth|subscription|account)key")
SECRET_KEY_EXACT = {"sid", "key", "auth", "pin", "pass", "otp"}
A = re.ASCII | re.I
SECRET_PATTERNS = [   # (what, pattern, the group whose content decides: a masked capture passes; None = always refused)
    ("a Bearer token", re.compile(r"\bBearer\s+([\w.~+/-]{8,}=*)", A), 1),
    ("an Authorization header", re.compile(r"\b(?:proxy-)?authorization\s*:\s*(?:[a-z][\w-]*\s+)?([^\s,;\"']+)", A), 1),
    ("a cookie header", re.compile(r"\b(?:set-)?cookie\s*:\s*([^\s;\"']+)", A), 1),     # also inside a curl -H 'Cookie: ...'
    ("a JWT", re.compile(r"\beyJ[\w-]{5,}\.[\w-]{5,}\.[\w-]{5,}", re.ASCII), None),
    ("a private key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), None),
    ("a cloud access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), None),
    ("a GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_\w{20,})", re.ASCII), None),
    ("a GitLab token", re.compile(r"\bglpat-[\w-]{20,}", re.ASCII), None),
    ("a Slack token", re.compile(r"\bxox[abeoprs]-[\w-]{10,}", re.ASCII), None),
    ("a Stripe key", re.compile(r"\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}"), None),
    ("a Google API key", re.compile(r"\bAIza[\w-]{35}", re.ASCII), None),
    ("an API secret key", re.compile(r"\bsk-[\w-]{20,}", re.ASCII), None),
    ("an APIM subscription key", re.compile(r"\bocp-apim-subscription-key\s*[:=]\s*[\"']?([A-Za-z0-9]{16,})", A), 1),
    ("a storage account key", re.compile(r"\baccountkey=([A-Za-z0-9+/=]{20,})", A), 1),
    ("a token or signature in a URL", re.compile(r"[?&](?:sig|code)=([^&\s\"']{8,})", A), 1),
    # `password=...`, `"token": "..."`, `?api_key=...`, `newPassword: ...` written inside a string (JSON bodies included)
    ("a key or password", re.compile(r"(?:[\w-]*?(?:password|passwd|secret|token|apikey|api[_-]key|credential)|\b(?:[\w-]*[_-])?(?:key|sid|pwd|session[_-]?id))[\"']?\s*[:=]\s*[\"']?([^\s\"'&,;}]+)", A), 1),
]
EMAIL = re.compile(r"[\w.%+-]+@[a-z0-9.-]+\.[a-z]{2,}", A)


def fail(msg):
    sys.exit(f"build.py: {msg}")


ALSO_ALLOWED = []    # roots an absolute image path may also sit in (the worktree a fleet worker runs in)


def git_line(*args):
    try:
        return subprocess.check_output(["git", *args], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def repo_root():
    """The PRIMARY checkout, also from a linked worktree: the evidence lives in the primary's .context/PBI
    (the same resolution as cli/lib/worktree.ts checkoutRoots()). The worktree itself stays allowed for absolute paths."""
    top = git_line("rev-parse", "--show-toplevel")
    if not top:
        return os.getcwd()
    git_dir, common = git_line("rev-parse", "--path-format=absolute", "--git-dir"), git_line("rev-parse", "--path-format=absolute", "--git-common-dir")
    if git_dir and common and os.path.realpath(git_dir) != os.path.realpath(common):
        ALSO_ALLOWED.append(os.path.realpath(top))
        return os.path.realpath(os.path.dirname(common))
    return os.path.realpath(top)


def is_secret_key(key):
    k = re.sub(r"[\s._-]", "", str(key).lower())
    return k in SECRET_KEY_EXACT or bool(SECRET_KEY_WORDS.search(k))


COUNT_KEY = re.compile(r"(?:count|total|length|len|size|ttl|expiresin|expiresat|expiry|maxage)$")


def is_count_key(key):
    """`token_count`, `session_ttl`: a number under such a key is a measure, not a secret."""
    return bool(COUNT_KEY.search(re.sub(r"[\s._-]", "", str(key).lower())))


def is_masked(v):
    """Masked = empty, a mask word, an env reference, or at most MAX_CLEAR characters besides mask symbols.
    One leading auth scheme is ignored: `Bearer <redacted>` is the placeholder the skill prescribes."""
    if v is None or isinstance(v, bool):
        return True
    if not isinstance(v, (str, int, float)):
        return False
    text = re.sub(r"^(?:bearer|basic|token|digest|apikey|negotiate)\s+", "", str(v).strip(), flags=re.I)
    if text == "" or MASK_WORDS.match(text) or ENV_REF.match(text):
        return True
    clear = re.sub(r"[*•·]", "", text)
    if re.fullmatch(r"x{3,}", clear, re.I):
        return True
    return len(clear) <= MAX_CLEAR


def join_path(base, k):
    if isinstance(k, int):
        return f"{base}[{k}]"
    return (f"{base}.{k}" if base else k) if re.fullmatch(r"[A-Za-z_$][\w$]*", k, re.ASCII) else f"{base}[{json.dumps(k)}]"


def secret_scan(value, path=""):
    """Every string, every key that names a secret, every SQL column that does. Returns (refusals, emails) as (path, what)."""
    refusals, emails = [], []

    def text(v, path):
        for what, rx, group in SECRET_PATTERNS:
            for m in rx.finditer(v):
                if group is None or not is_masked(m.group(group)):
                    refusals.append((path, what))
                    break
        if EMAIL.search(v):
            emails.append((path, EMAIL.search(v).group(0)))
        t = v.strip()
        if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
            try:
                walk(json.loads(t), path)          # a JSON body kept as a string is scanned by key too
            except ValueError:
                pass

    def walk(v, path):
        if isinstance(v, str):
            text(v, path)
        elif isinstance(v, list):
            if len(v) == 2 and not path.endswith(".columns") and isinstance(v[0], str) and re.fullmatch(r"[\w.-]+", v[0], re.ASCII) and is_secret_key(v[0]) and not is_masked(v[1]):
                refusals.append((path, "a value under a secret-named key"))      # a header kept as [name, value]
            for i, x in enumerate(v):
                walk(x, join_path(path, i))
        elif isinstance(v, dict):
            if isinstance(v.get("name"), str) and is_secret_key(v["name"]) and "value" in v and not is_masked(v["value"]):
                refusals.append((join_path(path, "value"), "a value under a secret-named key"))   # the {name, value} header shape
            cols, rows = v.get("columns"), v.get("rows")
            if isinstance(cols, list) and isinstance(rows, list):                  # an SQL result: cells under a secret column
                secret_cols = [i for i, c in enumerate(cols) if isinstance(c, str) and is_secret_key(c)]
                for r, row in enumerate(rows):
                    if isinstance(row, list):
                        for i in secret_cols:
                            if i < len(row) and not is_masked(row[i]) and not (is_count_key(cols[i]) and num(row[i])):
                                refusals.append((f"{join_path(join_path(path, 'rows'), r)}[{i}]", "a value in a secret-named SQL column"))
            for k, x in v.items():
                cp = join_path(path, k)
                if is_secret_key(k) and isinstance(x, (str, int, float)) and not isinstance(x, bool) and not is_masked(x) and not (is_count_key(k) and num(x)):
                    refusals.append((cp, "a value under a secret-named key"))
                walk(x, cp)

    walk(value, path)
    dedupe = lambda xs: [x for i, x in enumerate(xs) if x not in xs[:i]]
    return dedupe(refusals), dedupe(emails)


# ---------------------------------------------------------------- validation ----
def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def unknown(obj, allowed, where):
    if not isinstance(obj, dict):
        fail(f"{where} must be an object")
    extra = sorted(set(obj) - allowed)
    if extra:
        fail(f"{where}.{extra[0]} is not a field of evidence-pack/2.0 here (allowed: {', '.join(sorted(allowed))})")


def check_str(obj, key, where, required=False):
    v = obj.get(key)
    if v is None:
        if required: fail(f"{where}.{key} is required")
        return None
    if not isinstance(v, str) or (required and not v.strip()):
        fail(f"{where}.{key} must be a {'non-empty ' if required else ''}string")
    return v


def check_link(obj, key, where):
    """A link the page renders as href: an absolute http(s) URL, or #PACK.CASE inside a multi-pack page."""
    v = check_str(obj, key, where)
    if v is not None and not re.fullmatch(r"#[\w.-]+", v) and not re.match(r"https?://[^\s/]+", v, re.I):
        fail(f"{where}.{key} must be an absolute http(s) URL or a #PACK.CASE deep link (got {v!r})")


def validate(p, where, key_rx):
    if not isinstance(p, dict): fail(f"{where}: a pack is one JSON object (an extract of a review page holds several: give each its own file)")
    if p.get("schema") in REPLACED: fail(f"{where}: {REPLACED[p['schema']]}")
    if p.get("schema") not in SCHEMAS: fail(f"{where}: schema must be one of {sorted(SCHEMAS)}")
    unknown(p, TOP_FIELDS, f"{where}: pack")
    if p.get("kind") not in KINDS: fail(f"{where}: kind must be \"story\" or \"bug\"")
    t = p.get("ticket") or fail(f"{where}: ticket{{}} is required")
    unknown(t, TICKET_FIELDS, f"{where}: ticket")
    if not key_rx.fullmatch(str(t.get("id", ""))): fail(f"{where}: ticket.id {t.get('id')!r} must match the ticket key pattern {key_rx.pattern} (board.ticket_key_pattern)")
    check_str(t, "title", f"{where}: ticket", required=True)
    if t.get("verdict") not in VERDICTS: fail(f"{where}: ticket.verdict must be one of {', '.join(_ST['verdicts'])}")
    for k in TICKET_FIELDS - {"id", "title", "verdict", "bugs", "deferral"}: check_str(t, k, f"{where}: ticket")
    check_deferral(t.get("deferral"), p["kind"], where)
    if not isinstance(t.get("bugs", []), list) or not all(isinstance(b, str) for b in t.get("bugs", [])): fail(f"{where}: ticket.bugs must be a list of strings")
    env = p.get("env")
    if not isinstance(env, dict) or not all(isinstance(v, str) for v in env.values()): fail(f"{where}: env is required: an ordered map of label -> string (the build strip)")
    check_str(p, "summary", f"{where}: pack", required=True)
    if p.get("repro") is not None:
        unknown(p["repro"], {"steps", "frequency", "expected", "actual"}, f"{where}: repro")
    images = p.get("images") or {}
    if not isinstance(images, dict): fail(f"{where}: images must be an object of {{key: {{file, redact?}}}}")
    for k, v in images.items():
        check_image(v, f"{where}: images.{k}")
    if not isinstance(p.get("tcs"), list) or not p["tcs"]: fail(f"{where}: tcs[] needs at least one case (a bug page puts its reproduction here)")
    if not isinstance(p.get("bugs", []), list): fail(f"{where}: bugs must be a list")
    seen = set()
    for bug, c in [(False, x) for x in p["tcs"]] + [(True, x) for x in p.get("bugs", [])]:
        if not isinstance(c, dict): fail(f"{where}: every case is an object")
        cid = c.get("id") or fail(f"{where}: a case has no id")
        if not isinstance(cid, str): fail(f"{where}: case id {cid!r} must be a string")
        if cid in seen: fail(f"{where}: case id {cid} appears twice")
        seen.add(cid)
        unknown(c, CASE_FIELDS, f"{where} {cid}")
        allowed = BUG_STATUSES if bug else CASE_STATUSES
        if c.get("status") not in allowed: fail(f"{where} {cid}: status {c.get('status')!r} not in {allowed} ({'bugs[]' if bug else 'tcs[]'} statuses)")
        if not isinstance(c.get("title"), str) or not c["title"].strip(): fail(f"{where} {cid}: title is required (the board card and the viewer show it)")
        if bug and not key_rx.fullmatch(cid): fail(f"{where} {cid}: a bug card id must match the ticket key pattern {key_rx.pattern}")
        if bug and c.get("kind") is not None: fail(f"{where} {cid}: kind belongs to tcs[] (repro, retest); a bug card has none")
        if c.get("kind") not in CASE_KINDS: fail(f"{where} {cid}: kind {c.get('kind')!r} must be repro, retest or absent")
        for k in ("note", "date", "severity", "priority", "from"): check_str(c, k, f"{where} {cid}")
        check_link(c, "url", f"{where} {cid}")
        check_round(c.get("round"), f"{where} {cid}: round")
        if not isinstance(c.get("evidence", []), list): fail(f"{where} {cid}: evidence must be a list")
        for e in c.get("evidence", []):
            check_item(e, f"{where} {cid} item {(e.get('label') or e.get('type')) if isinstance(e, dict) else e!r}", images)
        if c.get("compare") is not None:
            cmp = c["compare"]
            unknown(cmp, {"left", "right", "caption"}, f"{where} {cid}: compare")
            for side in ("left", "right"):
                s = cmp.get(side) or fail(f"{where} {cid}: compare needs left and right")
                unknown(s, SIDE_FIELDS, f"{where} {cid}: compare.{side}")
                if s.get("image") not in images: fail(f"{where} {cid}: compare.{side}.image {s.get('image')!r} not in images{{}}")
                if s.get("tone") not in SIDE_TONES: fail(f"{where} {cid}: compare.{side}.tone {s.get('tone')!r} must be ok, defect, note, before or absent")
                check_round(s.get("round"), f"{where} {cid}: compare.{side}.round")
                check_annotations(s.get("annotations", []), f"{where} {cid} compare")
    check_round(p.get("currentRound"), f"{where}: currentRound")
    if not isinstance(p.get("rounds", []), list): fail(f"{where}: rounds must be a list of {{round, date, build}}")
    for r in p.get("rounds", []):
        if not isinstance(r, dict): fail(f"{where}: each rounds[] entry is {{round, date, build}}")
        unknown(r, {"round", "date", "build"}, f"{where}: rounds[]")
        check_round(r.get("round"), f"{where}: rounds[].round", required=True)
    if p.get("artifact") is not None:
        unknown(p["artifact"], {"url", "path", "published"}, f"{where}: artifact")
    cross_check(p, where, key_rx)
    scan_text(p, where)


def check_deferral(d, kind, where):
    if d is None: return
    if kind == "bug": fail(f"{where}: ticket.deferral belongs to a story pack: a bug never passes on a deferral")
    unknown(d, DEFERRAL_FIELDS, f"{where}: ticket.deferral")
    check_str(d, "label", f"{where}: ticket.deferral")
    ok = d.get("ok")
    if ok is None or ok == {}: return
    at = f"{where}: ticket.deferral.ok"
    unknown(ok, OK_FIELDS, at)
    check_str(ok, "by", at, required=True)
    if not OK_TIME.fullmatch(check_str(ok, "at", at, required=True)): fail(f"{at}.at must be a timestamp with date and time, such as 2026-11-05T14:30:00Z")
    forms = [k for k in ("pointer", "record") if (check_str(ok, k, at) or "").strip()]
    if len(forms) != 1: fail(f"{at} needs exactly one of pointer (a URL or board:<need-id>) or record (an OK given in session)")
    if forms == ["pointer"] and not OK_POINTER.fullmatch(ok["pointer"]): fail(f"{at}.pointer must be an absolute http(s) URL or board:<need-id> (got {ok['pointer']!r})")
    if forms == ["record"] and not ok["record"].startswith(IN_SESSION): fail(f"{at}.record must start with \"{IN_SESSION}\"")
    cases = ok.get("cases")
    if not (isinstance(cases, list) and cases and all(isinstance(c, str) for c in cases) and len(set(cases)) == len(cases)):
        fail(f"{at}.cases must list the covered case ids, at least one and each once")


def check_image(v, where):
    unknown(v, IMAGE_FIELDS, where)
    if v.get("file") is None and v.get("src") is None: fail(f"{where} has no file")
    check_str(v, "file", where)
    if v.get("src") is not None and not DATA_IMAGE.match(str(v["src"])): fail(f"{where}.src must be a data:image/png or data:image/jpeg base64 URI")
    for box in v.get("redact") or []:
        if not (isinstance(box, list) and len(box) == 4 and all(num(n) for n in box)): fail(f"redact box {box} must be [x, y, w, h] in pixels")
        if box[2] <= 0 or box[3] <= 0: fail(f"{where}: redact box {box} needs w and h greater than 0")


def check_item(e, where, images):
    if not isinstance(e, dict) or e.get("type") not in ITEM_TYPES: fail(f"{where}: unknown evidence type {e.get('type') if isinstance(e, dict) else e!r} (one of {sorted(ITEM_TYPES)})")
    unknown(e, ITEM_COMMON | ITEM_FIELDS[e["type"]], where)
    check_round(e.get("round"), f"{where}: round")
    if e.get("result") not in RESULTS: fail(f"{where}: result {e.get('result')!r} must be defect, pass, info or absent")
    if e["type"] == "image":
        if e.get("ref") not in images: fail(f"{where}: image ref {e.get('ref')!r} not in images{{}}")
        if e.get("coords") not in (None, "px", "fraction"): fail(f"{where}: coords must be \"px\" or \"fraction\"")
        check_annotations(e.get("annotations", []), where)
    elif e["type"] == "note":
        check_str(e, "body", where, required=True)
    elif e["type"] == "timeline":
        if not isinstance(e.get("events"), list) or not e["events"]: fail(f"{where}: a timeline needs events[]")
        for ev in e["events"]:
            unknown(ev, {"t", "label", "rows", "state"}, f"{where}: events[]")
            if not num(ev.get("t")) or not isinstance(ev.get("label"), str) or ev.get("state") not in STATES: fail(f"{where}: each event is {{t (ms), label, state: ok/req/wait/bad}}")
    elif e["type"] == "sql":
        for row in e.get("rows", []):
            if not isinstance(row, list) or not all(c is None or isinstance(c, (str, int, float)) for c in row): fail(f"{where}: rows[] are lists of cells (strings, numbers, booleans or null)")


def check_annotations(anns, where):
    if not isinstance(anns, list): fail(f"{where}: annotations must be a list")
    for a in anns:
        unknown(a, ANN_FIELDS, f"{where}: annotation")
        if a.get("shape") not in SHAPES: fail(f"{where}: annotation shape {a.get('shape')!r} not in {sorted(SHAPES)}")
        if a.get("tone") not in TONES: fail(f"{where}: annotation tone {a.get('tone')!r} must be defect, ok, note or absent")
        for k in GEOMETRY[a["shape"]]:
            if not num(a.get(k)): fail(f"{where}: a {a['shape']} annotation needs a number {k}")
        if a["shape"] == "bubble" and not isinstance(a.get("text"), str): fail(f"{where}: a bubble annotation needs its text")
        if a["shape"] == "path" and not (isinstance(a.get("pts"), list) and len(a["pts"]) >= 2 and all(isinstance(pt, list) and len(pt) == 2 and all(num(n) for n in pt) for pt in a["pts"])):
            fail(f"{where}: a path annotation needs pts: [[x, y], ...] with at least 2 points")


def check_round(v, what, required=False):
    """A round is a whole number: 0 = the original finding, 1 = retest 1, ..."""
    if v is None and not required: return
    if isinstance(v, bool) or not isinstance(v, int) or v < 0: fail(f"{what} must be a whole number >= 0 (0 = the original finding), got {v!r}")


def case_round(c, cur):
    """No round means current, except a reproduction, which is the original finding (round 0) by definition."""
    if c.get("round") is not None: return c["round"]
    return 0 if c.get("kind") == "repro" else cur


def current_round(p):
    """The round the verdict is judged on: currentRound, else the highest round present, else 0."""
    if p.get("currentRound") is not None: return p["currentRound"]
    seen = [case_round(c, 0) for c in p["tcs"]] + [e["round"] for c in p["tcs"] for e in c.get("evidence", []) if e.get("round") is not None]
    return max(seen, default=0)


def deferral_gap(kind, cases, deferral):
    deferred = [c["id"] for c in cases if c["status"] == "DEFERRED"]
    if kind == "bug": return "a bug never passes on a deferral"
    if not deferred: return "no current case is DEFERRED"
    covered = (deferral.get("ok") or {}).get("cases", [])
    uncovered = [i for i in deferred if i not in covered]
    if uncovered: return f"waiting for owner OK on {', '.join(uncovered)} (ticket.deferral.ok.cases)"
    if not (deferral.get("label") or "").strip(): return "ticket.deferral.label is missing"
    return None


def allowed_verdicts(kind, cases, deferral):
    """The verdicts the current cases allow. History never counts."""
    st = [c["status"] for c in cases]
    if "FAILED" in st: return ["FAILED"]
    if not st or "BLOCKED" in st or "NOT RUN" in st: return ["PENDING"]
    passed = ["PASSED"] if "PASSED" in st else []
    if kind == "bug" or "DEFERRED" not in st: return passed or ["PENDING"]
    if deferral_gap(kind, cases, deferral) is None: return [DEFERRED_PASS] + passed
    # PASSED stays allowed beside an uncovered deferral so a pack with no ticket.deferral still builds, with a warning
    return passed + ["PENDING"]


def cross_check(p, where, key_rx):
    """ADR-0021, judged on the current round: PASSED and FAILED only on observation, BLOCKED and DEFERRED need a reason,
    a DEFERRED reason names its follow-up key, a verdict the current cases contradict is refused, a retest never passes on a deferral."""
    cur = current_round(p)
    key_in = re.compile("(?:" + key_rx.pattern.lstrip("^").rstrip("$") + ")")
    live = [c for c in p["tcs"] if case_round(c, cur) >= cur]
    for c in live:
        items = [e for e in c.get("evidence", []) if (e.get("round") if e.get("round") is not None else case_round(c, cur)) >= cur]
        # an http(s) `url` is where the case's evidence lives: the page offers "Open where its evidence lives"
        if c["status"] in ("PASSED", "FAILED") and not items and not c.get("compare") and not str(c.get("url", "")).lower().startswith(("http://", "https://")):
            fail(f"{where} {c['id']}: a current {c['status']} case needs at least one evidence item of this round, a compare, or the url where its evidence lives (PASSED and FAILED only on observation)")
        if c["status"] in ("BLOCKED", "DEFERRED"):
            reasons = [r for r in [c.get("note") or ""] + [e.get("body", "") for e in items if e["type"] == "note"] if r.strip()]
            if not reasons: fail(f"{where} {c['id']}: a {c['status']} case needs the reason it was not run (its note, or a note item)")
            if c["status"] == "DEFERRED" and not any(key_in.search(r) for r in reasons):
                fail(f"{where} {c['id']}: a DEFERRED reason names the follow-up ticket that records the deferral (a key matching {key_rx.pattern})")
    deferral, verdict = p["ticket"].get("deferral") or {}, p["ticket"]["verdict"]
    deferred = next((c for c in live if c["status"] == "DEFERRED"), None)
    deferred_ids = {c["id"] for c in live if c["status"] == "DEFERRED"}
    stray = next((i for i in (deferral.get("ok") or {}).get("cases", []) if i not in deferred_ids), None)
    if stray: fail(f"{where}: ticket.deferral.ok.cases lists {stray}, which is not a current DEFERRED case")
    if p["kind"] == "bug" and cur > 0 and deferred and verdict in ("PASSED", DEFERRED_PASS):
        fail(f"{where}: a retest cannot pass on a deferral ({deferred['id']} is DEFERRED in round {cur})")
    allowed = allowed_verdicts(p["kind"], live, deferral)
    if verdict not in allowed:
        culprit = next((c for c in live if c["status"] in ("FAILED", "BLOCKED", "NOT RUN")), None)
        if culprit: why = f"{culprit['id']} is {culprit['status']}"
        elif verdict == DEFERRED_PASS: why = deferral_gap(p["kind"], live, deferral)
        elif allowed[0] == DEFERRED_PASS: why = "the owner OK covers every deferred case"
        else: why = "no current case was observed PASSED"
        fail(f"{where}: ticket.verdict {verdict} contradicts the current cases (they allow {' or '.join(allowed)}: {why}); earlier rounds never count")
    if verdict == "PASSED" and deferred:
        print(f"warning: {where}: {deferred['id']} is DEFERRED, outside this PASSED verdict; list it in the report.", file=sys.stderr)


def find_bug_pack(bug_id, story_path, root, given):
    """The bug's own live pack: --bug-pack, else beside the story pack (workflow.md §1), else the bug's own PBI folder
    (a pack recovered with extract, workflow.md §5). Several found: the one judged on the latest round. None: (None, places)."""
    beside = os.path.join(os.path.dirname(os.path.abspath(story_path)), f"evidence-pack-{bug_id}.json")
    places = [beside, f"<bug PBI under {os.path.join(root, '.context', 'PBI')}>/evidence/evidence-pack.json"]
    if bug_id in given:
        return given[bug_id], places
    cands = [beside] if os.path.isfile(beside) else []
    pbi = os.path.join(root, ".context", "PBI")
    own = re.compile(rf"(?:^|-){re.escape(bug_id)}(?:-|$)")
    for dirpath, dirs, files in os.walk(pbi):
        dirs[:] = [d for d in dirs if d != "evidence"]
        if own.search(os.path.basename(dirpath)) and os.path.isfile(os.path.join(dirpath, "evidence", "evidence-pack.json")):
            cands.append(os.path.join(dirpath, "evidence", "evidence-pack.json"))
    best = None
    for c in cands:
        try:
            p = json.load(open(c))
            if p.get("kind") != "bug" or (p.get("ticket") or {}).get("id") != bug_id: continue
            r = current_round(p)
        except (OSError, ValueError, TypeError, KeyError, AttributeError):
            continue
        if best is None or r > best[0]: best = (r, c)
    return (best[1] if best else None), places


def cross_check_packs(packs, paths, root, given):
    """A story's bug card that reports a retest (the pill readers see) agrees with the bug's own pack: the one built
    together with it, else the live pack find_bug_pack locates. A pill nothing can check is refused (ADR-0021 M5)."""
    own = {p["ticket"]["id"]: p for p in packs if p["kind"] == "bug"}
    for p, path in zip(packs, paths):
        for b in p.get("bugs", []):
            if b["status"] not in ("RETEST PASSED", "RETEST FAILED"): continue
            bp, where = own.get(b["id"]), "its own pack"
            if bp is None:
                found, places = find_bug_pack(b["id"], path, root, given)
                if found is None:
                    fail(f"{p['ticket']['id']} bug {b['id']}: {b['status']} cannot be checked: no pack for {b['id']} at {places[0]} or {places[1]}; build the bug page first, or pass --bug-pack {b['id']}=<pack.json>")
                try:
                    bp = json.load(open(found))
                except (OSError, ValueError) as err:
                    fail(f"{p['ticket']['id']} bug {b['id']}: cannot read {found} ({err})")
                where = found
            want = "PASSED" if b["status"] == "RETEST PASSED" else "FAILED"
            got = (bp.get("ticket") or {}).get("verdict")
            if got != want: fail(f"{p['ticket']['id']} bug {b['id']}: {b['status']} contradicts {where} (verdict {got})")


def mark_rounds(p):
    """Retest rounds: items and cases from a round below the current one are history.
    The page shows them as BEFORE FIX, never as a current DEFECT or PASS, and never counts them."""
    cur = current_round(p)
    p["currentRound"] = cur
    for c in p["tcs"]:
        cr = case_round(c, cur)
        c.pop("hist", None); c.pop("histRound", None)
        if cr < cur: c["hist"] = True; c["histRound"] = cr
        for e in c.get("evidence", []):
            e.pop("hist", None); e.pop("histRound", None)
            er = e["round"] if e.get("round") is not None else cr
            if er < cur: e["hist"] = True; e["histRound"] = er
    return cur


def round_text(p, n, word):
    """`round 0, build v2.4.0-20261016.1, 2026-10-16` from the pack's rounds[] metadata."""
    meta = next((r for r in p.get("rounds", []) if r.get("round") == n), {})
    parts = [f"{word} {n}"] + [f"build {meta['build']}"] * bool(meta.get("build")) + [meta["date"]] * bool(meta.get("date"))
    return ", ".join(parts)


def scan_text(p, where):
    """Credentials stop the build; email addresses only warn (a test login is fine, a customer's is not)."""
    shown = copy.deepcopy(p)
    for v in (shown.get("images") or {}).values(): v.pop("src", None)        # image bytes are not text
    refusals, emails = secret_scan(shown, "pack")
    if refusals:
        path, what = refusals[0]
        fail(f"{where}: {path} holds {what}. Write <redacted> (privacy.md) and build again.")
    for path, m in emails:
        print(f"warning: {where}: {path} shows the address {m}. Keep it only if it is a QA test login, never a customer's (privacy.md).", file=sys.stderr)


# ------------------------------------------------------------------- images ----
def safe_path(f, root, where, k):
    """The screenshot file, inside the repo root; never session state, a HAR or a trace (privacy.md)."""
    if any(s == ".auth" or s.startswith(".auth") for s in re.split(r"[\\/]", f)): fail(f"{where}: image {k!r} points into an .auth folder; session state never goes on a page")
    ext = os.path.splitext(f)[1].lower()
    if ext in (".har", ".zip", ".json", ".trace", ".ndjson", ".log"): fail(f"{where}: image {k!r} is a HAR, trace or state file; those never go on a page (attach a screenshot instead)")
    if ext not in (".png", ".jpg", ".jpeg"): fail(f"{where}: image {k!r} must be a .png, .jpg or .jpeg screenshot")
    path = f if os.path.isabs(f) else os.path.join(root, f)
    if not os.path.exists(path): fail(f"{where}: image {k!r} -> missing file {f}")
    real = os.path.realpath(path)
    if not any(real == top or real.startswith(top + os.sep) for top in [os.path.realpath(root)] + ALSO_ALLOWED):
        fail(f"{where}: image {k!r} -> {f} resolves outside the repo root")
    with open(real, "rb") as fh:
        head = fh.read(4)
    if not (head.startswith(b"\x89PNG") or head.startswith(b"\xff\xd8\xff")): fail(f"{where}: image {k!r} -> {f} is not a PNG or JPEG file (checked by its first bytes)")
    return real


def carries_metadata(raw):
    """An inline image is kept as it came only when it is a clean JPEG (what this builder writes); anything else is re-encoded."""
    im = Image.open(raw); raw.seek(0)
    return im.format != "JPEG" or bool({"comment", "exif", "xmp", "XML:com.adobe.xmp"} & set(im.info))


def load_image(path, redact):
    im = Image.open(path).convert("RGB")
    im.info.clear()                    # no comment, EXIF or text chunk of the capture reaches a page (ADR-0021)
    if redact:
        d = ImageDraw.Draw(im)
        for box in redact:
            if len(box) != 4: fail(f"redact box {box} must be [x, y, w, h] in pixels")
            x, y, w, h = box
            d.rectangle([x, y, x + w, y + h], fill=(32, 32, 36))   # burned in: the pixels are gone
    return im


def encode(im, file_label):
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=QUALITY, optimize=True, progressive=True)
    return {"src": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(), "w": im.width, "h": im.height,
            "file": file_label, "bytes": len(buf.getvalue())}


def px_to_fraction(anns, w, h):
    out = []
    for a in anns:
        a = dict(a); X = lambda v: round(v / w, 5); Y = lambda v: round(v / h, 5)
        s = a["shape"]
        if s == "rect": a.update(x=X(a["x"]), y=Y(a["y"]), w=X(a["w"]), h=Y(a["h"]))
        elif s == "ellipse": a.update(cx=X(a["cx"]), cy=Y(a["cy"]), rx=X(a["rx"]), ry=Y(a["ry"]))
        elif s == "arrow": a.update(x1=X(a["x1"]), y1=Y(a["y1"]), x2=X(a["x2"]), y2=Y(a["y2"]))
        elif s == "path": a["pts"] = [[X(x), Y(y)] for x, y in a["pts"]]
        elif s == "bubble": a.update(x=X(a["x"]), y=Y(a["y"]))
        out.append(a)
    return out


def span(a):
    """The points an annotation covers, in its own units."""
    s = a["shape"]
    if s == "rect": return [(a["x"], a["y"]), (a["x"] + a["w"], a["y"] + a["h"])]
    if s == "ellipse": return [(a["cx"] - a["rx"], a["cy"] - a["ry"]), (a["cx"] + a["rx"], a["cy"] + a["ry"])]
    if s == "arrow": return [(a["x1"], a["y1"]), (a["x2"], a["y2"])]
    if s == "path": return [tuple(pt) for pt in a["pts"]]
    return [(a["x"], a["y"])]


def check_inside(anns, coords, w, h, what):
    """A mark outside its image points at nothing: refused (ADR-0021)."""
    mw, mh = (w, h) if coords == "px" else (1, 1)
    for a in anns or []:
        if not all(-1e-6 <= x <= mw + 1e-6 and -1e-6 <= y <= mh + 1e-6 for x, y in span(a)):
            fail(f"{what}: annotation {a.get('n', a['shape'])!r} lies outside the {w}x{h} image ({'pixels' if coords == 'px' else 'fractions 0..1'})")


def label(side, default):
    """Compare labels default to EXPECTED (left) / ACTUAL (right); `detail` adds the per-case line.
    A retest's compare defaults to BEFORE FIX (round N, build ..) / AFTER FIX (retest R, build ..)."""
    base = side.get("label") or default
    return f"{base} · {side['detail']}" if side.get("detail") and "·" not in base else base


def compare_defaults(p, c, cur):
    """Returns ((left default label, short, tone), (right ...)) for one case's compare."""
    retest = c.get("kind") == "retest" or (c.get("round") or 0) > 0
    if not retest:
        return ("EXPECTED", "expected", "ok"), ("ACTUAL", "actual", "defect")
    r = case_round(c, cur)
    left_round = (c.get("compare", {}).get("left") or {}).get("round", 0)
    after_tone = "ok" if c.get("status") == "PASSED" else "defect" if c.get("status") == "FAILED" else "note"
    return ((f"BEFORE FIX ({round_text(p, left_round, 'round')})", "before the fix", "before"),
            (f"AFTER FIX ({round_text(p, r, 'retest')})", "after the fix", after_tone))


def resolve(p, where, root):
    # Redactions are burned once per FILE: two keys on one screenshot burn the union of their boxes,
    # so no key can inline an unredacted copy (ADR-0021). Inline images (extracted from a page) group by their bytes.
    groups = {}
    for k, v in (p.get("images") or {}).items():
        if str(v.get("src", "")).startswith("data:"):                         # extracted from a page
            ident = ("inline", v["src"])
        else:
            ident = safe_path(v.get("file") or fail(f"{where}: image {k!r} has no file"), root, where, k)
        g = groups.setdefault(ident, {"keys": [], "redact": [], "decl": v})
        g["keys"].append(k); g["redact"] += v.get("redact") or []
    imgs = {}
    for ident, g in groups.items():
        v, keys = g["decl"], g["keys"]
        if isinstance(ident, tuple):
            raw = io.BytesIO(base64.b64decode(v["src"].split(",", 1)[1]))
            w, h = Image.open(raw).size
            raw.seek(0)
        else:
            w, h = Image.open(ident).size
        for box in g["redact"]:
            x, y, bw, bh = box
            if x < 0 or y < 0 or x + bw > w or y + bh > h: fail(f"{where}: redact box {box} of image {keys[0]!r} lies outside the {w}x{h} image")
        if isinstance(ident, tuple):
            if g["redact"] or carries_metadata(raw):                          # burn the boxes in here too, never skip them
                raw.seek(0)
                enc = encode(load_image(raw, g["redact"]), v.get("file") or keys[0])
            else:
                enc = dict(v, w=w, h=h); enc.pop("redact", None)
        else:
            f = v["file"]
            enc = encode(load_image(ident, g["redact"]), os.path.relpath(ident, os.path.realpath(root)) if not os.path.isabs(f) else f)
        for k in keys:
            imgs[k] = dict(enc)
    p["images"] = imgs

    def need(ref, who):
        if ref not in imgs: fail(f"{where} {who}: image ref {ref!r} not in images{{}}")
        return imgs[ref]

    cur = mark_rounds(p)
    for c in p["tcs"] + p.get("bugs", []):
        c.setdefault("evidence", [])
        for e in c["evidence"]:
            if e["type"] == "image":
                im = need(e.get("ref"), c["id"])
                check_inside(e.get("annotations"), e.get("coords"), im["w"], im["h"], f"{where} {c['id']} item {e.get('label') or e['ref']!r}")
                if e.get("coords") == "px":
                    e["annotations"] = px_to_fraction(e.get("annotations", []), im["w"], im["h"]); e["coords"] = "fraction"
        cmp = c.get("compare")
        if cmp:
            for side, (default, short, tone) in zip(("left", "right"), compare_defaults(p, c, cur)):
                s = cmp.get(side) or fail(f"{where} {c['id']}: compare needs left and right")
                im = need(s.get("image"), c["id"] + " compare")
                check_inside(s.get("annotations"), s.get("coords"), im["w"], im["h"], f"{where} {c['id']} compare.{side}")
                if s.get("coords") == "px":
                    s["annotations"] = px_to_fraction(s.get("annotations", []), im["w"], im["h"]); s["coords"] = "fraction"
                if not s.get("label"): s["short"] = short
                s["label"] = label(s, default)
                s.setdefault("tone", tone)
    p["schema"] = "evidence-pack/2.0"
    return p


def load_pack(path, root, key_rx):
    where = os.path.basename(path)
    try:
        p = json.load(open(path))
    except (OSError, ValueError) as err:
        fail(f"{where}: cannot read the pack ({err})")
    if isinstance(p, dict): p.setdefault("bugs", [])
    validate(p, where, key_rx)
    return resolve(copy.deepcopy(p), where, root)


# --------------------------------------------------------------------- page ----
def render(packs, out, max_mb, standalone=False):
    css = open(os.path.join(TEMPLATES, "shared.css")).read()
    js = open(os.path.join(TEMPLATES, "shared.js")).read()
    html = open(os.path.join(TEMPLATES, "evidence-artifact.html")).read()
    data = json.dumps(packs, ensure_ascii=False).replace("</", "<\\/")
    title = f"<title>{htmllib.escape(packs[0]['ticket']['id'])} Evidence</title>" if len(packs) == 1 else "<title>Evidence Packs Review</title>"
    for marker in ("/*__SHARED_CSS__*/", "/*__SHARED_JS__*/"):
        if html.count(marker) != 1: fail(f"template marker {marker} found {html.count(marker)} times, expected once")
    packs_slot = re.findall(r"/\*__PACKS__\*/\s*null", html)     # the exact text the substitution below replaces
    if len(packs_slot) != 1: fail(f"template slot /*__PACKS__*/null found {len(packs_slot)} times, expected once")
    html = re.sub(r"<title>.*?</title>", lambda m: title, html, count=1)
    html = html.replace("/*__SHARED_CSS__*/", css).replace("/*__SHARED_JS__*/", js)
    html = re.sub(r"/\*__PACKS__\*/\s*null", lambda m: data, html, count=1)
    if standalone: html = "<!doctype html>\n" + html          # opened from disk (--host local): no quirks mode
    size = len(html.encode())
    if size > max_mb * MB:
        uses = {}
        for p in packs:
            for c in p["tcs"] + p["bugs"]:
                for r in [e["ref"] for e in c["evidence"] if e["type"] == "image"] + ([c["compare"]["left"]["image"], c["compare"]["right"]["image"]] if c.get("compare") else []):
                    uses[(p["ticket"]["id"], r)] = uses.get((p["ticket"]["id"], r), 0) + 1
        big = sorted(((len(im["src"]) * max(1, uses.get((p["ticket"]["id"], k), 0)), k, uses.get((p["ticket"]["id"], k), 0)) for p in packs for k, im in p["images"].items()), reverse=True)[:3]
        names = ", ".join(f"{k} ({f'{n} uses, ' if n > 1 else ''}{b / MB:.1f} MB inlined)" for b, k, n in big)
        fail(f"{out} would be {size / MB:.2f} MB, over the {max_mb} MB guard (artifact limit {HARD_MAX_MB} MB). Largest images: {names}. "
             "Drop screenshots that prove nothing new, or crop tall full-page shots, then build again.")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    open(out, "w").write(html)
    print(f"{out}: {size / MB:.2f} MB, {sum(len(p['images']) for p in packs)} images, {sum(len(p['tcs']) + len(p['bugs']) for p in packs)} cases")


# ---------------------------------------------------------------- thumbnail ----
TONE = {"defect": (208, 49, 45), "ok": (31, 138, 76), "note": (37, 99, 235)}


def thumbnail(pack_path, out, case_id, root, key_rx):
    """Burn the marks of one screenshot into a PNG: the bug's ONE tracker image."""
    p = json.load(open(pack_path))
    if isinstance(p, dict): p.setdefault("bugs", [])
    validate(p, os.path.basename(pack_path), key_rx)
    cases = p["tcs"] + p["bugs"]
    if case_id:
        cases = [c for c in cases if c["id"] == case_id] or fail(f"--case {case_id} is not in the pack")
    else:
        cases = sorted(cases, key=lambda c: 0 if c.get("kind") == "repro" else 1 if c["status"] in ("FAILED", "DEFECT", "OPEN") else 2)
    pick = None
    for c in cases:
        imgs = [e for e in c.get("evidence", []) if e["type"] == "image"]
        hit = next((e for e in imgs if e.get("result") == "defect" or any(a.get("tone") == "defect" for a in e.get("annotations", []))), None) or (imgs[0] if imgs else None)
        if hit: pick = hit; break
    if not pick: fail("no screenshot in the pack to make a thumbnail from (API/DB-only bug: the tracker gets the link only)")
    meta = p["images"].get(pick["ref"]) or fail(f"image ref {pick['ref']!r} not in images{{}}")
    if str(meta.get("src", "")).startswith("data:"):     # a pack recovered with --extract: the bytes are inline
        f = io.BytesIO(base64.b64decode(meta["src"].split(",", 1)[1]))
        # the union of every key's boxes on the same bytes, as on the page
        redact = [b for v in p["images"].values() if v.get("src") == meta["src"] for b in (v.get("redact") or [])]
    else:
        f = safe_path(meta["file"], root, os.path.basename(pack_path), pick["ref"])
        # the union of every key's boxes on this file, as on the page
        redact = [b for k, v in p["images"].items() if v.get("file") and not str(v.get("src", "")).startswith("data:")
                  and safe_path(v["file"], root, os.path.basename(pack_path), k) == f for b in (v.get("redact") or [])]
    im = load_image(f, redact)
    W, H = im.size
    anns = pick.get("annotations", [])
    check_inside(anns, pick.get("coords"), W, H, f"{pick['ref']}")
    if pick.get("coords") != "px":                       # fractions -> pixels
        anns = [scale(a, W, H) for a in anns]
    d = ImageDraw.Draw(im)
    lw = max(3, round(W / 400))
    font = font_of(max(14, round(W / 70)))
    for a in anns:
        col = TONE.get(a.get("tone"), TONE["note"]); s = a["shape"]
        if s == "rect": d.rectangle([a["x"], a["y"], a["x"] + a["w"], a["y"] + a["h"]], outline=col, width=lw); anchor = (a["x"], a["y"])
        elif s == "ellipse": d.ellipse([a["cx"] - a["rx"], a["cy"] - a["ry"], a["cx"] + a["rx"], a["cy"] + a["ry"]], outline=col, width=lw); anchor = (a["cx"] - a["rx"], a["cy"] - a["ry"])
        elif s == "arrow": arrow(d, a, col, lw); anchor = (a["x1"], a["y1"])
        elif s == "path": d.line([tuple(pt) for pt in a["pts"]], fill=col, width=lw, joint="curve"); anchor = tuple(a["pts"][0])
        else: anchor = bubble(d, a, col, font, W)
        if a.get("n") is not None: badge(d, anchor, str(a["n"]), col, font)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    im.save(out, "PNG", optimize=True)
    print(f"{out}: {W}x{H}, {os.path.getsize(out) // 1024} KB, {len(anns)} marks from {pick['ref']}")


def scale(a, W, H):
    a = dict(a); s = a["shape"]
    if s == "rect": a.update(x=a["x"] * W, y=a["y"] * H, w=a["w"] * W, h=a["h"] * H)
    elif s == "ellipse": a.update(cx=a["cx"] * W, cy=a["cy"] * H, rx=a["rx"] * W, ry=a["ry"] * H)
    elif s == "arrow": a.update(x1=a["x1"] * W, y1=a["y1"] * H, x2=a["x2"] * W, y2=a["y2"] * H)
    elif s == "path": a["pts"] = [[x * W, y * H] for x, y in a["pts"]]
    elif s == "bubble": a.update(x=a["x"] * W, y=a["y"] * H)
    return a


def font_of(size):
    for name in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc", "DejaVuSans-Bold.ttf"):
        try: return ImageFont.truetype(name, size)
        except OSError: continue
    try: return ImageFont.load_default(size=size)
    except TypeError: return ImageFont.load_default()


def arrow(d, a, col, lw):
    import math
    x1, y1, x2, y2 = a["x1"], a["y1"], a["x2"], a["y2"]
    d.line([(x1, y1), (x2, y2)], fill=col, width=lw)
    ang = math.atan2(y2 - y1, x2 - x1); L = lw * 5
    d.polygon([(x2, y2), (x2 - L * math.cos(ang - .45), y2 - L * math.sin(ang - .45)), (x2 - L * math.cos(ang + .45), y2 - L * math.sin(ang + .45))], fill=col)


def bubble(d, a, col, font, W):
    text = a.get("text") or a.get("title") or ""
    x, y = a["x"], a["y"]
    tw = d.textlength(text, font=font); pad = 8
    bx = min(max(0, x - tw / 2 - pad), W - tw - 2 * pad); by = max(0, y - font.size - 3 * pad)
    d.rounded_rectangle([bx, by, bx + tw + 2 * pad, by + font.size + 2 * pad], radius=8, fill=(255, 255, 255), outline=col, width=3)
    d.text((bx + pad, by + pad), text, fill=col, font=font)
    d.line([(x, y), (x, by + font.size + 2 * pad)], fill=col, width=3)
    return (bx, by)


def badge(d, xy, n, col, font):
    r = font.size * 0.75; x, y = xy
    d.ellipse([x - r, y - r, x + r, y + r], fill=col, outline=(255, 255, 255), width=2)
    d.text((x, y), n, fill=(255, 255, 255), font=font, anchor="mm")


# ------------------------------------------------------------------ extract ----
def extract(html_path, out):
    """Recover the pack(s) embedded in a built or published page; images come back as data URIs."""
    html = open(html_path).read()
    m = re.search(r"const PACKS = (\[.*?\]);\nconst \{ esc, el \}", html, re.S) or fail(f"{html_path}: no embedded packs found (not an evidence artifact page?)")
    packs = json.loads(m.group(1).replace("<\\/", "</"))
    for p in packs:
        for v in p.get("images", {}).values(): v.pop("redact", None)       # already burned in
    json.dump(packs[0] if len(packs) == 1 else packs, open(out, "w"), indent=1, ensure_ascii=False)
    print(f"{out}: {len(packs)} pack(s) recovered from {html_path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Build an evidence artifact page (or a bug thumbnail) from an evidence pack.")
    ap.add_argument("--pack", nargs="+", metavar="PACK", help="evidence pack JSON file(s)")
    ap.add_argument("--out", help="output HTML (page) or JSON (--extract)")
    ap.add_argument("--thumb", metavar="PNG", help="write the bug's tracker thumbnail PNG instead of the page")
    ap.add_argument("--case", help="with --thumb: the case to take the screenshot from (default: the reproduction or the first failing case)")
    ap.add_argument("--extract", metavar="HTML", help="recover the pack embedded in a page into --out")
    ap.add_argument("--check", action="store_true", help="validate the pack(s) only: no image read, nothing written")
    ap.add_argument("--repo", help="root that relative image paths resolve against (default: the primary checkout, also from a worktree)")
    ap.add_argument("--bug-pack", action="append", default=[], metavar="BUG=PACK", help="the bug's own pack, to check a story's RETEST pill (default: beside the story pack, else the bug's PBI folder)")
    ap.add_argument("--key-pattern", default=GENERIC_KEY, help="the ticket key regex (board.ticket_key_pattern; default: the generic key shape)")
    ap.add_argument("--standalone", action="store_true", help="write a full document with a doctype (a page opened from disk)")
    ap.add_argument("--max-mb", type=float, default=14.0, help="fail when the page is larger (default 14; the artifact limit is 16)")
    a = ap.parse_args()
    root = os.path.abspath(a.repo) if a.repo else repo_root()
    given = {}
    for item in a.bug_pack:
        if "=" not in item: fail(f"--bug-pack {item!r} must be <BUG>=<pack.json>")
        k, v = item.split("=", 1); given[k] = v
    top = git_line("rev-parse", "--show-toplevel")
    if top and os.path.realpath(top) not in ALSO_ALLOWED: ALSO_ALLOWED.append(os.path.realpath(top))
    if not 0 < a.max_mb <= HARD_MAX_MB: fail(f"--max-mb must be between 0 and {HARD_MAX_MB} (the artifact limit)")
    try:
        key_rx = re.compile(a.key_pattern)
    except re.error as err:
        fail(f"--key-pattern {a.key_pattern!r} is not a regular expression ({err})")
    if a.extract:
        if not a.out: fail("--extract needs --out <pack.json>")
        extract(a.extract, a.out)
    elif a.check:
        if not a.pack: fail("--check needs --pack <pack.json>")
        for x in a.pack:
            p = json.load(open(x))
            if isinstance(p, dict): p.setdefault("bugs", [])
            validate(p, os.path.basename(x), key_rx)
            print(f"{x}: valid evidence-pack/2.0")
    elif a.thumb:
        if not a.pack or len(a.pack) != 1: fail("--thumb takes exactly one --pack")
        thumbnail(a.pack[0], a.thumb, a.case, root, key_rx)
    else:
        if not a.pack or not a.out: fail("give --pack <pack.json> and --out <index.html>")
        packs = [load_pack(x, root, key_rx) for x in a.pack]
        cross_check_packs(packs, a.pack, root, given)
        render(packs, a.out, a.max_mb, a.standalone)
