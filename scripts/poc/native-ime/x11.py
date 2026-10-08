"""Read actual X11 windows and root pixels; no browser-rendered panel substitutes."""
import os
from Xlib import X, Xatom, display, error
from PIL import Image


class Desktop:
    def __init__(self):
        self.display = display.Display()
        self.root = self.display.screen().root

    def windows(self):
        records = []

        def walk(parent):
            for win in parent.query_tree().children:
                try:
                    geom = win.get_geometry()
                    pos = self.root.translate_coords(win, 0, 0)
                    pid = win.get_full_property(self.display.intern_atom("_NET_WM_PID"), X.AnyPropertyType)
                    types = win.get_full_property(self.display.intern_atom("_NET_WM_WINDOW_TYPE"), X.AnyPropertyType)
                    records.append(dict(id=win.id, name=win.get_wm_name(),
                                        **{"class": list(win.get_wm_class() or [])},
                                        pid=int(pid.value[0]) if pid is not None else None,
                                        types=[self.display.get_atom_name(int(t)) for t in types.value] if types is not None else [],
                                        viewable=win.get_attributes().map_state == X.IsViewable,
                                        x=pos.x, y=pos.y, width=geom.width, height=geom.height))
                    walk(win)
                except error.XError:
                    # Windows may disappear between QueryTree and GetAttributes.
                    continue
        walk(self.root)
        return records

    def screenshot(self, path):
        geom = self.root.get_geometry()
        assert geom.depth == 24, "Unsupported X11 pixel layout; no silent screenshot fallback"
        pixels = self.root.get_image(0, 0, geom.width, geom.height, X.ZPixmap, 0xffffffff)
        Image.frombytes("RGB", (geom.width, geom.height), pixels.data, "raw", "BGRX").save(path)

    def unrelated_window(self):
        # A real foreign X11 window with plausible title/class/type must be rejected.
        win = self.root.create_window(1300, 100, 200, 150, 0, X.CopyFromParent, X.InputOutput,
                                      X.CopyFromParent, background_pixel=self.display.screen().white_pixel)
        win.set_wm_name("Fcitx5 Input Window")
        win.set_wm_class("fcitx", "fcitx")
        win.change_property(self.display.intern_atom("_NET_WM_PID"), Xatom.CARDINAL, 32, [os.getpid()])
        win.change_property(self.display.intern_atom("_NET_WM_WINDOW_TYPE"), Xatom.ATOM, 32,
                            [self.display.intern_atom("_NET_WM_WINDOW_TYPE_COMBO")])
        win.map()
        self.display.sync()
        return win
