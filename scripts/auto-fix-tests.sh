#!/bin/bash

# Auto-fix tests script
# This script runs tests, and if they fail, requests Claude to fix them
# It repeats until tests pass, then pushes the changes

set -e

# Configuration
MAX_ATTEMPTS=5
ATTEMPT=1
CLAUDE_COMMENT_FILE="/tmp/claude-test-fix-request.md"
TEST_LOG_FILE="/tmp/test-results.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 Starting automated test fix process${NC}"
echo -e "${BLUE}📊 Maximum attempts: $MAX_ATTEMPTS${NC}"
echo ""

# Function to run all tests
run_tests() {
    echo -e "${BLUE}🧪 Running all tests...${NC}"
    
    # Clear previous test results
    > "$TEST_LOG_FILE"
    
    # Run tests and capture output
    cd client
    
    # Run unit tests
    echo -e "${YELLOW}Running unit tests...${NC}"
    if npm run test:unit 2>&1 | tee -a "$TEST_LOG_FILE"; then
        echo -e "${GREEN}✅ Unit tests passed${NC}"
        UNIT_PASSED=true
    else
        echo -e "${RED}❌ Unit tests failed${NC}"
        UNIT_PASSED=false
    fi
    
    # Run integration tests
    echo -e "${YELLOW}Running integration tests...${NC}"
    if npm run test:integration 2>&1 | tee -a "$TEST_LOG_FILE"; then
        echo -e "${GREEN}✅ Integration tests passed${NC}"
        INTEGRATION_PASSED=true
    else
        echo -e "${RED}❌ Integration tests failed${NC}"
        INTEGRATION_PASSED=false
    fi
    
    # Run e2e tests
    echo -e "${YELLOW}Running e2e tests...${NC}"
    if npm run test:e2e 2>&1 | tee -a "$TEST_LOG_FILE"; then
        echo -e "${GREEN}✅ E2E tests passed${NC}"
        E2E_PASSED=true
    else
        echo -e "${RED}❌ E2E tests failed${NC}"
        E2E_PASSED=false
    fi
    
    cd ..
    
    # Check overall test status
    if [ "$UNIT_PASSED" = true ] && [ "$INTEGRATION_PASSED" = true ] && [ "$E2E_PASSED" = true ]; then
        return 0  # All tests passed
    else
        return 1  # Some tests failed
    fi
}

# Function to create Claude fix request
create_claude_request() {
    local attempt=$1
    
    echo -e "${YELLOW}🤖 Creating Claude fix request for attempt $attempt${NC}"
    
    cat > "$CLAUDE_COMMENT_FILE" << EOF
@claude Please help fix the failing tests in this PR.

## Test Failure Analysis Request (Attempt $attempt/$MAX_ATTEMPTS)

The automated test suite has failed. Please analyze the test failures and implement fixes.

### Test Results Summary:
- **Unit Tests**: $([ "$UNIT_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")
- **Integration Tests**: $([ "$INTEGRATION_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")
- **E2E Tests**: $([ "$E2E_PASSED" = true ] && echo "✅ PASSED" || echo "❌ FAILED")

### Test Output:
\`\`\`
$(tail -n 100 "$TEST_LOG_FILE")
\`\`\`

### Your Task:
1. **Analyze the failing tests** and identify the root cause
2. **Fix the underlying issues** in the code (not the tests themselves)
3. **Ensure all tests pass** after your changes
4. **Follow project conventions** and maintain code quality
5. **Test your changes** by running the test suite

### Important Guidelines:
- Fix the actual bugs, don't modify tests to make them pass
- Maintain backward compatibility
- Follow existing code patterns and naming conventions
- Add appropriate error handling where needed
- Document complex changes with comments

### Test Commands:
- Unit tests: \`cd client && npm run test:unit\`
- Integration tests: \`cd client && npm run test:integration\`
- E2E tests: \`cd client && npm run test:e2e\`
- All tests: \`cd client && npm run test:all\`

Please start by examining the test failures and implementing the necessary fixes.
EOF

    echo -e "${GREEN}✅ Claude fix request created${NC}"
}

# Function to commit and push changes
commit_and_push() {
    echo -e "${BLUE}📝 Checking for changes to commit...${NC}"
    
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo -e "${YELLOW}📋 Changes detected, committing...${NC}"
        
        git add .
        git commit -m "🤖 Auto-fix: Tests now passing (attempt $ATTEMPT)

- Fixed failing tests through automated analysis
- All test suites now pass: unit, integration, e2e
- Changes made by Claude Code Action
- Attempt $ATTEMPT of $MAX_ATTEMPTS"
        
        echo -e "${BLUE}🚀 Pushing changes...${NC}"
        git push origin HEAD
        
        echo -e "${GREEN}✅ Changes committed and pushed successfully${NC}"
    else
        echo -e "${YELLOW}ℹ️ No changes to commit${NC}"
    fi
}

# Function to post Claude request as issue comment
post_claude_request() {
    if [ -n "$GITHUB_TOKEN" ] && [ -n "$PR_NUMBER" ]; then
        echo -e "${BLUE}📤 Posting Claude request to PR #$PR_NUMBER${NC}"
        
        # Use GitHub CLI to post comment
        if command -v gh >/dev/null 2>&1; then
            gh pr comment "$PR_NUMBER" --body-file "$CLAUDE_COMMENT_FILE"
            echo -e "${GREEN}✅ Claude request posted to PR${NC}"
        else
            echo -e "${YELLOW}⚠️ GitHub CLI not available, Claude request saved to file${NC}"
            echo -e "${YELLOW}📁 Request saved to: $CLAUDE_COMMENT_FILE${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ GitHub token or PR number not available${NC}"
        echo -e "${YELLOW}📁 Claude request saved to: $CLAUDE_COMMENT_FILE${NC}"
    fi
}

# Main test fix loop
while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    echo -e "${BLUE}📊 Attempt $ATTEMPT of $MAX_ATTEMPTS${NC}"
    echo "----------------------------------------"
    
    # Run tests
    if run_tests; then
        echo -e "${GREEN}🎉 All tests passed on attempt $ATTEMPT!${NC}"
        
        # Commit and push changes if any
        commit_and_push
        
        echo -e "${GREEN}✅ Test fix process completed successfully${NC}"
        exit 0
    else
        echo -e "${RED}❌ Tests failed on attempt $ATTEMPT${NC}"
        
        if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
            echo -e "${RED}💥 Maximum attempts reached ($MAX_ATTEMPTS)${NC}"
            echo -e "${RED}🔧 Manual intervention required${NC}"
            
            # Create final Claude request
            create_claude_request $ATTEMPT
            post_claude_request
            
            echo -e "${RED}❌ Auto-fix process failed after $MAX_ATTEMPTS attempts${NC}"
            exit 1
        fi
        
        # Create Claude fix request
        create_claude_request $ATTEMPT
        post_claude_request
        
        echo -e "${YELLOW}⏳ Waiting for Claude to analyze and fix the issues...${NC}"
        echo -e "${YELLOW}💡 Claude has been notified and should start working on fixes${NC}"
        
        # In a real scenario, we would wait for Claude to make changes
        # For now, we'll increment the attempt and continue
        # This would be handled by the Claude Code Action workflow
        
        ATTEMPT=$((ATTEMPT + 1))
        
        if [ $ATTEMPT -le $MAX_ATTEMPTS ]; then
            echo -e "${BLUE}🔄 Preparing for attempt $ATTEMPT...${NC}"
            sleep 10  # Brief pause before next attempt
        fi
    fi
done

echo -e "${RED}❌ Test fix loop completed without success${NC}"
exit 1
