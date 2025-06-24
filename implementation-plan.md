# 選択範囲機能（SLR: Selection Range）実装計画

## 1. 複数アイテムにまたがる選択範囲の実装

### 1.1 Shift+上下キーによる複数アイテム選択の強化

- Cursor.ts の extendSelectionUp/Down メソッドを拡張して、複数アイテム選択をより堅牢に実装
- 選択範囲の開始と終了が異なるアイテムにある場合の処理を改善
- 選択方向（isReversed）の適切な管理

### 1.2 マウスドラッグによる複数アイテム選択の実装

- OutlinerItem.svelte にマウスドラッグイベントハンドラを追加
- ドラッグ開始時と終了時のアイテムとオフセットを追跡
- 複数アイテムにまたがるドラッグの検出と処理
- EditorOverlayStore に選択範囲情報を適切に設定

## 2. 選択範囲に対する編集操作の実装

### 2.1 複数アイテム選択時のコピー＆ペースト

- Cursor.ts の copySelectedText と cutSelectedText メソッドを拡張
- 複数アイテムにまたがる選択範囲のテキスト取得ロジックの実装
- クリップボードへの適切なフォーマットでのコピー
- 複数アイテム選択時のペースト操作の実装

### 2.2 複数アイテム選択時の削除

- Cursor.ts に deleteSelection メソッドを追加
- 複数アイテムにまたがる選択範囲の削除ロジック
- 削除後のカーソル位置の適切な設定
- アイテムの結合処理（必要な場合）

## 3. ドラッグ＆ドロップによるテキスト操作の実装

### 3.1 選択範囲のドラッグ＆ドロップ

- OutlinerItem.svelte にドラッグ＆ドロップイベントハンドラを追加
- ドラッグ可能な選択範囲の視覚的表示
- ドロップ位置の検出と処理
- テキスト移動のロジック実装

### 3.2 ドラッグ＆ドロップ時のカーソル位置の更新

- ドロップ後のカーソル位置の適切な設定
- 選択範囲の更新または解除
- 複数アイテムにまたがるドラッグ＆ドロップの処理

## 4. テスト実装

### 4.1 E2Eテスト

- 複数アイテム選択のテスト
- コピー＆ペースト操作のテスト
- 削除操作のテスト
- ドラッグ＆ドロップのテスト

### 4.2 ユニットテスト

- Cursor.ts の新機能のテスト
- EditorOverlayStore の選択範囲関連機能のテスト

## 5. ドキュメント更新

- docs/client-features.yaml の更新
- 新機能の使用方法のドキュメント作成

## 6. Multi-Cursor Editing

### マイルストーン

- ローカルで複数カーソルを生成・移動できるようにする
- 複数カーソルでの同時テキスト編集操作を実装
- 他ユーザーとのカーソル同期により共同編集を強化

### 依存関係

- Selection Range 機能の安定化
- Fluid Framework の signal 機能

## 7. Advanced Search & Replace

### マイルストーン

- クライアントサイド全文検索エンジンの導入
- 検索UIと結果ハイライトの実装
- 一括置換と履歴管理の追加
- WASM DB との連携による高速検索

### 依存関係

- Client-Side WASM DB の実装
- ページ・アイテムデータの正規化

## 8. Client-Side WASM DB

### マイルストーン

- WebAssembly 版データベースのセットアップ
- オフライン時の読み書きキャッシュ機構
- Fluid とのデータ同期ロジック構築
- 高速全文検索用インデックス生成

### 依存関係

- Service Worker との連携
- Fluid Framework Integration

## 9. Fluid Framework Integration

### マイルストーン

- Fluid Framework の最新バージョンへの更新
- SharedTree への移行とデータモデル整理
- Signal を活用したリアルタイム機能拡充
- WASM DB と同期するロジック実装

### 依存関係

- Client-Side WASM DB
- Multi-Cursor Editing の仕様確定

## 10. Graph View

### マイルストーン

- ページ間リンクを解析してグラフ構造を生成
- D3.js などを用いたインタラクティブ表示
- グラフからページを開くナビゲーション機能
- リアルタイム更新と編集機能

### 依存関係

- Fluid Framework Integration
- Advanced Search & Replace

## 6. 新規機能の概要

### VCM-001 Multi-Cursor Editing

- 複数カーソルを任意の位置に追加して同時編集する
- 選択や入力操作を全カーソルに適用する

### SRE-001 Advanced Search & Replace

- 正規表現を用いた検索と一括置換をサポート
- 複数ページを対象にした検索UIを提供する

### DBW-001 Client-Side SQL Database

- IndexedDB上で動作するSQLデータベースを導入する
- オフラインでもページデータを保存し、復帰時に同期する

### FFI-001 Fluid Framework Integration

- Fluid Frameworkのコンテナ管理機能を共通モジュール化
- リアルタイム同期処理を他機能から簡単に利用できるようにする

### TBL-0001 Editable JOIN Table

- SQLite WASM と Fluid Framework を組み合わせ、JOIN クエリ結果を編集可能なテーブルとして表示
- セル編集は EditMapper を経由して Fluid に反映し、SyncWorker が SQLite キャッシュを更新
- ChartPanel は queryStore の変更を監視して自動更新する
- sqlService、editMapper、syncWorker のユニットテストと E2E テストを追加
- ChartPanel 表示確認と JOIN 編集検証を含むE2Eテストを追加
- EditMapper は PK エイリアスで行の編集先を特定するユニットテストを追加
- セル編集後に再実行しても更新値が取得できることをE2Eテストで検証
