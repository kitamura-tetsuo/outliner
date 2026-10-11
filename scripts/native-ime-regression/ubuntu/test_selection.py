"""Offline selection validation; live Firefox/Fcitx5 controls are in regression.py."""
import unittest

from selection import selection, selection_changed, matches_preedit, matches_commit, matched_selection, candidate_text


def observation():
    return dict(source="fcitx5-candidate-list", pid=42, sequence=7, context=[1, 2], focused=True,
                cursor=1, size=3, selected="日本", pieces=[dict(text="私は", highlight=False),
                dict(text="日本", highlight=True), dict(text="人", highlight=False)])


class NativeSelection(unittest.TestCase):
    def test_legacy_mozc_annotations_are_not_committed(self):
        for label in ("ひらがな", "全角カタカナ", "半角カタカナ"):
            self.assertEqual(candidate_text(f"あゝ [{label}]"), "あゝ")
        self.assertEqual(candidate_text("嗚呼"), "嗚呼")
        for label in ("value [unknown]", "value\nusage", "value [hiragana] suffix"):
            with self.assertRaises(AssertionError):
                candidate_text(label)
        native = selection(dict(observation(), selected="あゝ [ひらがな]"), 42)
        self.assertEqual(native["text"], "あゝ")
        self.assertEqual(native["display"], "あゝ [ひらがな]")
        self.assertEqual(native["expected"], "私はあゝ人")

    def test_native_candidate_drives_segment_and_full_confirmation(self):
        native = selection(observation(), 42, 6)
        self.assertEqual(native["text"], "日本")
        self.assertEqual(native["segment"], dict(index=1, start=2, end=4))
        self.assertEqual(native["expected"], "私は日本人")
        self.assertTrue(matches_preedit(native, "私は日本人"))
        self.assertTrue(matches_commit(native, "私は日本人"))

    def test_candidate_is_independent_of_native_and_browser_preedit(self):
        native = selection(dict(observation(), selected="二本"), 42)
        self.assertEqual(native["expected"], "私は二本人")
        self.assertFalse(matches_preedit(native, "私は日本人"))
        self.assertFalse(matches_commit(native, "私は日本人"))

    def test_missing_stale_foreign_and_unfocused_data_fail_closed(self):
        changes = [dict(source="browser"), dict(pid=99), dict(sequence=6), dict(focused=False),
                   dict(cursor=-1), dict(cursor=3), dict(selected=""), dict(pieces=[]),
                   dict(pieces=[dict(text="a", highlight=True), dict(text="b", highlight=True)])]
        for changeset in changes:
            with self.subTest(changes=changeset), self.assertRaises(AssertionError):
                selection(dict(observation(), **changeset), 42, 6)

    def test_redraw_and_new_sequence_without_selection_change_are_rejected(self):
        before = selection(observation(), 42)
        after = selection(dict(observation(), sequence=8), 42)
        self.assertFalse(selection_changed(before, before))
        self.assertFalse(selection_changed(before, after))

    def test_change_requires_same_context_and_new_sequence(self):
        before = selection(observation(), 42)
        after = selection(dict(observation(), sequence=8, cursor=2, selected="二本"), 42)
        self.assertTrue(selection_changed(before, after))
        self.assertFalse(selection_changed(before, dict(after, sequence=7)))
        self.assertFalse(selection_changed(before, dict(after, context=[3, 4])))

    def test_reference_must_match_text_segment_and_full_conversion(self):
        native = selection(observation(), 42)
        self.assertTrue(matched_selection(native, dict(native, context=[3, 4], sequence=10)))
        for changes in [dict(text="二本"), dict(segment=dict(index=0, start=0, end=2)),
                        dict(expected="日本"), dict(source="browser")]:
            self.assertFalse(matched_selection(native, dict(native, **changes)))


if __name__ == "__main__":
    unittest.main()
