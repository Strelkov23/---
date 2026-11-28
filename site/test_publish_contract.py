"""Offline checks of the exact publication contract."""
import ast
import re
import unittest
from pathlib import Path

class PublishContractTests(unittest.TestCase):
    def test_hash_lists_match(self):
        path=Path(__file__).resolve().parents[1]/".github/workflows/publish.yml"
        source=path.read_text(encoding="utf-8")
        def names(key):
            found=re.findall(r"^\s*"+key+r"=(\[\"analyst-cockpit\.html\".*\])$",source,re.M)
            self.assertEqual(len(found),1,key)
            result=ast.literal_eval(found[0])
            self.assertEqual(len(result),len(set(result)))
            self.assertTrue(all(re.fullmatch(r"[a-zA-Z0-9_.-]+",n) for n in result))
            return set(result)
        generated=names("names")
        verified=names("expected_names")
        self.assertEqual(generated,verified)
        self.assertTrue({"style.css","interface.js","papers.html","literature.json","journal-evidence.json","literature-journals.csv","literature-years.csv","literature-topics.csv"}<=verified)

    def test_assistant_release_gate(self):
        root=Path(__file__).resolve().parents[1]
        source=(root/".github/workflows/publish.yml").read_text(encoding="utf-8")
        self.assertIn("node test-global-economic-assistant.js",source)
        browser=source.index("python3 ../test_chat_release_browser.py")
        self.assertLess(browser,source.index("uses: actions/upload-pages-artifact@v3"))
        self.assertLess(browser,source.index("uses: actions/deploy-pages@v4"))
        required={"global-economic-assistant.js","economic-ai-page-context.js","economic-ai-scenario.js","index.html","historical.html"}
        for key in ("names","expected_names"):
            found=re.findall(r"^\s*"+key+r"=(\[\"analyst-cockpit\.html\".*\])$",source,re.M)
            self.assertEqual(len(found),1,key)
            self.assertTrue(required<=set(ast.literal_eval(found[0])))
        self.assertTrue((root/"site/test_chat_release_browser.py").is_file())
        shell=(root/"site/shell.html").read_text(encoding="utf-8")
        for name in ("global-economic-assistant.js","economic-ai-page-context.js","economic-ai-scenario.js"):
            self.assertIn('src="'+name+'"',shell)

    def test_exact_ai_public_source_gate(self):
        root=Path(__file__).resolve().parents[1]
        source=(root/".github/workflows/publish.yml").read_text(encoding="utf-8")
        self.assertIn("source_revision: ${{ steps.archive.outputs.source_revision }}",source)
        self.assertIn('source_revision=$(cat monitor/public/source-version.txt)',source)
        self.assertIn("EXPECTED_SOURCE_REVISION: ${{ needs.build.outputs.source_revision }}",source)
        verify=source.split("      - name: Verify public deployment",1)[1]
        self.assertIn('test "$actual_source" = "$EXPECTED_SOURCE_REVISION"',verify)
        self.assertIn('assistant_pages={"index.html","historical.html","papers.html","analyst-cockpit.html"}',verify)
        self.assertIn('assert {"gea-toggle","gea-panel","gea-question","gea-model"}<=parser.ids',verify)
        self.assertIn('assert {"global-economic-assistant.js","economic-ai-page-context.js","economic-ai-scenario.js"}<=parser.scripts',verify)
        ci=(root/".github/workflows/validate.yml").read_text(encoding="utf-8")
        self.assertIn("pull_request:",ci)
        self.assertIn("python3 -m unittest -v test_probe_ai_public_release.py",ci)
        live=(root/".github/workflows/ai-live-probe.yml").read_text(encoding="utf-8")
        self.assertIn("EXPECTED_REVISION: ${{ inputs.revision }}",live)

if __name__=="__main__":
    unittest.main()
