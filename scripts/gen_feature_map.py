#!/usr/bin/env python3
# scripts/gen_feature_map.py
"""
Scan tests for `@feature` tags, merge with docs/features.yaml,
and emit a Markdown table mapping features to test files.
Now supports **multiple test-root directories**.
"""

from pathlib import Path
import re, sys, yaml, subprocess
from loguru import logger

# ─────────────────────────  設定  ──────────────────────────
ROOT        = Path(__file__).resolve().parent.parent
YAML_SRC    = ROOT / "docs" / "client-features.yaml"
# ★ 複数ディレクトリをリストで指定
TEST_ROOTS  = [                                   # 任意で追記 / 上書き
    ROOT / "client/e2e",                         # default
    ROOT / "client/src/tests",                   # default
    ROOT / "functions/test",                     # new: Cloud Functions tests
    ROOT / "server/tests",                       # new: server unit tests
]
MD_OUTFILE  = ROOT / "docs" / "feature-map.md"        # 出力先
# Accept any capitalized prefix like CLM-0001 or API-0123
FEATURE_RE  = re.compile(r"@feature\s+([A-Z]+-\d{3,4})", re.I)
# ──────────────────────────────────────────────────────────

# ---------- Loguru ----------
logger.remove()
logger.add(sys.stdout, format="<lvl>{message}</lvl>")
logger.add(ROOT / "scripts" / "gen_feature_map.log", rotation="1 MB")

# ---------- Helpers ----------

def load_features():
    data = yaml.safe_load(YAML_SRC.read_text(encoding="utf-8"))
    return {f["id"]: f for f in data}


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

    # Markdown をバッファに貯める
    lines: list[str] = []
    lines.append("# Feature ↔ Test Matrix\n")
    lines.append("| Feature | Title | Test files | Status |\n")
    lines.append("|---------|-------|------------|--------|\n")

    for fid, meta in sorted(features.items()):
        test_links = "<br>".join(tests.get(fid, ["—"]))
        lines.append(
            f"| {fid} | {meta['title']} | {test_links} | {meta['status']} |\n"
        )

    md_text = "".join(lines)

    # ファイルへ書き込み（差分がなければスキップ）
    if not MD_OUTFILE.exists() or MD_OUTFILE.read_text(encoding="utf-8") != md_text:
        MD_OUTFILE.write_text(md_text, encoding="utf-8")
        logger.info(f"feature-map.md updated → {MD_OUTFILE.relative_to(ROOT)}")
        # pre-commit から呼ばれた場合に備え、自動 add しておく
        subprocess.run(["git", "add", str(MD_OUTFILE)], check=False)
    else:
        logger.info("feature-map.md already up-to-date ✔")


if __name__ == "__main__":
    main()
