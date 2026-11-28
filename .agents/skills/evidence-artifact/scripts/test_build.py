"""Regression tests for build.py: python3 -m unittest discover -s .agents/skills/evidence-artifact/scripts

Stdlib unittest plus Pillow (the builder's own dependency); skipped with the reason when Pillow is
missing. Each case runs build.py as a process, the way `bun run evidence build` does. The secret,
validation and redaction cases carry over the inputs of the TypeScript tests they replace (ADR-0022).
"""
import base64, copy, io, json, os, re, shutil, subprocess, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build.py")
try:
    from PIL import Image, ImageDraw
    HAVE_PIL = True
except ImportError:  # pragma: no cover
    HAVE_PIL = False

GRAY = (32, 32, 36)
KEY = "S3cr3tVa1ue" * 3   # a long clear value: never printed back (all-x reads as a mask)


def shot(path, size=(400, 300), fmt="PNG"):
    im = Image.new("RGB", size, (240, 242, 246))
    d = ImageDraw.Draw(im)
    d.rectangle([20, 20, 380, 60], fill=(36, 52, 86))
    d.rectangle([40, 100, 260, 120], fill=(200, 30, 30))      # the "email" a redaction burns out
    im.save(path, fmt)


def base_pack(**over):
    p = {
        "schema": "evidence-pack/2.0", "kind": "story",
        "ticket": {"id": "DEMO-7001", "title": "Checkout keeps the cart", "verdict": "PASSED"},
        "env": {"Environment": "staging"}, "summary": "One case passed.",
        "images": {"a": {"file": "a.png"}},
        "tcs": [{"id": "DEMO-7001-TC1", "title": "Pay with a valid card", "status": "PASSED",
                 "evidence": [{"type": "image", "ref": "a", "label": "Form", "coords": "px",
                               "annotations": [{"n": 1, "shape": "rect", "x": 40, "y": 100, "w": 220, "h": 20, "tone": "ok", "title": "Field", "explain": "x"}]}]}],
    }
    p.update(over)
    return p


def embedded(html):
    m = re.search(r"const PACKS = (\[.*?\]);\nconst \{ esc, el \}", html, re.S)
    return json.loads(m.group(1).replace("<\\/", "</"))


def pixel_of(src, xy):
    im = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1]))).convert("RGB")
    return im.getpixel(xy)


def near(a, b, tol=12):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


@unittest.skipUnless(HAVE_PIL, "Pillow is not installed (python3 -m pip install pillow; Homebrew Python: brew install pillow; Windows: py -m pip install pillow); build.py needs it")
class BuildCase(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="evidence-build-")
        shot(os.path.join(self.dir, "a.png"))
        shot(os.path.join(self.dir, "b.png"))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def run_build(self, packs, *extra, out="out/index.html", key=None):
        paths = []
        for i, p in enumerate(packs if isinstance(packs, list) else [packs]):
            path = os.path.join(self.dir, f"pack{i}.json")
            with open(path, "w") as f:
                json.dump(p, f)
            paths.append(path)
        args = [sys.executable, BUILD, "--pack", *paths, "--repo", self.dir]
        if out and "--thumb" not in extra and "--check" not in extra:
            args += ["--out", os.path.join(self.dir, out)]
        if key:
            args += ["--key-pattern", key]
        r = subprocess.run(args + list(extra), capture_output=True, text=True)
        html = open(os.path.join(self.dir, out)).read() if r.returncode == 0 and out and os.path.exists(os.path.join(self.dir, out)) and "--thumb" not in extra else None
        return r, html

    def refused(self, pack, needle, *extra, **kw):
        r, _ = self.run_build(pack, *extra, **kw)
        self.assertNotEqual(r.returncode, 0, r.stdout)
        self.assertIn(needle, r.stderr)
        self.assertNotIn(KEY, r.stderr)
        return r.stderr


class TestSecrets(BuildCase):
    def with_api(self, **fields):
        p = base_pack()
        p["tcs"][0]["evidence"].append(dict({"type": "api", "label": "call", "method": "GET", "url": "https://staging.example.test/api"}, **fields))
        return p

    def test_tokens_jwts_private_keys_and_cloud_keys_anywhere_by_path(self):
        self.refused(self.with_api(request="Authorization: Bearer " + KEY), "tcs[0].evidence[1].request holds")
        self.refused(self.with_api(response="eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl"), "a JWT")
        self.refused(base_pack(summary="-----BEGIN RSA PRIVATE KEY-----"), "a private key")
        self.refused(base_pack(summary="key AKIAABCDEFGHIJKLMNOP leaked"), "a cloud access key")

    def test_values_under_secret_named_keys_unless_masked(self):
        for body in ({"newPassword": KEY}, {"X-Auth-Token": KEY}, {"service_role_key": KEY}):
            self.refused(self.with_api(request=json.dumps(body)), "tcs[0].evidence[1].request holds")
        for masked in ("<redacted>", "[REDACTED]", "ab****", "***", "$API_TOKEN_DEMO", "${API_TOKEN}"):
            r, _ = self.run_build(self.with_api(request=json.dumps({"password": masked})))
            self.assertEqual(r.returncode, 0, f"{masked}: {r.stderr}")

    def test_header_list_shapes_and_json_bodies_kept_as_strings(self):
        self.refused(self.with_api(request=json.dumps([["Authorization", KEY]])), "a value under a secret-named key")
        self.refused(self.with_api(request=json.dumps({"headers": [{"name": "X-Api-Key", "value": KEY}]})), "a value under a secret-named key")

    def test_secret_assignments_and_cookies_in_raw_text(self):
        self.refused(self.with_api(curl=f"curl 'https://x.test/?api_key={KEY}'"), "a key or password")
        self.refused(self.with_api(curl=f"curl -H 'Accept: */*; Cookie: sid={KEY}'"), "a cookie header")
        self.refused(self.with_api(request=f'{{"password": "{KEY}"}}'), "tcs[0].evidence[1].request")

    def test_any_authorization_scheme(self):
        for scheme in ("Basic", "Token", "Digest", "ApiKey"):
            self.refused(self.with_api(request=f"Authorization: {scheme} {KEY}"), "an Authorization header")

    def test_token_and_signature_query_parameters(self):
        for q in ("access_token", "token", "refresh_token"):
            self.refused(self.with_api(url=f"https://x.test/cb?{q}={KEY}"), "tcs[0].evidence[1].url")
        self.refused(self.with_api(url=f"https://store.test/f.png?sv=1&sig={KEY}"), "a token or signature in a URL")
        self.refused(self.with_api(url=f"https://x.test/cb?code={KEY}"), "a token or signature in a URL")

    def test_reference_header_and_storage_key_shapes(self):
        self.refused(self.with_api(curl=f"curl -H 'Ocp-Apim-Subscription-Key: {'a1' * 10}'"), "tcs[0].evidence[1].curl")
        self.refused(self.with_api(request=f"DefaultEndpointsProtocol=https;AccountKey={'A' * 40}"), "tcs[0].evidence[1].request")

    def test_a_real_value_ending_in_stars_is_not_a_mask(self):
        self.refused(self.with_api(request=json.dumps({"password": "RealValue***"})), "tcs[0].evidence[1].request holds")

    def test_sql_cells_under_a_secret_column(self):
        sql = {"type": "sql", "label": "users", "db": "staging", "query": "select email, api_token from users", "columns": ["email", "api_token"], "rows": [["qa@example.test", KEY]]}
        p = base_pack(); p["tcs"][0]["evidence"].append(sql)
        self.refused(p, "pack.tcs[0].evidence[1].rows[0][1] holds a value in a secret-named SQL column")
        sql["rows"] = [["qa@example.test", "<redacted>"]]
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_vendor_token_shapes(self):
        for token in ("ghp_" + "a" * 36, "glpat-" + "a" * 20, "xoxb-" + "1" * 12, "sk_live_" + "a" * 16, "AIza" + "a" * 35, "sk-" + "a" * 24):
            self.refused(base_pack(summary=f"leaked {token}"), "pack.summary holds")

    def test_emails_only_warn_and_ordinary_data_passes(self):
        p = self.with_api(response='{"orderId": "demo-order-9", "total": 42.5, "owner": "qa@example.test"}', flags=["Token redacted", "Response trimmed"],
                          curl='curl -H "Authorization: Bearer $API_TOKEN_DEMO" https://staging.example.test/api')
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("warning:", r.stderr)
        self.assertIn("qa@example.test", r.stderr)


class TestValidation(BuildCase):
    def test_the_replaced_format_is_refused_in_one_line(self):
        stderr = self.refused(base_pack(schema="evidence-pack/1.0"), "evidence-pack/1.0 was replaced by evidence-pack/2.0")
        self.assertEqual(len(stderr.strip().splitlines()), 1)

    def test_unknown_fields_are_refused(self):
        p = base_pack(); p["tcs"][0]["evidance"] = []
        self.refused(p, "evidance is not a field of evidence-pack/2.0")

    def test_statuses_per_field(self):
        p = base_pack(); p["tcs"][0]["status"] = "RETEST PASSED"
        self.refused(p, "(tcs[] statuses)")
        p = base_pack(bugs=[{"id": "DEMO-7009", "title": "bug", "status": "PASSED"}])
        self.refused(p, "(bugs[] statuses)")

    def test_ticket_keys_follow_the_board_pattern(self):
        self.refused(base_pack(), "must match the ticket key pattern ^BK-\\d+$", key=r"^BK-\d+$")
        p = base_pack(); p["ticket"]["id"] = "BK-7012"
        r, _ = self.run_build(p, key=r"^BK-\d+$")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.refused(base_pack(bugs=[{"id": "nope", "title": "bug", "status": "OPEN"}]), "a bug card id must match the ticket key pattern")

    def test_observation_reason_and_follow_up(self):
        p = base_pack(); p["tcs"][0]["evidence"] = []
        self.refused(p, "PASSED and FAILED only on observation")
        p = base_pack(); p["ticket"]["verdict"] = "PENDING"
        p["tcs"].append({"id": "DEMO-7001-TC2", "title": "Receipt", "status": "BLOCKED"})
        self.refused(p, "a BLOCKED case needs the reason")
        p = base_pack(); p["tcs"].append({"id": "DEMO-7001-TC3", "title": "Saved cards", "status": "DEFERRED", "note": "flag off in staging"})
        self.refused(p, "a DEFERRED reason names the follow-up ticket")
        p["tcs"][1]["note"] = "flag off in staging; deferred to DEMO-7130"
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("DEFERRED, outside this PASSED verdict", r.stderr)

    def test_a_contradicted_verdict_is_refused_and_history_never_counts(self):
        p = base_pack(); p["ticket"]["verdict"] = "FAILED"
        self.refused(p, "ticket.verdict FAILED contradicts the current cases")
        bug = self.retest_pack("PASSED")
        r, _ = self.run_build(bug)
        self.assertEqual(r.returncode, 0, r.stderr)

    def retest_pack(self, status, verdict=None):
        return base_pack(kind="bug", ticket={"id": "DEMO-7009", "title": "Bug", "verdict": verdict or status},
                         images={"a": {"file": "a.png"}, "b": {"file": "b.png"}}, currentRound=1,
                         rounds=[{"round": 0, "date": "2026-10-24", "build": "v1"}, {"round": 1, "date": "2026-10-25", "build": "v2"}],
                         tcs=[{"id": "DEMO-7009-retest-1", "kind": "retest", "round": 1, "title": "Retest", "status": status,
                               "evidence": [{"type": "image", "ref": "b", "result": "pass"}, {"type": "image", "ref": "a", "round": 0, "result": "defect"}],
                               "compare": {"left": {"image": "a"}, "right": {"image": "b"}}},
                              {"id": "DEMO-7009-repro", "kind": "repro", "title": "Repro", "status": "FAILED", "evidence": []}])

    def test_a_retest_never_passes_on_a_deferral(self):
        p = self.retest_pack("PASSED")
        p["tcs"].append({"id": "DEMO-7009-TC2", "round": 1, "title": "Other", "status": "DEFERRED", "note": "later, DEMO-7031"})
        self.refused(p, "a retest cannot pass on a deferral")

    def test_retest_passed_card_agrees_with_the_bug_pack(self):
        story = base_pack(bugs=[{"id": "DEMO-7009", "title": "Bug", "status": "RETEST PASSED"}])
        self.refused([story, self.retest_pack("FAILED")], "RETEST PASSED contradicts its own pack (verdict FAILED)")
        r, _ = self.run_build([story, self.retest_pack("PASSED")])
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_links_rendered_as_href(self):
        for bad in ("javascript:alert(1)", "data:text/html,x", "/relative"):
            self.refused(base_pack(bugs=[{"id": "DEMO-7009", "title": "b", "status": "OPEN", "url": bad}]), "must be an absolute http(s) URL or a #PACK.CASE deep link")
        for good in ("https://claude.ai/artifact/abc", "#DEMO-7009"):
            r, _ = self.run_build(base_pack(bugs=[{"id": "DEMO-7009", "title": "b", "status": "OPEN", "url": good}]))
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_a_mark_outside_its_image_is_refused(self):
        p = base_pack(); p["tcs"][0]["evidence"][0]["annotations"][0]["x"] = 390
        self.refused(p, "lies outside the 400x300 image")

    def test_check_mode_validates_without_writing(self):
        r, _ = self.run_build(base_pack(), "--check", out=None)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("valid evidence-pack/2.0", r.stdout)


class TestDeferral(BuildCase):
    OK = {"by": "Owner (demo)", "at": "2026-11-05T14:30:00Z", "pointer": "https://tracker.example.test/browse/DEMO-7001?focusedCommentId=9", "cases": ["DEMO-7001-TC2"]}

    def story(self, verdict, ok=OK, label="not-fully-tested", passed=False):
        p = base_pack()
        p["ticket"]["verdict"] = verdict
        deferred = {"id": "DEMO-7001-TC2", "title": "Saved cards", "status": "DEFERRED", "note": "flag off in staging; deferred to DEMO-7130"}
        p["tcs"] = ([p["tcs"][0]] if passed else []) + [deferred]
        deferral = dict({"label": label} if label is not None else {}, **({"ok": copy.deepcopy(ok)} if ok is not None else {}))
        if deferral:
            p["ticket"]["deferral"] = deferral
        return p

    def passes(self, pack):
        r, html = self.run_build(pack)
        self.assertEqual(r.returncode, 0, r.stderr)
        return r, html

    def test_a_covering_ok_ends_pending_on_a_deferrals_only_story(self):
        _, html = self.passes(self.story("PASSED WITH DEFERRALS"))
        self.assertEqual(embedded(html)[0]["ticket"]["deferral"], {"label": "not-fully-tested", "ok": self.OK})
        self.refused(self.story("PENDING"), "they allow PASSED WITH DEFERRALS: the owner OK covers every deferred case")
        self.refused(self.story("PASSED"), "ticket.verdict PASSED contradicts the current cases")

    def test_without_an_ok_a_deferrals_only_story_stays_pending(self):
        for ok in (None, {}):
            self.passes(self.story("PENDING", ok=ok))
            self.refused(self.story("PASSED WITH DEFERRALS", ok=ok), "waiting for owner OK on DEMO-7001-TC2")
        self.passes(self.story("PENDING", ok=None, label=None))

    def test_the_ok_covers_only_the_cases_it_lists(self):
        p = self.story("PASSED WITH DEFERRALS", passed=True)
        p["tcs"].append({"id": "DEMO-7001-TC3", "title": "Receipt", "status": "DEFERRED", "note": "mail sink down, DEMO-7131"})
        self.refused(p, "waiting for owner OK on DEMO-7001-TC3")
        p["ticket"]["verdict"] = "PENDING"
        self.passes(p)
        p["ticket"]["deferral"]["ok"]["cases"].append("DEMO-7001-TC3")
        p["ticket"]["verdict"] = "PASSED WITH DEFERRALS"
        self.passes(p)

    def test_the_ok_lists_only_current_deferred_cases(self):
        for stray in ("DEMO-7001-TC1", "DEMO-7001-TC9"):
            self.refused(self.story("PASSED WITH DEFERRALS", ok=dict(self.OK, cases=["DEMO-7001-TC2", stray]), passed=True), f"lists {stray}, which is not a current DEFERRED case")
        p = self.story("PENDING")
        p["currentRound"] = 1
        p["tcs"][0]["round"] = 0
        p["tcs"].append({"id": "DEMO-7001-TC4", "title": "Later round", "status": "BLOCKED", "round": 1, "note": "sink down"})
        self.refused(p, "lists DEMO-7001-TC2, which is not a current DEFERRED case")

    def test_the_label_is_required_for_the_result(self):
        for label in (None, "  "):
            self.refused(self.story("PASSED WITH DEFERRALS", label=label), "ticket.deferral.label is missing")
            self.passes(self.story("PENDING", label=label))

    def test_an_incomplete_ok_is_refused_by_field(self):
        without = lambda key: {k: v for k, v in self.OK.items() if k != key}
        record = dict(without("pointer"), record="owner OK given in session: both cases accepted")
        self.passes(self.story("PASSED WITH DEFERRALS", ok=record))
        self.passes(self.story("PASSED WITH DEFERRALS", ok=dict(self.OK, pointer="board:deferral-DEMO-7001-TC2")))
        for ok, needle in (
            (without("by"), "ticket.deferral.ok.by is required"),
            (without("at"), "ticket.deferral.ok.at is required"),
            (dict(self.OK, at="2026-11-05"), "ok.at must be a timestamp"),
            (without("pointer"), "exactly one of pointer"),
            (dict(self.OK, pointer="  "), "exactly one of pointer"),
            (dict(record, pointer=self.OK["pointer"]), "exactly one of pointer"),
            (dict(self.OK, pointer="the owner said yes"), "ok.pointer must be an absolute http(s) URL or board:<need-id>"),
            (dict(self.OK, pointer="board:"), "ok.pointer must be an absolute http(s) URL"),
            (dict(self.OK, pointer="javascript:alert(1)"), "ok.pointer must be an absolute http(s) URL"),
            (dict(record, record="the conductor says owner OK given in session"), "ok.record must start with"),
            (without("cases"), "ok.cases must list the covered case ids"),
            (dict(self.OK, cases=[]), "ok.cases must list the covered case ids"),
            (dict(self.OK, aproved=True), "aproved is not a field"),
            ("yes", "ticket.deferral.ok must be an object"),
        ):
            self.refused(self.story("PENDING", ok=ok), needle)

    def test_a_bug_never_passes_on_a_deferral_ok_or_not(self):
        p = TestValidation.retest_pack(self, "PASSED")
        p["tcs"] = [{"id": "DEMO-7009-TC2", "round": 1, "title": "Other", "status": "DEFERRED", "note": "later, DEMO-7031"}, p["tcs"][1]]
        for verdict in ("PASSED", "PASSED WITH DEFERRALS"):
            p["ticket"]["verdict"] = verdict
            self.refused(p, "a retest cannot pass on a deferral")
        p["ticket"]["verdict"] = "PENDING"
        self.passes(p)
        p["ticket"]["deferral"] = {"label": "not-fully-tested", "ok": dict(self.OK, cases=["DEMO-7009-TC2"])}
        self.refused(p, "ticket.deferral belongs to a story pack")
        found = base_pack(kind="bug")
        found["ticket"]["verdict"] = "PASSED WITH DEFERRALS"
        found["tcs"].append({"id": "DEMO-7001-TC2", "title": "Other", "status": "DEFERRED", "note": "later, DEMO-7031"})
        self.refused(found, "a bug never passes on a deferral")

    def test_a_failed_or_blocked_case_outranks_the_ok(self):
        for status, verdict in (("FAILED", "FAILED"), ("BLOCKED", "PENDING")):
            p = self.story("PASSED WITH DEFERRALS")
            p["tcs"].append({"id": "DEMO-7001-TC3", "title": "Other", "status": status, "note": "sink down", "url": "https://claude.ai/artifact/abc"})
            self.refused(p, f"they allow {verdict}: DEMO-7001-TC3 is {status}")

    def test_a_pack_with_ticket_deferral_never_reads_plain_passed(self):
        for ok, label in ((None, "not-fully-tested"), (None, None), (dict(self.OK, cases=["DEMO-7001-TC2"]), None)):
            p = self.story("PASSED", ok=ok, label=label, passed=True)
            p["ticket"].setdefault("deferral", {})
            gap = "ticket.deferral.label is missing" if ok else "waiting for owner OK on DEMO-7001-TC2"
            self.refused(p, f"they allow PENDING: {gap}")
            p["ticket"]["verdict"] = "PENDING"
            self.passes(p)
        covered = self.story("PASSED", passed=True)
        self.refused(covered, "they allow PASSED WITH DEFERRALS: the owner OK covers every deferred case")
        covered["ticket"]["verdict"] = "PENDING"
        self.refused(covered, "they allow PASSED WITH DEFERRALS")
        covered["ticket"]["verdict"] = "PASSED WITH DEFERRALS"
        self.passes(covered)

    def test_ticket_deferral_with_no_current_deferred_case_still_reads_passed(self):
        p = base_pack()
        p["ticket"]["deferral"] = {}
        self.passes(p)

    def test_a_passed_pack_with_no_ticket_deferral_still_builds_with_a_warning(self):
        r, _ = self.passes(self.story("PASSED", ok=None, label=None, passed=True))
        self.assertIn("DEFERRED, outside this PASSED verdict", r.stderr)

    def test_the_new_fields_go_through_the_secret_scan(self):
        record = {"by": "Owner", "at": "2026-11-05T14:30:00Z", "record": f"owner OK given in session, token={KEY}", "cases": ["DEMO-7001-TC2"]}
        self.refused(self.story("PASSED WITH DEFERRALS", ok=record), "pack.ticket.deferral.ok.record holds")
        self.refused(self.story("PASSED WITH DEFERRALS", ok=dict(self.OK, pointer=f"https://x.test/c?sig={KEY}")), "pack.ticket.deferral.ok.pointer holds")


class TestPage(BuildCase):
    def test_the_template_is_filled_once_and_titled(self):
        r, html = self.run_build(base_pack(summary="</script><script>alert(1)</script>"))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(html.startswith("<title>DEMO-7001 Evidence</title>"))
        for marker in ("/*__SHARED_CSS__*/", "/*__SHARED_JS__*/", "/*__PACKS__*/"):
            self.assertNotIn(marker, html)
        self.assertNotIn("</script><script>alert(1)", html)      # `</` can never close the data script
        packs = embedded(html)
        self.assertEqual(packs[0]["summary"], "</script><script>alert(1)</script>")
        self.assertTrue(packs[0]["images"]["a"]["src"].startswith("data:image/jpeg;base64,"))
        self.assertIn("fonts.googleapis.com", html)

    def test_local_host_writes_a_standalone_document(self):
        r, html = self.run_build(base_pack(), "--standalone")
        self.assertTrue(html.startswith("<!doctype html>\n<title>"))

    def test_px_marks_become_fractions(self):
        _, html = self.run_build(base_pack())
        a = embedded(html)[0]["tcs"][0]["evidence"][0]
        self.assertEqual(a["coords"], "fraction")
        self.assertEqual((a["annotations"][0]["x"], a["annotations"][0]["w"]), (0.1, 0.55))

    def test_rounds_history_and_compare_labels(self):
        p = TestValidation.retest_pack(self, "PASSED")
        _, html = self.run_build(p)
        packed = embedded(html)[0]
        retest, repro = packed["tcs"]
        self.assertTrue(repro["hist"]); self.assertEqual(repro["histRound"], 0)
        self.assertTrue(retest["evidence"][1]["hist"])
        self.assertNotIn("hist", retest)
        self.assertEqual(retest["compare"]["left"]["label"], "BEFORE FIX (round 0, build v1, 2026-10-24)")
        self.assertEqual(retest["compare"]["left"]["tone"], "before")
        self.assertEqual(retest["compare"]["right"]["label"], "AFTER FIX (retest 1, build v2, 2026-10-25)")
        self.assertEqual(retest["compare"]["right"]["tone"], "ok")
        p = base_pack(images={"a": {"file": "a.png"}, "b": {"file": "b.png"}})
        p["tcs"][0]["compare"] = {"left": {"image": "a", "detail": "TC1 run"}, "right": {"image": "b"}}
        _, html = self.run_build(p)
        cmp = embedded(html)[0]["tcs"][0]["compare"]
        self.assertEqual((cmp["left"]["label"], cmp["right"]["label"], cmp["left"]["short"]), ("EXPECTED · TC1 run", "ACTUAL", "expected"))

    def test_redactions_burn_into_the_page_pixels(self):
        p = base_pack(); p["images"]["a"]["redact"] = [[40, 100, 220, 20]]
        _, html = self.run_build(p)
        self.assertTrue(near(pixel_of(embedded(html)[0]["images"]["a"]["src"], (150, 110)), GRAY))

    def test_two_keys_on_one_file_burn_the_union(self):
        p = base_pack(images={"a": {"file": "a.png", "redact": [[40, 100, 220, 20]]}, "b": {"file": "./a.png"}})
        p["tcs"][0]["evidence"].append({"type": "image", "ref": "b"})
        _, html = self.run_build(p)
        imgs = embedded(html)[0]["images"]
        self.assertTrue(near(pixel_of(imgs["b"]["src"], (150, 110)), GRAY))
        self.assertEqual(imgs["a"]["src"], imgs["b"]["src"])

    def test_a_jpeg_capture_takes_a_burned_redaction(self):
        shot(os.path.join(self.dir, "c.jpg"), fmt="JPEG")
        p = base_pack(images={"a": {"file": "c.jpg", "redact": [[40, 100, 220, 20]]}})
        r, html = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(near(pixel_of(embedded(html)[0]["images"]["a"]["src"], (150, 110)), GRAY))

    def test_capture_metadata_never_reaches_the_page(self):
        im = Image.new("RGB", (64, 48), (200, 200, 200))
        exif = Image.Exif(); exif[0x010E] = "gps 40.4,-3.7"
        im.save(os.path.join(self.dir, "m.jpg"), "JPEG", comment=b"camera note", exif=exif.tobytes())
        from PIL import PngImagePlugin
        info = PngImagePlugin.PngInfo(); info.add_text("Comment", "png note")
        im.save(os.path.join(self.dir, "m.png"), "PNG", pnginfo=info)
        for f in ("m.jpg", "m.png"):
            p = base_pack(images={"a": {"file": f}}); p["tcs"][0]["evidence"][0]["annotations"] = []
            _, html = self.run_build(p)
            raw = base64.b64decode(embedded(html)[0]["images"]["a"]["src"].split(",", 1)[1])
            out = Image.open(io.BytesIO(raw))
            self.assertNotIn("comment", out.info, f)
            self.assertNotIn("exif", out.info, f)
            for text in (b"camera note", b"png note", b"gps"):
                self.assertNotIn(text, raw, f)

    def test_image_paths_are_refused_outside_the_repo_and_for_session_state(self):
        os.makedirs(os.path.join(self.dir, ".auth"))
        shot(os.path.join(self.dir, ".auth", "s.png"))
        outside = tempfile.mkdtemp()
        shot(os.path.join(outside, "o.png"))
        with open(os.path.join(self.dir, "fake.png"), "w") as f:
            f.write("not an image")
        cases = {".auth/s.png": "points into an .auth folder", "session.har": "is a HAR, trace or state file", "trace.zip": "is a HAR, trace or state file",
                 os.path.join(outside, "o.png"): "resolves outside the repo root", "fake.png": "is not a PNG or JPEG file", "gone.png": "missing file gone.png"}
        for f, msg in cases.items():
            self.refused(base_pack(images={"a": {"file": f}}), msg)
        shutil.rmtree(outside)
        shot(os.path.join(self.dir, "contract-trace.png"))
        r, _ = self.run_build(base_pack(images={"a": {"file": "contract-trace.png"}}))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_the_size_guard_names_the_largest_images(self):
        stderr = self.refused(base_pack(), "over the 0.01 MB guard (artifact limit 16 MB). Largest images: a (", "--max-mb", "0.01")
        self.assertIn("Drop screenshots", stderr)
        self.refused(base_pack(), "--max-mb must be between 0 and 16", "--max-mb", "17")

    def test_extract_round_trip_builds_the_same_page_data(self):
        p = base_pack(); p["images"]["a"]["redact"] = [[40, 100, 220, 20]]
        _, html = self.run_build(p)
        page = os.path.join(self.dir, "out", "index.html")
        pack_out = os.path.join(self.dir, "recovered.json")
        r = subprocess.run([sys.executable, BUILD, "--extract", page, "--out", pack_out], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        recovered = json.load(open(pack_out))
        self.assertNotIn("redact", recovered["images"]["a"])
        r2, html2 = self.run_build(recovered, out="again/index.html")
        self.assertEqual(r2.returncode, 0, r2.stderr)
        self.assertEqual(embedded(html2), embedded(html))
        thumb = os.path.join(self.dir, "t.png")
        r3, _ = self.run_build(recovered, "--thumb", thumb, out=None)
        self.assertEqual(r3.returncode, 0, r3.stderr)


class TestThumbnail(BuildCase):
    def test_the_reproduction_screenshot_with_marks_and_redactions_burned(self):
        p = TestValidation.retest_pack(self, "PASSED")
        p["images"]["a"]["redact"] = [[40, 100, 220, 20]]
        p["tcs"][1]["evidence"] = [{"type": "image", "ref": "a", "result": "defect", "coords": "px",
                                    "annotations": [{"n": 1, "shape": "rect", "x": 300, "y": 200, "w": 60, "h": 40, "tone": "defect"},
                                                    {"n": 2, "shape": "bubble", "x": 200, "y": 250, "text": "Cart emptied", "tone": "note"}]}]
        out = os.path.join(self.dir, "thumb.png")
        r, _ = self.run_build(p, "--thumb", out, out=None)
        self.assertEqual(r.returncode, 0, r.stderr)
        im = Image.open(out).convert("RGB")
        self.assertEqual(im.size, (400, 300))                      # native size
        self.assertEqual(im.getpixel((150, 110)), GRAY)            # redaction burned
        self.assertEqual(im.getpixel((330, 200)), (208, 49, 45))   # the defect rect outline
        self.assertIn("2 marks from a", r.stdout)


class TestFixRound(BuildCase):
    """The reviewer's probes (VERIFY M2-M4, S1, S3, N1, N2, N6), one regression each."""

    def story_with_card(self, status="RETEST PASSED"):
        return base_pack(bugs=[{"id": "DEMO-7009", "title": "Bug", "status": status, "severity": "Major"}])

    def write(self, path, pack):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(pack, f)
        return path

    def test_m2_a_retest_pill_built_alone_agrees_with_the_pack_beside_the_story(self):
        self.write(os.path.join(self.dir, "evidence-pack-DEMO-7009.json"), TestValidation.retest_pack(self, "PASSED"))
        r, _ = self.run_build(self.story_with_card())
        self.assertEqual(r.returncode, 0, r.stderr)
        self.write(os.path.join(self.dir, "evidence-pack-DEMO-7009.json"), TestValidation.retest_pack(self, "FAILED"))
        self.refused(self.story_with_card(), "RETEST PASSED contradicts")

    def test_m2_a_pill_nothing_can_check_is_refused(self):
        stderr = self.refused(self.story_with_card(), "RETEST PASSED cannot be checked")
        self.assertIn("evidence-pack-DEMO-7009.json", stderr)
        self.assertIn("--bug-pack DEMO-7009=", stderr)

    def test_m2_the_recovered_pack_in_the_bug_folder_and_the_latest_round_win(self):
        stale = TestValidation.retest_pack(self, "FAILED"); stale["currentRound"] = 0
        stale["tcs"] = [stale["tcs"][1]]; stale["tcs"][0]["evidence"] = [{"type": "note", "body": "repro"}]
        stale.pop("rounds")
        self.write(os.path.join(self.dir, "evidence-pack-DEMO-7009.json"), stale)
        self.write(os.path.join(self.dir, ".context", "PBI", "bugs", "BUG-DEMO-7009-cart", "evidence", "evidence-pack.json"), TestValidation.retest_pack(self, "PASSED"))
        r, _ = self.run_build(self.story_with_card())
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_m2_an_explicit_bug_pack_flag(self):
        path = self.write(os.path.join(self.dir, "elsewhere", "bug.json"), TestValidation.retest_pack(self, "FAILED"))
        r, _ = self.run_build(self.story_with_card("RETEST FAILED"), "--bug-pack", f"DEMO-7009={path}")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_m3_after_extract_two_keys_on_one_image_burn_the_union(self):
        p = base_pack(images={"a": {"file": "a.png"}, "b": {"file": "a.png"}})
        p["tcs"][0]["evidence"].append({"type": "image", "ref": "b", "result": "defect"})
        _, html = self.run_build(p)
        page = os.path.join(self.dir, "out", "index.html")
        rec = os.path.join(self.dir, "rec.json")
        subprocess.run([sys.executable, BUILD, "--extract", page, "--out", rec], check=True, capture_output=True)
        recovered = json.load(open(rec))
        recovered["images"]["a"]["redact"] = [[40, 100, 220, 20]]
        _, html2 = self.run_build(recovered, out="again/index.html")
        imgs = embedded(html2)[0]["images"]
        self.assertTrue(near(pixel_of(imgs["a"]["src"], (150, 110)), GRAY))
        self.assertTrue(near(pixel_of(imgs["b"]["src"], (150, 110)), GRAY))
        thumb = os.path.join(self.dir, "t.png")
        r, _ = self.run_build(recovered, "--thumb", thumb, out=None)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(near(Image.open(thumb).convert("RGB").getpixel((150, 110)), GRAY))

    def test_m4_a_worktree_builds_a_pack_in_the_primary_checkout(self):
        primary = os.path.join(self.dir, "primary")
        os.makedirs(primary)
        git = lambda *a, cwd=primary: subprocess.run(["git", *a], cwd=cwd, check=True, capture_output=True)
        git("init", "-q"); git("-c", "user.email=t@example.test", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init")
        wt = os.path.join(self.dir, "wt")
        git("worktree", "add", "-q", wt)
        ev = os.path.join(primary, ".context", "PBI", "stories", "STORY-DEMO-7001-x", "evidence")
        os.makedirs(ev); shot(os.path.join(ev, "DEMO-7001-tc1.png"))
        for f in (os.path.join(ev, "DEMO-7001-tc1.png"), os.path.relpath(os.path.join(ev, "DEMO-7001-tc1.png"), primary)):
            pack = self.write(os.path.join(ev, "evidence-pack.json"), base_pack(images={"a": {"file": f}}))
            r = subprocess.run([sys.executable, BUILD, "--pack", pack, "--out", os.path.join(ev, "page.html")], cwd=wt, capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, f"{f}: {r.stderr}")

    def test_s1_the_prescribed_bearer_placeholder_passes_and_a_real_token_does_not(self):
        p = base_pack(); p["tcs"][0]["evidence"].append({"type": "api", "label": "x", "request": json.dumps({"headers": {"Authorization": "Bearer <redacted>"}})})
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        p["tcs"][0]["evidence"][1]["request"] = json.dumps({"headers": {"Authorization": "Bearer " + KEY}})
        self.refused(p, "tcs[0].evidence[1].request")

    def test_s3_a_passed_case_whose_evidence_lives_at_its_url(self):
        p = base_pack(); p["tcs"][0]["evidence"] = []; p["tcs"][0]["url"] = "https://claude.ai/artifact/abc"
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        p["tcs"][0]["url"] = "#DEMO-7001"
        self.refused(p, "PASSED and FAILED only on observation")

    def test_n1_the_key_pattern_matches_the_whole_id(self):
        p = base_pack(); p["ticket"]["id"] = "xDEMO-7001y"
        self.refused(p, "must match the ticket key pattern", key=r"DEMO-\d+")

    def test_n2_a_count_is_not_a_secret(self):
        sql = {"type": "sql", "label": "usage", "query": "select token_count, api_token from usage", "columns": ["token_count", "api_token"], "rows": [[1234, "<redacted>"]]}
        p = base_pack(); p["tcs"][0]["evidence"].append(sql)
        r, _ = self.run_build(p)
        self.assertEqual(r.returncode, 0, r.stderr)
        sql["rows"] = [[1234, KEY]]
        self.refused(p, "rows[0][1] holds a value in a secret-named SQL column")

    def test_n6_an_inline_image_with_metadata_is_re_encoded_clean(self):
        from PIL import PngImagePlugin
        buf = io.BytesIO(); info = PngImagePlugin.PngInfo(); info.add_text("Comment", "png note")
        Image.new("RGB", (400, 300), (200, 200, 200)).save(buf, "PNG", pnginfo=info)
        p = base_pack(images={"a": {"src": "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()}})
        _, html = self.run_build(p)
        src = embedded(html)[0]["images"]["a"]["src"]
        self.assertTrue(src.startswith("data:image/jpeg;base64,"))
        self.assertNotIn(b"png note", base64.b64decode(src.split(",", 1)[1]))


if __name__ == "__main__":
    unittest.main()
