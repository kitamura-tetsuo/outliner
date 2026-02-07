import time
from playwright.sync_api import sync_playwright

def verify_vote():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            # Navigate to home
            print("Navigating to home...")
            page.goto("http://localhost:5174/")

            # Check if logged in
            try:
                page.wait_for_selector(".login-status-indicator", timeout=3000)
                status = page.locator(".login-status-indicator").text_content()
                if "Signed in" in status:
                    print("Already logged in.")
                else:
                    raise Exception("Not logged in")
            except:
                print("Attempting login...")
                page.wait_for_selector(".auth-container")
                dev_toggle = page.get_by_text("Developer Login")
                if dev_toggle.is_visible():
                    dev_toggle.click()
                page.fill("input[type=email]", "test@example.com")
                page.fill("input[type=password]", "password")
                page.click("button:has-text('Login to Dev Environment')")
                page.wait_for_selector(".login-status-indicator:has-text('Signed in')", timeout=10000)
                print("Logged in.")

            # Go to projects/new
            print("Going to create project...")
            if not page.url.endswith("/projects/new"):
                page.goto("http://localhost:5174/projects/new")

            print("Creating project...")
            page.wait_for_selector("#containerName")
            page.fill("#containerName", "VerifyVoteProject")

            # Click "Create" button
            # Be specific to avoid clicking other buttons if any
            page.click("button:has-text('Create')")

            # Wait for success message or navigation
            print("Waiting for creation...")
            # It waits 1.5s then navigates.
            # Wait for URL change to /VerifyVoteProject
            page.wait_for_url("**/VerifyVoteProject", timeout=15000)
            print(f"Project created. URL: {page.url}")

            # Now checking for pages or add item
            print("Checking for pages/items...")

            # Wait for either page list (to create page) or outliner (if seeded)
            try:
                # PageList has "New page name" input
                page.wait_for_selector("input[placeholder='New page name']", timeout=5000)
                print("Creating page...")
                page.fill("input[placeholder='New page name']", "VotePage")
                # Click "Create" button in PageList
                # It might be tricky if there are multiple "Create" buttons (like in header?)
                # PageList button is next to input
                page.click(".mb-4 button:has-text('Create')")

                page.wait_for_url("**/VotePage", timeout=10000)
                print("Page created.")
            except:
                print("Not on page list, maybe already on page or different UI.")

            # Now adding item
            print("Adding item...")
            try:
                # OutlinerTree.svelte toolbar "Add Item"
                add_btn = page.get_by_role("button", name="Add Item")
                if add_btn.is_visible():
                    add_btn.click()
                else:
                    # Empty state "Add first item"
                    page.click("text=Add first item")
            except:
                print("Could not click add item, checking if items exist...")

            page.wait_for_selector(".outliner-item")
            print("Item visible.")

            # Find an item (second one, as first is page title which has no actions)
            # Check count
            count = page.locator(".outliner-item").count()
            print(f"Item count: {count}")
            if count > 1:
                item = page.locator(".outliner-item").nth(1)
            else:
                # Try adding another item just in case
                print("Only 1 item found, adding another...")
                page.click("text=Add Item")
                page.wait_for_function("document.querySelectorAll('.outliner-item').length > 1")
                item = page.locator(".outliner-item").nth(1)

            # Hover over item to make actions visible (if opacity affects interaction, though get_attribute shouldn't care)
            item.hover()

            # Find vote button
            vote_btn = item.locator(".vote-btn")

            # Check initial state
            initial_label = vote_btn.get_attribute("aria-label")
            initial_title = vote_btn.get_attribute("title")
            print(f"Initial vote button aria-label: {initial_label}")
            print(f"Initial vote button title: {initial_title}")

            # Click vote
            print("Clicking vote button...")
            vote_btn.click()

            # Wait a bit for update
            time.sleep(1)

            # Check updated state
            updated_label = vote_btn.get_attribute("aria-label")
            updated_title = vote_btn.get_attribute("title")
            print(f"Updated vote button aria-label: {updated_label}")
            print(f"Updated vote button title: {updated_title}")

            # Check vote count
            vote_count = item.locator(".vote-count")
            if vote_count.is_visible():
                count_label = vote_count.get_attribute("aria-label")
                count_title = vote_count.get_attribute("title")
                print(f"Vote count aria-label: {count_label}")
                print(f"Vote count title: {count_title}")

                # Hover
                vote_count.hover()
            else:
                print("Vote count not visible")

            page.screenshot(path="verification.png")
            print("Screenshot saved to verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    verify_vote()
