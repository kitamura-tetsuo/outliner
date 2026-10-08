# Native IME execution report

Run: https://github.com/kitamura-tetsuo/outliner/actions/runs/37774299380
Tested checkout SHA: `89796051b4fc7d01152cf42751755e4456d5c0f6`

Artifact on the run page: `native-ime-37774299380-1`

| Capability | Classification | Observation                                                                                                                                                                               |
| ---------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A          | PROVEN         | Stock graphical Firefox has a real X11 window and visible textarea                                                                                                                        |
| B          | PROVEN         | Focused Firefox D-Bus context, loaded GTK module, real key traffic and trusted preedit                                                                                                    |
| C          | PROVEN         | XTest typing extends kana; candidate Down changes preedit; Enter value and second composition cancellation verified                                                                       |
| D          | PROVEN         | Exactly one viewable Fcitx5 Input Window, matching process PID, class and source-defined Classic UI type, correlated with trusted focused composition and screenshots                     |
| E          | PROVEN         | Root coordinates, dimensions and viewable state recorded; same panel lifecycle observed across selection, confirmation and cancellation; candidate follows real input movement within 4px |
| F          | PROVEN         | Live Latin input, missing panel with forced active flags, and real foreign-owner X11 window all rejected                                                                                  |
| G          | PROVEN         | Normal OS item click and Enter created/focused the app-owned global-textarea; same native composition, selection and panel lifecycle verified                                             |
| H          | PARTIAL        | No controlled before/after regression reproduction                                                                                                                                        |

A–G all PROVEN: True

Step outcomes: `{"APPLICATION": "success", "DEPENDENCIES": "success", "DESKTOP": "success", "OUTLINER": "success", "STANDALONE": "success"}`

Versions: packages.txt, firefox-version.txt, firefox-distribution.txt, fcitx5-version.txt and os-release.txt.
Native evidence: stage PNGs/window crops, snapshot JSON, focused-context.txt, GTK process maps, D-Bus and keyboard logs.
H requires controlled reproduction on the original revision and disappearance on the unchanged PR #5504 revision.
This workflow alone does not establish H or verify REQ-002. See docs/poc/ubuntu-firefox-fcitx5-native-ime.md.
