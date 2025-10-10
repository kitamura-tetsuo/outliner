#!/usr/bin/env python3
"""Pre-commit tasks

1. Verify all E2E specs import & call registerCoverageHooks()
2. Sort client feature YAML files and regenerate feature-map.md
"""
from subprocess import run
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent

cmds = [
    [sys.executable, str(ROOT / 'verify_e2e_coverage_hooks.py')],
    [sys.executable, str(ROOT / 'aggregate_features.py')],
    [sys.executable, str(ROOT / 'gen_feature_map.py')],
]

for cmd in cmds:
    result = run(cmd)
    if result.returncode != 0:
        sys.exit(result.returncode)
