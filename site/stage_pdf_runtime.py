"""Copy only the required pinned PDF.js browser runtime assets."""
import json
import shutil
import sys
from pathlib import Path

source, target = map(Path, sys.argv[1:])
assert json.loads((source / "package.json").read_text())["version"] == "6.5.438"
target.mkdir(parents=True, exist_ok=True)
for name in ("pdf.mjs", "pdf.worker.mjs"):
    shutil.copyfile(source / "legacy" / "build" / name, target / name)
shutil.copyfile(source / "LICENSE", target / "LICENSE")
for name in ("cmaps", "standard_fonts", "wasm"):
    if (source / name).is_dir():
        shutil.copytree(source / name, target / name, dirs_exist_ok=True)
