"""Stage pinned OCR browser assets and the two local language packages."""
import json
import shutil
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
versions = {"tesseract.js": "6.0.1", "tesseract.js-core": "6.0.0", "@tesseract.js-data/eng": "1.0.0", "@tesseract.js-data/rus": "1.0.0"}
for name, version in versions.items():
    assert json.loads((source / name / "package.json").read_text())["version"] == version
target.mkdir(parents=True, exist_ok=True)
for name in ("tesseract.min.js", "worker.min.js"):
    shutil.copyfile(source / "tesseract.js" / "dist" / name, target / name)
core = target / "core"
core.mkdir(exist_ok=True)
for file in (source / "tesseract.js-core").glob("tesseract-core*"):
    if file.is_file() and (file.name.endswith(".wasm") or file.name.endswith(".wasm.js")):
        shutil.copyfile(file, core / file.name)
assert (core / "tesseract-core-lstm.wasm.js").is_file()
assert (core / "tesseract-core-simd-lstm.wasm.js").is_file()
lang = target / "lang"
lang.mkdir(exist_ok=True)
for code in ("eng", "rus"):
    name = code + ".traineddata.gz"
    shutil.copyfile(source / "@tesseract.js-data" / code / "4.0.0_best_int" / name, lang / name)
notices = target / "licenses"
notices.mkdir(exist_ok=True)
for package in versions:
    folder = source / package
    for file in folder.iterdir():
        if file.is_file() and file.name.lower().startswith(("license", "notice", "copying", "readme")):
            shutil.copyfile(file, notices / (package.replace("/", "-").replace("@", "") + "-" + file.name))
(notices / "components.json").write_text(json.dumps(versions, indent=2))
