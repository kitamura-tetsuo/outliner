# ポーリング削除依頼プロンプト

## 基本プロンプト (推奨)

```
[ファイル名]のポーリングを削除して下さい。

1. npm run analyze:polling でポーリングを特定
2. 各ポーリングをリアクティブパターンに置き換え
3. テストで回帰がないことを確認

テストに回帰がある場合は、ポーリングが必要な理由を分析して報告して下さい。
```

## 詳細プロンプト (複雑なケース向け)

```
[ファイル名]の不要なポーリングを削除して、テストに回帰がない事を確認して下さい。

作業手順:
1. npm run analyze:polling で対象ファイルのポーリングを特定
2. 各ポーリングについて:
   - setInterval/setTimeout → Svelte $derived/$effect または Yjs observe
   - requestAnimationFrame → MutationObserver/ResizeObserver (可能な場合)
3. テスト実行:
   - npm run test:unit
   - npm run test:e2e:basic
   - 関連するE2Eテスト
4. 回帰がある場合:
   - ポーリングが必要な理由を分析
   - 代替手段を検討
   - 結果を報告

テストに回帰があるならば、ポーリングの弁別精度を向上させる方法を実装して下さい。
```

## 使用例

### 単一ファイル

```
OutlinerItemAlias.svelte のポーリングを削除して下さい。

1. npm run analyze:polling でポーリングを特定
2. 各ポーリングをリアクティブパターンに置き換え
3. テストで回帰がないことを確認

テストに回帰がある場合は、ポーリングが必要な理由を分析して報告して下さい。
```

### 複数ファイル

```
以下のファイルのポーリングを削除して下さい:
- CommentThread.svelte
- EditorOverlay.svelte

1. npm run analyze:polling でポーリングを特定
2. 各ポーリングをリアクティブパターンに置き換え
3. テストで回帰がないことを確認

テストに回帰がある場合は、ポーリングが必要な理由を分析して報告して下さい。
```

### 特定のポーリングタイプ

```
EditorOverlay.svelte の位置更新ポーリング (16ms間隔) を削除して下さい。

1. npm run analyze:polling でポーリングを特定
2. MutationObserver または ResizeObserver に置き換え
3. テストで回帰がないことを確認

テストに回帰がある場合は、ポーリングが必要な理由を分析して報告して下さい。
```

## 置き換えパターン

### setInterval/setTimeout → Svelte リアクティビティ

**削除前**:

```typescript
setInterval(() => {
    const value = someStore.getValue();
    if (value) {
        updateDOM(value);
    }
}, 100);
```

**削除後**:

```typescript
let reactiveValue = $derived(someStore.getValue());

$effect(() => {
    if (reactiveValue) {
        updateDOM(reactiveValue);
    }
});
```

### setInterval/setTimeout → Yjs observe

**削除前**:

```typescript
setInterval(() => {
    const value = ymap.get("key");
    if (value !== lastValue) {
        lastValue = value;
        updateUI(value);
    }
}, 100);
```

**削除後**:

```typescript
onMount(() => {
    const observer = (event) => {
        if (event.keysChanged.has("key")) {
            const value = ymap.get("key");
            updateUI(value);
        }
    };
    ymap.observe(observer);
    observer(); // Initial sync
    onDestroy(() => ymap.unobserve(observer));
});
```

### requestAnimationFrame → MutationObserver

**削除前**:

```typescript
function checkPosition() {
    const rect = element.getBoundingClientRect();
    updatePosition(rect);
    requestAnimationFrame(checkPosition);
}
requestAnimationFrame(checkPosition);
```

**削除後**:

```typescript
const observer = new MutationObserver(() => {
    const rect = element.getBoundingClientRect();
    updatePosition(rect);
});
observer.observe(element, {
    attributes: true,
    childList: true,
    subtree: true,
});
onDestroy(() => observer.disconnect());
```

## 注意事項

### 削除してはいけないポーリング

以下のケースでは、ポーリングが必要な場合があります:

1. **ブラウザのレンダリングサイクルに依存する処理**
   - フォーカス設定の複数回試行
   - カーソル位置の設定
   - 例: `requestAnimationFrame(() => { setTimeout(() => { element.focus(); }, 10); })`

2. **外部システムのポーリング**
   - ログローテーション (定期実行が必要)
   - アイドルタイムアウト (一定時間後の処理)
   - 例: `setInterval(() => { rotateLog(); }, 3600000);`

3. **カーソル点滅**
   - UI表現として必要
   - 例: `setInterval(() => { toggleCursor(); }, 500);`

### テスト回帰時の対応

テストが失敗した場合:

1. **ポーリングの目的を再確認**
   - コメントやコミット履歴を確認
   - なぜポーリングが導入されたのか

2. **代替手段を検討**
   - イベントベースの実装は可能か
   - オブザーバーパターンは使えるか
   - リアクティブシステムで対応できるか

3. **必要性を判断**
   - 本当にポーリングが必要か
   - テスト側の問題ではないか
   - E2E専用のワークアラウンドではないか

4. **結果を報告**
   - ポーリングが必要な理由
   - 代替手段の検討結果
   - 推奨される対応

## 参考資料

- [ポーリング分析ガイド](./POLLING_ANALYSIS_GUIDE.md)
- [ポーリング削除ワークフロー](./POLLING_REMOVAL_WORKFLOW.md)
- [ポーリング削除結果](./POLLING_REMOVAL_RESULTS.md)
- [ポーリングツールインデックス](./POLLING_TOOLS_INDEX.md)
