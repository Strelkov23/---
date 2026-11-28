#!/usr/bin/env python3
"""Read-only public release smoke test. No model or external research requests."""
import argparse
import hashlib
import json
import re
import subprocess
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

SCRIPTS = ("global-economic-assistant.js", "economic-ai-page-context.js", "economic-ai-scenario.js")
PAGES = ("index.html", "historical.html", "papers.html", "analyst-cockpit.html")
MAX_BYTES = 8 * 1024 * 1024

class ShellProbe(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = set()
        self.scripts = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "script" and "src" in attrs:
            self.scripts.add(attrs["src"])

def validate_base(value):
    p = urlsplit(value)
    if p.scheme != "https" or not p.hostname or p.username or p.password or p.query or p.fragment:
        raise ValueError("Provide the exact HTTPS GitHub Pages site root")
    return value.rstrip("/") + "/"

def check_revision(value):
    if not re.fullmatch(r"[a-f0-9]{40}", value):
        raise ValueError("Expected complete git source revision")
    return value

def fetch(base, name, revision):
    url = urljoin(base, name) + "?source=" + revision
    with urlopen(Request(url, headers={"Cache-Control": "no-cache"}), timeout=30) as response:
        if response.geturl().split("?")[0] != url.split("?")[0]:
            raise ValueError("Unexpected redirect: " + name)
        raw = response.read(MAX_BYTES + 1)
    if not raw or len(raw) > MAX_BYTES:
        raise ValueError("Empty or oversized response: " + name)
    return raw

def source_bytes(revision, name):
    return subprocess.check_output(["git", "show", revision + ":site/" + name])

def probe(base, revision, reader=fetch, source=source_bytes):
    base, revision = validate_base(base), check_revision(revision)
    results = []
    def test(name, fn):
        try:
            fn()
            results.append({"name": name, "pass": True})
        except (OSError, ValueError, UnicodeError, subprocess.SubprocessError) as exc:
            results.append({"name": name, "pass": False, "error": str(exc)[:300]})
    def require(condition, reason):
        if not condition:
            raise ValueError(reason)
    def revision_test():
        current = reader(base, "source-version.txt", revision).decode("utf-8").strip()
        require(current == revision, "Public source revision differs: " + current[:100])
    test("source-version.txt", revision_test)
    for name in SCRIPTS:
        def script_test(name=name):
            raw = reader(base, name, revision)
            expected = source(revision, name)
            require(hashlib.sha256(raw).digest() == hashlib.sha256(expected).digest(), "Public script differs from source")
        test(name, script_test)
    for name in PAGES:
        def page_test(name=name):
            parser = ShellProbe()
            parser.feed(reader(base, name, revision).decode("utf-8"))
            require({"gea-toggle", "gea-panel", "gea-question", "gea-model"} <= parser.ids, "Assistant controls missing")
            require(set(SCRIPTS) <= parser.scripts, "Assistant scripts missing")
        test(name, page_test)
    return {"source_revision": revision, "passed": all(x["pass"] for x in results), "checks": results,
            "limit": "Checks exact code and static HTML only. No live model inference or external catalog availability claim."}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="Exact published HTTPS site root")
    parser.add_argument("--revision", required=True, help="40-character source commit in local git checkout")
    args = parser.parse_args()
    result = probe(args.base, args.revision)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(0 if result["passed"] else 1)

if __name__ == "__main__":
    main()
