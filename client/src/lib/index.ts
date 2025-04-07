// place files you want to import through the `$lib` alias in this folder.

// 開発モードのみ適用する場合
if (import.meta.env.MODE === 'development') {
    // 開発モードのときだけ、fetch のエラーハンドリングを追加
    if (typeof window !== 'undefined') {
        const originalFetch = window.fetch;
        window.fetch = async function (input, init) {
            try {
                return await originalFetch(input, init);
            } catch (error) {
                let url;
                if (typeof input === 'string') {
                    url = input;
                } else if (input instanceof Request) {
                    url = input.url;
                } else {
                    url = 'Unknown URL';
                }
                // オリジナルのエラーメッセージに URL を追加
                if (error instanceof Error) {
                    const enhancedError = new Error(`Failed to fetch from ${url}: ${error.message}`);
                    enhancedError.stack = error.stack;
                    throw enhancedError;
                } else {
                    throw new Error(`Failed to fetch from ${url}: Unknown error`);
                }
            }
        };
    }
}
