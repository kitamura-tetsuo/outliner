# TreeValidator 使用ガイド

このドキュメントでは、`TreeValidator` クラスの使用方法と、SharedTreeデータの検証方法について説明します。

## 目次

1. [基本的な使い方](#基本的な使い方)
2. [データの比較](#データの比較)
   - [部分比較モード](#部分比較モード)
   - [厳密比較モード](#厳密比較モード)
3. [パスによる検証](#パスによる検証)
4. [スナップショットの比較](#スナップショットの比較)
5. [特定のパスを無視した比較](#特定のパスを無視した比較)
6. [実際のデータ構造](#実際のデータ構造)
7. [ブラウザでのデバッグ](#ブラウザでのデバッグ)

## 基本的な使い方

`TreeValidator` クラスを使用して、SharedTreeのデータ構造を取得し、検証することができます。

```typescript
import { TreeValidator } from "./treeValidation";

// SharedTreeのデータ構造を取得
const treeData = await TreeValidator.getTreeData(page);
console.log("Tree data:", JSON.stringify(treeData, null, 2));
```

## データの比較

### 部分比較モード

部分比較モードでは、期待値に含まれるプロパティのみを比較します。実際のデータには、期待値に含まれていない追加のプロパティが存在しても問題ありません。

```typescript
// 実際のデータ構造に合わせた期待値を定義
const expectedData = {
    itemCount: 1,
    items: [
        {
            text: "First item",
            items: [
                { text: "Second item" },
                { text: "Third item" }
            ]
        }
    ]
};

// 部分比較モードで検証
await TreeValidator.assertTreeData(page, expectedData);
```

### 厳密比較モード

厳密比較モードでは、期待値と実際の値が完全に一致する必要があります。

```typescript
// 現在のデータを取得
const currentData = await TreeValidator.getTreeData(page);

// 同じデータで厳密比較
await TreeValidator.assertTreeData(page, currentData, true);
```

## パスによる検証

特定のパスのデータを検証することができます。パスはドット区切りで指定します。

```typescript
// 特定のパスのデータを検証
await TreeValidator.assertTreePath(page, "itemCount", 1);
await TreeValidator.assertTreePath(page, "items.0.text", "First item");
await TreeValidator.assertTreePath(page, "items.0.items.0.text", "Second item");
await TreeValidator.assertTreePath(page, "items.0.items.1.text", "Third item");
```

## スナップショットの比較

現在の状態をスナップショットとして保存し、後で比較することができます。

```typescript
// スナップショットを取得
const snapshot = await TreeValidator.takeTreeSnapshot(page);

// 何も変更せずに比較（一致するはず）
await TreeValidator.compareWithSnapshot(page, snapshot);

// 新しいアイテムを追加
await page.locator(".outliner-item").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("New item");
await page.waitForTimeout(500);

// 変更後は一致しないはず
try {
    await TreeValidator.compareWithSnapshot(page, snapshot);
    throw new Error("スナップショットが一致してしまいました");
} catch (error) {
    console.log("スナップショットが一致しないことを確認しました");
}
```

## 特定のパスを無視した比較

特定のパスを無視して比較することができます。これは、時間やIDなど、テストごとに変わる値を無視したい場合に便利です。

```typescript
// スナップショットを取得
const snapshot = await TreeValidator.takeTreeSnapshot(page);

// 新しいアイテムを追加
await page.locator(".outliner-item").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("New item");
await page.waitForTimeout(500);

// 特定のパスを無視して比較
try {
    // 新しく追加されたアイテムのパスを無視
    await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
    console.log("無視したパス以外は一致しました");
} catch (error) {
    console.error("無視したパス以外も変更されています");
}
```

## 実際のデータ構造

実際のデータ構造は以下のようになっています：

```json
{
  "itemCount": 1,
  "items": [
    {
      "id": "c1220e18-60ef-48c4-9c58-8731e89ccfb4",
      "text": "First item",
      "author": "3WMAjkxTZjVrZLlRHjtdUDgygHV0",
      "votes": [],
      "created": 1746710413970,
      "lastChanged": 1746710414632,
      "items": [
        {
          "id": "69bb3616-50b0-475a-9713-36146086f50a",
          "text": "Second item",
          "author": "local",
          "votes": [],
          "created": 1746710414633,
          "lastChanged": 1746710414986
        },
        {
          "id": "e5ee6ac8-4438-412c-aa3e-8cdfb2e342a5",
          "text": "Third item",
          "author": "local",
          "votes": [],
          "created": 1746710414988,
          "lastChanged": 1746710415305
        }
      ]
    }
  ]
}
```

## ブラウザでのデバッグ

ブラウザのコンソールからもSharedTreeのデータを取得できます。

```javascript
// コンソールからSharedTreeのデータを取得
const treeData = window.getFluidTreeDebugData();
console.log(treeData);

// 特定のパスのデータを取得
const firstItemText = window.getFluidTreePathData("items.0.text");
console.log(firstItemText);
```
