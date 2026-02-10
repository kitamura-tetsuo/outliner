# TreeValidator Usage Guide

This document describes how to use the `TreeValidator` class and how to verify SharedTree data.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Data Comparison](#data-comparison)
   - [Partial Comparison Mode](#partial-comparison-mode)
   - [Strict Comparison Mode](#strict-comparison-mode)
3. [Verification by Path](#verification-by-path)
4. [Comparing Snapshots](#comparing-snapshots)
5. [Comparison Ignoring Specific Paths](#comparison-ignoring-specific-paths)
6. [Actual Data Structure](#actual-data-structure)
7. [Debugging in the Browser](#debugging-in-the-browser)

## Basic Usage

You can use the `TreeValidator` class to retrieve and verify the SharedTree data structure.

```typescript
import { TreeValidator } from "./treeValidation";

// Get SharedTree data structure
const treeData = await TreeValidator.getTreeData(page);
console.log("Tree data:", JSON.stringify(treeData, null, 2));
```

## Data Comparison

### Partial Comparison Mode

In partial comparison mode, only the properties included in the expected value are compared. It is acceptable for the actual data to contain additional properties not included in the expected value.

```typescript
// Define expected value matching the actual data structure
const expectedData = {
    itemCount: 1,
    items: [
        {
            text: "First item",
            items: [
                { text: "Second item" },
                { text: "Third item" },
            ],
        },
    ],
};

// Verify in partial comparison mode
await TreeValidator.assertTreeData(page, expectedData);
```

### Strict Comparison Mode

In strict comparison mode, the expected value and the actual value must match exactly.

```typescript
// Get current data
const currentData = await TreeValidator.getTreeData(page);

// Strict comparison with the same data
await TreeValidator.assertTreeData(page, currentData, true);
```

## Verification by Path

You can verify data at a specific path. The path is specified using dot notation.

```typescript
// Verify data at specific paths
await TreeValidator.assertTreePath(page, "itemCount", 1);
await TreeValidator.assertTreePath(page, "items.0.text", "First item");
await TreeValidator.assertTreePath(page, "items.0.items.0.text", "Second item");
await TreeValidator.assertTreePath(page, "items.0.items.1.text", "Third item");
```

## Comparing Snapshots

You can save the current state as a snapshot and compare it later.

```typescript
// Take a snapshot
const snapshot = await TreeValidator.takeTreeSnapshot(page);

// Compare without any changes (should match)
await TreeValidator.compareWithSnapshot(page, snapshot);

// Add a new item
await page.locator(".outliner-item").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("New item");
await page.waitForTimeout(500);

// Should not match after changes
try {
    await TreeValidator.compareWithSnapshot(page, snapshot);
    throw new Error("Snapshot matched unexpectedly");
} catch (error) {
    console.log("Confirmed that snapshot does not match");
}
```

## Comparison Ignoring Specific Paths

You can compare while ignoring specific paths. This is useful when you want to ignore values that change with every test, such as timestamps or IDs.

```typescript
// Take a snapshot
const snapshot = await TreeValidator.takeTreeSnapshot(page);

// Add a new item
await page.locator(".outliner-item").first().click();
await page.keyboard.press("End");
await page.keyboard.press("Enter");
await page.keyboard.type("New item");
await page.waitForTimeout(500);

// Compare ignoring specific paths
try {
    // Ignore the path of the newly added item
    await TreeValidator.compareWithSnapshot(page, snapshot, ["items.0.items.2"]);
    console.log("Matched except for the ignored path");
} catch (error) {
    console.error("Changed even outside the ignored path");
}
```

## Actual Data Structure

The actual data structure is as follows:

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

## Debugging in the Browser

You can also retrieve Yjs tree data from the browser console.

```javascript
// Get tree data from console
const treeData = window.getYjsTreeDebugData?.() ?? window.getFluidTreeDebugData?.();
console.log(treeData);

// Get data at a specific path
const firstItemText = window.getYjsTreePathData?.("items.0.text")
    ?? window.getFluidTreePathData?.("items.0.text");
console.log(firstItemText);
```
