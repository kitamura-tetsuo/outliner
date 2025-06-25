#!/usr/bin/env python3
"""Sort docs/dev-features/*.yaml alphabetically by feature id and
regenerate docs/dev-features.yaml"""
from pathlib import Path
import yaml
from loguru import logger
import subprocess

ROOT = Path(__file__).resolve().parent.parent
YAML_DIR = ROOT / "docs" / "dev-features"
AGG_FILE = ROOT / "docs" / "dev-features.yaml"


def main() -> None:
    features = []
    for path in YAML_DIR.glob("*.yaml"):
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        if "title-ja" not in data:
            data["title-ja"] = data.get("title", "")
        for key in ("acceptance", "components", "tests"):
            items = data.get(key)
            if isinstance(items, list):
                data[key] = sorted(items)
        text = yaml.safe_dump(data, allow_unicode=True, sort_keys=False, width=4096)
        if path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8")
            subprocess.run(["git", "add", str(path)], check=False)
            logger.info(f"sorted {path.relative_to(ROOT)}")
        features.append(data)

    features_sorted = sorted(features, key=lambda f: f.get("id", ""))
    agg_text = yaml.safe_dump(features_sorted, allow_unicode=True, sort_keys=False, width=4096)
    if not AGG_FILE.exists() or AGG_FILE.read_text(encoding="utf-8") != agg_text:
        AGG_FILE.write_text(agg_text, encoding="utf-8")
        subprocess.run(["git", "add", str(AGG_FILE)], check=False)
        logger.info("dev-features.yaml regenerated")
    else:
        logger.info("dev-features.yaml already up-to-date")


if __name__ == "__main__":
    main()
