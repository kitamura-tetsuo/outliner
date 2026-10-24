import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { registerCoverageHooks } from "../utils/registerCoverageHooks";
import { TestHelpers } from "../utils/testHelpers";
registerCoverageHooks();

const BODY_LINES = ["Line 1", "Line 2", "Line 3"];
const EXPECTED_CLIPBOARD = BODY_LINES.join("\n");

async function seededItemId(page: Page, text: string, title = false) {
    const matches = await page.locator(".outliner-item[data-item-id]").evaluateAll(
        (rows, expected) =>
            rows.filter(row => {
                const itemText = row.querySelector(".item-text");
                return itemText?.textContent === expected.text
                    && itemText.classList.contains("title-text") === expected.title;
            }).map(row => row.getAttribute("data-item-id")),
        { text, title },
    );
    expect(matches, `one seeded ${title ? "title" : "body item"} named ${text}`).toHaveLength(1);
    expect(matches[0]).toBeTruthy();
    return matches[0]!;
}

async function localEditorState(page: Page) {
    return page.evaluate(() => {
        const store = globalThis.editorOverlayStore! as unknown as {
            cursors: Record<string, { userId?: string; itemId: string; offset: number; isActive: boolean; }>;
            selections: Record<string, {
                userId?: string;
                startItemId: string;
                startOffset?: number;
                endItemId: string;
                endOffset?: number;
                isReversed?: boolean;
            }>;
            activeItemId: string | undefined;
            getSelectedText: (userId: string) => string;
        };
        return {
            cursors: Object.values(store.cursors).filter(cursor => (cursor.userId ?? "local") === "local").map(
                cursor => ({
                    itemId: cursor.itemId,
                    offset: cursor.offset,
                    isActive: cursor.isActive,
                }),
            ),
            selections: Object.values(store.selections).filter(selection => (selection.userId ?? "local") === "local")
                .map(selection => ({
                    startItemId: selection.startItemId,
                    startOffset: selection.startOffset,
                    endItemId: selection.endItemId,
                    endOffset: selection.endOffset,
                    isReversed: Boolean(selection.isReversed),
                })),
            activeItemId: store.activeItemId,
            editorFocused: document.activeElement === document.querySelector(".global-textarea"),
            selectedText: store.getSelectedText("local"),
        };
    });
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
    const serializableValue = value === undefined ? { status: "unavailable" } : value;
    await testInfo.attach(`${name}.json`, {
        body: Buffer.from(JSON.stringify(serializableValue, undefined, 2)),
        contentType: "application/json",
    });
}

function errorEvidence(error: unknown) {
    return error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { name: "NonError", message: String(error) };
}

function rethrowWithEvidenceFailure(primaryError: unknown, attachmentError: unknown): never {
    if (primaryError instanceof Error) {
        Object.defineProperty(primaryError, "evidenceAttachmentError", {
            configurable: true,
            enumerable: true,
            value: errorEvidence(attachmentError),
        });
        throw primaryError;
    }
    throw new AggregateError(
        [primaryError, attachmentError],
        "The primary failure was not an Error and its evidence could not be attached",
    );
}

class CaretStateMismatchError extends Error {
    constructor(
        readonly actual: Awaited<ReturnType<typeof localEditorState>>,
        readonly expected: ReturnType<typeof titleEndCaretState>,
        options: ErrorOptions,
    ) {
        super("The observed caret state does not match the required title-end prerequisite", options);
        this.name = "CaretStateMismatchError";
    }
}

class ClipboardMismatchError extends Error {
    constructor(readonly actual: string, readonly expected: string, options?: ErrorOptions) {
        super(`The actual clipboard does not equal the required clipboard text`, options);
        this.name = "ClipboardMismatchError";
    }
}

async function expectTitleEndCaret(
    page: Page,
    titleId: string,
    titleLength: number,
    testInfo: TestInfo,
    evidenceName: string,
    timeout = 10_000,
) {
    let observation: Awaited<ReturnType<typeof localEditorState>> | undefined;
    let observationError: unknown;
    let assertionError: unknown;
    try {
        await expect.poll(async () => {
            try {
                observation = await localEditorState(page);
                observationError = undefined;
                return observation;
            } catch (error) {
                observation = undefined;
                observationError = error;
                throw error;
            }
        }, { timeout })
            .toEqual(titleEndCaretState(titleId, titleLength));
    } catch (error) {
        assertionError = error;
    }

    const evidence = observation === undefined
        ? { status: "unavailable", error: errorEvidence(observationError ?? assertionError) }
        : { status: "observed", observation };
    try {
        await attachJson(testInfo, evidenceName, evidence);
    } catch (attachmentError) {
        if (assertionError !== undefined) {
            rethrowWithEvidenceFailure(assertionError, attachmentError);
        }
        throw attachmentError;
    }

    if (assertionError !== undefined) {
        if (observation === undefined || observationError !== undefined) throw assertionError;
        throw new CaretStateMismatchError(
            observation,
            titleEndCaretState(titleId, titleLength),
            { cause: assertionError },
        );
    }

    return observation!;
}

function titleEndCaretState(titleId: string, titleLength: number) {
    return {
        cursors: [{ itemId: titleId, offset: titleLength, isActive: true }],
        selections: [],
        activeItemId: titleId,
        editorFocused: true,
        selectedText: "",
    };
}

async function selectThreeBodyLines(
    page: Page,
    titleId: string,
    titleLength: number,
    thirdBodyId: string,
    testInfo: TestInfo,
) {
    for (let i = 0; i < 3; i++) await page.keyboard.press("Shift+ArrowDown");
    let observation: Awaited<ReturnType<typeof localEditorState>> | undefined;
    let observationError: unknown;
    let assertionError: unknown;
    try {
        await expect.poll(async () => {
            try {
                observation = await localEditorState(page);
                observationError = undefined;
                return observation;
            } catch (error) {
                observation = undefined;
                observationError = error;
                throw error;
            }
        }, { timeout: 10_000 }).toMatchObject({
            selections: [{
                startItemId: titleId,
                startOffset: titleLength,
                endItemId: thirdBodyId,
                endOffset: BODY_LINES[2].length,
                isReversed: false,
            }],
            editorFocused: true,
            selectedText: EXPECTED_CLIPBOARD,
        });
    } catch (error) {
        assertionError = error;
    }

    const evidence = observation === undefined
        ? { status: "unavailable", error: errorEvidence(observationError ?? assertionError) }
        : { status: "observed", observation };
    try {
        await attachJson(testInfo, "final-selection", evidence);
    } catch (attachmentError) {
        if (assertionError !== undefined) {
            rethrowWithEvidenceFailure(assertionError, attachmentError);
        }
        throw attachmentError;
    }

    if (assertionError !== undefined) throw assertionError;
    return observation!;
}

async function expectActualClipboard(
    page: Page,
    testInfo: TestInfo,
    evidenceName: string,
) {
    let actualClipboard: string;
    try {
        actualClipboard = await page.evaluate(() => navigator.clipboard.readText());
    } catch (readError) {
        try {
            await attachJson(testInfo, evidenceName, { status: "unavailable", error: errorEvidence(readError) });
        } catch (attachmentError) {
            rethrowWithEvidenceFailure(readError, attachmentError);
        }
        throw readError;
    }

    await attachJson(testInfo, evidenceName, { status: "observed", actualClipboard });
    try {
        expect(actualClipboard).toBe(EXPECTED_CLIPBOARD);
    } catch (error) {
        throw new ClipboardMismatchError(actualClipboard, EXPECTED_CLIPBOARD, { cause: error });
    }
    return actualClipboard;
}

test.use({ trace: "retain-on-failure", screenshot: "only-on-failure" });

test.describe("Ctrl+C copies cross-item selection", () => {
    test("copies exact selected text via mouse drag", async ({ page }) => {
        await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);

        const item1 = page.locator(".item-text").nth(0);
        const item3 = page.locator(".item-text").nth(3);
        await item1.hover();
        await page.mouse.down();
        await item3.hover();
        await page.mouse.up();

        await page.keyboard.press("Control+c");
        await page.waitForTimeout(300);

        const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboardText).toBe(EXPECTED_CLIPBOARD);
    });

    test("copies exact selected text via Shift+ArrowDown", async ({ page }) => {
        const testInfo = test.info();
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const bodyIds = await Promise.all(BODY_LINES.map(line => seededItemId(page, line)));
        const title = page.locator(`[data-item-id="${titleId}"] .item-text.title-text`);

        await title.click();
        await page.keyboard.press("End");
        await expectTitleEndCaret(page, titleId, pageName.length, testInfo, "initial-caret");
        await selectThreeBodyLines(page, titleId, pageName.length, bodyIds[2], testInfo);

        const sentinel = `uncopied-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(sentinel);
        await page.keyboard.press("Control+c");
        await expectActualClipboard(page, testInfo, "actual-clipboard");
    });

    test("rejects a title-start origin before copy", async ({ page }) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const sentinel = `wrong-origin-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);

        await page.locator(`[data-item-id="${titleId}"] .item-text.title-text`).click();
        await page.keyboard.press("Home");
        await expect.poll(() => localEditorState(page), { timeout: 10_000 })
            .toEqual(titleEndCaretState(titleId, 0));
        let rejection: unknown;
        try {
            await expectTitleEndCaret(page, titleId, pageName.length, test.info(), "rejected-wrong-origin", 1_000);
        } catch (error) {
            rejection = error;
        }
        expect(rejection).toBeInstanceOf(CaretStateMismatchError);
        expect((rejection as CaretStateMismatchError).actual).toEqual(titleEndCaretState(titleId, 0));
        expect((rejection as CaretStateMismatchError).expected).toEqual(titleEndCaretState(titleId, pageName.length));
        const actualClipboard = await page.evaluate(() => navigator.clipboard.readText());
        await attachJson(test.info(), "wrong-origin-clipboard", { actualClipboard });
        expect(actualClipboard).toBe(sentinel);
    });

    test("does not accept a stale clipboard when copy is a no-op", async ({ page }) => {
        const { pageName } = await TestHelpers.seedProjectAndNavigate(page, test.info(), BODY_LINES);
        const titleId = await seededItemId(page, pageName, true);
        const thirdBodyId = await seededItemId(page, BODY_LINES[2]);
        await page.locator(`[data-item-id="${titleId}"] .item-text.title-text`).click();
        await page.keyboard.press("End");
        await expectTitleEndCaret(page, titleId, pageName.length, test.info(), "initial-caret");
        await selectThreeBodyLines(page, titleId, pageName.length, thirdBodyId, test.info());

        const sentinel = `no-op-copy-${crypto.randomUUID()}`;
        await page.evaluate(value => navigator.clipboard.writeText(value), sentinel);
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(sentinel);
        let rejection: unknown;
        try {
            await expectActualClipboard(page, test.info(), "rejected-no-op-clipboard");
        } catch (error) {
            rejection = error;
        }
        expect(rejection).toBeInstanceOf(ClipboardMismatchError);
        expect((rejection as ClipboardMismatchError).actual).toBe(sentinel);
        expect((rejection as ClipboardMismatchError).expected).toBe(EXPECTED_CLIPBOARD);
    });

    test("does not classify unavailable observations as expected control mismatches", async ({ page }) => {
        const testInfo = test.info();
        await page.close();

        let caretFailure: unknown;
        try {
            await expectTitleEndCaret(page, "unavailable-title", 1, testInfo, "unavailable-caret", 100);
        } catch (error) {
            caretFailure = error;
        }
        expect(caretFailure).toBeInstanceOf(Error);
        expect(caretFailure).not.toBeInstanceOf(CaretStateMismatchError);

        let clipboardFailure: unknown;
        try {
            await expectActualClipboard(page, testInfo, "unavailable-clipboard");
        } catch (error) {
            clipboardFailure = error;
        }
        expect(clipboardFailure).toBeInstanceOf(Error);
        expect(clipboardFailure).not.toBeInstanceOf(ClipboardMismatchError);

        for (const name of ["unavailable-caret.json", "unavailable-clipboard.json"]) {
            const attachment = testInfo.attachments.find(candidate => candidate.name === name);
            expect(attachment?.body).toBeTruthy();
            const evidence = JSON.parse(attachment!.body!.toString()) as { status: string; error?: unknown; };
            expect(evidence.status).toBe("unavailable");
            expect(evidence.error).toBeTruthy();
        }
    });
});
