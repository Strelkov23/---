"""Staged publication of the optional diagnostic SME profile index."""
import json,os,shutil,tempfile
from pathlib import Path
import sme_profile_index as p
import company_index as ci
import company_names as cn

# Retain the existing combined financial-search budget, now including profiles.
MAX_COMBINED_BYTES=cn.MAX_COMBINED_BYTES
MAX_MANIFEST=8*1024*1024
def empty():return dict(schema=1,status="not_deployed",note=p.NOTE)
def read(path):
    if not path.is_file() or not 0<path.stat().st_size<=MAX_MANIFEST:raise ValueError("Паспорт профилей отсутствует или слишком велик")
    return json.loads(path.read_text(encoding="utf-8"))
def linked(out):
    import sme_finance_public as sf
    ix=read(out/ci.FILE);finance=read(out/sf.FILE);matrix=read(out/"sme-matrix.json")
    sf.quality(finance,ix,matrix)
    return ix,finance
def budget(out,d):
    files=[out/ci.FILE,out/cn.FILE]
    total=sum(f.stat().st_size for f in files if f.exists())
    for f in files:
        if f.exists():
            data=read(f)
            total+=sum(e["bytes"] for e in data.get("files",{}).values())
    total+=len(ci.encode(d))+sum(e["bytes"] for e in d["files"].values())
    if total>MAX_COMBINED_BYTES:raise ValueError("Общий бюджет индексов превышает 224 МиБ")
def quality(out,d=None,deep=False):
    d=read(out/p.FILE) if d is None else d
    if d==empty():
        if (out/p.DIR).exists():raise ValueError("Блоки без опубликованного паспорта")
        return dict(sme_profile_records=0,sme_profile_bytes=0,sme_profile_regions=0)
    ix,finance=linked(out);budget(out,d)
    q=p.quality(d,out,ix,finance,deep=deep,financial_root=out)
    return dict(sme_profile_records=q["profiles"],sme_profile_bytes=q["compressed_bytes"],sme_profile_regions=q["regions"])
def install(source,out,d):
    ix,finance=linked(out);budget(out,d)
    # Validate all source blocks against the exact current financial index before copying.
    p.quality(d,source,ix,finance,deep=True,financial_root=out)
    with tempfile.TemporaryDirectory(dir=out) as tmp:
        temp=Path(tmp)
        (temp/p.DIR).mkdir()
        for name in d["files"]:shutil.copyfile(source/name,temp/name)
        p.quality(d,temp,ix,finance)
        (temp/p.FILE).write_bytes(ci.encode(d))
        if (out/p.DIR).exists():shutil.rmtree(out/p.DIR)
        (temp/p.DIR).replace(out/p.DIR)
        (temp/p.FILE).replace(out/p.FILE)
    quality(out)
def publish(out,previous,source=None):
    out=Path(out);previous=Path(previous)
    if out.resolve()==previous.resolve():raise ValueError("Выход совпадает с архивом")
    shutil.rmtree(out/p.DIR,ignore_errors=True)
    (out/p.FILE).write_bytes(ci.encode(empty()))
    for folder in ([Path(source),previous] if source else [previous]):
        try:
            d=read(folder/p.FILE)
            if d==empty():continue
            install(folder,out,d)
            return d
        except (OSError,ValueError,TypeError,KeyError,AttributeError) as e:
            print("SME_PROFILE_NOT_IMPORTED",str(e)[:180],flush=True)
            shutil.rmtree(out/p.DIR,ignore_errors=True)
            (out/p.FILE).write_bytes(ci.encode(empty()))
    return empty()
