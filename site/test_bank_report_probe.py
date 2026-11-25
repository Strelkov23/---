import struct,unittest
import bank_report_probe as p
import bank_disclosure as d
class BankReportProbeTests(unittest.TestCase):
    def test_xml(self):
        raw=(f'<s:Envelope xmlns:s="{d.SOAP}"><s:Body><{p.METHOD}Response xmlns="{d.NS}"><{p.METHOD}Result><rows><row><code>000</code><value>123</value></row></rows></{p.METHOD}Result></{p.METHOD}Response></s:Body></s:Envelope>').encode()
        x=p.inspect_xml(raw)
        self.assertEqual(x["bytes"],len(raw));self.assertTrue(any(k.endswith("}code") for k in x["tags"]))
        self.assertNotIn("capital",x)
        with self.assertRaises(ValueError):p.inspect_xml(b"<!DOCTYPE a><a/>")
    def test_request(self):
        self.assertIn(b"<OnDate>2026-10-01T00:00:00</OnDate>",p.request(1,"2026-10-01"))
        with self.assertRaises(ValueError):p.request(-1,"2026-10-01")
    def test_links(self):
        self.assertEqual(p.archive_links(b'<a href="/vfs/123.zip">x</a><a href="https://example.org/123.zip">y</a>'),["https://www.cbr.ru/vfs/123.zip"])
    def test_dbf(self):
        raw=bytearray(69);struct.pack_into("<IHH",raw,4,1,65,4);raw[32:36]=b"CODE";raw[43]=ord("C");raw[48]=3;raw[64]=13;raw[65:69]=b" 000"
        x=p.inspect_dbf(bytes(raw));self.assertEqual(x["rows"],1);self.assertEqual(x["fields"][0]["name"],"CODE")
        with self.assertRaises(ValueError):p.inspect_dbf(bytes(raw[:-1]))
