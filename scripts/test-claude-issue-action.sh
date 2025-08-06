#!/bin/bash

# Test script for Claude Code Action on Issues
# This script creates a test issue to verify the workflow is working

set -e

echo "🧪 Testing Claude Code Action on Issues"
echo "======================================="

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

# Create test issue
echo "📝 Creating test issue..."

ISSUE_TITLE="Test Claude Code Action Integration"
ISSUE_BODY="This is a test issue to verify that the Claude Code Action workflow is working correctly.

## Test Details

- **Workflow**: \`.github/workflows/issue-claude-action.yml\`
- **Expected Behavior**: Claude should analyze this issue and provide a response
- **Router**: Claude Code Router with Gemini CLI
- **Model**: Gemini 2.5 Pro

## Test Instructions

1. This issue should trigger the Claude Code Action workflow automatically
2. The workflow should start on a self-hosted runner
3. Claude Code Router should be configured with Gemini CLI
4. Claude should analyze this issue and add a comment

## Questions for Claude

@claude Please analyze this test issue and confirm that:

1. You can access the repository content
2. The Claude Code Router is working correctly
3. Gemini CLI integration is functioning
4. You can provide helpful analysis and suggestions

Please also suggest any improvements to our GitHub Actions setup."

# Create the issue (without labels since 'test' doesn't exist)
ISSUE_URL=$(gh issue create \
    --title "$ISSUE_TITLE" \
    --body "$ISSUE_BODY" \
    --label "enhancement")

echo "✅ Test issue created: $ISSUE_URL"

# Extract issue number from URL
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -o '[0-9]*$')

echo "📊 Issue Number: #$ISSUE_NUMBER"

# Wait a moment and check workflow status
echo "⏳ Waiting for workflow to start..."
sleep 10

# Check if workflow is running
echo "🔍 Checking workflow status..."

# Get workflow runs for this repository
WORKFLOW_RUNS=$(gh run list --workflow="issue-claude-action.yml" --limit=5 --json status,conclusion,createdAt,headBranch)

echo "📋 Recent workflow runs:"
echo "$WORKFLOW_RUNS" | jq -r '.[] | "- Status: \(.status), Conclusion: \(.conclusion // "N/A"), Created: \(.createdAt), Branch: \(.headBranch)"'

# Monitor the workflow for a few minutes
echo "👀 Monitoring workflow progress (will check for 5 minutes)..."

for i in {1..30}; do
    # Get the latest workflow run
    LATEST_RUN=$(gh run list --workflow="issue-claude-action.yml" --limit=1 --json status,conclusion,url)
    
    if [ -n "$LATEST_RUN" ]; then
        STATUS=$(echo "$LATEST_RUN" | jq -r '.[0].status')
        CONCLUSION=$(echo "$LATEST_RUN" | jq -r '.[0].conclusion // "N/A"')
        RUN_URL=$(echo "$LATEST_RUN" | jq -r '.[0].url')
        
        echo "📊 Workflow Status: $STATUS, Conclusion: $CONCLUSION"
        
        if [ "$STATUS" = "completed" ]; then
            if [ "$CONCLUSION" = "success" ]; then
                echo "✅ Workflow completed successfully!"
                echo "🔗 Run URL: $RUN_URL"
                break
            else
                echo "❌ Workflow failed with conclusion: $CONCLUSION"
                echo "🔗 Run URL: $RUN_URL"
                echo "📋 Please check the workflow logs for details"
                break
            fi
        fi
    fi
    
    if [ $i -eq 30 ]; then
        echo "⏰ Timeout reached (5 minutes). Workflow may still be running."
        echo "🔗 Check manually: https://github.com/$REPO_OWNER/$REPO_NAME/actions"
        break
    fi
    
    sleep 10
done

# Check if Claude has commented on the issue
echo "🔍 Checking for Claude's response..."
sleep 5

COMMENTS=$(gh issue view "$ISSUE_NUMBER" --json comments --jq '.comments[].body')

if echo "$COMMENTS" | grep -q "Claude\|claude\|AI\|analysis"; then
    echo "✅ Claude appears to have responded to the issue!"
    echo "📝 Recent comments:"
    echo "$COMMENTS" | tail -n 20
else
    echo "⚠️ No obvious Claude response found yet"
    echo "💡 This might be normal if the workflow is still running"
fi

echo ""
echo "🎯 Test Summary"
echo "==============="
echo "✅ Test issue created: $ISSUE_URL"
echo "📊 Issue number: #$ISSUE_NUMBER"
echo "🔗 Actions page: https://github.com/$REPO_OWNER/$REPO_NAME/actions"
echo ""
echo "📋 Next Steps:"
echo "1. Check the Actions page for workflow execution"
echo "2. Monitor the test issue for Claude's response"
echo "3. Review workflow logs if there are any issues"
echo "4. Clean up the test issue when done: gh issue close $ISSUE_NUMBER"

echo ""
echo "🧹 Cleanup Command:"
echo "gh issue close $ISSUE_NUMBER --comment 'Test completed. Closing test issue.'"
