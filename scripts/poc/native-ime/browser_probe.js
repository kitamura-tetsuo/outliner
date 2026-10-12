// Passive browser observation only. This does not dispatch events or change the input.
window.__nativeIme = { events: [], composing: false, preedit: "" };
for (const type of ["keydown", "keyup", "compositionstart", "compositionupdate", "compositionend", "input"]) {
    document.addEventListener(type, event => {
        if (!(event.target instanceof HTMLTextAreaElement)) return;
        const state = window.__nativeIme;
        if (type === "compositionstart") state.composing = event.isTrusted;
        if (type === "compositionupdate") state.preedit = event.data;
        if (type === "compositionend") state.composing = false;
        const rect = event.target.getBoundingClientRect();
        state.events.push({
            type,
            trusted: event.isTrusted,
            data: event.data,
            key: event.key,
            value: event.target.value,
            time: performance.now(),
            target: event.target.className || event.target.id,
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        });
    }, true);
}
