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
    isProjectLink?: boolean;
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
        // 既に斜体の場合は解除（スペース必須）
        if (text.startsWith("[/ ") && text.endsWith("]")) {
            return text.substring(3, text.length - 1);
        }
        return `[/ ${text}]`;
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
        } else if (text.startsWith("[/ ") && text.endsWith("]")) {
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
            // 斜体 - スペース必須: [/ テキスト]
            { type: "italic", start: "[/ ", end: "]", regex: /\[\/\s+([^\]]*)\]/g },
            // プロジェクト内部リンク - スペースなし: [/project/page] または [/page]
            { type: "internalLink", start: "[/", end: "]", regex: /\[\/([^\s\]]+)\]/g },
            { type: "strikethrough", start: "[-", end: "]", regex: /\[-(.*?)\]/g },
            { type: "underline", start: "<u>", end: "</u>", regex: /<u>(.*?)<\/u>/g },
            { type: "code", start: "`", end: "`", regex: /`(.*?)`/g },
            {
                type: "link",
                start: "[",
                end: "]",
                // URL と任意のラベルを解析（ラベルが空白のみの場合も許可）
                regex: /\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g,
            },
            // 通常の内部リンク（page-name形式）- ハイフンを含むページ名も許可
            { type: "internalLink", start: "[", end: "]", regex: /\[([^[\]]+?)\]/g },
            { type: "quote", start: "> ", end: "", regex: /^>\s(.*?)$/gm },
        ];

        // すべてのフォーマットマッチを見つける
        const matches: {
            type: string;
            start: number;
            end: number;
            content: string;
            url?: string;
            isProjectLink?: boolean;
        }[] = [];

        // フォーマットのマッチを処理
        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.regex.exec(text)) !== null) {
                const startIndex = match.index;
                const endIndex = startIndex + match[0].length;
                const content = match[1];
                const isProjectLink = pattern.type === "internalLink" && pattern.start === "[/";

                // リンクの場合はURLとラベルを保存
                if (pattern.type === "link") {
                    const url = match[1];
                    const rawLabel = match[2];
                    const label = rawLabel && rawLabel.trim() !== "" ? rawLabel.trim() : url;
                    matches.push({
                        type: pattern.type,
                        start: startIndex,
                        end: endIndex,
                        content: label,
                        url,
                    });
                } else {
                    matches.push({
                        type: pattern.type,
                        start: startIndex,
                        end: endIndex,
                        content: content,
                        isProjectLink,
                    });
                }
            }
        });

        // マッチを開始位置でソート
        matches.sort((a, b) => a.start - b.start);

        // 重複や入れ子のマッチを処理
        const validMatches: {
            type: string;
            start: number;
            end: number;
            content: string;
            url?: string;
            isProjectLink?: boolean;
        }[] = [];

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
                type: match.type as
                    | "bold"
                    | "italic"
                    | "strikethrough"
                    | "underline"
                    | "code"
                    | "link"
                    | "internalLink"
                    | "quote",
                content: match.content,
                start: match.start,
                end: match.end,
                url: match.url,
                isProjectLink: match.isProjectLink,
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
            const rawContent = token.content ?? "";
            const content = escapeHtml(rawContent);

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
                case "internalLink": {
                    const isProjectLink = token.isProjectLink === true || rawContent.startsWith("/");
                    if (isProjectLink) {
                        const normalizedRaw = rawContent.startsWith("/") ? rawContent.slice(1) : rawContent;
                        const escapedNormalized = escapeHtml(normalizedRaw);
                        const parts = normalizedRaw.split("/").filter(p => p);

                        if (parts.length >= 2) {
                            const projectName = parts[0];
                            const pageName = parts.slice(1).join("/");

                            let existsClassTokens = "page-not-exists"; // default for safety
                            try {
                                existsClassTokens = this.checkPageExists(pageName, projectName)
                                    ? "page-exists"
                                    : "page-not-exists";
                            } catch {
                                existsClassTokens = "page-not-exists";
                            }

                            const escapedProjectName = escapeHtml(projectName);
                            const escapedPageName = escapeHtml(pageName);
                            html += `<span class="link-preview-wrapper">
                                <a href="/${escapedNormalized}" class="internal-link project-link ${existsClassTokens}" data-project="${escapedProjectName}" data-page="${escapedPageName}">${escapedNormalized}</a>
                            </span>`;
                        } else {
                            html +=
                                `<a href="/${escapedNormalized}" class="internal-link project-link">${escapedNormalized}</a>`;
                        }
                    } else {
                        const existsClass = this.checkPageExists(rawContent) ? "page-exists" : "page-not-exists";
                        html += `<span class="link-preview-wrapper">
                            <a href="/${content}" class="internal-link ${existsClass}" data-page="${content}">${content}</a>
                        </span>`;
                    }
                    break;
                }
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

        // HTMLエスケープ
        const escapeHtml = (str: string): string => {
            return str
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };

        // 下線タグを一時的にプレースホルダーに置換
        const underlinePlaceholders: string[] = [];
        const tempText = text.replace(/<u>(.*?)<\/u>/g, (match, content) => {
            const placeholder = `__UNDERLINE_${underlinePlaceholders.length}__`;
            underlinePlaceholders.push(content);
            return placeholder;
        });

        // 括弧のバランスを考慮して太字をマッチする関数
        const matchBalancedBold = (text: string): Array<{ start: number; end: number; content: string; }> => {
            const matches: Array<{ start: number; end: number; content: string; }> = [];
            let i = 0;
            while (i < text.length - 1) {
                if (text[i] === "[" && text[i + 1] === "[") {
                    // 太字の開始を見つけた
                    let boldDepth = 1; // [[...]] のネストレベル
                    let j = i + 2;
                    let content = "";

                    while (j < text.length && boldDepth > 0) {
                        if (j < text.length - 1 && text[j] === "[" && text[j + 1] === "[") {
                            // 入れ子の太字開始
                            boldDepth++;
                            content += "[[";
                            j += 2;
                        } else if (j < text.length - 1 && text[j] === "]" && text[j + 1] === "]") {
                            // 太字の終了候補
                            boldDepth--;
                            if (boldDepth === 0) {
                                // マッチ完了
                                matches.push({ start: i, end: j + 2, content });
                                i = j + 2;
                                break;
                            } else {
                                content += "]]";
                                j += 2;
                            }
                        } else if (text[j] === "[" && (j + 1 >= text.length || text[j + 1] !== "[")) {
                            // 単一の [ を見つけた（内部リンクなどの開始）
                            // 対応する ] を探す
                            content += "[";
                            j++;
                            let bracketDepth = 1;
                            while (j < text.length && bracketDepth > 0) {
                                if (text[j] === "[" && (j + 1 >= text.length || text[j + 1] !== "[")) {
                                    // 単一の [ (ネストされた内部リンクなど)
                                    bracketDepth++;
                                    content += "[";
                                    j++;
                                } else if (text[j] === "]") {
                                    // ] を見つけた
                                    bracketDepth--;
                                    content += "]";
                                    j++;
                                    if (bracketDepth === 0) {
                                        break;
                                    }
                                } else {
                                    content += text[j];
                                    j++;
                                }
                            }
                        } else {
                            content += text[j];
                            j++;
                        }
                    }

                    if (boldDepth > 0) {
                        // マッチしなかった場合は次の文字へ
                        i++;
                    }
                } else {
                    i++;
                }
            }
            return matches;
        };

        // グローバルなプレースホルダーマップ（再帰呼び出し間で共有）
        const globalPlaceholders: Map<string, string> = new Map();
        let globalPlaceholderIndex = 0;

        // プレースホルダーを生成する関数（制御文字を使用して内部リンクとして認識されないようにする）
        const createPlaceholder = (html: string): string => {
            const placeholder = `\x00HTML_${globalPlaceholderIndex++}\x00`;
            globalPlaceholders.set(placeholder, html);
            return placeholder;
        };

        // 括弧のバランスを考慮して斜体をマッチする関数
        const matchBalancedItalic = (text: string): Array<{ start: number; end: number; content: string; }> => {
            const matches: Array<{ start: number; end: number; content: string; }> = [];
            let i = 0;
            while (i < text.length - 2) {
                if (text[i] === "[" && text[i + 1] === "/" && text[i + 2] === " ") {
                    // 斜体の開始を見つけた: [/ (スペース必須)
                    let j = i + 3;
                    let content = "";
                    let bracketDepth = 1;

                    while (j < text.length && bracketDepth > 0) {
                        if (text[j] === "[" && j + 1 < text.length && text[j + 1] !== "[" && text[j + 1] !== "/") {
                            // 単一の [ (内部リンクなど)
                            bracketDepth++;
                            content += "[";
                            j++;
                        } else if (text[j] === "]") {
                            bracketDepth--;
                            if (bracketDepth === 0) {
                                // マッチ完了
                                matches.push({ start: i, end: j + 1, content });
                                i = j + 1;
                                break;
                            } else {
                                content += "]";
                                j++;
                            }
                        } else {
                            content += text[j];
                            j++;
                        }
                    }

                    if (bracketDepth > 0) {
                        // マッチしなかった場合は次の文字へ
                        i++;
                    }
                } else {
                    i++;
                }
            }
            return matches;
        };

        // 再帰的にフォーマットを処理する関数
        const processFormat = (input: string): string => {
            // 太字 - 最初に処理して、中身を再帰的に処理する
            // これにより、太字の中のネストされたフォーマットが正しく処理される
            const boldMatches = matchBalancedBold(input);
            // 後ろから置換して、インデックスがずれないようにする
            for (let i = boldMatches.length - 1; i >= 0; i--) {
                const match = boldMatches[i];
                // 内部のコンテンツも再帰的に処理
                const html = `<strong>${processFormat(match.content)}</strong>`;
                const placeholder = createPlaceholder(html);
                input = input.substring(0, match.start) + placeholder + input.substring(match.end);
            }

            // 斜体 - スペース必須: [/ テキスト]
            // バランスを考慮してマッチ
            const italicMatches = matchBalancedItalic(input);
            // 後ろから置換して、インデックスがずれないようにする
            for (let i = italicMatches.length - 1; i >= 0; i--) {
                const match = italicMatches[i];
                // 内部のコンテンツも再帰的に処理
                const html = `<em>${processFormat(match.content)}</em>`;
                const placeholder = createPlaceholder(html);
                input = input.substring(0, match.start) + placeholder + input.substring(match.end);
            }

            // プロジェクト内部リンク - スペースなし: [/project/page] または [/page]
            // スラッシュの後にスペースがない場合のみマッチ
            const projectLinkRegex = /\[\/([^\s\]]+)\]/g;
            input = input.replace(projectLinkRegex, (match, path) => {
                // パスを分解してプロジェクト名とページ名を取得
                const parts = path.split("/").filter((p: string) => p);
                let html: string;
                if (parts.length >= 2) {
                    const projectName = parts[0];
                    const pageName = parts.slice(1).join("/");

                    // ページの存在確認用のクラスを追加
                    let existsClass = "page-not-exists"; // default for safety
                    try {
                        existsClass = this.checkPageExists(pageName, projectName) ? "page-exists" : "page-not-exists";
                    } catch {
                        // In case of unknown error in checkPageExists, default to page-not-exists
                        existsClass = "page-not-exists";
                    }

                    // LinkPreviewコンポーネントを使用
                    html = `<span class="link-preview-wrapper">
                        <a href="/${
                        escapeHtml(path)
                    }" class="internal-link project-link ${existsClass}" data-project="${
                        escapeHtml(projectName)
                    }" data-page="${escapeHtml(pageName)}">${escapeHtml(path)}</a>
                    </span>`;
                } else {
                    // 単一のページ名の場合（プロジェクト内部リンク）
                    const existsClass = this.checkPageExists(path) ? "page-exists" : "page-not-exists";
                    html = `<span class="link-preview-wrapper">
                        <a href="/${escapeHtml(path)}" class="internal-link ${existsClass}" data-page="${
                        escapeHtml(path)
                    }">${escapeHtml(path)}</a>
                    </span>`;
                }
                return createPlaceholder(html);
            });

            // 取り消し線
            const strikethroughRegex = /\[-(.*?)\]/g;
            input = input.replace(strikethroughRegex, (match, content) => {
                const html = `<s>${processFormat(content)}</s>`;
                return createPlaceholder(html);
            });

            // コード (コード内部は再帰処理しない)
            const codeRegex = /`(.*?)`/g;
            input = input.replace(codeRegex, (match, content) => {
                const html = `<code>${escapeHtml(content)}</code>`;
                return createPlaceholder(html);
            });

            // 外部リンク（ラベルが空白のみの場合も許可）
            const linkRegex = /\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g;
            input = input.replace(linkRegex, (match, url, label) => {
                const trimmedLabel = label?.trim();
                const text = trimmedLabel ? processFormat(trimmedLabel) : escapeHtml(url);
                const html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
                return createPlaceholder(html);
            });

            // プロジェクト内部リンクは上で処理済み

            // 通常の内部リンク - 外部リンクの後に処理する必要がある
            // [text] 形式で、text が [ または ] を含まないもの
            const internalLinkRegex = /\[([^[\]]+?)\]/g;
            input = input.replace(internalLinkRegex, (match, text) => {
                // ページの存在確認用のクラスを追加
                const existsClass = this.checkPageExists(text) ? "page-exists" : "page-not-exists";

                // LinkPreviewコンポーネントを使用
                const html = `<span class="link-preview-wrapper">
                    <a href="/${escapeHtml(text)}" class="internal-link ${existsClass}" data-page="${
                    escapeHtml(text)
                }">${escapeHtml(text)}</a>
                </span>`;
                return createPlaceholder(html);
            });

            // プレーンテキスト部分をエスケープ
            input = escapeHtml(input);

            // プレースホルダーをHTMLタグに復元
            globalPlaceholders.forEach((html, placeholder) => {
                // 制御文字がエスケープされている可能性があるため、両方を試す
                const escapedPlaceholder = escapeHtml(placeholder);
                input = input.replaceAll(escapedPlaceholder, html);
                input = input.replaceAll(placeholder, html);
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
                    result += `<blockquote>${processFormat(quoteMatch[1])}</blockquote>`;
                    continue;
                }

                // 通常のテキスト - フォーマット構文を処理
                result += processFormat(line);

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
            result = result.replace(placeholder, `<u>${escapeHtml(processFormat(content))}</u>`);
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

        // 太字 - バランスを考慮してマッチ
        const boldMatches = this.matchBalancedBold(html);
        // 後ろから置換して、インデックスがずれないようにする
        for (let i = boldMatches.length - 1; i >= 0; i--) {
            const match = boldMatches[i];
            const replacement = '<span class="control-char">[</span><span class="control-char">[</span>'
                + `<strong>${match.content}</strong>`
                + '<span class="control-char">]</span><span class="control-char">]</span>';
            html = html.substring(0, match.start) + replacement + html.substring(match.end);
        }

        // コード
        html = html.replace(
            /(`)(.*?)(`)/g,
            '<span class="control-char">$1</span><code>$2</code><span class="control-char">$3</span>',
        );

        // 取り消し線
        html = html.replace(
            /(\[)(-)(.*?)(\])/g,
            '<span class="control-char">$1</span><span class="control-char">$2</span><s>$3</s><span class="control-char">$4</span>',
        );

        // 下線 (HTML escaped version)
        html = html.replace(
            /(&lt;u&gt;)(.*?)(&lt;\/u&gt;)/g,
            '<span class="control-char">&lt;u&gt;</span><u>$2</u><span class="control-char">&lt;/u&gt;</span>',
        );

        // 斜体 - スペース必須: [/ テキスト]
        html = html.replace(
            /(\[)(\/)(\s+)([^\]]*)(\])/g,
            '<span class="control-char">$1</span><span class="control-char">$2</span>$3<em>$4</em><span class="control-char">$5</span>',
        );

        // プロジェクト内部リンク - スペースなし: [/project/page] または [/page]
        html = html.replace(
            /(\[\/)([^\s\]]+)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 外部リンク - カーソルがある時は制御文字のみ表示
        html = html.replace(
            /(\[)(https?:\/\/[^\s\]]+)(?:\s+([^\]]+))?(\])/g,
            (match, open, url, label, close) => {
                const content = label ? `${url} ${label}` : url;
                return `<span class="control-char">${open}</span>${content}<span class="control-char">${close}</span>`;
            },
        );

        // 通常の内部リンク - カーソルがある時は制御文字のみ表示
        html = html.replace(
            /(\[)([^[\]/-][^[\]]*?)(\])/g,
            '<span class="control-char">$1</span>$2<span class="control-char">$3</span>',
        );

        // 引用
        html = html.replace(/(^>\s)(.*?)$/gm, '<span class="control-char">$1</span><blockquote>$2</blockquote>');

        return html;
    }

    /**
     * 括弧のバランスを考慮して太字をマッチする関数（formatWithControlChars用）
     */
    private static matchBalancedBold(text: string): Array<{ start: number; end: number; content: string; }> {
        const matches: Array<{ start: number; end: number; content: string; }> = [];
        let i = 0;
        while (i < text.length - 1) {
            if (text[i] === "[" && text[i + 1] === "[") {
                // 太字の開始を見つけた
                let j = i + 2;
                let content = "";
                let boldDepth = 1;

                while (j < text.length && boldDepth > 0) {
                    if (j < text.length - 1 && text[j] === "[" && text[j + 1] === "[") {
                        // ネストされた太字の開始
                        boldDepth++;
                        content += "[[";
                        j += 2;
                    } else if (j < text.length - 1 && text[j] === "]" && text[j + 1] === "]") {
                        // 太字の終了
                        boldDepth--;
                        if (boldDepth === 0) {
                            // マッチ完了
                            matches.push({ start: i, end: j + 2, content });
                            i = j + 2;
                            break;
                        } else {
                            content += "]]";
                            j += 2;
                        }
                    } else if (text[j] === "[" && (j + 1 >= text.length || text[j + 1] !== "[")) {
                        // 単一の [ を見つけた（内部リンクなどの開始）
                        content += "[";
                        j++;
                        let bracketDepth = 1;
                        while (j < text.length && bracketDepth > 0) {
                            if (text[j] === "[" && (j + 1 >= text.length || text[j + 1] !== "[")) {
                                bracketDepth++;
                                content += "[";
                                j++;
                            } else if (text[j] === "]") {
                                bracketDepth--;
                                content += "]";
                                j++;
                                if (bracketDepth === 0) {
                                    break;
                                }
                            } else {
                                content += text[j];
                                j++;
                            }
                        }
                    } else {
                        content += text[j];
                        j++;
                    }
                }

                if (boldDepth > 0) {
                    // マッチしなかった場合は次の文字へ
                    i++;
                }
            } else {
                i++;
            }
        }
        return matches;
    }

    /**
     * テキストにScrapbox構文のフォーマットが含まれているかチェックする
     * @param text チェックするテキスト
     * @returns フォーマットが含まれている場合はtrue
     */
    static hasFormatting(text: string): boolean {
        if (!text) return false;

        // 基本フォーマットの正規表現パターン
        const basicFormatPattern = /\[\[(.*?)\]\]|\[\/(.*?)\]|\[-(.*?)\]|`(.*?)`/;

        // 外部リンクの正規表現パターン
        const linkPattern = /\[(https?:\/\/[^\s\]]+)(?:\s+[^\]]+)?\]/;

        // 内部リンクの正規表現パターン
        const internalLinkPattern = /\[([^[\]/][^[\]]*?)\]/;

        // プロジェクト内部リンクの正規表現パターン
        const projectLinkPattern = /\[\/([\w\-/]+)\]/;

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

        try {
            // グローバルストアからページ情報を取得
            const store = window.appStore;
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
                // Ensure page.text is a string before calling toLowerCase
                const pageText = String(page?.text ?? "");
                if (pageText.toLowerCase() === pageName.toLowerCase()) {
                    return true;
                }
            }

            return false;
        } catch {
            // If there's an error, assume the page doesn't exist
            return false;
        }
    }
}

// グローバルに参照できるようにする（テスト環境でアクセスするため）
if (typeof window !== "undefined") {
    window.ScrapboxFormatter = ScrapboxFormatter;
}
