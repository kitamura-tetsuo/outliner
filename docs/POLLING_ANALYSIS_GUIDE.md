# ポーリング分析・削除ガイド

このガイドでは、コードベース内の不要なポーリングを特定して削除する方法を説明します。

## 概要

コードベースには多数の `setInterval`、`setTimeout`、`requestAnimationFrame` によるポーリング処理が存在します。これらの中には:

- **必要なポーリング**: カーソル点滅、ログローテーションなど、明確な目的がある
- **不要なポーリング**: 試行錯誤の残骸、E2Eテストのワークアラウンドなど
- **置き換え可能なポーリング**: Yjs observerやSvelteリアクティビティで代替可能

このツールセットは、これらを自動的に分析し、安全に削除できるポーリングを特定します。

## ツールの構成

### 1. 静的分析ツール (`analyze-polling.ts`)

コードベースをスキャンして、すべてのポーリング処理を検出・分類します。

**実行方法:**
```bash
npm run analyze:polling
```

**出力:**
- `docs/polling-analysis-report.md`: 分析レポート

**分類:**
- **必要なポーリング**: 削除すべきでないもの
- **疑わしいポーリング**: 削除候補
- **テスト専用ポーリング**: テスト環境でのみ実行

### 2. ランタイム監視ツール (`pollingMonitor.ts`)

ブラウザ内でポーリング呼び出しをインターセプトして追跡します。

**使用方法:**
```typescript
import { pollingMonitor } from '$lib/pollingMonitor';

// モニタリング開始
pollingMonitor.start();

// 統計取得
const stats = pollingMonitor.getStats();
console.log(stats);

// レポート生成
console.log(pollingMonitor.generateReport());
```

### 3. E2Eテストヘルパー (`pollingTestHelper.ts`)

特定のポーリングを無効化してテストを実行し、影響を確認します。

**使用方法:**
```typescript
import { testWithoutPolling } from '../utils/pollingTestHelper';

const result = await testWithoutPolling(
    page,
    'Test name',
    /ファイル名.*ポーリング識別子/,
    async () => {
        // テストコード
    }
);

// result.isRemovable が true なら削除可能
```

### 4. ポーリング削除可能性テスト

実際にポーリングを無効化してE2Eテストを実行します。

**実行方法:**
```bash
npm run test:polling
```

**出力:**
- `docs/polling-removability-report.md`: 削除可能性レポート

## 使用ワークフロー

### ステップ1: 静的分析を実行

```bash
cd client
npm run analyze:polling
```

これにより `docs/polling-analysis-report.md` が生成されます。

### ステップ2: 分析レポートをレビュー

`docs/polling-analysis-report.md` を開いて、以下を確認:

- **疑わしいポーリング**セクションを重点的にレビュー
- 各ポーリングのコンテキストを確認
- 削除候補をリストアップ

### ステップ3: 削除可能性テストを実行

```bash
cd client
npm run test:polling
```

これにより、各疑わしいポーリングを無効化してテストを実行します。

### ステップ4: テスト結果をレビュー

`docs/polling-removability-report.md` を開いて:

- **削除可能なポーリング**セクションを確認
- これらは無効化してもテストが成功したポーリング
- 安全に削除できる可能性が高い

### ステップ5: ポーリングを削除

削除可能と判定されたポーリングを実際に削除します。

**例: OutlinerItem.svelte の 340行目のポーリング**

削除前:
```typescript
onMount(() => {
    const iv = setInterval(() => {
        // ポーリング処理
    }, 100);
    onDestroy(() => clearInterval(iv));
});
```

削除後:
```typescript
// ポーリングを削除し、Yjs observeで代替
onMount(() => {
    const observer = () => {
        // 同じ処理
    };
    ymap.observe(observer);
    onDestroy(() => ymap.unobserve(observer));
});
```

### ステップ6: 完全なテストスイートを実行

```bash
cd client
npm test
```

すべてのテストが成功することを確認します。

## 分類基準

### 必要なポーリング

以下の特徴があるポーリングは削除すべきではありません:

- カーソル点滅 (530ms間隔)
- ログローテーション (12時間間隔)
- アイドルタイムアウト監視
- 明確なコメントで目的が説明されている

### 疑わしいポーリング（削除候補）

以下の特徴があるポーリングは削除を検討すべきです:

- 短い間隔 (<200ms)
- "フォールバック"、"暫定"、"E2E安定化"などのコメント
- 明確な目的がない
- 試行錯誤の残骸と思われる

### テスト専用ポーリング

以下の特徴があるポーリングはテスト環境でのみ実行されます:

- `__E2E__` や `VITE_IS_TEST` の条件分岐内
- E2Eテストのワークアラウンド
- テスト環境でのみ必要な処理

## ポーリングの代替手段

### 1. Yjs Observer

ポーリングの代わりにYjsのobserveを使用:

```typescript
// Before: ポーリング
setInterval(() => {
    const value = ymap.get('key');
    localState = value;
}, 100);

// After: Yjs observe
ymap.observe((event) => {
    if (event.keysChanged.has('key')) {
        localState = ymap.get('key');
    }
});
```

### 2. Svelte 5 Reactivity

ポーリングの代わりにSvelte 5の `$derived` を使用:

```typescript
// Before: ポーリング
let value = $state(0);
setInterval(() => {
    value = store.getValue();
}, 100);

// After: $derived
let value = $derived(store.getValue());
```

### 3. MutationObserver

DOMの変更を監視する場合:

```typescript
// Before: ポーリング
setInterval(() => {
    const el = document.querySelector('.target');
    if (el) updatePosition(el);
}, 16);

// After: MutationObserver
const observer = new MutationObserver(() => {
    const el = document.querySelector('.target');
    if (el) updatePosition(el);
});
observer.observe(document.body, { childList: true, subtree: true });
```

## トラブルシューティング

### テストが失敗する場合

1. **ポーリングが実際に必要**
   - レポートの「必要なポーリング」セクションに移動
   - 削除しない

2. **代替手段が不完全**
   - Yjs observeやSvelteリアクティビティで完全に置き換えられているか確認
   - 初期化タイミングを確認

3. **テスト環境固有の問題**
   - テスト環境でのみ失敗する場合、テスト側の修正を検討

### ポーリングが検出されない場合

1. **動的に生成されるポーリング**
   - ランタイム監視ツールを使用
   - ブラウザコンソールで `window.__pollingMonitor.getStats()` を実行

2. **外部ライブラリのポーリング**
   - 分析対象外（node_modules除外）
   - 必要に応じて手動で確認

## ベストプラクティス

1. **段階的に削除**
   - 一度に多数のポーリングを削除しない
   - 1つずつ削除してテストを実行

2. **コミットを分ける**
   - 各ポーリング削除を個別のコミットに
   - ロールバックしやすくする

3. **理由を文書化**
   - 削除できない場合はコメントで理由を説明
   - 将来の開発者のために

4. **定期的に実行**
   - 新しいポーリングが追加されていないか定期的にチェック
   - CI/CDに組み込むことを検討

## 参考情報

- [AGENTS.md](../AGENTS.md) - プロジェクトガイドライン
- [docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml](./dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml) - 機能仕様
- [Yjs Documentation](https://docs.yjs.dev/) - Yjs observeの詳細
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/$derived) - Svelteリアクティビティの詳細

