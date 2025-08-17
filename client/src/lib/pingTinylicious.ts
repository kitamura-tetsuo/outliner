// Tinylicious到達性の簡易チェック（テスト環境向け）
// 指定ポートへの HTTP 接続が可能かを短時間で確認する。
// - 404 応答でも到達性があれば成功
// - 接続不可/タイムアウト時は "network" を含むエラーを投げる
export async function pingTinylicious(port: number, timeoutMs = 1500): Promise<void> {
    try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
        clearTimeout(to);
        // 404 でも OK（到達性の検証が目的）
        if (!res.ok && res.status !== 404) {
            throw new Error(`network: tinylicious responded with status ${res.status}`);
        }
    } catch (_e) {
        // vitest のテストが早期 return できるよう、メッセージに "network" を含める
        throw new Error(`network: tinylicious unreachable on port ${port}`);
    }
}
