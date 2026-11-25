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
class PipelineTests(unittest.TestCase):
    def test_registry(self):
        import source_registry as sr
        self.assertEqual(len(sr.passports()),9)
        self.assertEqual(sr.identify("https://www.cbr.ru/scripts/XML_dynamic.asp?date_req1=01%2F01%2F2025").id,"cbr_fx")
        self.assertEqual(sr.identify("https://data.nalog.ru/a.xlsx").id,"fns_finance")
        for url in ("https://www.cbr.ru/other","https://data.nalog.ru/a.exe","https://example.org/a.xlsx"):
            with self.assertRaises(ValueError):sr.identify(url)
    def test_buffers_during_import_transaction(self):
        import sqlite3,source_journal as sj,source_pipeline as sp
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/"db";journal=sj.BufferedJournal(db);pipeline=sp.Buffer(db)
            url="https://www.cbr.ru/hd_base/KeyRate/"
            p=st.download(url,hosts={"www.cbr.ru"},max_bytes=8,opener=Client(FakeResponse(b"123",url=url)))
            with sqlite3.connect(db) as writer:
                writer.execute("create table fixture(v integer)")
                writer.execute("insert into fixture values(1)")
                journal(url,p,None)
                pipeline.record(url,"KEY","commit",1)
                pipeline.record(url,"KEY","commit",error=ValueError("bad batch"))
                self.assertEqual(writer.execute("select count(*) from transport_events").fetchone()[0],0)
            journal.flush();pipeline.flush()
            self.assertEqual(sj.quality(sj.collect(db,ContractTests.stamp))["transport_events"],1)
            d=sp.collect(db,ContractTests.stamp)
            self.assertEqual(sp.quality(d),dict(pipeline_sources=9,pipeline_events=2,pipeline_rejected=1))
            self.assertEqual(d["events"][0]["reason"],"ValueError")
            self.assertIsNone(d["events"][0]["count"])
            journal.flush();pipeline.flush()
            self.assertEqual(sp.collect(db,ContractTests.stamp),d)
    def test_parse_quarantine(self):
        import source_pipeline as sp
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/"db";buf=sp.Buffer(db);sp.configure(buf)
            self.addCleanup(sp.configure,None)
            url="https://www.cbr.ru/hd_base/infl/"
            self.assertEqual(sp.parsed(url,"HTML",lambda:{("CPI","2026-01"):4}),{("CPI","2026-01"):4})
            with self.assertRaises(ValueError):sp.parsed(url,"HTML",lambda:{})
            buf.flush()
            d=sp.collect(db,ContractTests.stamp)
            self.assertEqual(sp.quality(d)["pipeline_rejected"],1)
            self.assertEqual(d["events"][1]["stage"],"parse")
    def test_conflicting_cbr_rows(self):
        import cbr_data
        base='<ValCurs ID="R01235"><Record Date="01.01.2026"><Nominal>1</Nominal><Value>90</Value></Record>'
        with self.assertRaises(ValueError):cbr_data.fx_rows((base+'<Record Date="01.01.2026"><Nominal>1</Nominal><Value>91</Value></Record></ValCurs>').encode(),"R01235")
        with self.assertRaises(ValueError):cbr_data.fx_rows(base.replace(">90<",">nan<").encode()+b"</ValCurs>","R01235")
class StreamTests(unittest.TestCase):
    def raw_zip(self):
        import zipfile
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,"w") as z:z.writestr("fixture.xml",b"x"*100)
        return buf.getvalue()
    def test_atomic_zip(self):
        import stream_archive as sa,hashlib
        url="https://file.nalog.ru/opendata/7707329152-rsmp/data-20261110-structure-20261110.zip"
        raw=self.raw_zip()
        with tempfile.TemporaryDirectory() as tmp:
            dest=Path(tmp)/"source.zip";dest.write_bytes(b"previous")
            for response in (FakeResponse(raw,url=url,length=len(raw)+1),FakeResponse(raw,url=url,status=206),FakeResponse(b"not zip",url=url),FakeResponse(raw,url=url.replace("20261110","20261111")),FakeResponse(raw,url=url,encoding="gzip")):
                with self.assertRaises(ValueError):sa.download_zip(url,dest,max_bytes=1000,opener=Client(response).open)
                self.assertEqual(dest.read_bytes(),b"previous")
                self.assertEqual(list(Path(tmp).iterdir()),[dest])
            response=FakeResponse(raw,url=url,length=len(raw))
            self.assertEqual(sa.download_zip(url,dest,max_bytes=1000,opener=Client(response).open),(hashlib.sha256(raw).hexdigest(),len(raw)))
            self.assertEqual(dest.read_bytes(),raw)
    def test_chunked_transport(self):
        import stream_archive as sa,zipfile
        class Bounded(FakeResponse):
            def read(self,n=-1):
                if not 0<n<=sa.CHUNK:raise AssertionError("Unbounded read")
                return super().read(n)
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,"w") as z:z.writestr("big.xml",b"x"*(2*sa.CHUNK+1))
        raw=buf.getvalue();url="https://data.nalog.ru/opendata/7707329152-revexp/data-20261110-structure-20261110.zip"
        with tempfile.TemporaryDirectory() as tmp:
            target=Path(tmp)/"zip"
            with self.assertRaises(ValueError):sa.download_zip(url,target,max_bytes=sa.CHUNK,opener=Client(Bounded(raw,url=url)).open)
            self.assertFalse(target.exists())
            sa.download_zip(url,target,max_bytes=len(raw),opener=Client(Bounded(raw,url=url)).open)
            with zipfile.ZipFile(target) as z:
                members,complete=sa.inventory_xml(z,max_members=10,max_member_bytes=3*sa.CHUNK,max_unpacked=3*sa.CHUNK,strict=True)
                self.assertTrue(complete);self.assertEqual(len(sa.read_member(z,members[0],3*sa.CHUNK)),2*sa.CHUNK+1)
                with self.assertRaises(ValueError):sa.inventory_xml(z,max_members=10,max_member_bytes=sa.CHUNK,max_unpacked=sa.CHUNK,strict=True)
    def test_inventory_and_source_scope(self):
        import stream_archive as sa,zipfile
        self.assertFalse(sa.approved("https://data.nalog.ru/other.zip"))
        self.assertFalse(sa.approved("https://data.nalog.ru:8080/opendata/7707329152-rsmp/data-20261110-structure-20261110.zip"))
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,"w") as z:z.writestr("data.xml",b"valid");z.writestr("readme.txt",b"note")
        with zipfile.ZipFile(buf) as z:
            options=dict(max_members=10,max_member_bytes=10,max_unpacked=10)
            with self.assertRaises(ValueError):sa.inventory_xml(z,strict=True,**options)
            members,complete=sa.inventory_xml(z,strict=False,**options)
            self.assertFalse(complete);self.assertEqual(sa.read_member(z,members[0],10),b"valid")
            with self.assertRaises(ValueError):sa.read_member(z,members[0],2)
class ApiContractTests(unittest.TestCase):
    def test_api_registration(self):
        import source_registry as sr
        self.assertEqual(sr.identify("https://api.worldbank.org/v2/country/RUS/indicator/NY.GDP.MKTP.CD?format=json").id,"wdi_series")
        self.assertEqual(sr.identify("https://api.worldbank.org/v2/indicator?source=2").id,"wdi_metadata")
        with self.assertRaises(ValueError):sr.identify("https://api.worldbank.org/v2/country/USA/indicator/NY.GDP.MKTP.CD")
    def test_api_payload(self):
        import series
        def payload(value):
            return [{"pages":1,"total":1,"lastupdated":"2026-11-25"},[{"countryiso3code":"RUS","indicator":{"id":"X"},"date":"2025","value":value}]]
        self.assertEqual(series.parse_response(payload(None),"X")[0],{"2025":None})
        self.assertEqual(series.parse_response(payload(1),"X")[0],{"2025":1.0})
        with self.assertRaises(ValueError):series.parse_response(payload(True),"X")
        with self.assertRaises(ValueError):series.parse_response(payload(1),"Y")
        bad=payload(2);bad[0]["pages"]=2
        with self.assertRaises(ValueError):series.parse_response(bad,"X")
    def test_wdi_exact_decimal_and_metadata(self):
        raw=b'{"X":{"title":"GDP","unit":"USD","values":{"2025":1234567890.123456789}}}'
        meta=json.dumps({"X":{"title":"GDP","unit":"USD","source":"https://api.worldbank.org/v2/country/RUS/indicator/X","checked":None,"success":None,"status":"archived"}}).encode()
        rows=oc.wdi_rows(raw,meta);oc.validate_rows(rows)
        self.assertEqual(rows[0]["value"],"1234567890.123456789")
        with self.assertRaises(ValueError):oc.wdi_rows(raw,b'{}')
        with self.assertRaises(ValueError):oc.wdi_rows(raw,meta.replace(b"USD",b"EUR"))
if __name__=="__main__":unittest.main()
