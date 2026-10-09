"""Summarize one native IME regression job into verdict.json and a Markdown report.

Usage: python3 report.py ubuntu|windows <artifact directory>

The verdict is derived only from the job's own assertion records and evidence files; a
missing file is a failure, never a skipped check. Exit status is non-zero unless the
required native scenarios and controls all passed for a verified application revision.
"""
import json
import os
import sys
from pathlib import Path


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        return None


def ubuntu(directory):
    results = load(directory / "results.json") or {}
    identity = results.get("application") or {}
    assertions = results.get("assertions") or []
    failed = [a["name"] for a in assertions if not a["passed"]]
    rows = []
    for scenario in results.get("scenarios") or []:
        for index, sample in enumerate(scenario["samples"]):
            verdict = sample["verdict"]
            native = sample["application"].get("selection") or {}
            rows.append(f"| {scenario['label']} | {index + 1} | `{native.get('text')}` | `{native.get('segment')}` | "
                        f"{verdict['displacement_px']:.2f} | {min(verdict['covered'].values()):.2f} | "
                        f"{'PASS' if verdict['ok'] else 'FAIL'} |")
    controls = [f"| {c['name']} | {', '.join(c.get('failed') or [r['control'] for r in c.get('rejections', [])])} | "
                f"{c.get('defect_px', '-') if 'defect_px' in c else '-'} |" for c in results.get("negative_controls") or []]
    scenarios = {s["label"] for s in results.get("scenarios") or []}
    required = {"empty-confirm-application", "empty-cancel-application", "after-text-confirm-application",
                "after-text-cancel-application"}
    control_names = {c["name"] for c in results.get("negative_controls") or []}
    required_controls = {"control-missing-and-foreign", "control-horizontal-displacement-without-overlap",
                         "control-overlap-without-horizontal-displacement", "control-redraw-without-selection-change",
                         "control-native-selection-preedit-mismatch", "control-native-selection-commit-mismatch"}
    ok = (results.get("status") == "PASSED" and identity.get("verified") is True and not failed
          and required <= scenarios and required_controls <= control_names)
    lines = ["## Ubuntu/X11 Firefox + Fcitx5 native IME regression", "",
             f"**Verdict: {'PASSED' if ok else 'FAILED'}**", "",
             f"- Application SHA (served, verified={identity.get('verified')}): `{identity.get('sha')}`",
             f"- Harness SHA: `{(results.get('harness') or {}).get('sha')}`",
             f"- Run: {(results.get('run') or {}).get('url')}",
             f"- Assertions: {len(assertions) - len(failed)} passed, {len(failed)} failed",
             f"- Tolerances (declared before observation): `{json.dumps(results.get('tolerances'))}`",
             f"- Calibration: `{json.dumps((results.get('calibration') or {}))[:300]}`", ""]
    if failed:
        lines += ["Failed assertions:", ""] + [f"- `{name}`" for name in failed[:40]] + [""]
    lines += ["| Scenario | Stage | Native selected candidate | Focused segment | Horizontal displacement px | Coverage px | Verdict |",
              "| --- | --- | --- | --- | --- | --- | --- |"] + rows + ["",
              "| Negative control | Rejected by | Defect px |", "| --- | --- | --- |"] + controls
    versions = directory / "versions.txt"
    if versions.exists():
        lines += ["", "```", versions.read_text(errors="replace").strip(), "```"]
    return ok, dict(platform="ubuntu", ok=ok, failed=failed, application=identity), lines


WINDOWS_CONTROLS = {"production-1-confirm": 3, "production-1-cancel": 1, "production-2-confirm": 4,
                    "production-2-cancel": 1}


def windows(directory):
    results = load(directory / "results.json") or {}
    capabilities = results.get("capabilities") or {}
    identity = load(directory / "application-identity.json") or {}
    revision = load(directory / "application-revision.json") or {}
    scenarios = load(directory / "production-scenarios.json") or []
    if isinstance(scenarios, dict):
        scenarios = [scenarios]
    proven = {key: value.get("status") for key, value in capabilities.items()}
    actions = {s.get("baseline", {}).get("action"): s.get("result") for s in scenarios}
    controls = {}
    for path in directory.glob("production-*-control-*.json"):
        control = load(path) or {}
        action = path.name.split("-control-")[0]
        controls.setdefault(action, []).append(bool(control.get("rejected")))
    control_ok = all(len(controls.get(action, [])) == count and all(controls[action])
                     for action, count in WINDOWS_CONTROLS.items())
    ok = (identity.get("verified") is True and revision.get("applicationSha") == identity.get("sha")
          and revision.get("applicationImageLabel") == identity.get("sha")
          and set("ABCDEFGHIJK") <= set(proven) and all(v == "PROVEN" for v in proven.values())
          and all(actions.get(action) == "PROVEN" for action in WINDOWS_CONTROLS) and control_ok)
    lines = ["## Windows Firefox + Microsoft Japanese IME native regression", "",
             f"**Verdict: {'PASSED' if ok else 'FAILED'}**", "",
             f"- Application SHA (served, verified={identity.get('verified')}): `{identity.get('sha')}`; "
             f"backend image label `{revision.get('applicationImageLabel')}`",
             f"- Harness SHA: `{revision.get('harnessSha') or os.environ.get('GITHUB_SHA')}`",
             f"- Capabilities: `{json.dumps(proven)}`",
             "", "| Scenario | Outcome | Live document/cursor controls rejected |", "| --- | --- | --- |"]
    for action, count in WINDOWS_CONTROLS.items():
        rejected = controls.get(action, [])
        lines.append(f"| {action} | {actions.get(action, 'NOT RUN')} | {sum(rejected)}/{count} |")
    return ok, dict(platform="windows", ok=ok, capabilities=proven, scenarios=actions,
                    controls={k: sum(v) for k, v in controls.items()}, application=identity), lines


def main():
    platform, directory = sys.argv[1], Path(sys.argv[2])
    ok, verdict, lines = (ubuntu if platform == "ubuntu" else windows)(directory)
    (directory / "verdict.json").write_text(json.dumps(verdict, ensure_ascii=False, indent=2), encoding="utf-8")
    report = "\n".join(lines) + "\n"
    (directory / "report.md").write_text(report, encoding="utf-8")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write(report)
    print(report)
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
