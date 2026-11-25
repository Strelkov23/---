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

if __name__=="__main__":
    unittest.main()
