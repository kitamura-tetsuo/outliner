#!/usr/bin/env python3
# scripts/gen_feature_map.py
"""
Scan tests for `@feature` tags, merge YAML files in docs/client-features,
and emit a Markdown table mapping features to test files.
Now supports **multiple test-root directories**.
"""

from pathlib import Path
import re, sys, yaml, subprocess
from loguru import logger

# ─────────────────────────  Settings  ──────────────────────────
ROOT        = Path(__file__).resolve().parent.parent
YAML_DIR    = ROOT / "docs" / "client-features"
# ★ Specify multiple directories in a list
TEST_ROOTS  = [                                   # Append / Overwrite as needed
    ROOT / "client/e2e",                         # default
    ROOT / "client/src/tests",                   # default
    ROOT / "functions/test",                     # new: Cloud Functions tests
    ROOT / "server/tests",                       # new: server unit tests
]
MD_OUTFILE  = ROOT / "docs" / "feature-map.md"        # Output destination
# Accept tags like ITM-xxxxxxx (hex), CLM-xxxxxxxx, FTR-xxxxxxxx, etc.
# Prefix: 2+ letters, Suffix: 8 hex characters (case-insensitive)
FEATURE_RE  = re.compile(r"@feature\s+([A-Z]+-[0-9a-f]{8})", re.I)
# ──────────────────────────────────────────────────────────

# ---------- Loguru ----------
logger.remove()
logger.add(sys.stdout, format="<lvl>{message}</lvl>")
logger.add(ROOT / "scripts" / "gen_feature_map.log", rotation="1 MB")

# ---------- Helpers ----------

def _find_key_line(content: str, key: str) -> int | None:
    """Best-effort: find the 1-based line number where a YAML key appears."""
    for i, line in enumerate(content.splitlines(), start=1):
        # naive but effective for our flat front-matter style
        if line.strip().startswith(f"{key}:"):
            return i
    return None


def load_features():
    features: dict[str, dict] = {}
    if not YAML_DIR.exists():
        return features

    required_keys = ("id", "title", "status", "title-ja")
    for path in YAML_DIR.glob("*.yaml"):
        content = path.read_text(encoding="utf-8")
        try:
            data = yaml.safe_load(content)
        except Exception as e:
            logger.error(f"YAML parse error in {path.relative_to(ROOT)}: {e}")
            raise SystemExit(1)

        if not isinstance(data, dict):
            logger.error(f"Invalid YAML structure (not a mapping) in {path.relative_to(ROOT)}")
            raise SystemExit(1)

        missing = [k for k in required_keys if k not in data]
        if missing:
            # Try to point at where the user could add the first missing key
            line_hint = 1
            # If file has a title/name line, hint right after it
            for probe in ("id", "title", "name"):
                line = _find_key_line(content, probe)
                if line:
                    line_hint = line
                    break
            mlist = ", ".join(missing)
            logger.error(
                f"Feature file missing required key(s): {mlist} -> {path.relative_to(ROOT)}:{line_hint}"
            )
            # Show a short preview to help pinpoint
            preview = "\n".join(content.splitlines()[: min(15, len(content.splitlines()))])
            logger.error(f"Preview:\n{preview}")
            raise SystemExit(1)

        fid = str(data["id"]).strip()
        if not fid:
            logger.error(f"Empty 'id' in {path.relative_to(ROOT)}")
            raise SystemExit(1)

        if fid in features:
            logger.error(
                "Duplicate feature id detected: {fid}\n -> {a}\n -> {b}".format(
                    fid=fid,
                    a=path.relative_to(ROOT),
                    b=features[fid].get("__source__", "<unknown>")
                )
            )
            raise SystemExit(1)

        data["__source__"] = str(path.relative_to(ROOT))
        features[fid] = data

    return features


def scan_tests():
    """Walk through every directory in TEST_ROOTS and collect @feature tags."""
    mapping: dict[str, list[str]] = {}

    for root in TEST_ROOTS:
        if not root.exists():
            logger.warning(f"⚠  Test root not found: {root.relative_to(ROOT) if root.is_absolute() else root}")
            continue

        for path in root.rglob("*.spec.ts"):
            ids = FEATURE_RE.findall(path.read_text(encoding="utf-8"))
            for fid in ids:
                mapping.setdefault(fid, []).append(str(path.relative_to(ROOT)))

    return mapping

# ---------- Main ----------

def main() -> None:
    features = load_features()
    tests    = scan_tests()

    # Buffer Markdown lines
    lines: list[str] = []
    lines.append("# Feature ↔ Test Matrix\n")
    lines.append("| Feature | Title | Test files | Status |\n")
    lines.append("|---------|-------|------------|--------|\n")

    for fid, meta in sorted(features.items()):
        test_links = "<br>".join(tests.get(fid, ["—"]))
        title = meta.get("title", "")
        status = meta.get("status", "")
        lines.append(f"| {fid} | {title} | {test_links} | {status} |\n")

    header = (
        "<!-- DO NOT EDIT THIS FILE. Generated by scripts/gen_feature_map.py. -->\n"
        "<!-- Edit docs/client-features/*.yaml or add/remove @feature tags in tests, then rerun the script. -->\n\n"
    )
    md_text = header + "".join(lines)

    # Write to file (skip if no diff)
    if not MD_OUTFILE.exists() or MD_OUTFILE.read_text(encoding="utf-8") != md_text:
        MD_OUTFILE.write_text(md_text, encoding="utf-8")
        logger.info(f"feature-map.md updated → {MD_OUTFILE.relative_to(ROOT)}")
        # Auto-add if called from pre-commit
        subprocess.run(["git", "add", str(MD_OUTFILE)], check=False)
    else:
        logger.info("feature-map.md already up-to-date ✔")


if __name__ == "__main__":
    main()
