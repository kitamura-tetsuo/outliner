import assert from 'node:assert/strict';

// Serialised into regular Firefox via WebDriver. No imports, text/layout changes or
// fallback to DOM/fixture telemetry: all text comes directly from attached Y.Text.
export function readApplication() {
    const y = window.__YJS_STORE__;
    const project = y?.yjsClient?.getProject();
    const store = window.editorOverlayStore;
    const ta = document.querySelector('textarea.global-textarea');
    const telemetry = window.__nativeImeObservation;
    if (!y?.isConnected || !project?.ydoc || !store || !ta || !telemetry) {
        throw new Error('Canonical application state or current session observation unavailable');
    }
    const items = [];
    const walk = (children) => {
        for (const item of children) {
            const text = item.value.get('text');
            if (!text || text.doc !== project.ydoc || typeof text.toDelta !== 'function') {
                throw new Error(`Missing attached canonical Y.Text for ${item.id}`);
            }
            const element = document.querySelector(`.outliner-item[data-item-id="${item.id}"] .item-text`);
            items.push({ id: item.id, canonical: text.toString(), rendered: element?.textContent ?? null });
            walk(item.items);
        }
    };
    walk(project.items);
    const cursors = Object.values(store.cursors).filter(c => (c.userId ?? 'local') === 'local')
        .map(c => ({ cursorId: c.cursorId, itemId: c.itemId, offset: c.offset, userId: c.userId ?? 'local', isActive: c.isActive }))
        .sort((a, b) => a.cursorId.localeCompare(b.cursorId));
    const selections = Object.entries(store.selections).filter(([, s]) => (s.userId ?? 'local') === 'local')
        .map(([id, selection]) => ({ id, ...JSON.parse(JSON.stringify(selection)) })).sort((a, b) => a.id.localeCompare(b.id));
    return {
        ...JSON.parse(JSON.stringify(telemetry)), sequence: ++telemetry.sequence,
        documentGuid: project.ydoc.guid, url: location.href, items: items.sort((a, b) => a.id.localeCompare(b.id)),
        cursors, selections, value: ta.value, start: ta.selectionStart, end: ta.selectionEnd,
        focused: document.activeElement === ta, documentFocused: document.hasFocus(), wrap: ta.wrap,
        receiver: ta.className, rect: ta.getBoundingClientRect().toJSON(),
        window: { innerScreenX: window.mozInnerScreenX, innerScreenY: window.mozInnerScreenY },
        screen: { dpr: devicePixelRatio },
    };
}

export function installObservation(action) {
    if (window.__nativeImeObservation) throw new Error('Observation already installed in this document');
    const observation = window.__nativeImeObservation = {
        sessionId: crypto.randomUUID(), action, compositionId: 0, composing: false, sequence: 0, events: [],
    };
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'input']) {
        document.addEventListener(type, event => {
            if (!event.target.matches('textarea.global-textarea')) return;
            if (type === 'compositionstart') { observation.compositionId++; observation.composing = true; }
            if (type === 'compositionend') observation.composing = false;
            observation.events.push({ type, data: event.data, trusted: event.isTrusted,
                compositionId: observation.compositionId, sessionId: observation.sessionId,
                action: observation.action, time: Date.now(), value: event.target.value });
        }, true);
    }
    return observation.sessionId;
}

export function expectedOutcome(before, candidate, cancel = false) {
    assert.equal(before.selections.length, 0, 'Baseline must have no local selection');
    assert.ok(before.cursors.length === 1 || before.cursors.length === 2);
    assert.equal(new Set(before.cursors.map(c => c.itemId)).size, before.cursors.length);
    const items = before.items.map(item => {
        const cursor = before.cursors.find(c => c.itemId === item.id);
        const text = cursor && !cancel
            ? item.canonical.slice(0, cursor.offset) + candidate + item.canonical.slice(cursor.offset)
            : item.canonical;
        // Non-visible page title/children must retain their visibility and canonical text too.
        return { id: item.id, canonical: text, rendered: item.rendered === null ? null : text };
    });
    return { items, cursors: before.cursors.map(c => ({ ...c, offset: c.offset + (cancel ? 0 : candidate.length) })), selections: before.selections };
}

export function assertOutcome(before, after, candidate, cancel = false) {
    assert.equal(after.sessionId, before.sessionId, 'Page session changed');
    assert.equal(after.action, before.action, 'Scenario action changed');
    assert.equal(after.documentGuid, before.documentGuid, 'Canonical document changed');
    assert.equal(after.compositionId, before.compositionId + 1, 'Expected exactly one fresh composition');
    assert.equal(after.composing, false);
    assert.ok(after.focused && after.documentFocused, 'Production receiver lost focus');
    assert.equal(after.wrap, 'off');
    const expected = expectedOutcome(before, candidate, cancel);
    assert.deepEqual(after.items, expected.items, 'Canonical/rendered recipient set differs');
    assert.deepEqual(after.cursors, expected.cursors, 'Exact logical cursor set differs');
    assert.deepEqual(after.selections, expected.selections, 'Logical selections differ');
    const ends = after.events.filter(e => e.type === 'compositionend' && e.trusted
        && e.sessionId === before.sessionId && e.action === before.action && e.compositionId === after.compositionId);
    assert.equal(ends.length, 1, 'Missing or ambiguous trusted native end');
    assert.equal(ends[0].data, cancel ? '' : candidate, 'Native selected text and compositionend disagree');
    return expected;
}
