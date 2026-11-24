"""Content-addressed data manifest. Integrity, not source authenticity."""
import hashlib,json,os,re
from pathlib import Path

SCHEMA="1"
EXCLUDED={"quality.json","links.json","data-manifest.json"}
def sha(b):return hashlib.sha256(b).hexdigest()
def file_info(path):
    b=path.read_bytes()
    return {"sha256":sha(b),"bytes":len(b)}
def fingerprint(files):
    # ASCII sorted paths + lowercase hashes + byte lengths, one line per file.
    return sha("".join(f"{name}\t{info['sha256']}\t{info['bytes']}\n" for name,info in sorted(files.items())).encode("ascii"))
def create(out,stamp):
    paths=[p for p in out.glob("*.json") if p.name not in EXCLUDED]
    paths+=list((out/"regional-data").glob("*.json"))
    if (out/"regional-boundaries.geojson").is_file():paths.append(out/"regional-boundaries.geojson")
    entries={p.relative_to(out).as_posix():file_info(p) for p in sorted(paths)}
    if not {"data-registry.json","method-passports.json","compare.json","capital-data.json","forecast.json","price-data.json","sectors.json"}<=entries.keys():raise ValueError("Incomplete provenance manifest")
    source=os.environ.get("ECONOMIC_SOURCE_REVISION","")
    if not re.fullmatch(r"[0-9a-f]{40}",source):source=None
    return dict(schema=SCHEMA,built=stamp,source_revision=source,data_fingerprint=fingerprint(entries),files=entries,
      note="SHA-256 точных байтов опубликованных наборов; не цифровая подпись и не подтверждение достоверности первоисточника. Отчёты контроля и сам манифест исключены.")
def validate(out,data):
    if data["schema"]!=SCHEMA or fingerprint(data["files"])!=data["data_fingerprint"]:raise ValueError("Invalid manifest fingerprint")
    for name,entry in data["files"].items():
        p=Path(name)
        if p.is_absolute() or ".." in p.parts or p.as_posix()!=name or file_info(out/p)!=entry:raise ValueError("Manifest mismatch: "+name)
def publish(page,out,stamp):
    data=create(out,stamp)
    validate(out,data)
    (out/"data-manifest.json").write_text(json.dumps(data,ensure_ascii=False,sort_keys=True,allow_nan=False),encoding="utf-8")
    page("reproducibility.html",'<section class="mast"><h1>Воспроизводимость данных и расчётов</h1><p>Для каждого архивируемого набора рассчитывается SHA-256 точных байтов и размер. Общий отпечаток связывает все перечисленные файлы. Совпадение хеша подтверждает идентичность файла, но не достоверность статистики и не авторство источника.</p><p><a href="data-manifest.json">Манифест данных JSON</a> · <a href="method-passports.html">Методики</a> · <a href="data-registry.html">Каталог и выгрузка наблюдений</a> · <a href="methodology.html#provenance-method">Правила проверки</a></p></section><section><h2>Версия опубликованного набора</h2><p id="repro-status" role="status">Загрузка…</p><p>Ревизия кода и ревизия архива различаются. Архивная ссылка открывает именно сохранённые JSON; статические страницы и алгоритмы остаются текущими. Для повторения старого алгоритма сохраните исходную ревизию кода отдельно.</p><p id="repro-version"></p><p id="repro-source"></p><p id="repro-fingerprint"></p><label>Файл для проверки<select id="repro-file"></select></label><button id="repro-verify" disabled>Проверить контрольную сумму</button><p id="repro-result" role="status"></p><p>Проверка выполняется локально в браузере через SHA-256. При несовпадении не используйте файл вместе с данным манифестом.</p></section><script defer src="provenance.js"></script><script defer src="reproducibility.js"></script>')
