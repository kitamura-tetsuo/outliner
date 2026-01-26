import re

file_path = "client/src/components/GlobalTextArea.svelte"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

translations = {
    "エイリアスピッカー表示中: ピッカー内の矢印/Enter操作をピッカーへバイパス": "Alias picker visible: Bypass Arrow/Enter inside picker to picker",
    "エイリアスピッカー表示中: /alias コマンドを検出して直接表示させる": "Alias picker visible: Detect /alias command and show directly",
    "パレット表示中はグローバルkeydownから直接文字入力/移動/確定を転送": "Palette visible: Forward character input/move/confirm from global keydown directly",
    "軽量入力でUIだけを即時更新（モデルは変更しない）": "Immediate UI update with lightweight input (model unchanged)",
    "フィルタ結果が単一で Alias の場合は直接 insert してから閉じる（確実にピッカーを出す）": "If single filter result and Alias, insert directly then close (ensure picker shows)",
    "直接 textarea の値からも厳密に検出": "Strict detection from textarea value directly",
    "それ以外は通常の確定": "Otherwise normal confirmation",
    "グローバル: フォーカス位置に関わらず KeyEventHandler を呼ぶバックアップ": "Global: Backup calling KeyEventHandler regardless of focus position",
    "既に他で処理済みは尊重": "Respect if already processed elsewhere",
    "IME/修飾キーは無視（ただし Alt\+Shift\+Arrow は矩形選択のため許可）": "Ignore IME/modifier keys (allow Alt+Shift+Arrow for box selection)",
    "常に KeyEventHandler へ委譲（内部で必要時のみ処理される）": "Always delegate to KeyEventHandler (processed internally only if needed)",
    "フォールバック：measureCtxが利用できない場合は固定幅を設定": "Fallback: Set fixed width if measureCtx unavailable",
    "テキスト長に応じた適当な幅": "Appropriate width based on text length",
    "キーダウンイベントを KeyEventHandler へ委譲": "Delegate keydown event to KeyEventHandler",
    "入力イベントを KeyEventHandler へ委譲": "Delegate input event to KeyEventHandler",
    "CompositionEnd イベントを KeyEventHandler へ委譲": "Delegate CompositionEnd event to KeyEventHandler",
    "CompositionUpdate イベントを KeyEventHandler へ委譲": "Delegate CompositionUpdate event to KeyEventHandler",
    "コピーイベントを KeyEventHandler へ委譲": "Delegate copy event to KeyEventHandler",
    "カットイベントを KeyEventHandler へ委譲": "Delegate cut event to KeyEventHandler",
    "ペーストイベントを KeyEventHandler に委譲する非同期ハンドラ。": "Async handler delegating paste event to KeyEventHandler.",
    "`KeyEventHandler.handlePaste` は Promise を返すため `await` して": "Since `KeyEventHandler.handlePaste` returns Promise, `await` it",
    "権限拒否や読み取り失敗を捕捉し、`clipboard-permission-denied`": "catch permission denial or read failure, and `clipboard-permission-denied`",
    "または `clipboard-read-error` を dispatch してユーザーにはペーストされない。": "or `clipboard-read-error` is dispatched and not pasted to user.",
    "フォーカス喪失時の処理を追加": "Add processing for focus loss",
    "エイリアスピッカー表示中はフォーカス復元しない": "Do not restore focus while alias picker is visible",
    "フォーカスを確実に設定するための複数の試行": "Multiple attempts to ensure focus is set",
    "フォールバック: パレット表示中はグローバルkeydownから直接文字入力/移動/確定を転送": "Fallback: Forward character input/move/confirm from global keydown directly while palette is visible"
}

for jp, en in translations.items():
    content = content.replace(jp, en)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
