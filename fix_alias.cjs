const fs = require("fs");

// 1. Remove from CommentThread.svelte
let commentContent = fs.readFileSync("client/src/components/CommentThread.svelte", "utf8");
let blockToReplace =
    `// E2E stabilization: Poll input DOM value and auto-add (last resort when bind:value doesn't work depending on environment)
onMount(() => {
    let fired = false;
    const iv = setInterval(() => {
        try {
            if (fired) return;
            const inputEl = threadRef?.querySelector('[data-testid="new-comment-input"]') as HTMLInputElement | null;
            const val = inputEl?.value ?? '';
            if (val && (renderCommentsState?.length ?? 0) === 0) {
                newText = val;
                fired = true;
                try { e2eLog({ tag: 'auto-poll-add' }); } catch {}
                add();
            }
        } catch {}
    }, 120);
    return () => { try { clearInterval(iv); } catch {} };
});`;
commentContent = commentContent.replace(blockToReplace, "");
fs.writeFileSync("client/src/components/CommentThread.svelte", commentContent);

// 2. Remove e2e timer from OutlinerItem.svelte
let itemContent = fs.readFileSync("client/src/components/OutlinerItem.svelte", "utf8");

itemContent = itemContent.replace(/let e2eTimer: ReturnType<typeof setInterval> \| undefined = undefined;\n\n/g, "");
itemContent = itemContent.replace(/        try \{ if \(e2eTimer\) clearInterval\(e2eTimer\); \} catch \{\}\n/g, "");

fs.writeFileSync("client/src/components/OutlinerItem.svelte", itemContent);
