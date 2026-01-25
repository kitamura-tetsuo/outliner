# Polling Analysis and Removal Tool Index

This document provides an overview of the polling analysis and removal toolset.

## Tool List

### 1. Static Analysis Tool

**File**: `scripts/analyze-polling.mjs`

**Purpose**: Scan codebase to detect and classify all polling processes

**Usage**:

```bash
cd client
npm run analyze:polling
```

**Output**: `docs/polling-analysis-report.md`

**Features**:

- Detects setInterval, setTimeout, requestAnimationFrame
- Classifies into Necessary/Suspicious/Test-Only
- Displays context of each polling

### 2. Runtime Monitoring Tool

**File**: `client/src/lib/pollingMonitor.ts`

**Purpose**: Intercept and track polling calls within the browser

**Usage**:

```typescript
import { pollingMonitor } from "$lib/pollingMonitor";

// Start monitoring
pollingMonitor.start();

// Get statistics
const stats = pollingMonitor.getStats();
console.log(stats);

// Generate report
console.log(pollingMonitor.generateReport());

// Disable specific polling
pollingMonitor.addDisablePattern(/OutlinerItem.*alias/);
```

**Features**:

- Intercepts polling calls
- Tracks execution counts
- Records stack traces
- Disables polling matching specific patterns

### 3. E2E Test Helper

**File**: `client/e2e/utils/pollingTestHelper.ts`

**Purpose**: Disable polling in E2E tests for testing

**Usage**:

```typescript
import { testWithoutPolling } from "../utils/pollingTestHelper";

const result = await testWithoutPolling(
    page,
    "Test name",
    /Filename.*PollingIdentifier/,
    async () => {
        // Test code
    },
);

// If result.isRemovable is true, it can be removed
```

**Features**:

- Disables specific polling
- Runs tests with/without polling
- Determines removability

### 4. Polling Removability Test

**File**: `client/e2e/env/env-polling-analysis-test-removability-a1b2c3d4.spec.ts`

**Purpose**: Actually disable polling and run E2E tests

**Usage**:

```bash
cd client
npm run test:polling
```

**Output**: `docs/polling-removability-report.md`

**Features**:

- Disables major pollings and runs tests
- Compares test results
- Reports removable pollings

## Document List

### 1. Quick Start

**File**: `docs/POLLING_ANALYSIS_SUMMARY.md`

**Content**: Concise guide to start in 3 steps

**Target**: Developers who want to start immediately

### 2. Complete Guide

**File**: `docs/POLLING_ANALYSIS_GUIDE.md`

**Content**: Detailed usage and theory of tools

**Target**: Developers who want to understand how tools work

### 3. Removal Workflow

**File**: `docs/POLLING_REMOVAL_WORKFLOW.md`

**Content**: Specific steps to actually remove polling

**Target**: Developers removing polling

### 4. Analysis Report

**File**: `docs/polling-analysis-report.md`

**Content**: Static analysis results (Auto-generated)

**Target**: Developers checking removal candidates

### 5. Removability Report

**File**: `docs/polling-removability-report.md`

**Content**: E2E test results (Auto-generated)

**Target**: Developers verifying safety of removal

### 6. Feature Specifications

**File**: `docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml`

**Content**: Tool feature specifications

**Target**: Developers who want to grasp the full picture of the tool

## Workflow

### Initial Execution

```bash
# 1. Run analysis
cd client
npm run analyze:polling

# 2. Check report
cat ../docs/polling-analysis-report.md

# 3. Check summary
cat ../docs/POLLING_ANALYSIS_SUMMARY.md

# 4. Check removal workflow
cat ../docs/POLLING_REMOVAL_WORKFLOW.md
```

### Polling Removal

```bash
# 1. Select removal candidate
# Select from docs/polling-analysis-report.md

# 2. Modify code
# Edit relevant file in editor

# 3. Run tests
npm test

# 4. Commit
git add .
git commit -m "refactor: Remove unnecessary polling in XXX"
```

### Periodic Check

```bash
# Check if new pollings are added
cd client
npm run analyze:polling

# Compare reports
diff ../docs/polling-analysis-report.md ../docs/polling-analysis-report.md.old
```

## NPM Scripts

### analyze:polling

```bash
npm run analyze:polling
```

Runs static analysis and generates report

### test:polling

```bash
npm run test:polling
```

Verifies polling removability with E2E tests

## File Structure

```
workspace/
├── scripts/
│   ├── analyze-polling.mjs          # Static Analysis Tool
│   └── analyze-polling.ts           # TypeScript version (Unused)
├── client/
│   ├── src/
│   │   └── lib/
│   │       └── pollingMonitor.ts    # Runtime Monitoring Tool
│   └── e2e/
│       ├── utils/
│       │   └── pollingTestHelper.ts # E2E Test Helper
│       └── env/
│           └── env-polling-analysis-test-removability-a1b2c3d4.spec.ts
└── docs/
    ├── POLLING_ANALYSIS_SUMMARY.md      # Quick Start
    ├── POLLING_ANALYSIS_GUIDE.md        # Complete Guide
    ├── POLLING_REMOVAL_WORKFLOW.md      # Removal Workflow
    ├── POLLING_TOOLS_INDEX.md           # This file
    ├── polling-analysis-report.md       # Analysis Report (Auto-generated)
    ├── polling-removability-report.md   # Removability Report (Auto-generated)
    └── dev-features/
        └── pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml
```

## Next Steps

1. **For Beginners**: Read `docs/POLLING_ANALYSIS_SUMMARY.md`
2. **For Details**: Read `docs/POLLING_ANALYSIS_GUIDE.md`
3. **To Start Removal**: Read `docs/POLLING_REMOVAL_WORKFLOW.md`
4. **To Extend Tools**: Read `docs/dev-features/pol-polling-analysis-and-removal-tool-a1b2c3d4.yaml`

## Support

If you have questions or issues, please check:

1. Troubleshooting section in `docs/POLLING_ANALYSIS_GUIDE.md`
2. Troubleshooting section in `docs/POLLING_REMOVAL_WORKFLOW.md`
3. Create a GitHub Issue

## Contribution

Suggestions for tool improvements and bug reports are welcome:

1. Create an Issue on GitHub
2. Send a Pull Request
3. Suggest document improvements

## License

This toolset follows the project license.
