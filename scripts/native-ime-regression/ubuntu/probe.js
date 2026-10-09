// Passive observation installed into each page through WebDriver. It never dispatches
// events, focuses elements, or changes the observed input: it only records trusted
// composition/pointer events and answers read-only layout queries.
(() => {
    if (window.__nativeImeProbe) return;
    const probe = window.__nativeImeProbe = {
        compositions: 0,
        composing: false,
        preedit: "",
        events: [],
        pointer: null,
    };
    for (const type of ["compositionstart", "compositionupdate", "compositionend"]) {
        document.addEventListener(type, event => {
            if (!(event.target instanceof HTMLTextAreaElement)) return;
            if (type === "compositionstart" && event.isTrusted) {
                probe.compositions++;
                probe.composing = true;
                probe.preedit = "";
            }
            if (type === "compositionupdate") probe.preedit = event.data;
            if (type === "compositionend") probe.composing = false;
            probe.events.push({
                type,
                trusted: event.isTrusted,
                data: event.data,
                target: event.target.className || event.target.id,
                composition: probe.compositions,
                time: performance.now(),
            });
        }, true);
    }
    document.addEventListener("mousemove", event => {
        probe.pointer = {
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            trusted: event.isTrusted,
        };
    }, true);
})();
