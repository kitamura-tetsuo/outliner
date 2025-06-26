#!/usr/bin/env python3
"""Sort client feature YAML files and regenerate feature-map.md."""
from subprocess import run
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

cmds = [
    [sys.executable, str(ROOT / 'sort_client_features.py')],
    [sys.executable, str(ROOT / 'sort_dev_features.py')],
    [sys.executable, str(ROOT / 'gen_feature_map.py')],
]

for cmd in cmds:
    result = run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)
