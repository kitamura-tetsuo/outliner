# Fluid vs Yjs 比較テストスクリプト

このディレクトリには、FluidブランチとYjsブランチの機能的同等性を検証するためのスクリプトが含まれています。

## 📋 スクリプト一覧

### 🚀 `run-full-comparison.sh` - メインスクリプト

FluidブランチとYjsブランチの包括的な比較テストを一コマンドで実行します。

#### 実行内容

1. **Fluid用サーバー起動** - `codex-setup.sh`を使用してFluid環境をセットアップ
2. **Fluid版全テスト実行** - E2Eテストを実行してスナップショットを生成
3. **Yjs用サーバー起動** - `codex-setup.sh`を使用してYjs環境をセットアップ
4. **Yjs版全テスト実行** - E2Eテストを実行してスナップショットを生成
5. **スナップショット比較** - 両ブランチのスナップショットを詳細比較

#### 使用方法

```bash
# 完全なテスト実行（推奨）
./scripts/run-full-comparison.sh

# 詳細ログ付きで実行
./scripts/run-full-comparison.sh --verbose

# セットアップをスキップして実行
./scripts/run-full-comparison.sh --skip-setup

# 既存のスナップショットのみを比較
./scripts/run-full-comparison.sh --compare-only

# ヘルプを表示
./scripts/run-full-comparison.sh --help
```

#### オプション

| オプション       | 説明                                     |
| ---------------- | ---------------------------------------- |
| `--skip-setup`   | セットアップ（codex-setup.sh）をスキップ |
| `--skip-tests`   | テスト実行をスキップ                     |
| `--compare-only` | 既存のスナップショットのみを比較         |
| `--verbose, -v`  | 詳細ログを表示                           |
| `--help, -h`     | ヘルプを表示                             |

### 🔍 `compareSnapshots.ts` - スナップショット比較ツール

TypeScriptで実装されたスナップショット比較ツールです。

```bash
# 直接実行
npx tsx scripts/compareSnapshots.ts
```

### 📊 `compare-snapshots.sh` - シェル版比較スクリプト

シェルスクリプト版の比較ツールです。

```bash
# 実行
./scripts/compare-snapshots.sh
```

## 🎯 実行例

### 完全なテスト実行

```bash
cd /home/ubuntu/src2/outliner/client
./scripts/run-full-comparison.sh --verbose
```

**期待される出力:**

```
=== Starting Full Fluid vs Yjs Comparison Test ===

=== Setting up Fluid server ===
[INFO] Running codex-setup.sh for Fluid...
[SUCCESS] Setup completed for Fluid
[SUCCESS] Fluid server is running on port 7090

=== Running tests for Fluid ===
[INFO] Running basic tests for Fluid...
[INFO] Running snapshot tests for Fluid...
[INFO] Generated 5 snapshot files for Fluid

=== Setting up Yjs server ===
[INFO] Running codex-setup.sh for Yjs...
[SUCCESS] Setup completed for Yjs
[SUCCESS] Yjs server is running on port 7090

=== Running tests for Yjs ===
[INFO] Running basic tests for Yjs...
[INFO] Running snapshot tests for Yjs...
[INFO] Generated 5 snapshot files for Yjs

=== Comparing snapshots ===
🔍 Found 5 test cases to compare:
  - Test-case-1
  - Test-case-2
  - Test-case-3
  - Test-case-4
  - Test-case-5

[Test-case-1] ✅ Snapshots match perfectly!
[Test-case-2] ✅ Snapshots match perfectly!
[Test-case-3] ✅ Snapshots match perfectly!
[Test-case-4] ✅ Snapshots match perfectly!
[Test-case-5] ✅ Snapshots match perfectly!

==================================================
📊 Comparison Summary:
  Total test cases: 5
  Passed: 5
  Failed: 0
  Success rate: 100%
🎉 All snapshots match perfectly!

=== Test Comparison Results ===
[SUCCESS] 🎉 All tests completed successfully!
[SUCCESS] ✅ Fluid and Yjs implementations are functionally equivalent!
```

## 🛠️ トラブルシューティング

### よくある問題

1. **ポート7090が使用中**
   - スクリプトは自動的にプロセスをクリーンアップしますが、手動で停止する場合：
   ```bash
   lsof -ti:7090 | xargs kill -9
   ```

2. **依存関係の問題**
   - 各ブランチで依存関係を再インストール：
   ```bash
   cd /home/ubuntu/src2/outliner/client && npm install
   cd /home/ubuntu/src2/outliner-fluid/client && npm install
   ```

3. **テストタイムアウト**
   - スクリプト内の`TEST_TIMEOUT`変数を調整してください（デフォルト：300秒）

### ログファイル

- テスト実行ログは各ブランチの`client/logs/`ディレクトリに保存されます
- スナップショットファイルは`client/e2e-snapshots/`ディレクトリに保存されます

## 📁 ディレクトリ構造

```
/home/ubuntu/src2/
├── outliner/                    # Yjsブランチ
│   ├── scripts/
│   │   └── codex-setup.sh      # Yjs環境セットアップ
│   └── client/
│       ├── scripts/
│       │   ├── run-full-comparison.sh  # メインスクリプト
│       │   ├── compareSnapshots.ts     # TS比較ツール
│       │   └── compare-snapshots.sh    # シェル比較ツール
│       └── e2e-snapshots/      # Yjsスナップショット
└── outliner-fluid/             # Fluidブランチ
    ├── scripts/
    │   └── codex-setup.sh      # Fluid環境セットアップ
    └── client/
        └── e2e-snapshots/      # Fluidスナップショット
```

## 🎉 成功基準

スクリプトが成功した場合：

- 終了コード: 0
- 最終メッセージ: "✅ Fluid and Yjs implementations are functionally equivalent!"
- すべてのスナップショット比較が100%一致

これにより、FluidからYjsへの移行が機能的に完全であることが保証されます。
