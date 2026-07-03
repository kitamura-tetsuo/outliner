const fs = require('fs');

let content = fs.readFileSync('client/src/components/OutlinerTree.svelte', 'utf-8');

const matchBlock = `                    let structureChanged = false;
                    const changedKeys = new SvelteSet<string>();

                    events.forEach(e => {
                        if (e.target === ymap) {
                            structureChanged = true;
                        } else if (e.path.length > 0) {
                            const nodeKey = String(e.path[0]);
                            if (e.path.length >= 2 && e.path[1] === "_parentHistory") {
                                structureChanged = true;
                            } else {
                                changedKeys.add(nodeKey);
                            }
                        } else {
                            structureChanged = true;
                        }
                    });

                    __lastUpdateInfo = {
                        tick: Date.now(),
                        changedKeys,
                        structureChanged
                    };`;

const newBlock = `                    let shouldQueue = false;

                    events.forEach(e => {
                        if (e.target === ymap) {
                            __batchedUpdates.structureChanged = true;
                            shouldQueue = true;
                        } else if (e.path.length > 0) {
                            const nodeKey = String(e.path[0]);
                            if (e.path.length >= 2 && e.path[1] === "_parentHistory") {
                                __batchedUpdates.structureChanged = true;
                                shouldQueue = true;
                            } else {
                                __batchedUpdates.changedKeys.add(nodeKey);
                                shouldQueue = true;
                            }
                        } else {
                            __batchedUpdates.structureChanged = true;
                            shouldQueue = true;
                        }
                    });

                    if (shouldQueue && !__updateQueued) {
                        __updateQueued = true;
                        queueMicrotask(() => {
                            __lastUpdateInfo = {
                                tick: Date.now(),
                                changedKeys: new SvelteSet(__batchedUpdates.changedKeys),
                                structureChanged: __batchedUpdates.structureChanged
                            };

                            __batchedUpdates.changedKeys.clear();
                            __batchedUpdates.structureChanged = false;
                            __updateQueued = false;
                        });
                    }`;

if (!content.includes(matchBlock)) {
    console.error("Match block not found! The file might have been modified.");
} else {
    content = content.replace(matchBlock, newBlock);

    // Add the missing batched updates state back
    const stateMatch = `    let __lastUpdateInfo = $state({ tick: 0, changedKeys: new SvelteSet<string>(), structureChanged: true });`;
    const newState = `    let __batchedUpdates = {
        changedKeys: new SvelteSet<string>(),
        structureChanged: false
    };
    let __updateQueued = false;

    let __lastUpdateInfo = $state({ tick: 0, changedKeys: new SvelteSet<string>(), structureChanged: true });`;

    content = content.replace(stateMatch, newState);

    fs.writeFileSync('client/src/components/OutlinerTree.svelte', content);
    console.log("Restored queueMicrotask with correct _parentHistory logic");
}
