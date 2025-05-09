/**
 * フォーマットトークンを表すインターフェース
 */
interface FormatToken {
    type: "text" | "bold" | "italic" | "strikethrough" | "code" | "link" | "internalLink" | "quote";
    content: string;
    children?: FormatToken[];
    start: number;
    end: number;
    url?: string;        // リンク用
}

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



    /**
     * テキストをトークンに分解する
     * @param text 解析するテキスト
     * @returns トークンの配列
     */
    static tokenize(text: string): FormatToken[] {
        if (!text) return [];

        // フォーマットパターン
        const patterns = [
            { type: "bold", start: "[[", end: "]]", regex: /\[\[(.*?)\]\]/g },
            { type: "italic", start: "[/", end: "]", regex: /\[\/(.*?)\]/g },
            { type: "strikethrough", start: "[-", end: "]", regex: /\[\-(.*?)\]/g },
            { type: "code", start: "`", end: "`", regex: /`(.*?)`/g },
            { type: "link", start: "[", end: "]", regex: /\[(https?:\/\/.*?)\]/g },
            { type: "internalLink", start: "[", end: "]", regex: /\[([^\[\]\/\-][^\[\]]*?)\]/g },
            { type: "quote", start: "> ", end: "", regex: /^>\s(.*?)$/gm }
        ];

        // すべてのフォーマットマッチを見つける
        const matches: { type: string; start: number; end: number; content: string; url?: string }[] = [];

        // フォーマットのマッチを処理
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                const startIndex = match.index;
                const endIndex = startIndex + match[0].length;
                const content = match[1];

                // リンクの場合はURLも保存
                if (pattern.type === "link") {
                    matches.push({
                        type: pattern.type,
                        start: startIndex,
                        end: endIndex,
                        content: content,
                        url: content
                    });
                } else {
                    matches.push({
                        type: pattern.type,
                        start: startIndex,
                        end: endIndex,
                        content: content
                    });
                }
            }
        });

        // マッチを開始位置でソート
        matches.sort((a, b) => a.start - b.start);

        // 重複や入れ子のマッチを処理
        const validMatches: { type: string; start: number; end: number; content: string }[] = [];

        for (const match of matches) {
            // 既存の有効なマッチと重複していないか確認
            let isValid = true;

            for (const validMatch of validMatches) {
                // 完全に含まれる場合は無効
                if (match.start >= validMatch.start && match.end <= validMatch.end) {
                    isValid = false;
                    break;
                }

                // 部分的に重複する場合も無効
                if (match.start < validMatch.end && match.end > validMatch.start) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                validMatches.push(match);
            }
        }

        // 有効なマッチを再度ソート
        validMatches.sort((a, b) => a.start - b.start);

        // トークンに変換
        const tokens: FormatToken[] = [];
        let lastIndex = 0;

        for (const match of validMatches) {
            // マッチの前にテキストがあれば追加
            if (match.start > lastIndex) {
                tokens.push({
                    type: "text",
                    content: text.substring(lastIndex, match.start),
                    start: lastIndex,
                    end: match.start
                });
            }

            // フォーマットトークンを追加
            tokens.push({
                type: match.type as "bold" | "italic" | "strikethrough" | "code",
                content: match.content,
                start: match.start,
                end: match.end
            });

            lastIndex = match.end;
        }

        // 最後のマッチ以降のテキストがあれば追加
        if (lastIndex < text.length) {
            tokens.push({
                type: "text",
                content: text.substring(lastIndex),
                start: lastIndex,
                end: text.length
            });
        }

        return tokens;
    }

    /**
     * トークンをHTMLに変換する
     * @param tokens 変換するトークン
     * @returns HTML文字列
     */
    static tokensToHtml(tokens: FormatToken[]): string {
        // HTMLエスケープ
        const escapeHtml = (str: string): string => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        let html = '';

        for (const token of tokens) {
            const content = escapeHtml(token.content);

            switch (token.type) {
                case "bold":
                    html += `<strong>${content}</strong>`;
                    break;
                case "italic":
                    html += `<em>${content}</em>`;
                    break;
                case "strikethrough":
                    html += `<s>${content}</s>`;
                    break;
                case "code":
                    html += `<code>${content}</code>`;
                    break;
                case "link":
                    html += `<a href="${token.url}" target="_blank" rel="noopener noreferrer">${content}</a>`;
                    break;
                case "internalLink":
                    // 内部リンクは別ページへのリンクとして処理
                    html += `<a href="#" class="internal-link">${content}</a>`;
                    break;
                case "quote":
                    html += `<blockquote>${content}</blockquote>`;
                    break;
                case "text":
                default:
                    html += content;
                    break;
            }
        }

        return html;
    }

    /**
     * Scrapbox構文のテキストをHTMLに変換する
     * @param text 変換するテキスト
     * @returns HTMLに変換されたテキスト
     */
    static formatToHtml(text: string): string {
        if (!text) return '';

        // 入れ子のフォーマットに対応した実装を使用
        return this.formatToHtmlAdvanced(text);
    }

    /**
     * 組み合わせフォーマットに対応した高度な変換（再帰的に処理）
     * @param text 変換するテキスト
     * @returns HTMLに変換されたテキスト
     */
    static formatToHtmlAdvanced(text: string): string {
        if (!text) return '';

        // HTMLエスケープ
        const escapeHtml = (str: string): string => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        // 再帰的にフォーマットを処理する関数
        const processFormat = (input: string): string => {
            // 太字
            const boldRegex = /\[\[(.*?)\]\]/g;
            input = input.replace(boldRegex, (match, content) => {
                // 内部のコンテンツも再帰的に処理
                return `<strong>${processFormat(content)}</strong>`;
            });

            // 斜体
            const italicRegex = /\[\/(.*?)\]/g;
            input = input.replace(italicRegex, (match, content) => {
                return `<em>${processFormat(content)}</em>`;
            });

            // 取り消し線
            const strikethroughRegex = /\[\-(.*?)\]/g;
            input = input.replace(strikethroughRegex, (match, content) => {
                return `<s>${processFormat(content)}</s>`;
            });

            // コード (コード内部は再帰処理しない)
            const codeRegex = /`(.*?)`/g;
            input = input.replace(codeRegex, (match, content) => {
                return `<code>${escapeHtml(content)}</code>`;
            });

            // 外部リンク
            const linkRegex = /\[(https?:\/\/.*?)\]/g;
            input = input.replace(linkRegex, (match, url) => {
                return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
            });

            // 内部リンク - 外部リンクの後に処理する必要がある
            const internalLinkRegex = /\[([^\[\]\/\-][^\[\]]*?)\]/g;
            input = input.replace(internalLinkRegex, (match, text) => {
                return `<a href="#${text}" class="internal-link">${text}</a>`;
            });

            return input;
        };

        // 行ごとに処理するための関数
        const processLines = (lines: string[]): string => {
            let result = '';

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                // 引用
                const quoteMatch = line.match(/^>\s(.*?)$/);
                if (quoteMatch) {
                    result += `<blockquote>${processFormat(escapeHtml(quoteMatch[1]))}</blockquote>`;
                    continue;
                }

                // 通常のテキスト
                result += processFormat(escapeHtml(line));

                // 最後の行でなければ改行を追加
                if (i < lines.length - 1) {
                    result += '<br>';
                }
            }

            return result;
        };

        // 行に分割して処理
        const lines = text.split('\n');
        return processLines(lines);
    }

    /**
     * 制御文字を表示しながらフォーマットを適用する（フォーカスがある場合用）
     * @param text 変換するテキスト
     * @returns HTMLに変換されたテキスト
     */
    static formatWithControlChars(text: string): string {
        if (!text) return '';

        // HTMLエスケープ
        const escapeHtml = (str: string): string => {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        let html = escapeHtml(text);

        // 太字
        html = html.replace(/(\[\[)(.*?)(\]\])/g, '<span class="control-char">$1</span><strong>$2</strong><span class="control-char">$3</span>');

        // 斜体
        html = html.replace(/(\[\/)(.+?)(\])/g, '<span class="control-char">$1</span><em>$2</em><span class="control-char">$3</span>');

        // 取り消し線
        html = html.replace(/(\[\-)(.+?)(\])/g, '<span class="control-char">$1</span><s>$2</s><span class="control-char">$3</span>');

        // コード
        html = html.replace(/(`)(.*?)(`)/g, '<span class="control-char">$1</span><code>$2</code><span class="control-char">$3</span>');

        // 外部リンク
        html = html.replace(/(\[)(https?:\/\/.*?)(\])/g, '<span class="control-char">$1</span><a href="$2" target="_blank" rel="noopener noreferrer">$2</a><span class="control-char">$3</span>');

        // 内部リンク - 外部リンクの後に処理する必要がある
        html = html.replace(/(\[)([^\[\]\/\-][^\[\]]*?)(\])/g, '<span class="control-char">$1</span><a href="#$2" class="internal-link">$2</a><span class="control-char">$3</span>');

        // 引用
        html = html.replace(/(^>\s)(.*?)$/gm, '<span class="control-char">$1</span><blockquote>$2</blockquote>');

        return html;
    }

    /**
     * テキストにScrapbox構文のフォーマットが含まれているかチェックする
     * @param text チェックするテキスト
     * @returns フォーマットが含まれている場合はtrue
     */
    static hasFormatting(text: string): boolean {
        if (!text) return false;

        // 基本フォーマットの正規表現パターン
        const basicFormatPattern = /\[\[(.*?)\]\]|\[\/(.*?)\]|\[\-(.*?)\]|`(.*?)`/;

        // 外部リンクの正規表現パターン
        const linkPattern = /\[(https?:\/\/.*?)\]/;

        // 内部リンクの正規表現パターン
        const internalLinkPattern = /\[([^\[\]\/\-][^\[\]]*?)\]/;

        // 引用の正規表現パターン
        const quotePattern = /^>\s(.*?)$/m;

        return basicFormatPattern.test(text) ||
               linkPattern.test(text) ||
               internalLinkPattern.test(text) ||
               quotePattern.test(text);
    }
}
