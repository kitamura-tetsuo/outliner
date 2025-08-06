#!/bin/bash

# Test script for PR Auto-Fix functionality
# This script creates a test PR with failing tests to verify the auto-fix workflow

set -e

echo "🧪 Testing PR Auto-Fix functionality"
echo "===================================="

# Check if gh CLI is available
if ! command -v gh >/dev/null 2>&1; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "Please install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status >/dev/null 2>&1; then
    echo "❌ GitHub CLI is not authenticated"
    echo "Please run: gh auth login"
    exit 1
fi

# Get repository information
REPO_OWNER=$(gh repo view --json owner --jq '.owner.login')
REPO_NAME=$(gh repo view --json name --jq '.name')

echo "📋 Repository: $REPO_OWNER/$REPO_NAME"

# Create a test branch
TEST_BRANCH="test/pr-auto-fix-$(date +%Y%m%d-%H%M%S)"
echo "🌿 Creating test branch: $TEST_BRANCH"

git checkout -b "$TEST_BRANCH"

# Create a failing test to trigger the auto-fix workflow
echo "📝 Creating a failing test..."

# Create a simple failing test
cat > client/src/lib/test-auto-fix.test.js << 'EOF'
import { describe, it, expect } from 'vitest';

describe('Auto-fix test', () => {
    it('should fail initially to test auto-fix functionality', () => {
        // This test is intentionally failing to test the auto-fix workflow
        const result = 2 + 2;
        expect(result).toBe(5); // This will fail: 4 !== 5
    });

    it('should have a syntax error to test fix capability', () => {
        // This will cause a syntax error
        const broken = {
            property: 'value'
            // Missing comma here will cause issues
            anotherProperty: 'another value'
        };
        expect(broken.property).toBe('value');
    });

    it('should have a logical error', () => {
        function divide(a, b) {
            return a / b; // No check for division by zero
        }
        
        const result = divide(10, 0);
        expect(result).toBe(10); // This will fail: Infinity !== 10
    });
});
EOF

# Add the test file to git
git add client/src/lib/test-auto-fix.test.js

# Commit the changes
git commit -m "Add failing test to trigger auto-fix workflow

This commit introduces intentionally failing tests to verify that:
1. The PR test workflow detects failures
2. The auto-fix workflow is triggered
3. Claude Code Action analyzes and fixes the issues
4. Tests pass after fixes are applied

Test failures include:
- Assertion error (2+2 expected to be 5)
- Syntax error (missing comma in object)
- Logical error (division by zero handling)"

# Push the branch
echo "🚀 Pushing test branch..."
git push origin "$TEST_BRANCH"

# Create a pull request
echo "📝 Creating test PR..."

PR_TITLE="Test PR Auto-Fix Functionality"
PR_BODY="This is a test PR to verify that the PR Auto-Fix functionality is working correctly.

## Test Details

- **Branch**: \`$TEST_BRANCH\`
- **Expected Behavior**: 
  1. Tests should fail initially
  2. Auto-fix workflow should be triggered
  3. Claude should analyze and fix the failing tests
  4. Tests should pass after fixes are applied

## Test Cases

This PR includes intentionally failing tests:

1. **Assertion Error**: \`2 + 2\` expected to be \`5\` (should be \`4\`)
2. **Syntax Error**: Missing comma in object literal
3. **Logical Error**: Division by zero without proper handling

## Expected Auto-Fix Actions

Claude should:
1. Identify the assertion error and fix the expected value
2. Fix the syntax error by adding the missing comma
3. Add proper error handling for division by zero
4. Ensure all tests pass after fixes

## Verification Steps

1. Check that the initial test run fails
2. Verify that the auto-fix workflow is triggered
3. Monitor Claude's analysis and fixes
4. Confirm that tests pass after auto-fix
5. Review the quality of the fixes applied

Please do not manually fix these tests - let the auto-fix workflow handle them!"

# Create the PR
PR_URL=$(gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base main \
    --head "$TEST_BRANCH")

echo "✅ Test PR created: $PR_URL"

# Extract PR number from URL
PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')

echo "📊 PR Number: #$PR_NUMBER"

# Wait for the test workflow to start
echo "⏳ Waiting for test workflow to start..."
sleep 15

# Monitor the test workflow
echo "🔍 Monitoring test workflow..."

for i in {1..20}; do
    # Get the latest workflow run for this PR
    WORKFLOW_RUNS=$(gh run list --branch="$TEST_BRANCH" --limit=1 --json status,conclusion,workflowName,url)
    
    if [ -n "$WORKFLOW_RUNS" ] && [ "$WORKFLOW_RUNS" != "[]" ]; then
        STATUS=$(echo "$WORKFLOW_RUNS" | jq -r '.[0].status')
        CONCLUSION=$(echo "$WORKFLOW_RUNS" | jq -r '.[0].conclusion // "N/A"')
        WORKFLOW_NAME=$(echo "$WORKFLOW_RUNS" | jq -r '.[0].workflowName')
        RUN_URL=$(echo "$WORKFLOW_RUNS" | jq -r '.[0].url')
        
        echo "📊 Workflow: $WORKFLOW_NAME"
        echo "📊 Status: $STATUS, Conclusion: $CONCLUSION"
        
        if [ "$STATUS" = "completed" ]; then
            if [ "$CONCLUSION" = "failure" ]; then
                echo "✅ Test workflow failed as expected!"
                echo "🔗 Run URL: $RUN_URL"
                echo "⏳ Auto-fix workflow should start soon..."
                break
            elif [ "$CONCLUSION" = "success" ]; then
                echo "⚠️ Test workflow passed unexpectedly"
                echo "🔗 Run URL: $RUN_URL"
                echo "💡 The failing tests may have been fixed already"
                break
            else
                echo "❌ Test workflow completed with unexpected conclusion: $CONCLUSION"
                echo "🔗 Run URL: $RUN_URL"
                break
            fi
        fi
    fi
    
    if [ $i -eq 20 ]; then
        echo "⏰ Timeout waiting for test workflow to complete"
        break
    fi
    
    sleep 15
done

# Monitor for auto-fix workflow
echo "👀 Monitoring for auto-fix workflow..."

for i in {1..30}; do
    # Look for the auto-fix workflow
    AUTO_FIX_RUNS=$(gh run list --workflow="pr-test-fix.yml" --limit=3 --json status,conclusion,createdAt,url)
    
    if [ -n "$AUTO_FIX_RUNS" ] && [ "$AUTO_FIX_RUNS" != "[]" ]; then
        echo "🤖 Auto-fix workflow detected!"
        
        LATEST_RUN=$(echo "$AUTO_FIX_RUNS" | jq -r '.[0]')
        STATUS=$(echo "$LATEST_RUN" | jq -r '.status')
        CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.conclusion // "N/A"')
        RUN_URL=$(echo "$LATEST_RUN" | jq -r '.url')
        
        echo "📊 Auto-fix Status: $STATUS, Conclusion: $CONCLUSION"
        echo "🔗 Auto-fix URL: $RUN_URL"
        
        if [ "$STATUS" = "completed" ]; then
            if [ "$CONCLUSION" = "success" ]; then
                echo "🎉 Auto-fix workflow completed successfully!"
                break
            else
                echo "❌ Auto-fix workflow failed"
                break
            fi
        fi
    fi
    
    if [ $i -eq 30 ]; then
        echo "⏰ Timeout waiting for auto-fix workflow"
        break
    fi
    
    sleep 20
done

echo ""
echo "🎯 Test Summary"
echo "==============="
echo "✅ Test PR created: $PR_URL"
echo "📊 PR number: #$PR_NUMBER"
echo "🌿 Test branch: $TEST_BRANCH"
echo "🔗 Actions page: https://github.com/$REPO_OWNER/$REPO_NAME/actions"
echo ""
echo "📋 Next Steps:"
echo "1. Monitor the PR for test results and auto-fix attempts"
echo "2. Check the Actions page for workflow execution details"
echo "3. Review Claude's fixes when the auto-fix workflow completes"
echo "4. Verify that tests pass after auto-fix"
echo ""
echo "🧹 Cleanup Commands:"
echo "gh pr close $PR_NUMBER --comment 'Test completed. Closing test PR.'"
echo "git checkout main"
echo "git branch -D $TEST_BRANCH"
echo "git push origin --delete $TEST_BRANCH"
