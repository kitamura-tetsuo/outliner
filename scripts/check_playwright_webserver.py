#!/usr/bin/env python3
"""
Fail the commit if client/playwright.config.ts contains a webServer configuration.
Rationale: The project policy states "Do not add webServer." for Playwright config.

Heuristic:
- Scan the file while ignoring line comments (// ...)
- Track and skip block comments (/* ... */)
- If a non-comment segment contains 'webServer:' (case-sensitive), fail.
"""
from pathlib import Path
import sys

PLAYWRIGHT_CONFIG = Path(__file__).resolve().parents[1] / "client" / "playwright.config.ts"

def main() -> int:
    if not PLAYWRIGHT_CONFIG.exists():
        return 0

    try:
        text = PLAYWRIGHT_CONFIG.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[pre-commit] Error reading {PLAYWRIGHT_CONFIG}: {e}", file=sys.stderr)
        return 2

    if "webServer:" in text:
        print(
            "[pre-commit] Forbidden: Playwright webServer detected in client/playwright.config.ts",
            file=sys.stderr,
        )
        print("Policy: // Do not add webServer.", file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(main())
