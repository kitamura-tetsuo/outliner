---
tags: [jules, recurrent]
name: ["auto improvement with demo site"]
---

# Target Resources
- Demo Environment (for testing): https://outliner-d57b0.web.app/demo

## 1. Observe and Understand the Current State
- Access the demo environment (URL) and verify that key functions (adding/editing outlines, manipulating the hierarchical structure, etc.) are working correctly and that there are no errors in the developer tools console.
- Check the latest commit history, issues, or "TODO" comments in the code within the repository to find hints for tasks to address now.

## 2. Developing an Improvement Plan (Plan)
- Select only one improvement point per run from the following perspectives (to keep the scope small):
- Bug fixes (resolving console errors and unexpected behavior)
- UI/UX fine-tuning (improving user feedback, responsive design, accessibility)
- Code health improvement (improving test coverage, refactoring, stricter type definitions)

## 3. Code Modification and Local Verification (Execute & Test)
- Modify the target code based on the selected improvements.
- After modification, verify that the build in your local environment and existing test scripts (e.g., npm run test) pass successfully. Add new test cases as needed.

## 4. Submission of Deliverables
- Instead of committing directly to the `main` (or `master`) branch, be sure to create a new branch with a name that clearly indicates the changes (e.g., `fix/console-error` or `refactor/outline-node`).
- Create a Pull Request (PR) reflecting the changes and include the following information in the description:
- [Issues] Problems discovered and areas for improvement
- [Changes] Specifically, which code was changed and how
- [Verification Results] Results of functionality checks and tests

# Constraints (Guardrails)
- Never make "major breaking changes" such as a complete architecture overhaul or major updates to major libraries in a single run.
- When touching core application logic (such as Yjs/Hocuspocus) related to collaborative editing or real-time synchronization, exercise extreme caution to avoid breaking existing behavior.
- This environment is a speculative execution (sandbox), so write your code to completion and run tests without fear of breaking changes or errors.
- Do not seek human confirmation or permission along the way. If you get stuck, try to overcome the problem by forming a hypothesis on your own, and only terminate after outputting the log up to that point if you absolutely cannot resolve the issue.
