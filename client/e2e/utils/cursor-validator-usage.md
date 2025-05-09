# CursorValidator 使用ガイド

このドキュメントでは、`CursorValidator` クラスの使用方法と、カーソル情報の検証方法について説明します。

## 目次

1. [基本的な使い方](#基本的な使い方)
2. [データの比較](#データの比較)
   - [部分比較モード](#部分比較モード)
   - [厳密比較モード](#厳密比較モード)
3. [パスによる検証](#パスによる検証)
4. [スナップショットの比較](#スナップショットの比較)
5. [カーソル数の検証](#カーソル数の検証)
6. [アクティブアイテムの検証](#アクティブアイテムの検証)
7. [cursorsとcursorInstancesの使い分け](#cursorsとcursorinstancesの使い分け)
8. [実際のデータ構造](#実際のデータ構造)
9. [ブラウザでのデバッグ](#ブラウザでのデバッグ)

## 基本的な使い方

`CursorValidator` クラスを使用して、カーソル情報を取得し、検証することができます。

```typescript
import { CursorValidator } from "./cursorValidation";
import { setupCursorDebugger, waitForCursorVisible } from "../helpers";

// カーソル情報取得用のデバッグ関数をセットアップ
await setupCursorDebugger(page);

// 最初のアイテムをクリックしてカーソルを表示
await page.locator(".outliner-item").first().click();
await waitForCursorVisible(page);

// カーソル情報を取得
const cursorData = await CursorValidator.getCursorData(page);
console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
```

## データの比較

### 部分比較モード

部分比較モードでは、期待値に含まれるプロパティのみを比較します。実際のデータには、期待値に含まれていない追加のプロパティが存在しても問題ありません。

```typescript
// 実際のデータ構造に合わせた期待値を定義
const expectedData = {
    cursorCount: 1,
    cursors: [
        {
            isActive: true
        }
    ]
};

// 部分比較モードで検証
await CursorValidator.assertCursorData(page, expectedData);
```

### 厳密比較モード

厳密比較モードでは、期待値と実際の値が完全に一致する必要があります。

```typescript
// 現在のデータを取得
const currentData = await CursorValidator.getCursorData(page);

// 同じデータで厳密比較
await CursorValidator.assertCursorData(page, currentData, true);
```

## パスによる検証

特定のパスのデータを検証することができます。パスはドット区切りで指定します。

```typescript
// カーソルの数を検証
await CursorValidator.assertCursorPath(page, "cursorCount", 1);

// 最初のカーソルがアクティブであることを検証
await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);

// 最初のカーソルのオフセットを検証
await CursorValidator.assertCursorPath(page, "cursors.0.offset", 0);
```

## スナップショットの比較

現在の状態をスナップショットとして保存し、後で比較することができます。

```typescript
// スナップショットを取得
const snapshot = await CursorValidator.takeCursorSnapshot(page);

// 何も変更せずに比較（一致するはず）
await CursorValidator.compareWithSnapshot(page, snapshot);

// カーソルを移動
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(100);

// 変更後は一致しないはず
try {
    await CursorValidator.compareWithSnapshot(page, snapshot);
    throw new Error("スナップショットが一致してしまいました");
} catch (error) {
    console.log("スナップショットが一致しないことを確認しました");
}
```

## カーソル数の検証

カーソルの数を検証することができます。

```typescript
// カーソルの数を検証
await CursorValidator.assertCursorCount(page, 1);
```

## アクティブアイテムの検証

アクティブなアイテムIDを検証することができます。

```typescript
// アイテムIDを取得
const itemId = await page.locator(".outliner-item").first().getAttribute("data-item-id");

// アクティブなアイテムIDを検証
await CursorValidator.assertActiveItemId(page, itemId);
```

## cursorsとcursorInstancesの使い分け

カーソル情報の検証では、`cursors`と`cursorInstances`という2つのデータ構造が利用可能です。これらの違いと使い分けについて説明します。

### 違い

- **`cursors`**: UIの更新に使用されるリアクティブなデータ構造
  - Svelteの`$state`として定義されたプレーンなオブジェクト
  - カーソルの位置や状態などの基本情報を含む

- **`cursorInstances`**: カーソルの実際の振る舞いを実装するクラスインスタンスのコレクション
  - JavaScriptの`Map`オブジェクトとして定義
  - `Cursor`クラスのインスタンスを含み、メソッドなどの機能を持つ

### 使い分け

テストでは、検証の目的に応じて以下のように使い分けることを推奨します：

1. **基本的には`cursors`を使用する**
   ```typescript
   // カーソルの位置を検証
   await CursorValidator.assertCursorPath(page, "cursors.0.offset", 5);
   ```
   - UIに表示される内容と直接関連するため、ユーザー体験の検証に適しています
   - リアクティブな更新が正しく行われているかの検証に適しています

2. **特定の実装詳細を検証する場合は`cursorInstances`を使用する**
   ```typescript
   // カーソルインスタンスの状態を検証
   await CursorValidator.assertCursorPath(page, "cursorInstances.0.itemId", expectedItemId);
   ```
   - 実装の詳細に依存するテストは壊れやすいため、必要な場合のみ使用します

3. **両方を組み合わせた検証**
   ```typescript
   // 両方の情報が一致していることを確認
   const data = await CursorValidator.getCursorData(page);
   expect(data.cursors[0].itemId).toBe(data.cursorInstances[0].itemId);
   ```
   - 重要なテストケースでは、両方の情報を検証することで、データと振る舞いの両面から確認できます

### 推奨事項

E2Eテストでは、ユーザーの視点からの検証が重要なので、基本的には`cursors`の情報を中心に検証することを推奨します。ただし、カーソルの内部状態や振る舞いを詳細に検証したい場合は、`cursorInstances`の情報も活用してください。

## 実際のデータ構造

実際のデータ構造は以下のようになっています：

```json
{
  "cursors": [
    {
      "cursorId": "c1220e18-60ef-48c4-9c58-8731e89ccfb4",
      "itemId": "69bb3616-50b0-475a-9713-36146086f50a",
      "offset": 0,
      "isActive": true,
      "userId": "local"
    }
  ],
  "selections": [],
  "activeItemId": "69bb3616-50b0-475a-9713-36146086f50a",
  "cursorVisible": true,
  "cursorInstances": [
    {
      "cursorId": "c1220e18-60ef-48c4-9c58-8731e89ccfb4",
      "itemId": "69bb3616-50b0-475a-9713-36146086f50a",
      "offset": 0,
      "isActive": true,
      "userId": "local"
    }
  ],
  "cursorCount": 1,
  "selectionCount": 0
}
```

## ブラウザでのデバッグ

ブラウザのコンソールからもカーソル情報を取得できます。

```javascript
// コンソールからカーソル情報を取得
const cursorData = window.getCursorDebugData();
console.log(cursorData);

// 特定のパスのデータを取得
const activeItemId = window.getCursorPathData("activeItemId");
console.log(activeItemId);
```
