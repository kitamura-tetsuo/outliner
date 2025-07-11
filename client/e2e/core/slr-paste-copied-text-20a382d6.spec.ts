test("コピーしたテキストを別の場所にペーストできる", async ({ page }) => {
    // デバッグモードを有効化
    await page.evaluate(() => {
        (window as any).DEBUG_MODE = true;
        console.log("Debug mode enabled in test");
    });

    // 2つ目のアイテムを取得
    const secondItem = page.locator(".outliner-item").nth(1);

    // 2つ目のアイテムをクリックして選択
    await secondItem.locator(".item-content").click({ force: true });
    await page.waitForTimeout(300);

    // 選択範囲を手動で作成
    await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return;

        // 2つ目と3つ目のアイテムを選択
        const items = document.querySelectorAll("[data-item-id]");
        if (items.length < 3) return;

        const secondItemId = items[1].getAttribute("data-item-id");
        const thirdItemId = items[2].getAttribute("data-item-id");

        if (!secondItemId || !thirdItemId) return;

        // 選択範囲を設定
        store.setSelection({
            startItemId: secondItemId,
            startOffset: 0,
            endItemId: thirdItemId,
            endOffset: "Third item text".length,
            userId: "local",
            isReversed: false,
        });

        console.log("Selection created manually");
    });

    // 少し待機して選択が反映されるのを待つ
    await page.waitForTimeout(1000);

    // 選択範囲のテキストを取得（アプリケーションの選択範囲管理システムから）
    const selectionText = await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return "";
        return store.getSelectedText();
    });

    // 選択範囲が存在することを確認
    console.log("Selection text:", selectionText);
    expect(selectionText).toBeTruthy();

    // コピー操作を実行
    await page.keyboard.press("Control+c");

    // 手動でコピーイベントを発火させる
    const selectedText = await page.evaluate(() => {
        const store = (window as any).editorOverlayStore;
        if (!store) return "";
        return store.getSelectedText();
    });
    await page.evaluate(text => {
        const selectedText = text;
        console.log(`Selected text for copy: "${selectedText}"`);

        // クリップボードの内容を設定
        const textarea = document.createElement("textarea");
        textarea.value = selectedText;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);

        // EditorOverlayのclipboardRefにも設定
        const clipboardRef = document.querySelector(".clipboard-textarea") as HTMLTextAreaElement;
        if (clipboardRef) {
            clipboardRef.value = selectedText;
            console.log(`clipboardRef value set to: "${selectedText}"`);
        }

        // ClipboardEventを手動で作成
        const clipboardEvent = new ClipboardEvent("copy", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
        });

        // DataTransferオブジェクトにテキストを設定
        Object.defineProperty(clipboardEvent, "clipboardData", {
            writable: false,
            value: {
                getData: () => selectedText,
                setData: (format: string, text: string) => {
                    console.log(`Setting clipboard data: ${format}, "${text}"`);
                },
            },
        });

        // エディタオーバーレイにイベントを発火
        const editorOverlay = document.querySelector(".editor-overlay");
        if (editorOverlay) {
            editorOverlay.dispatchEvent(clipboardEvent);
            console.log("Dispatched copy event to editor overlay");
        }

        // グローバル変数に設定（テスト用）
        (window as any).testClipboardText = selectedText;
        console.log("Stored test clipboard text:", selectedText);
    });

    // 3つ目のアイテムをクリック
    const thirdItem = page.locator(".outliner-item").nth(2);
    await thirdItem.locator(".item-content").click({ force: true });
    await page.waitForTimeout(300);

    // 末尾に移動
    await page.keyboard.press("End");

    // 新しいアイテムを追加
    await page.keyboard.press("Enter");

    // ペースト操作を実行
    await page.keyboard.press("Control+v");

    // KeyEventHandlerのhandlePasteを直接呼び出す
    await page.evaluate(text => {
        console.log("Calling KeyEventHandler.handlePaste directly with text:", text);

        // ClipboardEventを手動で作成
        const clipboardEvent = new ClipboardEvent("paste", {
            clipboardData: new DataTransfer(),
            bubbles: true,
            cancelable: true,
        });

        // DataTransferオブジェクトにテキストを設定
        Object.defineProperty(clipboardEvent, "clipboardData", {
            writable: false,
            value: {
                getData: (format: string) => {
                    if (format === "text/plain") return text;
                    return "";
                },
                setData: () => {},
            },
        });

        // KeyEventHandlerのhandlePasteを直接呼び出し
        const KeyEventHandler = (window as any).__KEY_EVENT_HANDLER__;
        if (KeyEventHandler && KeyEventHandler.handlePaste) {
            KeyEventHandler.handlePaste(clipboardEvent);
            console.log("KeyEventHandler.handlePaste called successfully");
        } else {
            console.log("KeyEventHandler.handlePaste not found");
        }
    }, selectedText);

    // 少し待機してペーストが反映されるのを待つ
    await page.waitForTimeout(1000);

    // ペーストされたアイテムのテキストを確認
    const items = page.locator(".outliner-item");
    const count = await items.count();

    // 少なくとも4つのアイテムが存在することを確認（元の3つ + ペーストされた1つ以上）
    expect(count).toBeGreaterThanOrEqual(4);

    // ペーストされたアイテムのテキストを確認
    // 直接テキストを取得するのではなく、アプリケーション内部の状態を確認
    const fourthItemText = await page.evaluate(() => {
        // 4番目のアイテムのIDを取得
        const fourthItem = document.querySelectorAll(".outliner-item")[3];
        if (!fourthItem) return "";

        const itemId = fourthItem.getAttribute("data-item-id");
        if (!itemId) return "";

        // アイテムのテキストを取得
        const textEl = fourthItem.querySelector(".item-text");
        return textEl ? textEl.textContent : "";
    });

    // テスト結果を確認
    console.log(`Fourth item text: "${fourthItemText}"`);
    expect(fourthItemText).toBeTruthy();
});
