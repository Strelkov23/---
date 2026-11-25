import unittest, tempfile, json, io
from pathlib import Path
from email.message import Message
import source_transport as st
import observation_contract as oc
import federal_budget as budget

class FakeResponse(io.BytesIO):
    def __init__(self,raw,url="https://www.cbr.ru/data",status=200,length=None,encoding=None):
        super().__init__(raw);self.url=url;self.status=status;self.headers=Message()
        self.headers["Content-Type"]="application/json; charset=utf-8"
        if length is not None:self.headers["Content-Length"]=str(length)
        if encoding:self.headers["Content-Encoding"]=encoding
    def geturl(self):return self.url
class Client:
    def __init__(self,response):self.response=response;self.calls=0
    def open(self,request,timeout):self.calls+=1;return self.response
class TransportTests(unittest.TestCase):
    def get(self,response,url="https://www.cbr.ru/data"):
        return st.download(url,hosts={"www.cbr.ru"},max_bytes=8,path_check=lambda p:p=="/data",opener=Client(response))
    def test_payload(self):
        p=self.get(FakeResponse(b"123",length=3))
        self.assertEqual(p.raw,b"123");self.assertEqual(len(p.sha256),64);self.assertEqual(p.charset,"utf-8")
    def test_rejections(self):
        for r in (FakeResponse(b"123456789"),FakeResponse(b""),FakeResponse(b"123",length=4),FakeResponse(b"123",status=206),FakeResponse(b"123",url="https://example.org/data"),FakeResponse(b"123",encoding="gzip")):
            with self.assertRaises(ValueError):self.get(r)
        for url in ("http://www.cbr.ru/data","https://www.cbr.ru.evil.org/data","https://user@www.cbr.ru/data","https://www.cbr.ru:8080/data","https://www.cbr.ru/other"):
            with self.assertRaises(ValueError):self.get(FakeResponse(b"123"),url)
    def test_redirect(self):
        guard=st.GuardedRedirect(lambda url:st.url_allowed(url,{"www.cbr.ru"}))
        from urllib.request import Request
        with self.assertRaises(ValueError):guard.redirect_request(Request("https://www.cbr.ru/data"),None,302,"",{}, "https://example.org/data")

class ContractTests(unittest.TestCase):
    stamp="2026-11-25T10:00:00+00:00"
    def series(self,period="2026-11",value=4,kind="CPI_TARGET"):
        return {kind:dict(title="Test",unit="%",source="https://www.cbr.ru/",checked=self.stamp,success=self.stamp,status="Получено",values=[dict(period=period,value=value,seen=self.stamp,source="https://www.cbr.ru/data")])}
    def test_json_contract(self):
        r=oc.series_json(json.dumps(self.series()).encode(),"national","monthly","period")
        oc.validate_rows(r);self.assertEqual(r[0]["kind"],"target");self.assertEqual(r[0]["value"],"4");self.assertIsNone(r[0]["published_at"]);self.assertEqual(r[0]["source_level"],"observation")
        with self.assertRaises(ValueError):oc.validate_rows(r+r)
        with self.assertRaises(ValueError):oc.validate_rows(oc.series_json(json.dumps(self.series("2026-13")).encode(),"national","monthly","period"))
        with self.assertRaises(ValueError):oc.decimal_value(float("nan"))
        with self.assertRaises(ValueError):oc.json_load(b'{"a":1,"a":2}')
        with self.assertRaises(ValueError):oc.json_load(b'{"a":NaN}')
    def test_missing_vs_zero(self):
        for v,e in ((None,None),(0,"0"),(-1.5,"-1.5")):
            r=oc.series_json(json.dumps(self.series(value=v)).encode(),"national","monthly","period")
            oc.validate_rows(r);self.assertEqual(r[0]["value"],e)
    def test_reproducible_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);budget.publish(lambda *a:None,root,self.stamp)
            (root/"national.json").write_text(json.dumps(self.series()),encoding="utf-8")
            (root/"cbr.json").write_text("{}",encoding="utf-8")
            d=oc.publish(lambda *a:None,root,self.stamp)
            self.assertEqual(oc.quality(d,root)["normalized_observations"],49)
            self.assertEqual(oc.collect(root,self.stamp),d)
            self.assertEqual({r["kind"] for r in d["rows"]},{"documentary","target"})
            d["rows"][0]["value"]="999"
            with self.assertRaises(ValueError):oc.quality(d,root)
            (root/"national.json").write_text(json.dumps(self.series(value=8)),encoding="utf-8")
            fresh=oc.collect(root,self.stamp)
            self.assertNotEqual(fresh["inputs"][1]["sha256"],d["inputs"][1]["sha256"])
    def test_csv_shape(self):
        with self.assertRaises(ValueError):list(oc.csv_table(b"a,b\n1\n",["a","b"]))
        with self.assertRaises(ValueError):list(oc.csv_table(b"b,a\n1,2\n",["a","b"]))
class JournalTests(unittest.TestCase):
    def test_version_and_failure(self):
        import source_journal as sj
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);db=root/"monitor.db";j=sj.Journal(db)
            p=st.download("https://www.cbr.ru/data",hosts={"www.cbr.ru"},max_bytes=8,opener=Client(FakeResponse(b"123")))
            j(p.requested_url,p,None);j(p.requested_url,p,None);j(p.requested_url,None,ValueError("response body"))
            d=sj.collect(db,ContractTests.stamp)
            self.assertEqual(sj.quality(d),dict(transport_events=3,transport_versions=1,transport_failed=1))
            self.assertEqual(d["events"][0]["error"],"ValueError")
            self.assertEqual(d["versions"][0]["sha"],p.sha256)
            self.assertEqual(sj.collect(db,ContractTests.stamp),d)
            d["events"][0]["bytes"]=0
            with self.assertRaises(ValueError):sj.quality(d)
    def test_opt_in_cache(self):
        import source_journal as sj
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with self.assertRaises(ValueError):sj.Journal(root/"db",root/"raw")
            j=sj.Journal(root/"db",root/"raw",approved={"www.cbr.ru"})
            p=st.download("https://www.cbr.ru/data",hosts={"www.cbr.ru"},max_bytes=8,opener=Client(FakeResponse(b"123")))
            j(p.requested_url,p,None);j(p.requested_url,p,None)
            self.assertEqual(list((root/"raw").iterdir()),[root/"raw"/p.sha256])
            self.assertEqual((root/"raw"/p.sha256).read_bytes(),b"123")
    def test_transport_callback(self):
        calls=[];st.configure_journal(lambda *args:calls.append(args))
        self.addCleanup(st.configure_journal,None)
        p=st.download("https://www.cbr.ru/data",hosts={"www.cbr.ru"},max_bytes=8,opener=Client(FakeResponse(b"123")))
        self.assertEqual(calls[0],(p.requested_url,p,None))
        with self.assertRaises(ValueError):st.download("https://www.cbr.ru/data",hosts={"www.cbr.ru"},max_bytes=2,opener=Client(FakeResponse(b"123")))
        self.assertIsNone(calls[1][1])
        self.assertIsInstance(calls[1][2],ValueError)
if __name__=="__main__":unittest.main()
