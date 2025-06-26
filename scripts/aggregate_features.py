#!/usr/bin/env python3
"""
Collect and sort docs/client-features/*.yaml and docs/dev-features/*.yaml alphabetically by feature id,
and regenerate docs/client-features.yaml and docs/dev-features.yaml
"""
from pathlib import Path
import yaml
from loguru import logger
import subprocess

ROOT = Path(__file__).resolve().parent.parent


def aggregate_features(yaml_dir, agg_file):
    features = []
    for path in yaml_dir.glob("*.yaml"):
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
    if not agg_file.exists() or agg_file.read_text(encoding="utf-8") != agg_text:
        agg_file.write_text(agg_text, encoding="utf-8")
        subprocess.run(["git", "add", str(agg_file)], check=False)
        logger.info(f"{agg_file.name} regenerated")
    else:
        logger.info(f"{agg_file.name} already up-to-date")


def main():
    aggregate_features(
        ROOT / "docs" / "client-features",
        ROOT / "docs" / "client-features.yaml"
    )
    aggregate_features(
        ROOT / "docs" / "dev-features",
        ROOT / "docs" / "dev-features.yaml"
    )

if __name__ == "__main__":
    main()
