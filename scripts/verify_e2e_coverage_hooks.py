#!/usr/bin/env python3
"""
Verify that all Playwright E2E spec files import and call registerCoverageHooks().

Target files: client/e2e/**/*.spec.ts
Checks:
  1) import { registerCoverageHooks } from "../utils/registerCoverageHooks";
  2) registerCoverageHooks();

If any file is missing either requirement, exit with non-zero status and print a
clear list of offending files.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
E2E_DIR = REPO_ROOT / "client" / "e2e"

# Regex patterns (tolerant to whitespace and optional semicolon)
# Accept both "../utils/registerCoverageHooks" (for subdirectories) and "./utils/registerCoverageHooks" (for specs in client/e2e root)
IMPORT_RE = re.compile(
    r"import\s*\{\s*registerCoverageHooks\s*\}\s*from\s*[\"\'](?:\.\./|\./)utils/registerCoverageHooks[\"\']\s*;?",
    re.MULTILINE,
)
CALL_RE = re.compile(r"registerCoverageHooks\s*\(\s*\)\s*;?", re.MULTILINE)


def find_spec_files(base: Path) -> list[Path]:
    return [p for p in base.rglob("*.spec.ts") if p.is_file()]


def main() -> int:
    if not E2E_DIR.exists():
        print(f"[verify_e2e_coverage_hooks] Skip: {E2E_DIR} not found (no E2E tests)")
        return 0

    offending_import: list[Path] = []
    offending_call: list[Path] = []

    for spec in find_spec_files(E2E_DIR):
        try:
            text = spec.read_text(encoding="utf-8")
        except Exception as e:
            print(f"[verify_e2e_coverage_hooks] WARN: cannot read {spec}: {e}")
            continue

        # Require both import and call
        if not IMPORT_RE.search(text):
            offending_import.append(spec.relative_to(REPO_ROOT))
        if not CALL_RE.search(text):
            offending_call.append(spec.relative_to(REPO_ROOT))

    if offending_import or offending_call:
        print("\n[verify_e2e_coverage_hooks] ERROR: The following E2E spec files are missing registerCoverageHooks requirements:\n")
        if offending_import:
            print("- Missing import line (add to file top):\n  import { registerCoverageHooks } from \"../utils/registerCoverageHooks\";\n")
            for p in offending_import:
                print(f"  • {p}")
            print()
        if offending_call:
            print("- Missing call (place near the top, right after import):\n  registerCoverageHooks();\n")
            for p in offending_call:
                print(f"  • {p}")
            print()
        print("Commit aborted. Please add the import and call to all E2E spec files.")
        return 1

    print("[verify_e2e_coverage_hooks] OK: All E2E spec files have registerCoverageHooks() import and call.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

