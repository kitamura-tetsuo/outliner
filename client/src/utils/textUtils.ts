// Utility functions for text measuring and cursor positioning

// getClickPosition: Text Element と MouseEvent, content を受け取り、オフセットを返す
export function getClickPosition(textEl: HTMLElement, event: MouseEvent, content: string): number {
    const x = event.clientX;
    const y = event.clientY;
    // Caret API を試す
    if (
        textEl
        && (document.caretRangeFromPoint
            || (document as {
                caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number; } | null;
            }).caretPositionFromPoint)
    ) {
        let range: Range | null = null;
        if (document.caretRangeFromPoint) {
            range = document.caretRangeFromPoint(x, y);
        } else {
            const posInfo = (document as {
                caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number; } | null;
            }).caretPositionFromPoint(x, y);
            if (posInfo) {
                range = document.createRange();
                range.setStart(posInfo.offsetNode, posInfo.offset);
                range.collapse(true);
            }
        }
        if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
            return Math.min(Math.max(0, range.startOffset), content.length);
        }
    }
    // フォールバック: span を使って幅測定
    const rect = textEl.getBoundingClientRect();
    const relX = x - rect.left;
    const span = document.createElement("span");
    const style = window.getComputedStyle(textEl);
    span.style.fontFamily = style.fontFamily;
    span.style.fontSize = style.fontSize;
    span.style.fontWeight = style.fontWeight;
    span.style.letterSpacing = style.letterSpacing;
    span.style.whiteSpace = "pre";
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    document.body.appendChild(span);
    let best = 0;
    let minDist = Infinity;
    for (let i = 0; i <= content.length; i++) {
        span.textContent = content.slice(0, i);
        const w = span.getBoundingClientRect().width;
        const d = Math.abs(w - relX);
        if (d < minDist) {
            minDist = d;
            best = i;
        }
    }
    document.body.removeChild(span);
    return best;
}

// pixelPositionToTextPosition: 画面X座標と表示要素を受け取り、テキストオフセットを返す
export function pixelPositionToTextPosition(screenX: number, displayRef: HTMLElement): number {
    const textElement = displayRef.querySelector(".item-text") as HTMLElement;
    if (!textElement) return 0;
    const styles = window.getComputedStyle(textElement);
    const span = document.createElement("span");
    span.style.fontFamily = styles.fontFamily;
    span.style.fontSize = styles.fontSize;
    span.style.fontWeight = styles.fontWeight;
    span.style.letterSpacing = styles.letterSpacing;
    span.style.whiteSpace = "pre";
    span.style.visibility = "hidden";
    span.style.position = "absolute";
    document.body.appendChild(span);
    const rect = textElement.getBoundingClientRect();
    const relativeX = screenX - rect.left;
    const content = textElement.textContent || "";
    let best = 0;
    let minDist = Infinity;
    for (let i = 0; i <= content.length; i++) {
        span.textContent = content.substring(0, i);
        const w = span.getBoundingClientRect().width;
        const d = Math.abs(w - relativeX);
        if (d < minDist) {
            minDist = d;
            best = i;
        }
    }
    document.body.removeChild(span);
    return best;
}
