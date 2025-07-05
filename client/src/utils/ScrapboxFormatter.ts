/**
 * フォーマットトークンを表すインターフェース
 */
interface FormatToken {
    type: "text" | "bold" | "italic" | "strikethrough" | "underline" | "code" | "link" | "internalLink" | "quote";
    content: string;
    children?: FormatToken[];
    start: number;
    end: number;
    url?: string; // リンク用
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
     * テキストに下線を適用する
     * @param text フォーマットするテキスト
     * @returns 下線が適用されたテキスト
     */
    static underline(text: string): string {
        // 既に下線の場合は解除
        if (text.startsWith("<u>") && text.endsWith("</u>")) {
            return text.substring(3, text.length - 4);
        }
        return `<u>${text}</u>`;
    }

    /**
     * テキストが特定のフォーマットを持っているかチェックする
     * @param text チェックするテキスト
     * @returns フォーマットの種類（bold, italic, strikethrough, underline, code）または null
     */
    static getFormatType(text: string): "bold" | "italic" | "strikethrough" | "underline" | "code" | null {
        if (text.startsWith("[[") && text.endsWith("]]")) {
            return "bold";
        } else if (text.startsWith("[/") && text.endsWith("]")) {
            return "italic";
        } else if (text.startsWith("[-") && text.endsWith("]")) {
            return "strikethrough";
        } else if (text.startsWith("<u>") && text.endsWith("</u>")) {
            return "underline";
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
            // プロジェクト内部リンク（/project-name/page-name形式）- 斜体よりも先に処理
            // スラッシュを含む場合のみマッチ（プロジェクト内部リンク）
            { type: "internalLink", start: "[/", end: "]", regex: /\[\/([\w\-]+\/[\w\-\/]*)\]/g },
            // 斜体 - スラッシュを含まない場合のみマッチ
            { type: "italic", start: "[/", end: "]", regex: /\[\/([^\/\]]*)\]/g },
            { type: "strikethrough", start: "[-", end: "]", regex: /\[\-(.*?)\]/g },
            { type: "underline", start: "<u>", end: "</u>", regex: /<u>(.*?)<\/u>/g },
            { type: "code", start: "`", end: "`", regex: /`(.*?)`/g },
            { type: "link", start: "[", end: "]", regex: /\[(https?:\/\/.*?)\]/g },
            // 通常の内部リンク（page-name形式）- ハイフンを含むページ名も許可
            { type: "internalLink", start: "[", end: "]", regex: /\[([^\[\]\/][^\[\]]*?)\]/g },
            { type: "quote", start: "> ", end: "", regex: /^>\s(.*?)$/gm },
        ];

        // すべてのフォーマットマッチを見つける
        const matches: { type: string; start: number; end: number; content: string; url?: string; }[] = [];

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
                        url: content,
                    });
                } else {
                    matches.push({
                        type: pattern.type,
                        start: startIndex,
                        end: endIndex,
                        content: content,
                    });
                }
            }
        });

        // マッチを開始位置でソート
        matches.sort((a, b) => a.start - b.start);

        // 重複や入れ子のマッチを処理
        const validMatches: { type: string; start: number; end: number; content: string; }[] = [];

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
                    end: match.start,
                });
            }

            // フォーマットトークンを追加
            tokens.push({
                type: match.type as "bold" | "italic" | "strikethrough" | "underline" | "code",
                content: match.content,
                start: match.start,
                end: match.end,
            });

            lastIndex = match.end;
        }

        // 最後のマッチ以降のテキストがあれば追加
        if (lastIndex < text.length) {
            tokens.push({
                type: "text",
                content: text.substring(lastIndex),
                start: lastIndex,
                end: text.length,
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
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        let html = "";

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
                case "underline":
                    html += `<u>${content}</u>`;
                    break;
                case "code":
                    html += `<code>${content}</code>`;
                    break;
                case "link":
                    html += `<a href="${token.url}" target="_blank" rel="noopener noreferrer">${content}</a>`;
                    break;
                case "internalLink":
                    // 内部リンクは別ページへのリンクとして処理
                    // /project-name/page-name 形式かどうかを判断
                    if (content.startsWith("/")) {
                        // プロジェクト内部リンク
                        // パスを分解してプロジェクト名とページ名を取得
                        const parts = content.split("/").filter(p => p);
                        if (parts.length >= 2) {
                            const projectName = parts[0];
                            const pageName = parts.slice(1).join("/");

                            // ページの存在確認用のクラスを追加
                            const existsClass = this.checkPageExists(pageName, projectName)
                                ? "page-exists"
                                : "page-not-exists";

                            // LinkPreviewコンポーネントを使用
                            html += `<span class="link-preview-wrapper">
                                <a href="/${content}" class="internal-link project-link ${existsClass}" data-project="${projectName}" data-page="${pageName}">${content}</a>
                            </span>`;
                        } else {
                            // 不正なパス形式の場合は通常のリンクとして表示
                            html += `<a href="/${content}" class="internal-link project-link">${content}</a>`;
                        }
                    } else {
                        // 通常の内部リンク
                        // ページの存在確認用のクラスを追加
                        const existsClass = this.checkPageExists(content) ? "page-exists" : "page-not-exists";

                        // LinkPreviewコンポーネントを使用
                        html += `<span class="link-preview-wrapper">
                            <a href="/${content}" class="internal-link ${existsClass}" data-page="${content}">${content}</a>
                        </span>`;
                    }
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
        if (!text) return "";

        // 入れ子のフォーマットに対応した実装を使用
        return this.formatToHtmlAdvanced(text);
    }

    /**
     * 組み合わせフォーマットに対応した高度な変換（再帰的に処理）
     * @param text 変換するテキスト
     * @returns HTMLに変換されたテキスト
     */
    static formatToHtmlAdvanced(text: string): string {
        if (!text) return "";

        // HTMLエスケープ（プレースホルダーは除外）
        const escapeHtml = (str: string): string => {
            // プレースホルダーを一時的に保護
            const placeholderMap: Record<string, string> = {};
            let protectedStr = str.replace(/__UNDERLINE_\d+__/g, match => {
                const tempKey = `__TEMP_${Object.keys(placeholderMap).length}__`;
                placeholderMap[tempKey] = match;
                return tempKey;
            });

            // HTMLエスケープを適用
            protectedStr = protectedStr
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            // プレースホルダーを復元
            Object.keys(placeholderMap).forEach(tempKey => {
                protectedStr = protectedStr.replace(tempKey, placeholderMap[tempKey]);
            });

            return protectedStr;
        };

        // 下線タグを一時的にプレースホルダーに置換
        const underlinePlaceholders: string[] = [];
        let tempText = text.replace(/<u>(.*?)<\/u>/g, (match, content) => {
            const placeholder = `__UNDERLINE_${underlinePlaceholders.length}__`;
            underlinePlaceholders.push(content);
            return placeholder;
        });

        // 再帰的にフォーマットを処理する関数
        const processFormat = (input: string): string => {
            // 太字
            const boldRegex = /\[\[(.*?)\]\]/g;
            input = input.replace(boldRegex, (match, content) => {
                // 内部のコンテンツも再帰的に処理
                return `<strong>${processFormat(content)}</strong>`;
            });

            // プロジェクト内部リンク - 斜体よりも先に処理する必要がある
            // スラッシュを含む場合のみマッチ（プロジェクト内部リンク）
            const projectLinkRegex = /\[\/([\w\-]+\/[\w\-\/]*)\]/g;
            input = input.replace(projectLinkRegex, (match, path) => {
                // パスを分解してプロジェクト名とページ名を取得
                const parts = path.split("/").filter(p => p);
                if (parts.length >= 2) {
                    const projectName = parts[0];
                    const pageName = parts.slice(1).join("/");

                    // ページの存在確認用のクラスを追加
                    const existsClass = this.checkPageExists(pageName, projectName) ? "page-exists" : "page-not-exists";

                    // LinkPreviewコンポーネントを使用
                    return `<span class="link-preview-wrapper">
                        <a href="/${path}" class="internal-link project-link ${existsClass}" data-project="${projectName}" data-page="${pageName}">${path}</a>
                    </span>`;
                } else {
                    // 不正なパス形式の場合は通常のリンクとして表示
                    return `<a href="/${path}" class="internal-link project-link">${path}</a>`;
                }
            });

            // 斜体 - プロジェクト内部リンクの後に処理
            // スラッシュを含まない場合のみマッチ
            const italicRegex = /\[\/([^\/\]]*)\]/g;
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

            // プロジェクト内部リンクは上で処理済み

            // 通常の内部リンク - 外部リンクの後に処理する必要がある
            const internalLinkRegex = /\[([^\[\]\/][^\[\]]*?)\]/g;
            input = input.replace(internalLinkRegex, (match, text) => {
                // ページの存在確認用のクラスを追加
                const existsClass = this.checkPageExists(text) ? "page-exists" : "page-not-exists";

                // LinkPreviewコンポーネントを使用
                return `<span class="link-preview-wrapper">
                    <a href="/${text}" class="internal-link ${existsClass}" data-page="${text}">${text}</a>
                </span>`;
            });

            return input;
        };

        // 行ごとに処理するための関数
        const processLines = (lines: string[]): string => {
            let result = "";

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
                    result += "<br>";
                }
            }

            return result;
        };

        // 行に分割して処理
        const lines = tempText.split("\n");
        let result = processLines(lines);

        // プレースホルダーを実際の下線タグに復元
        underlinePlaceholders.forEach((content, index) => {
            const placeholder = `__UNDERLINE_${index}__`;
            result = result.replace(placeholder, `<u>${processFormat(escapeHtml(content))}</u>`);
        });

        return result;
    }

    /**
     * 制御文字を表示しながらフォーマットを適用する（フォーカスがある場合用）
     * @param text 変換するテキスト
     * @returns HTMLに変換されたテキスト
     */
    static formatWithControlChars(text: string): string {
        if (!text) return "";

        // HTMLエスケープ
        const escapeHtml = (str: string): string => {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        let html = escapeHtml(text);

        // 太字
        html = html.replace(
            /(\[\[)(.*?)(\]\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // コード
        html = html.replace(
            /(`)(.*?)(`)/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 取り消し線
        html = html.replace(
            /(\[\-)(.*?)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 下線
        html = html.replace(
            /(<u>)(.*?)(<\/u>)/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // プロジェクト内部リンク - カーソルがある時は制御文字のみ表示
        // スラッシュを含む場合のみマッチ（プロジェクト内部リンク）
        html = html.replace(
            /(\[\/)([a-zA-Z0-9\-]+\/[a-zA-Z0-9\-\/]*)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 斜体 - プロジェクト内部リンクの後に処理
        html = html.replace(
            /(\[\/)(.*?)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 外部リンク - カーソルがある時は制御文字のみ表示
        html = html.replace(
            /(\[)(https?:\/\/.*?)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 通常の内部リンク - カーソルがある時は制御文字のみ表示
        html = html.replace(
            /(\[)([^\[\]\/\-][^\[\]]*?)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

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
        const internalLinkPattern = /\[([^\[\]\/][^\[\]]*?)\]/;

        // プロジェクト内部リンクの正規表現パターン
        const projectLinkPattern = /\[\/([\w\-\/]+)\]/;

        // 引用の正規表現パターン
        const quotePattern = /^>\s(.*?)$/m;

        return basicFormatPattern.test(text)
            || linkPattern.test(text)
            || internalLinkPattern.test(text)
            || projectLinkPattern.test(text)
            || quotePattern.test(text);
    }

    /**
     * ページが存在するかどうかを確認する
     * @param pageName ページ名
     * @param projectName プロジェクト名（オプション）
     * @returns ページが存在する場合はtrue
     */
    static checkPageExists(pageName: string, projectName?: string): boolean {
        // 実装注意: このメソッドはクライアントサイドでのみ動作します
        if (typeof window === "undefined") return true;

        // グローバルストアからページ情報を取得
        const store = (window as any).appStore;
        if (!store || !store.pages) return false;

        // 現在のプロジェクトを取得
        const currentProject = store.project;
        if (!currentProject) return false;

        // プロジェクト名が指定されている場合、現在のプロジェクトと一致するか確認
        if (projectName && currentProject.title !== projectName) {
            // 別プロジェクトのページは確認できないため、存在しないと仮定
            return false;
        }

        // ページ名が一致するページを検索
        for (const page of store.pages.current) {
            if (page.text.toLowerCase() === pageName.toLowerCase()) {
                return true;
            }
        }

        return false;
    }
}

// グローバルに参照できるようにする（テスト環境でアクセスするため）
if (typeof window !== "undefined") {
    (window as any).ScrapboxFormatter = ScrapboxFormatter;
}
