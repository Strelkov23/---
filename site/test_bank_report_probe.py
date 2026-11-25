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

    def test_form135_metadata(self):
        for method in ["Data135FormFullXML","Data135MetaFullXML"]:
            self.assertIn(method.encode(),p.request(12,"2026-10-01",method))
            raw=(f'<s:Envelope xmlns:s="{d.SOAP}"><s:Body><{method}Response xmlns="{d.NS}"><{method}Result><rows><row/></rows></{method}Result></{method}Response></s:Body></s:Envelope>').encode()
            self.assertEqual(p.inspect_xml(raw,method)["bytes"],len(raw))
            with self.assertRaises(ValueError):p.inspect_xml(raw.replace(b"<rows><row/></rows>",b""),method)
        with self.assertRaises(ValueError):p.request(1,"2026-10-01","UnknownMethod")

    def test_catalogue_latest_zip_and_rar(self):
        urls=["https://www.cbr.ru/vfs/credit/forms/"+x for x in ("123-20240101.zip","123-20241001.rar","135-20240101.rar","135-20240230.rar","135-20990101.rar","101-20241001.rar")]
        urls+=["https://example.org/vfs/credit/forms/123-20250101.rar","https://www.cbr.ru/vfs/credit/forms/123-20250101.rar?x=1"]
        result=p.archive_candidates(urls)
        self.assertEqual([(x["form"],x["date"],x["url"].split("/")[-1]) for x in result],[("123","2024-10-01","123-20241001.rar"),("135","2024-01-01","135-20240101.rar")])
    def test_rar_structure_and_unsafe_name(self):
        raw=bytearray(69);struct.pack_into("<IHH",raw,4,1,65,4);raw[32:36]=b"CODE";raw[43]=ord("C");raw[48]=3;raw[64]=13;raw[65:69]=b" 000"
        calls=[]
        def reader(args,limit):
            calls.append(args)
            return b"data/123.dbf\nreadme.txt\n" if args[0]=="-tf" else bytes(raw)
        archive=b"Rar!\x1a\x07\x00dummy"
        result=p.inspect_rar(archive,reader)
        self.assertEqual(result["members"][0]["rows"],1)
        self.assertEqual(calls[1][-2:],["--","data/123.dbf"])
        for name in (b"../bad.dbf",b"/bad.dbf",b"a*.dbf",b"a.dbf\na.dbf"):
            with self.subTest(name=name),self.assertRaises(ValueError):
                p.inspect_rar(archive,lambda args,limit:name)
        with self.assertRaises(ValueError):p.inspect_rar(b"not-rar",reader)
