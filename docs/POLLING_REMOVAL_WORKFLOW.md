# ポーリング削除ワークフロー

## 概要

このドキュメントでは、`docs/polling-analysis-report.md` を使用して、不要なポーリングを安全に削除する具体的な手順を説明します。

## 現状

分析の結果:
- **総ポーリング数**: 104件
- **疑わしいポーリング**: 78件（削除候補）
- **テスト専用ポーリング**: 26件

## 削除の優先順位

### 高優先度（すぐに削除すべき）

1. **短い間隔のポーリング** (100ms以下)
   - パフォーマンスへの影響が大きい
   - 多くの場合、Yjs observeやSvelteリアクティビティで代替可能

2. **"暫定"、"フォールバック"とマークされたポーリング**
   - 試行錯誤の残骸である可能性が高い
   - 本来の実装で置き換えるべき

3. **E2E安定化のためのポーリング**
   - テスト環境でのみ必要
   - 本番環境では不要

### 中優先度（検証後に削除）

1. **明確な目的がないポーリング**
   - コメントがない、または不明確
   - 削除してテストを実行して確認

2. **重複しているポーリング**
   - 同じ目的で複数のポーリングが存在
   - 統合または削除

### 低優先度（慎重に検討）

1. **長い間隔のポーリング** (1秒以上)
   - パフォーマンスへの影響は小さい
   - 削除の優先度は低い

## 削除手順

### ステップ1: レポートを確認

```bash
cd client
npm run analyze:polling
```

生成されたレポート `docs/polling-analysis-report.md` を開いて、削除候補を確認します。

### ステップ2: 個別のポーリングを調査

各ポーリングについて:

1. **コンテキストを確認**
   - なぜこのポーリングが存在するのか?
   - 代替手段はあるか?

2. **使用箇所を確認**
   ```bash
   cd client
   grep -r "setInterval" src/components/OutlinerItem.svelte
   ```

3. **関連するテストを確認**
   ```bash
   cd client
   npm run test:e2e -- e2e/core/itm-*.spec.ts
   ```

### ステップ3: ポーリングを削除または置き換え

#### パターン1: Yjs Observeで置き換え

**削除前:**
```typescript
onMount(() => {
    const iv = setInterval(() => {
        aliasTargetId = item.aliasTargetId;
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

**削除後:**
```typescript
onMount(() => {
    const ymap = item.tree.getNodeValueFromKey(item.key);
    const observer = (event) => {
        if (event.keysChanged.has('aliasTargetId')) {
            aliasTargetId = ymap.get('aliasTargetId');
        }
    };
    ymap.observe(observer);
    onDestroy(() => ymap.unobserve(observer));
});
```

#### パターン2: Svelte $derivedで置き換え

**削除前:**
```typescript
let value = $state(0);
onMount(() => {
    const iv = setInterval(() => {
        value = store.getValue();
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

**削除後:**
```typescript
let value = $derived(store.getValue());
```

#### パターン3: 単純に削除

**削除前:**
```typescript
// E2E安定化: 入力DOMの値をポーリング
onMount(() => {
    const iv = setInterval(() => {
        const inputEl = document.querySelector('input');
        if (inputEl?.value) {
            newText = inputEl.value;
        }
    }, 120);
    onDestroy(() => clearInterval(iv));
});
```

**削除後:**
```typescript
// bind:valueで十分
<input bind:value={newText} />
```

### ステップ4: テストを実行

削除後、必ず関連するテストを実行します:

```bash
cd client

# 単体テスト
npm run test:unit

# 統合テスト
npm run test:integration

# E2Eテスト（該当ファイルのみ）
npm run test:e2e -- e2e/core/itm-*.spec.ts

# 完全なテストスイート
npm test
```

### ステップ5: コミット

テストが成功したら、変更をコミットします:

```bash
git add .
git commit -m "refactor: Remove unnecessary polling in OutlinerItem.svelte

- Replaced setInterval with Yjs observe for aliasTargetId
- Improves performance by reducing timer callbacks
- All tests passing"
```

## 具体的な削除候補

### 最優先: OutlinerItem.svelte のポーリング

**ファイル**: `client/src/components/OutlinerItem.svelte`

1. **行340付近: aliasLastConfirmedPulse ポーリング**
   - 間隔: 100ms
   - 目的: E2E安定化
   - 代替: Yjs observe + data属性の直接設定
   - 推奨: **削除**

2. **行1765付近: E2Eファイルドロップポーリング**
   - 間隔: 不明
   - 目的: E2Eテストのワークアラウンド
   - 代替: Playwrightの正式なファイルドロップAPI
   - 推奨: **削除**

### 高優先度: OutlinerItemAlias.svelte のポーリング

**ファイル**: `client/src/components/OutlinerItemAlias.svelte`

1. **行50付近: aliasLastConfirmedPulse ポーリング**
   - 間隔: 100ms
   - 目的: E2E安定化
   - 代替: Yjs observe
   - 推奨: **削除**

### 高優先度: CommentThread.svelte のポーリング

**ファイル**: `client/src/components/CommentThread.svelte`

1. **行147付近: 入力値ポーリング**
   - 間隔: 120ms
   - 目的: bind:valueが効かない環境への対応
   - 代替: bind:valueの修正
   - 推奨: **削除**

### 中優先度: EditorOverlay.svelte のポーリング

**ファイル**: `client/src/components/EditorOverlay.svelte`

1. **行213付近: 位置更新ポーリング**
   - 間隔: 16ms (60fps)
   - 目的: カーソル位置の更新
   - 代替: MutationObserver（既に実装済み）
   - 推奨: **検証後に削除**

## トラブルシューティング

### テストが失敗する場合

1. **エラーメッセージを確認**
   ```bash
   cd client
   npm run test:e2e -- e2e/core/itm-*.spec.ts 2>&1 | tee test-output.log
   ```

2. **ポーリングが本当に必要か確認**
   - 一時的にポーリングを復活させてテスト
   - 成功すれば、ポーリングは必要

3. **代替実装を確認**
   - Yjs observeが正しく設定されているか
   - 初期化タイミングは適切か

### パフォーマンスが悪化する場合

1. **ポーリング削除前後でプロファイリング**
   ```javascript
   // ブラウザコンソールで
   performance.mark('start');
   // 操作を実行
   performance.mark('end');
   performance.measure('operation', 'start', 'end');
   console.log(performance.getEntriesByType('measure'));
   ```

2. **代替実装の最適化**
   - Yjs observeのイベントフィルタリング
   - $derivedの依存関係の最適化

## 進捗管理

削除の進捗を追跡するために、以下のチェックリストを使用します:

### OutlinerItem.svelte
- [ ] aliasLastConfirmedPulse ポーリング (行340)
- [ ] E2Eファイルドロップポーリング (行1765)

### OutlinerItemAlias.svelte
- [ ] aliasLastConfirmedPulse ポーリング (行50)

### CommentThread.svelte
- [ ] 入力値ポーリング (行147)

### EditorOverlay.svelte
- [ ] 位置更新ポーリング (行213)

### その他
- [ ] Checklist.svelte の自動リセットポーリング
- [ ] AliasPicker.svelte のフォーカスポーリング
- [ ] AuthComponent.svelte のローディング状態ポーリング

## 参考資料

- [POLLING_ANALYSIS_GUIDE.md](./POLLING_ANALYSIS_GUIDE.md) - 詳細なガイド
- [polling-analysis-report.md](./polling-analysis-report.md) - 分析レポート
- [AGENTS.md](../AGENTS.md) - プロジェクトガイドライン

