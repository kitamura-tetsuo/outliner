const fs = require("fs");

function str_replace_editor(filepath, search, replace) {
    const content = fs.readFileSync(filepath, "utf8");
    if (content.indexOf(search) === -1) {
        console.error(`Search string not found in ${filepath}`);
        process.exit(1);
    }
    const updatedContent = content.replace(search, replace);
    fs.writeFileSync(filepath, updatedContent);
    console.log(`Replaced content in ${filepath}`);
}

const file1 = "client/src/components/GlobalTextArea.svelte";
const search1 = `    onpaste={async event => {
        try {
            await handlePaste(event);
        } catch (error) {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                  console.error("GlobalTextArea.handlePaste failed", error);
            }
        }
    }}`;
const replace1 = `    onpaste={async event => {
        try {
            await handlePaste(event);
        } catch (error) {
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
            if (typeof window !== "undefined" && window.DEBUG_MODE) {
                if ((error as Error)?.name !== "NotAllowedError") {
                    console.error("GlobalTextArea.handlePaste failed", error);
                }
            }
        }
    }}`;

str_replace_editor(file1, search1, replace1);

const file2 = "client/src/lib/KeyEventHandler.ts";
const search2 = `        } catch (error) {
            // Log error and notify UI if error occurs
            if (
                typeof window !== "undefined"
                && ((window as Window & typeof globalThis & { DEBUG_MODE?: boolean; }).DEBUG_MODE)
            ) {
                console.error(\`Error in handlePaste:\`, error);
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
        }`;
const replace2 = `        } catch (error) {
            // Log error and notify UI if error occurs
            if (
                typeof window !== "undefined"
                && ((window as Window & typeof globalThis & { DEBUG_MODE?: boolean; }).DEBUG_MODE)
            ) {
                if ((error as Error)?.name !== "NotAllowedError") {
                    console.error(\`Error in handlePaste:\`, error);
                }
            }
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("clipboard-read-error"));
            }
        }`;

str_replace_editor(file2, search2, replace2);
