import json,tempfile,unittest,subprocess
from pathlib import Path
import economic_vector_public as V
import provenance
class VectorPublishTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.out=Path(self.temp.name)/"public";self.out.mkdir()
        self.previous=Path(self.temp.name)/"previous";self.previous.mkdir()
        (self.out/V.INDEX).write_text('{"schema":1,"docs":[]}')
        self.stamp="2026-11-27T20:00:00+00:00"
    def tearDown(self):self.temp.cleanup()
    def mock(self,cmd,**kwargs):
        self.assertEqual(kwargs,{"check":True,"timeout":240})
        stage=Path(cmd[3]);stage.mkdir()
        source=provenance.file_info(Path(cmd[2])/V.INDEX)["sha256"]
        entries=[]
        for i in range(64):
            n=f"research-title-shard-{i:02}.json"
            (stage/n).write_text("{}")
            entries.append(dict(shard=i,file=n,rows=1,**provenance.file_info(stage/n)))
        (stage/V.CAT).write_text(json.dumps(dict(schema=1,scope="research-title-only",source_sha256=source,complete=True,shards=64,missing=[],entries=entries,indexed=64,total=64)))
    def test_ready(self):
        s=V.publish(self.out,self.previous,self.stamp,"runtime",self.mock)
        self.assertEqual(s["status"],"ready");self.assertEqual(s["indexed"],64)
        self.assertTrue(all((self.out/n).is_file() for n in V.NAMES))
    def test_offline(self):
        (self.out/V.CAT).write_text("{}")
        s=V.publish(self.out,self.previous,self.stamp,None,self.mock)
        self.assertEqual(s["status"],"not_enabled");self.assertFalse((self.out/V.CAT).exists())
    def test_timeout(self):
        def fail(*a,**k):raise subprocess.TimeoutExpired("node",240)
        s=V.publish(self.out,self.previous,self.stamp,"runtime",fail)
        self.assertEqual(s["status"],"unavailable");self.assertFalse(any((self.out/n).exists() for n in V.NAMES))
    def test_corruption(self):
        def fail(cmd,**kwargs):
            self.mock(cmd,**kwargs)
            (Path(cmd[3])/V.NAMES[1]).write_text("corrupt")
        s=V.publish(self.out,self.previous,self.stamp,"runtime",fail)
        self.assertEqual(s["status"],"unavailable");self.assertFalse(any((self.out/n).exists() for n in V.NAMES))
    def test_previous_without_manifest(self):
        (self.previous/V.CAT).write_text("{}")
        self.assertFalse(V.previous_ok(self.previous))
if __name__=="__main__":unittest.main()
