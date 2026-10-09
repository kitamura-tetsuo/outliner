"""Native observer preflight on a real Firefox textarea, without application services."""
import os
import traceback

import regression as r
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service


def main():
    r.OUT.mkdir(parents=True, exist_ok=True)
    r.desktop = r.NativeDesktop()
    options = Options()
    options.binary_location = os.environ.get("IME_FIREFOX_BINARY", "/usr/bin/firefox")
    options.set_preference("layout.css.devPixelsPerPx", "1.0")
    r.driver = webdriver.Firefox(options=options, service=Service(str(r.ROOT / "work/native-ime/geckodriver"),
                                                                log_output=str(r.OUT / "geckodriver.log")))
    controls = []
    try:
        r.driver.set_window_rect(x=40, y=40, width=1450, height=880)
        r.handles["reference"] = r.driver.current_window_handle
        r.driver.get(r.REFERENCE_URL)
        r.tab("reference")
        r.place_reference(dict(left=120, glyphTop=120, glyphHeight=23, lineHeight=24,
                               font=dict(fontFamily="Noto Sans CJK JP", fontSize="16px", fontWeight="400",
                                         fontStyle="normal", letterSpacing="normal")))
        r.native_selection_controls(controls)
        # Also exercise all three sizes in a single composition and cancellation.
        r.tab("reference")
        r.driver.execute_script("document.getElementById('reference').value = ''")
        samples, _, after = r.compose("reference", "#reference", "observer-preflight", r.reference_line, "cancel")
        r.record("observer-preflight-cancel-restores-empty", after["value"] == "")
        r.save("selection-preflight", dict(ok=True, controls=controls, samples=samples, assertions=r.assertions))
    except Exception:
        r.save("selection-preflight", dict(ok=False, controls=controls, assertions=r.assertions,
                                           error=traceback.format_exc(), state=r.state("#reference"),
                                           native=r.native_raw()))
        r.capture("selection-preflight-failure")
        raise
    finally:
        r.driver.quit()


if __name__ == "__main__":
    main()
