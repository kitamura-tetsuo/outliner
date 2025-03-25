/**
 * JWTトークンの内容をデコードして表示する
 * @param token デコードするJWTトークン
 * @returns デコードされたトークン情報
 */
export function decodeJwt(token: string): any {
  try {
    // JWT部分を分離
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { error: '有効なJWTトークンではありません' };
    }

    // Base64デコード
    const header = JSON.parse(atob(parts[0]));
    let payload = JSON.parse(atob(parts[1]));

    // 日付を人間が読める形式に変換
    if (payload.exp) {
      payload.expFormatted = new Date(payload.exp * 1000).toLocaleString();
    }
    if (payload.iat) {
      payload.iatFormatted = new Date(payload.iat * 1000).toLocaleString();
    }

    return { header, payload };
  } catch (error) {
    console.error('Token decoding error:', error);
    return { error: 'トークンのデコードに失敗しました' };
  }
}

/**
 * サーバーAPIを使用してトークン情報をデバッグする
 * @param token デバッグするトークン
 * @returns サーバーからのデバッグ情報
 */
export async function debugTokenWithServer(token: string): Promise<any> {
  try {
    const apiUrl = `${import.meta.env.VITE_API_BASE_URL}/debug/token-info?token=${encodeURIComponent(token)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Server token debug error:', error);
    return { error: error.message || 'サーバーからトークン情報を取得できませんでした' };
  }
}
