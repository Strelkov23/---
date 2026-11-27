"""Optional vector publication before final manifest; fail closed, keep statistics."""
import json,os,shutil,subprocess,tempfile
from pathlib import Path
import provenance
CAT="research-title-catalog.json"
STATUS="research-title-status.json"
INDEX="economic-search-index.json"
NAMES=[CAT]+[f"research-title-shard-{i:02}.json" for i in range(64)]
LIMIT=128*1024*1024

def read(p):
    return json.loads(p.read_text(encoding="utf-8"))

def previous_ok(previous):
    """Require the prior artifact to be bound to the archived manifest."""
    if not (previous/CAT).is_file():return False
    try:
        m=read(previous/"data-manifest.json")
        files=m["files"]
        if m["schema"]!="1" or provenance.fingerprint(files)!=m["data_fingerprint"]:return False
        c=read(previous/CAT)
        if c["source_sha256"]!=files[INDEX]["sha256"]:return False
        return all(files.get(n)==provenance.file_info(previous/n) for n in [CAT]+[r["file"] for r in c["entries"]] if n in NAMES) and all(r["file"] in NAMES[1:] for r in c["entries"])
    except (OSError,ValueError,TypeError,KeyError):return False

def verify(stage,source):
    c=read(stage/CAT)
    entries=c["entries"]
    if c["schema"]!=1 or c["scope"]!="research-title-only" or c["source_sha256"]!=source or c["complete"] is not True or c["shards"]!=64 or c["missing"]!=[] or len(entries)!=64 or {e["shard"] for e in entries}!=set(range(64)):raise ValueError("Incomplete vector catalogue")
    size=0;count=0
    for e in entries:
        n=f"research-title-shard-{e['shard']:02}.json"
        if e["file"]!=n or type(e["rows"]) is not int or not 0<=e["rows"]<=512:raise ValueError("Invalid shard entry")
        meta=provenance.file_info(stage/n)
        if meta!={"sha256":e["sha256"],"bytes":e["bytes"]} or meta["bytes"]>8*1024*1024:raise ValueError("Shard integrity")
        size+=meta["bytes"];count+=e["rows"]
    if size>LIMIT or count<=0 or c["indexed"]!=count or c["total"]!=count:raise ValueError("Invalid coverage")
    return count,size

def publish(out,previous,stamp,runtime,runner=subprocess.run):
    out=Path(out);previous=Path(previous)
    # A failed or offline build must never publish stale vectors under a new snapshot.
    for n in NAMES:
        (out/n).unlink(missing_ok=True)
    source=provenance.file_info(out/INDEX)["sha256"]
    status=dict(schema=1,built=stamp,source_sha256=source,status="not_enabled",indexed=0,bytes=0)
    if runtime:
        try:
            with tempfile.TemporaryDirectory(prefix="economic-vectors-") as temp:
                root=Path(temp);archive=root/"archive";archive.mkdir()
                shutil.copyfile(out/INDEX,archive/INDEX)
                (archive/"data-manifest.json").write_text(json.dumps({"files":{INDEX:provenance.file_info(archive/INDEX)}}),encoding="utf-8")
                stage=root/"stage"
                cmd=["node",str(Path(__file__).resolve().with_name("economic-vector-build.js")),str(archive),str(stage),"all",str(Path(runtime).resolve())]
                if previous_ok(previous):cmd.append(str(previous.resolve()))
                runner(cmd,check=True,timeout=240)
                count,size=verify(stage,source)
                for n in NAMES:shutil.copyfile(stage/n,out/n)
                status.update(status="ready",indexed=count,bytes=size)
        except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError) as err:
            for n in NAMES:(out/n).unlink(missing_ok=True)
            status["status"]="unavailable"
            print("Optional research vectors unavailable:",type(err).__name__,flush=True)
    (out/STATUS).write_text(json.dumps(status,ensure_ascii=False,allow_nan=False),encoding="utf-8")
    return status
