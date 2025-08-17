import { describe, it, expect } from "vitest";
import { pingTinylicious } from "./pingTinylicious";

// このテストはネットワークに依存するため、厳密検証として次を行う:
// - 存在しないポートに対しては必ず "network" を含むエラーで失敗する
// - 既定ポート(7082)は環境により未起動の可能性が高いのでエラー検証のみ
// - タイムアウト動作は短いタイムアウト指定でエラーになることを検証

describe("pingTinylicious", () => {
  it("should throw with message including 'network' when unreachable", async () => {
    const unreachablePort = 65530; // 通常未使用の高位ポート
    await expect(pingTinylicious(unreachablePort, 200)).rejects.toThrow(/network/);
  });

  it("should timeout quickly when server does not respond", async () => {
    const unreachablePort = 65529; // 別の未使用ポート
    const start = Date.now();
    await expect(pingTinylicious(unreachablePort, 150)).rejects.toThrow(/network/);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1500); // 長時間ハングしない
  });

  // 環境により起動している可能性があるが、少なくとも到達不可ではない時に成功させる
  // 実サーバが起動していない CI 環境ではこのケースはスキップされる前提にはしない
  // 代わりに、reachable 検証は環境変数で明示的に有効化した場合のみ行う
  it("should succeed when reachable (optional)", async () => {
    if (!process.env.VITE_TINYLICIOUS_TEST_PORT) return; // 明示的に指定された場合のみ
    const port = parseInt(process.env.VITE_TINYLICIOUS_TEST_PORT, 10);
    await expect(pingTinylicious(port, 1000)).resolves.toBeUndefined();
  });
});

