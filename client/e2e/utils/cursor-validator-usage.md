# CursorValidator Usage Guide

This document explains how to use the `CursorValidator` class and how to verify cursor information.

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Data Comparison](#data-comparison)
   - [Partial Comparison Mode](#partial-comparison-mode)
   - [Strict Comparison Mode](#strict-comparison-mode)
3. [Verification by Path](#verification-by-path)
4. [Snapshot Comparison](#snapshot-comparison)
5. [Cursor Count Verification](#cursor-count-verification)
6. [Active Item Verification](#active-item-verification)
7. [Distinction between cursors and cursorInstances](#distinction-between-cursors-and-cursorinstances)
8. [Actual Data Structure](#actual-data-structure)
9. [Debugging in Browser](#debugging-in-browser)

## Basic Usage

You can use the `CursorValidator` class to retrieve and verify cursor information.

```typescript
import { setupCursorDebugger, waitForCursorVisible } from "../helpers";
import { CursorValidator } from "./cursorValidation";

// Setup debug function for retrieving cursor information
await setupCursorDebugger(page);

// Click the first item to show the cursor
await page.locator(".outliner-item").first().click();
await waitForCursorVisible(page);

// Retrieve cursor information
const cursorData = await CursorValidator.getCursorData(page);
console.log("Cursor data:", JSON.stringify(cursorData, null, 2));
```

## Data Comparison

### Partial Comparison Mode

In partial comparison mode, only the properties included in the expected value are compared. It is acceptable for the actual data to contain additional properties not present in the expected value.

```typescript
// Define expected value matching the actual data structure
const expectedData = {
    cursorCount: 1,
    cursors: [
        {
            isActive: true,
        },
    ],
};

// Verify in partial comparison mode
await CursorValidator.assertCursorData(page, expectedData);
```

### Strict Comparison Mode

In strict comparison mode, the expected value and the actual value must match exactly.

```typescript
// Retrieve current data
const currentData = await CursorValidator.getCursorData(page);

// Strict comparison with the same data
await CursorValidator.assertCursorData(page, currentData, true);
```

## Verification by Path

You can verify data at a specific path. The path is specified using dot notation.

```typescript
// Verify the number of cursors
await CursorValidator.assertCursorPath(page, "cursorCount", 1);

// Verify that the first cursor is active
await CursorValidator.assertCursorPath(page, "cursors.0.isActive", true);

// Verify the offset of the first cursor
await CursorValidator.assertCursorPath(page, "cursors.0.offset", 0);
```

## Snapshot Comparison

You can save the current state as a snapshot and compare it later.

```typescript
// Take a snapshot
const snapshot = await CursorValidator.takeCursorSnapshot(page);

// Compare without any changes (should match)
await CursorValidator.compareWithSnapshot(page, snapshot);

// Move the cursor
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(100);

// Should not match after change
try {
    await CursorValidator.compareWithSnapshot(page, snapshot);
    throw new Error("Snapshot matched unexpectedly");
} catch (error) {
    console.log("Confirmed snapshot does not match");
}
```

## Cursor Count Verification

You can verify the number of cursors.

```typescript
// Verify the number of cursors
await CursorValidator.assertCursorCount(page, 1);
```

## Active Item Verification

You can verify the active item ID.

```typescript
// Retrieve item ID
const itemId = await page.locator(".outliner-item").first().getAttribute("data-item-id");

// Verify active item ID
await CursorValidator.assertActiveItemId(page, itemId);
```

## Distinction between cursors and cursorInstances

Two data structures, `cursors` and `cursorInstances`, are available for cursor information verification. This section explains their differences and usage.

### Differences

- **`cursors`**: Reactive data structure used for UI updates
  - Plain object defined as Svelte `$state`
  - Contains basic information such as cursor position and state

- **`cursorInstances`**: Collection of class instances implementing actual cursor behavior
  - Defined as a JavaScript `Map` object
  - Contains instances of the `Cursor` class and has methods and other functionalities

### Usage Guidelines

In tests, it is recommended to use them according to the verification purpose as follows:

1. **Basically use `cursors`**
   ```typescript
   // Verify cursor position
   await CursorValidator.assertCursorPath(page, "cursors.0.offset", 5);
   ```
   - Suitable for verifying user experience as it directly relates to what is displayed on the UI
   - Suitable for verifying that reactive updates are performed correctly

2. **Use `cursorInstances` when verifying specific implementation details**
   ```typescript
   // Verify cursor instance state
   await CursorValidator.assertCursorPath(page, "cursorInstances.0.itemId", expectedItemId);
   ```
   - Use only when necessary, as tests depending on implementation details are fragile

3. **Verification combining both**
   ```typescript
   // Confirm both information match
   const data = await CursorValidator.getCursorData(page);
   expect(data.cursors[0].itemId).toBe(data.cursorInstances[0].itemId);
   ```
   - In critical test cases, verifying both information allows checking from both data and behavior perspectives

### Recommendations

In E2E tests, verification from the user's perspective is important, so it is recommended to focus on verifying `cursors` information. However, if you want to verify the internal state or behavior of the cursor in detail, please utilize `cursorInstances` information as well.

## Actual Data Structure

The actual data structure is as follows:

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

## Debugging in Browser

You can also retrieve cursor information from the browser console.

```javascript
// Retrieve cursor information from console
const cursorData = window.getCursorDebugData();
console.log(cursorData);

// Retrieve data for a specific path
const activeItemId = window.getCursorPathData("activeItemId");
console.log(activeItemId);
```
