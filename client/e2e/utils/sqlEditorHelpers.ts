import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Drives the Grid's shared Monaco SQL editor (`SqlEditor.svelte`).
 *
 * Monaco is not a form control: there is no `inputValue()` to read and no
 * `fill()` to write. Text is typed through the real keyboard, and the current
 * text is reassembled from the rendered view lines -- Monaco positions them
 * absolutely, so they are sorted by their `top` offset rather than DOM order,
 * and its non-breaking spaces are folded back to ordinary ones.
 */
export class SqlEditorHelper {
    constructor(readonly root: Locator) {}

    static byTestId(page: Page, testId: string): SqlEditorHelper {
        return new SqlEditorHelper(page.getByTestId(testId).first());
    }

    /** Waits until the lazily imported Monaco runtime has mounted an editor. */
    async waitForReady(timeout = 60000): Promise<void> {
        await expect(this.root).toHaveAttribute("data-sql-editor-status", "ready", { timeout });
        await expect(this.root.locator(".monaco-editor").first()).toBeVisible({ timeout });
    }

    /**
     * Puts the caret in the editor.
     *
     * Which node ends up focused is a Monaco implementation detail -- a hidden
     * textarea on some browsers, an `EditContext` host div on others -- so
     * containment is the only stable assertion.
     */
    async focus(): Promise<void> {
        await this.root.locator(".view-lines").first().click();
        await expect
            .poll(async () => await this.hasFocus(), { timeout: 10000 })
            .toBe(true);
    }

    /** True while the caret is inside this editor. */
    async hasFocus(): Promise<boolean> {
        return await this.root.evaluate((el) => el.contains(document.activeElement));
    }

    /** The text Monaco currently shows, line breaks included. */
    async value(): Promise<string> {
        return await this.root.locator(".view-lines").first().evaluate((el) => {
            return Array.from(el.querySelectorAll<HTMLElement>(".view-line"))
                .map((line) => ({
                    top: Number.parseFloat(line.style.top || "0"),
                    text: (line.textContent ?? "").replace(/\u00a0/g, " "),
                }))
                .sort((a, b) => a.top - b.top)
                .map((line) => line.text)
                .join("\n");
        });
    }

    /** Replaces the whole text by typing it, exercising the real key handling. */
    async setValue(page: Page, text: string): Promise<void> {
        await this.focus();
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Delete");
        // `type` sends real key events, so newlines must be explicit Enters.
        const lines = text.split("\n");
        for (const [index, line] of lines.entries()) {
            if (index > 0) await page.keyboard.press("Enter");
            await page.keyboard.type(line);
        }
    }

    /** Moves focus out of the editor, which is what commits its value. */
    async commit(page: Page): Promise<void> {
        await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
        if (await this.hasFocus()) {
            // Some layouts cover the top-left corner. What the editor reacts to
            // is losing focus, not which element received the click.
            await this.root.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        }
        await expect
            .poll(async () => await this.hasFocus(), { timeout: 10000 })
            .toBe(false);
    }

    /** Types `text` and commits it, the way a user edits and moves on. */
    async fillAndCommit(page: Page, text: string): Promise<void> {
        await this.waitForReady();
        await this.setValue(page, text);
        await this.commit(page);
    }
}
