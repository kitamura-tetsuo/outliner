# ポーリング分析・削除ツール インデックス

このドキュメントは、ポーリング分析・削除ツールセットの全体像を示します。

## ツール一覧

### 1. 静的分析ツール

**ファイル**: `scripts/analyze-polling.mjs`

**目的**: コードベースをスキャンして、すべてのポーリング処理を検出・分類

**使用方法**:
```bash
cd client
npm run analyze:polling
```

**出力**: `docs/polling-analysis-report.md`

**機能**:
- setInterval、setTimeout、requestAnimationFrameを検出
- 必要/疑わしい/テスト専用に分類
- 各ポーリングのコンテキストを表示

### 2. ランタイム監視ツール

**ファイル**: `client/src/lib/pollingMonitor.ts`

**目的**: ブラウザ内でポーリング呼び出しをインターセプトして追跡

**使用方法**:
```typescript
import { pollingMonitor } from '$lib/pollingMonitor';

// モニタリング開始
pollingMonitor.start();

// 統計取得
const stats = pollingMonitor.getStats();
console.log(stats);

// レポート生成
console.log(pollingMonitor.generateReport());

// 特定のポーリングを無効化
pollingMonitor.addDisablePattern(/OutlinerItem.*alias/);
```

**機能**:
- ポーリング呼び出しのインターセプト
- 実行回数の追跡
- スタックトレースの記録
- 特定パターンのポーリングを無効化

### 3. E2Eテストヘルパー

**ファイル**: `client/e2e/utils/pollingTestHelper.ts`

**目的**: E2Eテストでポーリングを無効化してテスト

**使用方法**:
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

**機能**:
- 特定のポーリングを無効化
- ポーリングあり/なしでテストを実行
- 削除可能性を判定

### 4. ポーリング削除可能性テスト

**ファイル**: `client/e2e/env/env-polling-analysis-test-removability-a1b2c3d4.spec.ts`

**目的**: 実際にポーリングを無効化してE2Eテストを実行

**使用方法**:
```bash
cd client
npm run test:polling
```

**出力**: `docs/polling-removability-report.md`

**機能**:
- 主要なポーリングを無効化してテスト
- テスト結果を比較
- 削除可能なポーリングをレポート

## ドキュメント一覧

### 1. クイックスタート

**ファイル**: `docs/POLLING_ANALYSIS_SUMMARY.md`

**内容**: 3ステップで始められる簡潔なガイド

**対象**: すぐに始めたい開発者

### 2. 完全ガイド

**ファイル**: `docs/POLLING_ANALYSIS_GUIDE.md`

**内容**: ツールの詳細な使用方法と理論

**対象**: ツールの仕組みを理解したい開発者

### 3. 削除ワークフロー

**ファイル**: `docs/POLLING_REMOVAL_WORKFLOW.md`

**内容**: 実際にポーリングを削除する具体的な手順

**対象**: ポーリングを削除する開発者

### 4. 分析レポート

**ファイル**: `docs/polling-analysis-report.md`

**内容**: 静的分析の結果（自動生成）

**対象**: 削除候補を確認したい開発者

### 5. 削除可能性レポート

**ファイル**: `docs/polling-removability-report.md`

**内容**: E2Eテストの結果（自動生成）

**対象**: 削除の安全性を確認したい開発者

### 6. 機能仕様

**ファイル**: `docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml`

**内容**: ツールの機能仕様

**対象**: ツールの全体像を把握したい開発者

## ワークフロー

### 初回実行

```bash
# 1. 分析を実行
cd client
npm run analyze:polling

# 2. レポートを確認
cat ../docs/polling-analysis-report.md

# 3. サマリーを確認
cat ../docs/POLLING_ANALYSIS_SUMMARY.md

# 4. 削除ワークフローを確認
cat ../docs/POLLING_REMOVAL_WORKFLOW.md
```

### ポーリング削除

```bash
# 1. 削除候補を選択
# docs/polling-analysis-report.md から選択

# 2. コードを修正
# エディタで該当ファイルを編集

# 3. テストを実行
npm test

# 4. コミット
git add .
git commit -m "refactor: Remove unnecessary polling in XXX"
```

### 定期的なチェック

```bash
# 新しいポーリングが追加されていないか確認
cd client
npm run analyze:polling

# レポートを比較
diff ../docs/polling-analysis-report.md ../docs/polling-analysis-report.md.old
```

## NPMスクリプト

### analyze:polling

```bash
npm run analyze:polling
```

静的分析を実行してレポートを生成

### test:polling

```bash
npm run test:polling
```

E2Eテストでポーリングの削除可能性を検証

## ファイル構成

```
workspace/
├── scripts/
│   ├── analyze-polling.mjs          # 静的分析ツール
│   └── analyze-polling.ts           # TypeScript版（未使用）
├── client/
│   ├── src/
│   │   └── lib/
│   │       └── pollingMonitor.ts    # ランタイム監視ツール
│   └── e2e/
│       ├── utils/
│       │   └── pollingTestHelper.ts # E2Eテストヘルパー
│       └── env/
│           └── env-polling-analysis-test-removability-a1b2c3d4.spec.ts
└── docs/
    ├── POLLING_ANALYSIS_SUMMARY.md      # クイックスタート
    ├── POLLING_ANALYSIS_GUIDE.md        # 完全ガイド
    ├── POLLING_REMOVAL_WORKFLOW.md      # 削除ワークフロー
    ├── POLLING_TOOLS_INDEX.md           # このファイル
    ├── polling-analysis-report.md       # 分析レポート（自動生成）
    ├── polling-removability-report.md   # 削除可能性レポート（自動生成）
    └── dev-features/
        └── pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml
```

## 次のステップ

1. **初めての方**: `docs/POLLING_ANALYSIS_SUMMARY.md` を読む
2. **詳しく知りたい方**: `docs/POLLING_ANALYSIS_GUIDE.md` を読む
3. **削除を始める方**: `docs/POLLING_REMOVAL_WORKFLOW.md` を読む
4. **ツールを拡張したい方**: `docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml` を読む

## サポート

質問や問題がある場合は、以下を確認してください:

1. `docs/POLLING_ANALYSIS_GUIDE.md` のトラブルシューティングセクション
2. `docs/POLLING_REMOVAL_WORKFLOW.md` のトラブルシューティングセクション
3. GitHubのIssueを作成

## 貢献

ツールの改善提案やバグ報告は歓迎します:

1. GitHubでIssueを作成
2. Pull Requestを送信
3. ドキュメントの改善提案

## ライセンス

このツールセットはプロジェクトのライセンスに従います。

