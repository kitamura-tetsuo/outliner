"""Validate native panel observations independently of browser preedit/commit."""
import re


def candidate_text(text):
    """Mozc 2.28/2.29 embeds descriptions in CandidateWord.text as ' [description]'.

    New Mozc uses CandidateWord.comment instead. Decode only the known script
    annotations in this kana-only regression corpus; reject ambiguous labels.
    Never use browser or native preedit to infer the candidate's value.
    """
    match = re.fullmatch(r"([^\[\]\n]+) \[(ひらがな|全角カタカナ|半角カタカナ)\]", text)
    if match:
        return match[1]
    if " [" in text or "\n" in text:
        raise AssertionError(f"Unsupported Mozc candidate annotation: {text!r}")
    return text


def selection(observed, pid, after=0):
    if (observed.get("source") != "fcitx5-candidate-list" or observed.get("pid") != pid
            or observed.get("sequence", 0) <= after or not observed.get("focused")
            or not 0 <= observed.get("cursor", -1) < observed.get("size", 0)
            or not observed.get("selected")):
        raise AssertionError("Missing, stale, unfocused or foreign native selection")
    pieces = observed["pieces"]
    focused = [i for i, piece in enumerate(pieces) if piece["highlight"]]
    if len(focused) != 1:
        raise AssertionError("Expected exactly one natively highlighted Mozc segment")
    index = focused[0]
    prefix = "".join(p["text"] for p in pieces[:index])
    suffix = "".join(p["text"] for p in pieces[index + 1:])
    # The candidate list supplies the confirmation expectation. The native
    # preedit supplies only the other segments and the focused segment's range.
    selected = candidate_text(observed["selected"])
    return dict(source=observed["source"], pid=pid, sequence=observed["sequence"], context=observed["context"],
                cursor=observed["cursor"], text=selected, display=observed.get("display", observed["selected"]),
                segment=dict(index=index, start=len(prefix), end=len(prefix) + len(pieces[index]["text"])),
                expected=prefix + selected + suffix)


def selection_changed(before, after):
    return (before["context"] == after["context"] and after["sequence"] > before["sequence"]
            and (before["cursor"], before["text"], before["segment"]) !=
                (after["cursor"], after["text"], after["segment"]))


def matches_preedit(native, preedit):
    return native["expected"] == preedit


def matches_commit(native, committed):
    return native["expected"] == committed


def matched_selection(app, reference):
    return (app["source"] == reference["source"] == "fcitx5-candidate-list"
            and app["text"] == reference["text"] and app["segment"] == reference["segment"]
            and app["expected"] == reference["expected"])
