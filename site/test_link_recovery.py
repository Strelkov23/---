import unittest
from unittest.mock import patch,MagicMock
from urllib.error import HTTPError
import link_audit
class LinkRecovery(unittest.TestCase):
    def test_range(self):
        url="https://rosstat.gov.ru/test.xlsx"
        reply=MagicMock();reply.__enter__.return_value.status=200
        with patch.object(link_audit,"urlopen",side_effect=[HTTPError(url,416,"range",{},None),reply]) as get:
            self.assertEqual(link_audit.http_check(url),(url,"ok","200 (без Range)"))
            self.assertEqual(get.call_count,2)
            self.assertIsNone(get.call_args.args[0].get_header("Range"))
    def test_restricted(self):
        url="https://fedstat.ru/indicator/1"
        with patch.object(link_audit,"urlopen",side_effect=HTTPError(url,403,"forbidden",{},None)) as get:
            self.assertEqual(link_audit.http_check(url),(url,"restricted","403"))
            self.assertEqual(get.call_count,1)
    def test_unknown(self):
        with patch.object(link_audit,"urlopen") as get:
            self.assertEqual(link_audit.http_check("https://example.test/")[1],"unchecked")
            get.assert_not_called()
