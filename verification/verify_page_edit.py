from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            print("Navigating to page...")
            page.goto("http://localhost:7090/TestProject/TestPage")

            # Wait for page to load
            print("Waiting for page load...")
            page.wait_for_load_state("networkidle")

            # Add an item (assuming there is a way to add item, e.g. typing in the last empty line or clicking a button)
            # The UI has "Add Item" button in the toolbar
            print("Clicking Add Item button...")
            page.get_by_role("button", name="Add Item").click()

            # Type something
            print("Typing into the new item...")
            # Assuming the new item is focused or we can find it
            # We can try to type immediately
            page.keyboard.type("Hello World")
            page.keyboard.press("Enter")

            # Wait a bit for update
            time.sleep(1)

            # Take screenshot
            print("Taking screenshot...")
            page.screenshot(path="verification/page_edit.png")

            # Verify text exists
            content = page.content()
            if "Hello World" in content:
                print("SUCCESS: 'Hello World' found in page content.")
            else:
                print("FAILURE: 'Hello World' NOT found in page content.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
