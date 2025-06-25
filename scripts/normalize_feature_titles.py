#!/usr/bin/env python3
"""Normalize feature YAML titles to include English and Japanese titles,
rename files and associated tests accordingly."""
from pathlib import Path
import re
import subprocess
import yaml

ROOT = Path(__file__).resolve().parent.parent
YAML_DIR = ROOT / "docs" / "client-features"
TEST_DIR = ROOT / "client" / "e2e" / "core"


def slugify(s: str) -> str:
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s


def translate(text: str, src: str, dst: str) -> str:
    try:
        out = subprocess.check_output([
            "trans", "-b", f"{src}:{dst}", text
        ], text=True)
        return out.strip()
    except Exception:
        return text


def is_english(text: str) -> bool:
    return all(ord(c) < 128 for c in text)


def process_file(path: Path) -> None:
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    fid = data.get("id", "")
    slug = fid.split("-")[0].lower() if fid else path.stem.split("-")[0]
    uuid = path.stem.split("-")[-1]
    title_en = data.get("title", "")
    title_ja = data.get("title-ja", "")

    if not title_en:
        title_en = title_ja
    if not is_english(title_en):
        title_ja = title_en
        title_en = translate(title_en, "ja", "en")
    if not title_ja or is_english(title_ja):
        title_ja = translate(title_en, "en", "ja")

    data["title"] = title_en
    data["title-ja"] = title_ja

    kebab = slugify(title_en)
    new_name = f"{slug}-{kebab}-{uuid}.yaml"
    new_path = path.with_name(new_name)

    tests = data.get("tests", [])
    updated_tests = []
    for t in tests:
        if t.startswith("client/e2e/core/") and t.endswith(".spec.ts"):
            old_test = ROOT / t
            if old_test.exists():
                new_test_name = f"{slug}-{kebab}-{uuid}.spec.ts"
                new_test_path = TEST_DIR / new_test_name
                if old_test != new_test_path:
                    old_test.rename(new_test_path)
                updated_tests.append(str(new_test_path.relative_to(ROOT)))
            else:
                updated_tests.append(t)
        else:
            updated_tests.append(t)
    if updated_tests != tests:
        data["tests"] = updated_tests

    yaml_text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=4096)
    new_path.write_text(yaml_text, encoding="utf-8")
    if new_path != path:
        path.unlink()
    subprocess.run(["git", "add", str(new_path)], check=False)


def main() -> None:
    for p in list(YAML_DIR.glob("*.yaml")):
        process_file(p)


if __name__ == "__main__":
    main()
