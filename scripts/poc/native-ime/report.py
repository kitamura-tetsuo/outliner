"""Summarize artifacts without converting setup success into native proof."""
import json
import os
from pathlib import Path

out = Path(os.environ["IME_ARTIFACTS"])
out.mkdir(parents=True, exist_ok=True)
stages = {}
for stage in ["standalone", "outliner"]:
    path = out / stage / "results.json"
    if path.exists():
        stages[stage] = json.loads(path.read_text())

results = {}
for capability in "ABCDEFGH":
    stage = "standalone" if capability in "ABCDEF" else "outliner"
    if stage in stages:
        results[capability] = stages[stage]["capabilities"][capability]
    else:
        results[capability] = dict(status="BLOCKED", reason=f"{stage} did not produce observations; inspect step outcomes and logs")

run = f"https://github.com/{os.environ.get('GITHUB_REPOSITORY', 'unknown')}/actions/runs/{os.environ.get('GITHUB_RUN_ID', 'unknown')}"
sha_path = out / "tested-sha.txt"
sha = sha_path.read_text().strip() if sha_path.exists() else "unavailable"
artifact = f"native-ime-{os.environ.get('GITHUB_RUN_ID', 'unknown')}-{os.environ.get('GITHUB_RUN_ATTEMPT', 'unknown')}"
outcomes = {k.removeprefix("IME_").removesuffix("_OUTCOME"): v for k, v in os.environ.items()
            if k.startswith("IME_") and k.endswith("_OUTCOME")}
overall = all(results[k]["status"] == "PROVEN" for k in "ABCDEFG")
lines = ["# Native IME execution report", "", f"Run: {run}", f"Tested checkout SHA: `{sha}`", "",
         f"Artifact on the run page: `{artifact}`", "",
         "| Capability | Classification | Observation |", "| --- | --- | --- |"]
lines.extend(f"| {key} | {value['status']} | {value['reason']} |" for key, value in results.items())
lines.extend(["", f"A–G all PROVEN: {overall}", "", f"Step outcomes: `{json.dumps(outcomes, sort_keys=True)}`", "",
              "Versions: packages.txt, firefox-version.txt, firefox-distribution.txt, fcitx5-version.txt and os-release.txt.",
              "Native evidence: stage PNGs/window crops, snapshot JSON, focused-context.txt, GTK process maps, D-Bus and keyboard logs.",
              "H requires controlled reproduction on the original revision and disappearance on the unchanged PR #5504 revision.",
              "This workflow alone does not establish H or verify REQ-002. See docs/poc/ubuntu-firefox-fcitx5-native-ime.md."])
(out / "execution-report.md").write_text("\n".join(lines) + "\n")
(out / "classification.json").write_text(json.dumps(dict(capabilities=results, overall=overall, steps=outcomes), indent=2))
