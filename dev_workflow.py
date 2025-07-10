#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime

import yaml

# --- Configuration ---
ASSIGNEE = "@me"
LOG_FILE = "gemini_interactions.log"
MAX_GEMINI_RETRIES = 5
INITIAL_RETRY_DELAY = 10  # in seconds
# --- End Configuration ---


# --- YAML Formatting ---
def literal_str_presenter(dumper, data):
    """Custom YAML presenter to use literal block style for multi-line strings."""
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


yaml.add_representer(str, literal_str_presenter)
# --- End YAML Formatting ---


def log_gemini_interaction(purpose, prompt, response, is_error=False):
    """Appends a structured log of a Gemini interaction to the log file."""
    log_entry = {
        "timestamp": datetime.now(datetime.UTC).isoformat(),
        "purpose": purpose,
        "is_error": is_error,
        "prompt": prompt.strip(),
        "response": response.strip() if response else "(empty response)",
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write("---\n")
        yaml.dump(log_entry, f, allow_unicode=True, sort_keys=False)
    print(f"📝 Logged Gemini interaction for '{purpose}' to {LOG_FILE}")


def run_command(command, check=True, text=True, capture_output=True):
    """A helper function to run shell commands with retries for Gemini."""
    command_str = " ".join(command) if isinstance(command, list) else command
    print(f"🏃 Running command: {command_str}")

    if isinstance(command, list) and command[0] == "gemini":
        retries = MAX_GEMINI_RETRIES
        delay = INITIAL_RETRY_DELAY
        for i in range(retries):
            try:
                result = subprocess.run(
                    command,
                    check=True,
                    text=text,
                    capture_output=capture_output,
                    encoding="utf-8",
                    shell=isinstance(command, str),
                )
                if result.stdout:
                    print("✅ STDOUT:\n" + result.stdout)
                if result.stderr:
                    print("ℹ️ STDERR:\n" + result.stderr)
                return result
            except subprocess.CalledProcessError as e:
                print(f"❌ Command failed with exit code {e.returncode}")
                if e.stdout:
                    print("STDOUT:\n" + e.stdout)
                if e.stderr:
                    print("STDERR:\n" + e.stderr)

                if "429" in str(e.stderr) or "429" in str(e.stdout):
                    if i < retries - 1:
                        print(
                            f"💤 Rate limit error detected. Retrying in {delay} seconds..."
                        )
                        time.sleep(delay)
                        delay *= 2
                    else:
                        print(
                            "❌ Max retries reached for rate-limited command. Aborting."
                        )
                        sys.exit(1)
                else:
                    print("❌ Non-retriable error in gemini command. Aborting.")
                    sys.exit(1)
            except FileNotFoundError:
                cmd_name = command[0]
                print(
                    f"❌ Error: Command '{cmd_name}' not found. Is it installed and in your PATH?"
                )
                sys.exit(1)
    else:
        try:
            result = subprocess.run(
                command,
                check=check,
                text=text,
                capture_output=capture_output,
                encoding="utf-8",
                shell=isinstance(command, str),
            )
            if result.stdout:
                print("✅ STDOUT:\n" + result.stdout)
            if result.stderr:
                print("⚠️ STDERR:\n" + result.stderr)
            return result
        except FileNotFoundError:
            cmd_name = command[0] if isinstance(command, list) else command.split()[0]
            print(
                f"❌ Error: Command '{cmd_name}' not found. Is it installed and in your PATH?"
            )
            sys.exit(1)
        except subprocess.CalledProcessError as e:
            print(f"❌ Command failed with exit code {e.returncode}")
            if e.stdout:
                print("STDOUT:\n" + e.stdout)
            if e.stderr:
                print("STDERR:\n" + e.stderr)
            if check:
                sys.exit(1)
            return e


def check_dependencies():
    """Check if required command-line tools are installed."""
    print("🔎 Checking for dependencies (gh, git, gemini)...")
    run_command(["gh", "--version"])
    run_command(["git", "--version"])
    run_command(["gemini", "--version"])
    run_command(["gh", "auth", "status"])
    print("✅ All dependencies are installed and configured.")


def get_oldest_unassigned_issue():
    """Fetches the oldest unassigned issue from GitHub."""
    print("🔎 Fetching unassigned issues from GitHub...")
    result = run_command(
        [
            "gh",
            "issue",
            "list",
            "--state",
            "open",
            "--limit",
            "100",
            "--json",
            "number,title,body,assignees",
        ]
    )
    try:
        issues = json.loads(result.stdout)
    except json.JSONDecodeError:
        print("❌ Could not parse gh issue list output.")
        return None
    unassigned_issues = [i for i in issues if not i.get("assignees")]
    return unassigned_issues[-1] if unassigned_issues else None


def check_if_implemented_with_gemini(issue):
    """
    Uses Gemini to check if an issue is implemented and returns a tuple.
    (is_implemented: bool, explanation: str)
    """
    purpose = "check_implementation"
    print(
        f"🤖 Asking Gemini to check if issue #{issue['number']} is already implemented..."
    )
    prompt = f"""
    Please act as a senior software engineer.
    Analyze the codebase to determine if the functionality in the issue below is implemented.

    Issue Number: {issue['number']}
    Issue Title: {issue['title']}
    Issue Body:
    ---
    {issue.get('body', 'No description provided.')}
    ---

    Review the code for relevant keywords, components, services, and tests.

    Respond in one of two formats ONLY:

    1. If NOT implemented, respond with the single phrase:
    not implemented

    2. If IS implemented, respond with "implemented" on the first line, then explain where and how.
    Example:
    implemented
    This is handled by `UserProfileService` in `src/services/user.js`.
    """
    result = run_command(["gemini", "--force-model", "-p", prompt])
    raw_response = result.stdout.strip()
    actual_response_lines = [
        line for line in raw_response.splitlines() if not line.startswith("GrepLogic:")
    ]
    actual_response = "\n".join(actual_response_lines).strip()
    response_lower = actual_response.lower()

    print(f"🤖 Gemini's (cleaned) response:\n{actual_response}")

    if response_lower.startswith("not implemented"):
        log_gemini_interaction(purpose, prompt, raw_response)
        return (False, "")
    elif response_lower.startswith("implemented"):
        explanation = (
            "\n".join(actual_response.splitlines()[1:]).strip()
            or "No explanation provided."
        )
        log_gemini_interaction(purpose, prompt, raw_response)
        return (True, explanation)
    else:
        print("❌ Gemini returned an unexpected response. Aborting.")
        log_gemini_interaction(purpose, prompt, raw_response, is_error=True)
        sys.exit(1)


def slugify(text):
    """Create a slug from a string."""
    text = text.lower()
    text = re.sub(r"\s+", "-", text)
    text = re.sub(r"[^a-z0-9-]", "", text)
    return text[:50]


def main():
    """Main workflow script."""
    check_dependencies()
    print("🚀 Starting development workflow...")
    run_command(["./scripts/codex-setup.sh"])

    while True:
        issue = get_oldest_unassigned_issue()
        if not issue:
            print("\n🎉 No more unassigned issues found. Checking for failing PRs...")
            handle_failing_prs()
            print("\n✅ All tasks complete.")
            break

        print("\n" + "=" * 80)
        print(f"📌 Now working on Issue #{issue['number']}: {issue['title']}")
        print("=" * 80)

        is_implemented, explanation = check_if_implemented_with_gemini(issue)
        if is_implemented:
            print(f"✅ Issue #{issue['number']} appears to be already implemented.")
            close_comment = (
                "Closing as this functionality appears to be already implemented.\n\n"
                "**Gemini's explanation:**\n"
                f"{explanation}"
            )
            run_command(
                [
                    "gh",
                    "issue",
                    "close",
                    str(issue["number"]),
                    "--comment",
                    close_comment,
                ]
            )
            print(f"✅ Closed issue #{issue['number']}. Moving to the next one.")
            continue

        print(f"👍 Issue #{issue['number']} is not implemented. Let's get to work.")

        run_command(
            ["gh", "issue", "edit", str(issue["number"]), "--add-assignee", ASSIGNEE]
        )
        run_command(
            [
                "gh",
                "issue",
                "comment",
                str(issue["number"]),
                "--body",
                "I am starting work on this issue now.",
            ]
        )
        print(f"✅ Assigned issue #{issue['number']} to {ASSIGNEE}.")

        branch_name = f"feature/{issue['number']}-{slugify(issue['title'])}"
        # Check if branch exists locally, and check it out if it does.
        result = run_command(["git", "branch", "--list", branch_name], check=False)
        if result.stdout and result.stdout.strip():
            print(f"🌿 Branch '{branch_name}' already exists. Checking it out.")
            run_command(["git", "checkout", branch_name])
        else:
            print(f"🌿 Creating new branch: {branch_name}")
            run_command(["git", "checkout", "-b", branch_name])

        print("\n" + "-" * 80)
        print("🤖 Handing over implementation to Gemini...")
        purpose_impl = "implement_feature"
        implementation_prompt = f"""
        You are a senior software engineer. Implement the feature and tests for the GitHub issue below.

        Issue: #{issue['number']} - {issue['title']}
        Body: {issue.get('body', 'No description provided.')}
        Branch: {branch_name}

        Workflow:
        1. Implement the feature and required tests (unit, E2E).
        2. Commit your work in logical chunks (`feat: ...`, `test: ...`).
        3. In your response, mention the relative path to the main E2E test file you worked on (e.g., `client/e2e/core/my-feature.spec.ts`).
        4. If no E2E test is relevant, include the word "SKIP" in your response.
        """
        result = run_command(["gemini", "--force-model", "-p", implementation_prompt])
        gemini_response = result.stdout.strip()
        log_gemini_interaction(purpose_impl, implementation_prompt, gemini_response)

        test_file_match = re.search(
            r"((?:client/|e2e/)?\w\-\/.*\.spec\.ts)", gemini_response
        )
        test_file = ""
        if test_file_match:
            test_file = test_file_match.group(1)
            print(f"🤖 Found test file in response: {test_file}")
        elif "SKIP" in gemini_response.upper():
            test_file = "skip"
            print("🤖 Gemini indicated skipping tests.")

        if test_file.lower() != "skip":
            if not test_file or not os.path.exists(test_file):
                print(
                    f"⚠️ Could not find a valid test file path in Gemini's response (or file does not exist)."
                )
                print(f"   Full response was:\n{gemini_response}")
                # No manual input, just log and continue
                test_file = ""

            while test_file and os.path.exists(test_file):
                print(f"🧪 Running test file: {test_file}")
                test_command = f"cd client && npx playwright test {os.path.relpath(test_file, 'client')}"
                result = run_command(test_command, check=False)

                if result.returncode == 0:
                    print("✅ Tests passed successfully!")
                    break

                print("❌ Tests failed. Asking Gemini to fix the implementation.")
                purpose_fix = "fix_test"
                test_output = f"STDOUT:\n{result.stdout}\n\nSTDERR:\n{result.stderr}"
                fix_prompt = f"""
                The tests for feature '{issue['title']}' failed. Fix the code so the tests pass.

                Test File: {test_file}
                Test Output:
                ---
                {test_output}
                ---

                Workflow:
                1. Analyze the error and fix the code.
                2. Commit your changes (`fix: ...`).
                3. Respond with ONLY the word "DONE" once you have committed the fix.
                """
                fix_result = run_command(["gemini", "--force-model", "-p", fix_prompt])
                log_gemini_interaction(purpose_fix, fix_prompt, fix_result.stdout)
        else:
            print("⚠️ Gemini responded with 'SKIP'. Skipping test run.")

        print("\n" + "-" * 80)
        print("🤖 Asking Gemini to update documentation and generate a summary...")
        purpose_docs = "generate_docs_and_summary"
        combined_prompt = f"""
        You are a senior software engineer. Document the changes for the issue below and write a summary of the work.

        Issue: #{issue['number']}
        Branch: {branch_name}

        Workflow:
        1. Analyze changes: `git diff main...{branch_name}` and `git log main..{branch_name}`.
        2. Create Feature File (if needed) in `docs/client-features/` following conventions. If you create one, commit it (`docs: ...`).
        3. Write a brief summary of the work done.
        4. Respond with ONLY a single JSON object with two keys:
           - `documentation_status`: "updated" or "not_needed".
           - `summary`: The summary text.

        Example:
        ```json
        {{
          "documentation_status": "updated",
          "summary": "Implemented the core logic and added E2E tests."
        }}
        ```
        """
        result = run_command(["gemini", "--force-model", "-p", combined_prompt])
        summary = ""
        json_response_str = result.stdout.strip()
        try:
            json_match = re.search(r"```json\n(.+?)```", json_response_str, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = json_response_str

            response_data = json.loads(json_str)
            summary = response_data.get("summary", "")
            doc_status = response_data.get("documentation_status", "unknown")
            print(f"📄 Gemini's documentation status: {doc_status}")
            log_gemini_interaction(purpose_docs, combined_prompt, json_response_str)
        except (json.JSONDecodeError, AttributeError) as e:
            print(f"⚠️ Could not parse JSON response from Gemini: {e}")
            summary = json_response_str
            log_gemini_interaction(
                purpose_docs, combined_prompt, json_response_str, is_error=True
            )

        if summary:
            run_command(
                ["gh", "issue", "comment", str(issue["number"]), "--body", summary]
            )
            print("✅ Added summary to the issue.")
        else:
            print("⚠️ Gemini did not provide a summary. Skipping comment.")

        print("\n" + "-" * 80)
        print("🔎 Checking for new commits before creating PR...")
        main_branch = "main"
        result = run_command(
            ["git", "rev-list", "--count", f"{main_branch}..HEAD"], check=False
        )
        commit_count = 0
        if result.returncode == 0 and result.stdout and result.stdout.strip().isdigit():
            commit_count = int(result.stdout.strip())

        if commit_count == 0:
            print(
                f"🤷 No new commits found on branch {branch_name}. Skipping PR creation."
            )
            run_command(["git", "checkout", main_branch])
            run_command(["git", "branch", "-D", branch_name], check=False)
            print(f"🗑️ Deleted empty local branch {branch_name}.")
            continue

        print(f"✅ Found {commit_count} new commit(s).")
        print("🚀 Finalizing: Pushing branch and creating Pull Request...")
        run_command(
            ["git", "push", "--set-upstream", "origin", branch_name], check=False
        )

        # Check if a PR already exists for this branch
        existing_pr = run_command(
            ["gh", "pr", "list", "--head", branch_name, "--json", "number"], check=False
        )
        if (
            existing_pr.returncode == 0
            and existing_pr.stdout
            and json.loads(existing_pr.stdout)
        ):
            print(
                f"👍 A pull request for branch '{branch_name}' already exists. Skipping creation."
            )
        else:
            pr_title = f"feat: {issue['title']}"
            pr_body = (
                f"Closes #{issue['number']}\n\n{summary or 'No summary provided.'}"
            )
            run_command(
                [
                    "gh",
                    "pr",
                    "create",
                    "--title",
                    pr_title,
                    "--body",
                    pr_body,
                    "--assignee",
                    ASSIGNEE,
                    "--reviewer",
                    ASSIGNEE,
                ]
            )

        print(f"\n🎉 Successfully created a Pull Request for issue #{issue['number']}!")
        print("Moving on to the next issue...")
        run_command(["git", "checkout", "main"])


def get_oldest_failing_pr():
    """Fetches the oldest open PR with a failing CI check."""
    print("🔎 Fetching open PRs with failing checks...")
    result = run_command(
        [
            "gh",
            "pr",
            "list",
            "--state",
            "open",
            "--limit",
            "50",
            "--json",
            "number,title,headRefName,statusCheckRollup",
            "--search",
            "status:failure",
        ],
        check=False,
    )

    if result.returncode != 0 or not result.stdout:
        print("🤷 Could not fetch PRs or no failing PRs found.")
        return None

    try:
        prs = json.loads(result.stdout)
        # The API might return PRs that don't have a failing status, so we filter again.
        failing_prs = [
            p
            for p in prs
            if p.get("statusCheckRollup")
            and any(c.get("conclusion") == "FAILURE" for c in p["statusCheckRollup"])
        ]
        if not failing_prs:
            print("✅ No PRs with failing checks found.")
            return None
        # Sort by PR number to get the oldest
        return sorted(failing_prs, key=lambda p: p["number"])[0]
    except (json.JSONDecodeError, IndexError) as e:
        print(f"❌ Could not parse PR list output or no failing PRs found: {e}")
        return None


def run_tests_and_get_failures():
    """Runs all E2E tests and returns a list of failed test files."""
    print("🧪 Running all E2E tests to identify failures...")
    # The command needs to be run from the 'client' directory
    test_command = "cd client && npx playwright test"
    result = run_command(test_command, check=False)

    if result.returncode == 0:
        print("✅ All tests passed!")
        return None, None

    print("❌ Some tests failed. Analyzing report...")
    stdout = result.stdout
    failed_tests = re.findall(r"\s*\d+\) (.*\.spec\.ts)", stdout)

    return list(set(failed_tests)), stdout


def handle_failing_prs():
    """Main workflow to find and fix failing PRs."""
    while True:
        pr = get_oldest_failing_pr()
        if not pr:
            print("🎉 No more failing PRs to fix.")
            break

        print("\n" + "=" * 80)
        print(f"🛠️ Now working on PR #{pr['number']}: {pr['title']}")
        print("=" * 80)

        branch_name = pr["headRefName"]
        print(f"🌿 Checking out branch: {branch_name}")
        run_command(["git", "checkout", branch_name])
        run_command(
            ["git", "pull", "origin", branch_name]
        )  # Ensure we have the latest code

        max_retries = 5
        for i in range(max_retries):
            print(f"\n🔄 Attempt {i+1}/{max_retries} to fix tests...")
            failed_tests, test_output = run_tests_and_get_failures()

            if not failed_tests:
                print("✅ All tests passed for this PR!")
                break

            print(f"🔥 Found {len(failed_tests)} failing test file(s):")
            for test in failed_tests:
                print(f"  - {test}")

            purpose_fix_pr = "fix_failing_pr"
            fix_prompt = f"""
            You are a senior software engineer. The E2E tests in the PR '{pr['title']}' are failing.
            Your task is to analyze the test output, fix the underlying code and the tests, and commit the changes.

            Failing Test Files:
            {chr(10).join(failed_tests)}

            Full Test Output:
            ---
            {test_output}
            ---

            Workflow:
            1. Carefully analyze the error messages and the relevant code.
            2. Fix the implementation code and/or the test files.
            3. Commit your changes with a clear message (e.g., `fix: resolve failing tests for feature X`).
            4. Respond with ONLY the word "DONE" once you have committed the fix.
            """
            fix_result = run_command(["gemini", "--force-model", "-p", fix_prompt])
            log_gemini_interaction(purpose_fix_pr, fix_prompt, fix_result.stdout)

            if "DONE" not in fix_result.stdout.upper():
                print(
                    "⚠️ Gemini did not respond with 'DONE'. The fix might not be complete. Retrying..."
                )
        else:
            print(f"❌ Failed to fix the PR after {max_retries} attempts. Moving on.")
            run_command(["git", "checkout", "main"])
            continue  # Move to the next PR if any

        print("\n🚀 All tests passed. Pushing changes to remote...")
        run_command(["git", "push", "origin", branch_name])
        print(f"✅ Successfully fixed and updated PR #{pr['number']}!")
        run_command(["git", "checkout", "main"])


if __name__ == "__main__":
    main()
