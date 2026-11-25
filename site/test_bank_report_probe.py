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

    def test_selected_rows_exact_and_missing(self):
        fields=[("REGN","N",4,0),("C1","C",4,0),("C3","N",8,2)]
        head=33+32*len(fields);width=1+sum(x[2] for x in fields)
        data=bytearray(head+3*width);struct.pack_into("<IHH",data,4,3,head,width)
        for i,(name,kind,length,decimals) in enumerate(fields):
            pos=32+i*32;data[pos:pos+len(name)]=name.encode();data[pos+11]=ord(kind);data[pos+16]=length;data[pos+17]=decimals
        data[head-1]=13
        records=[b" "+b"   1"+b"A01 "+b"  12.340",b" "+b"   2"+b"A01 "+b"        ",b"*"+b"   3"+b"A02 "+b"    0.00"]
        for i,r in enumerate(records):self.assertEqual(len(r),width);data[head+i*width:head+(i+1)*width]=r
        rows=p.selected_rows(bytes(data),("REGN","C1","C3"))
        self.assertEqual(rows["source_rows"],3);self.assertEqual(rows["deleted"],1)
        self.assertEqual(rows["rows"],[{"source_row":1,"REGN":"1","C1":"A01","C3":"12.340"},{"source_row":2,"REGN":"2","C1":"A01","C3":None}])
        self.assertEqual(rows["non_numeric_cells"],0)
        with self.assertRaises(ValueError):p.selected_rows(bytes(data),("UNKNOWN",))
    def test_raw_coverage_without_financial_mapping(self):
        entry=dict(form="123",date="2026-10-01",url="https://www.cbr.ru/vfs/credit/forms/123-20261001.rar")
        tables={"123B":dict(member="b",sha256="b",rows=[{"REGN":"01"},{"REGN":"2"}]),"123D":dict(member="d",sha256="d",rows=[{"REGN":"1","C1":"A"},{"REGN":"3","C1":"A"},{"REGN":"3","C1":"B"}]),"123N":dict(member="n",sha256="n",rows=[])}
        info=dict(sha256="z",members=[dict(member=x["member"],sha256=x["sha256"]) for x in tables.values()])
        result=p.raw_report("123",entry,info,tables)
        self.assertEqual(result["status"],"raw_unmapped")
        self.assertEqual(result["coverage"]["matched_unique_regn"],1)
        self.assertEqual(result["coverage"]["unmatched_regn"],["3"])
        self.assertEqual(result["coverage"]["source_codes"],["A","B"])
        with self.assertRaises(ValueError):p.raw_report("123",entry,info,{"123B":tables["123B"]})

    def test_mapped135_documented_values(self):
        fields=[dict(name=n,type=k,length=l,decimals=d) for n,k,l,d in [("REGN","N",4,0),("C1_3","C",6,0),("C2_3","N",19,3),("C3_3","N",19,3),("C4_3","C",12,0)]]
        bank=dict(REGN="1",DT="20261001",REGN_S="1",OGRN="1027700132195",source_row=1)
        def row(i,code,actual="10.000",control="8.000",reg="1"):
            return dict(REGN=reg,C1_3=code,C2_3=actual,C3_3=control,C4_3=None,source_row=i)
        raw=dict(form="135",status="raw_unmapped",date="2026-10-01",url="https://www.cbr.ru/vfs/credit/forms/135-20261001.rar",archive_sha256="a",tables={"135B":dict(rows=[bank],sha256="b"),"135_3":dict(fields=fields,language_driver=101,sha256="c",rows=[row(1,{"hex":"8d312e30"}),row(2,"X","0",None),row(3,"D"),row(4,"D"),row(5,"B","not-a-number"),row(6,"M",None,None),row(7,"U",reg="2")] )})
        result=p.mapped135(raw)
        self.assertEqual(result["counts"]["observations"],2)
        self.assertEqual(result["counts"]["raw_byte_codes"],1)
        self.assertEqual(result["rows"][0]["actual_percent"],"10.000")
        self.assertEqual(result["rows"][1]["actual_percent"],"0")
        self.assertIsNone(result["rows"][1]["control_percent"])
        self.assertEqual(sum(result["counts"]["excluded"].values()),5)
        bank["DT"]="20260901"
        self.assertEqual(p.mapped135(raw)["counts"]["observations"],0)
        fields[2]["decimals"]=2
        with self.assertRaises(ValueError):p.mapped135(raw)

    def test_public_archive_summary_empty_and_reject_invalid(self):
        import bank_archive_summary as a
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as f:
            root=Path(f)
            d=a.publish(root,root)
            self.assertEqual(a.quality(d)["bank_archive_forms"],0)
            self.assertIn("ещё не загружен",a.render(d))
            with self.assertRaises(ValueError):a.quality(dict(d,status="verified"))

    def test_public_archive_full_artifact_and_tampering(self):
        import bank_archive_summary as a
        import tempfile,json
        from pathlib import Path
        with tempfile.TemporaryDirectory() as f:
            root=Path(f)
            def save(name,data):
                (root/name).write_text(json.dumps(data),encoding="utf-8")
            day="2026-10-01"; archives=[]
            for form,keys in (("123",["123B","123D","123N"]),("135",["135B","135_3"])):
                url="https://www.cbr.ru/vfs/credit/forms/"+form+"-20261001.rar"
                sha="a"*64
                directory=dict(source_row=1,REGN="1",DT="20261001")
                row=dict(source_row=1,REGN="1",C1_3={"hex":"8d32"},C2_3="10.000",C3_3="8.000")
                tables={}
                for key in keys:
                    entries=[] if key=="123N" else [directory if key.endswith("B") else row]
                    tables[key]=dict(member=key+".dbf",sha256="b"*64,rows=entries,deleted=0,source_rows=len(entries))
                cov=dict(directory_unique_regn=1,values_unique_regn=1,matched_unique_regn=1,unmatched_regn=[])
                report=dict(form=form,date=day,url=url,sha256=sha,raw_coverage=cov,members=[dict(member=x["member"],sha256=x["sha256"]) for x in tables.values()])
                save("form-"+form+"-raw.json",dict(form=form,date=day,url=url,archive_sha256=sha,coverage=cov,tables=tables))
                if form=="135":
                    counts=dict(observations=1,organizations=1,codes=1,excluded={},source_active_rows=1)
                    report["mapped_counts"]=counts
                    mapped=dict(archive_sha256=sha,date=day,counts=counts,table_sha256="b"*64,directory_sha256="b"*64,rows=[dict(registration_number="1",code="hex:8d32",date=day,source_row=1,directory_row=1,actual_percent="10.000",control_percent="8.000")])
                    save("form-135-documented.json",mapped)
                archives.append(report)
            save("report.json",dict(checked="2026-11-25T05:00:00+00:00",archives=archives))
            good=a.from_artifact(root)
            self.assertEqual(a.quality(good)["bank_archive_135_observations"],1)
            self.assertIn("Проверенный комплект",a.render(good))
            a.publish(root,root,root)
            mapped["rows"][0]["actual_percent"]="11.000"
            save("form-135-documented.json",mapped)
            with self.assertRaisesRegex(ValueError,"исходной строкой"):a.from_artifact(root)
            cached=a.publish(root,root,root)
            self.assertEqual(cached["status"],"cached")
            self.assertEqual(cached["forms"],good["forms"])
