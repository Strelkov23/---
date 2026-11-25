import unittest,tempfile,json
from pathlib import Path
import bank_disclosure as b
def response(method,content):
    return (f'<s:Envelope xmlns:s="{b.SOAP}"><s:Body><{method}Response xmlns="{b.NS}"><{method}Result>{content}</{method}Result></{method}Response></s:Body></s:Envelope>').encode()
class Disclosure(unittest.TestCase):
    def test_mapping(self):
        self.assertEqual(b.mapping(response("RegNumToIntCode","123.0")),123)
        with self.assertRaises(ValueError):b.mapping(response("RegNumToIntCode","0"))
        with self.assertRaises(ValueError):b.envelope("RegNumToIntCode","x","1")
    def test_dates(self):
        a="<dateTime>2026-10-01T00:00:00</dateTime>"
        self.assertEqual(b.dates(response("GetDatesForF123",a+a),"123","2026-11-25"),["2026-10-01"])
        self.assertEqual(b.dates(response("GetDatesForF123",""),"123","2026-11-25"),[])
        with self.assertRaises(ValueError):b.dates(response("GetDatesForF123",a),"123","2026-01-01")
        with self.assertRaises(ValueError):b.dates(b"<!DOCTYPE a><a/>","123","2026-11-25")
    def test_cache(self):
        directory={"datasets":{"system":{"edition":"2026-10-07","rows":[{"registration_number":str(i),"name":str(i)} for i in [4,3,2,1]]}}}
        def fetch(m,p,v):
            if m=="RegNumToIntCode":return response(m,str(100+int(v)))
            if m=="IntCodeToRegNum":return response(m,str(int(v)-100))
            return response(m,"<dateTime>2026-10-01T00:00:00</dateTime>")
        with tempfile.TemporaryDirectory() as t:
            root=Path(t);out=root/"out";old=root/"old";out.mkdir();old.mkdir()
            d=b.publish(out,old,"2026-11-25",True,directory,fetch)
            self.assertEqual(d["status"],"ok");self.assertEqual(b.quality(d)["bank_disclosure_verified_forms"],12)
            self.assertEqual([r["registration_number"] for r in d["rows"]],["1","2","3"])
            (old/b.FILE).write_bytes((out/b.FILE).read_bytes())
            def fail(*args):raise OSError("test")
            d=b.publish(out,old,"2026-12-03",True,directory,fail)
            self.assertEqual(d["status"],"cached");self.assertEqual(d["checked"],"2026-11-25")

    def test_bidirectional_mapping(self):
        self.assertEqual(b.mapping(response("RegNumToIntCode"," 1.23E2 ")),123)
        for value in ["-1","0","NaN","1.5","1e20",""]:
            with self.assertRaises(ValueError):b.mapping(response("RegNumToIntCode",value))
        self.assertEqual(b.reverse_mapping(response("IntCodeToRegNum","1481.0")),1481)
        def mismatch(m,p,v):return response(m,"123" if m=="RegNumToIntCode" else "2")
        row=b.one({"registration_number":"1","name":"А"},"2026-11-25",mismatch)
        self.assertIsNone(row["internal_code"]);self.assertEqual(row["forms"],{});self.assertIn("Обратное",row["error"])
        self.assertIn(b"IntNumber",b.envelope("IntCodeToRegNum","IntNumber",123))

    def test_soap12_fallback(self):
        from unittest.mock import patch,MagicMock
        from urllib.error import HTTPError
        raw=response("RegNumToIntCode","123").replace(b.SOAP.encode(),b.SOAP12.encode())
        self.assertEqual(b.mapping(raw),123)
        reply=MagicMock()
        reply.__enter__.return_value=reply
        reply.geturl.return_value=b.SOURCE
        reply.read.return_value=raw
        with patch.object(b,"urlopen",side_effect=[HTTPError(b.SOURCE,415,"format",{},None),reply]) as request:
            self.assertEqual(b.mapping(b.fetch("RegNumToIntCode","RegNumber","1")),123)
            self.assertEqual(request.call_count,2)
            self.assertIn(b.SOAP12.encode(),request.call_args_list[1].args[0].data)
            self.assertIn("application/soap+xml",request.call_args_list[1].args[0].headers["Content-type"])
        with patch.object(b,"urlopen",side_effect=HTTPError(b.SOURCE,429,"limit",{},None)) as request:
            with self.assertRaises(HTTPError):b.fetch("RegNumToIntCode","RegNumber","1")
            self.assertEqual(request.call_count,1)

    def test_probe_version_retry_once(self):
        directory={"datasets":{"system":{"edition":"2026-10-07","rows":[{"registration_number":"1","name":"A"}]}}}
        calls=[]
        def fail(*args):
            calls.append(args)
            raise OSError("test")
        with tempfile.TemporaryDirectory() as t:
            root=Path(t)
            d=b.publish(root,root,"2026-11-25",True,directory,fail)
            self.assertEqual(d["probe_version"],b.PROBE_VERSION)
            self.assertEqual(len(calls),1)
            d.pop("probe_version")
            (root/b.FILE).write_text(json.dumps(d))
            d=b.publish(root,root,"2026-11-25",True,directory,fail)
            self.assertEqual(len(calls),2)
            self.assertEqual(d["probe_version"],b.PROBE_VERSION)
            b.publish(root,root,"2026-11-26",True,directory,fail)
            self.assertEqual(len(calls),2)
