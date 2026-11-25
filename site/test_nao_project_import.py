import unittest
from unittest.mock import patch
import nao_project_import as p
class Import(unittest.TestCase):
    def test_units(self):
        self.assertEqual(p.amount(12345),"12.345")
        self.assertEqual(p.amount(0),"0")
        self.assertIsNone(p.amount("1000"))
        self.assertIsNone(p.amount("нет данных"))
        with self.assertRaises(ValueError):p.amount(-1)
        with self.assertRaises(ValueError):p.amount(float("inf"))
    def test_exact_edition(self):
        with self.assertRaises(ValueError):p.parse(b"not the workbook","completed")
    def test_no_followup_after_denial(self):
        from urllib.error import HTTPError
        calls=[]
        def fetch(url,**kwargs):
            calls.append(url);raise HTTPError(url,403,"Forbidden",{},None)
        with self.assertRaises(HTTPError):p.fetch_all(fetch)
        self.assertEqual(len(calls),1)
