/**
 * Scrapbox構文のフォーマットを処理するユーティリティクラス
 */
export class ScrapboxFormatter {
    /**
     * テキストを太字にフォーマットする
     * @param text フォーマットするテキスト
     * @returns 太字にフォーマットされたテキスト
     */
    static bold(text: string): string {
        // 既に太字の場合は解除
        if (text.startsWith("[[") && text.endsWith("]]")) {
            return text.substring(2, text.length - 2);
        }
        return `[[${text}]]`;
    }

    /**
     * テキストを斜体にフォーマットする
     * @param text フォーマットするテキスト
     * @returns 斜体にフォーマットされたテキスト
     */
    static italic(text: string): string {
        // 既に斜体の場合は解除
        if (text.startsWith("[/") && text.endsWith("]")) {
            return text.substring(2, text.length - 1);
        }
        return `[/${text}]`;
    }

    /**
     * テキストに取り消し線を適用する
     * @param text フォーマットするテキスト
     * @returns 取り消し線が適用されたテキスト
     */
    static strikethrough(text: string): string {
        // 既に取り消し線の場合は解除
        if (text.startsWith("[-") && text.endsWith("]")) {
            return text.substring(2, text.length - 1);
        }
        return `[-${text}]`;
    }

    /**
     * テキストをコードとしてフォーマットする
     * @param text フォーマットするテキスト
     * @returns コードとしてフォーマットされたテキスト
     */
    static code(text: string): string {
        // 既にコードの場合は解除
        if (text.startsWith("`") && text.endsWith("`")) {
            return text.substring(1, text.length - 1);
        }
        return `\`${text}\``;
    }

    /**
     * テキストが特定のフォーマットを持っているかチェックする
     * @param text チェックするテキスト
     * @returns フォーマットの種類（bold, italic, strikethrough, code）または null
     */
    static getFormatType(text: string): "bold" | "italic" | "strikethrough" | "code" | null {
        if (text.startsWith("[[") && text.endsWith("]]")) {
            return "bold";
        } else if (text.startsWith("[/") && text.endsWith("]")) {
            return "italic";
        } else if (text.startsWith("[-") && text.endsWith("]")) {
            return "strikethrough";
        } else if (text.startsWith("`") && text.endsWith("`")) {
            return "code";
        }
        return null;
    }
}
