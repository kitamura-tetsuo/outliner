"""Native Fcitx5 candidate-panel identity.

Builds on the prepared PoC observer (scripts/poc/native-ime/observer.py), which matches the
published window properties (_NET_WM_PID, WM_NAME, WM_CLASS, window type, viewability).
Those properties are writable by any X client, so this module additionally requires the
X server's own record of the client that created the window (X-Resource extension) to be
the launched Fcitx5 daemon. A foreign window that copies every property, including the
daemon's PID, is therefore still rejected.
"""
import sys
from pathlib import Path

from Xlib.ext import res

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "scripts/poc/native-ime"))
from observer import candidate_windows  # noqa: E402  (prepared PoC predicate)
from x11 import Desktop  # noqa: E402  (prepared PoC X11 reader)


def owner_pid(display, window_id):
    """PID of the X client owning ``window_id`` as recorded by the X server."""
    reply = display.res_query_client_ids([{"client": window_id, "mask": res.LocalClientPIDMask}])
    for client in reply.ids:
        if client.spec.mask == res.LocalClientPIDMask and client.value:
            return int(client.value[0])
    return None


class NativeDesktop(Desktop):
    def windows(self):
        records = super().windows()
        for record in records:
            try:
                record["owner_pid"] = owner_pid(self.display, record["id"])
            except Exception as error:  # A vanished window cannot be attributed to any owner.
                record["owner_pid"] = None
                record["owner_error"] = repr(error)
        return records

    def spoofed_candidate(self, pid, x=1300, y=100):
        """A foreign window copying every published candidate property, including ``pid``."""
        from Xlib import Xatom
        window = super().unrelated_window()
        window.change_property(self.display.intern_atom("_NET_WM_PID"), Xatom.CARDINAL, 32, [pid])
        window.configure(x=x, y=y)
        self.display.sync()
        return window


def native_candidates(windows, fcitx_pid):
    return [w for w in candidate_windows(windows, fcitx_pid) if w.get("owner_pid") == fcitx_pid]


def require_native_candidate(windows, fcitx_pid, composing, focused):
    """Exactly one visible panel owned by the Fcitx5 daemon during focused composition."""
    if not composing or not focused:
        raise AssertionError("No active trusted composition in the focused receiver")
    matches = native_candidates(windows, fcitx_pid)
    if len(matches) != 1:
        published = len(candidate_windows(windows, fcitx_pid))
        raise AssertionError(f"Expected one native Fcitx5 candidate panel; found {len(matches)} "
                             f"({published} with matching published properties)")
    return matches[0]
