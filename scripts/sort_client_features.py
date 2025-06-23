#!/usr/bin/env python3
"""Sort docs/client-features.yaml alphabetically by feature id."""
from pathlib import Path
import yaml
from loguru import logger
import subprocess

ROOT = Path(__file__).resolve().parent.parent
YAML_FILE = ROOT / "docs" / "client-features.yaml"


def main() -> None:
    data = yaml.safe_load(YAML_FILE.read_text(encoding="utf-8"))

    for feature in data:
        for key in ("acceptance", "components", "tests"):
            items = feature.get(key)
            if isinstance(items, list):
                feature[key] = sorted(items)

    sorted_data = sorted(data, key=lambda f: f.get("id", ""))
    out_text = yaml.safe_dump(sorted_data, allow_unicode=True, sort_keys=False, width=4096)

    if out_text != YAML_FILE.read_text(encoding="utf-8"):
        YAML_FILE.write_text(out_text, encoding="utf-8")
        logger.info("client-features.yaml sorted")
        subprocess.run(["git", "add", str(YAML_FILE)], check=False)
    else:
        logger.info("client-features.yaml already sorted")


if __name__ == "__main__":
    main()
