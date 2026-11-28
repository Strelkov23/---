"""Offline regression for the public release probe; no network."""
import unittest
from probe_ai_public_release import probe, SCRIPTS, PAGES

REV = "a" * 40
BASE = "https://example.test/monitor/"
HTML = ('<html>' + ''.join('<div id="' + x + '"></div>' for x in
    ("gea-toggle", "gea-panel", "gea-question", "gea-model")) +
    ''.join('<script src="' + x + '"></script>' for x in SCRIPTS) + '</html>').encode()

class ProbeTests(unittest.TestCase):
    def setUp(self):
        self.payload = {"source-version.txt": (REV+"\n").encode()}
        self.payload.update({x: x.encode() for x in SCRIPTS})
        self.payload.update({x: HTML for x in PAGES})

    def run_probe(self):
        return probe(BASE, REV, lambda b, n, r: self.payload[n], lambda r,n: n.encode())

    def test_exact_release(self):
        result = self.run_probe()
        self.assertTrue(result["passed"])
        self.assertEqual(len(result["checks"]), 8)

    def test_stale_revision(self):
        self.payload["source-version.txt"] = ("b"*40).encode()
        result = self.run_probe()
        self.assertFalse(result["passed"])
        self.assertFalse(result["checks"][0]["pass"])

    def test_changed_script(self):
        self.payload[SCRIPTS[0]] = b"old"
        result = self.run_probe()
        self.assertFalse(result["passed"])
        self.assertFalse(result["checks"][1]["pass"])

    def test_missing_control(self):
        self.payload[PAGES[0]] = HTML.replace(b'gea-model', b'other')
        self.assertFalse(self.run_probe()["passed"])

    def test_missing_script(self):
        self.payload[PAGES[1]] = HTML.replace(SCRIPTS[1].encode(), b'other.js')
        self.assertFalse(self.run_probe()["passed"])

    def test_invalid_inputs(self):
        with self.assertRaises(ValueError):
            probe("http://example.test/", REV)
        with self.assertRaises(ValueError):
            probe(BASE, "main")
        with self.assertRaises(ValueError):
            probe("https://user:pass@example.test/", REV)

    def test_network_failure(self):
        def reader(b,n,r):
            if n==PAGES[0]:
                raise OSError("timeout")
            return self.payload[n]
        result = probe(BASE, REV, reader, lambda r,n:n.encode())
        self.assertFalse(result["passed"])
        self.assertEqual(len(result["checks"]),8)

if __name__ == "__main__":
    unittest.main()
