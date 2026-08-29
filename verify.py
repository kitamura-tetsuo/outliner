import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = await context.new_page()

        print("Navigating to app...")
        await page.goto("http://localhost:7090/")

        print("Clicking Create New Outliner...")
        await page.get_by_role("button", name="+ Create New Outliner").click()

        print("Waiting for page load...")
        await page.wait_for_selector("text=Show sidebar")

        print("Opening sidebar...")
        await page.get_by_text("Show sidebar").click()

        print("Clicking Add new scheduled SQL...")
        await page.get_by_role("button", name="Add new scheduled SQL").click()

        print("Waiting for Scheduled SQL page...")
        await page.wait_for_url("**/schedules/**")

        # Wait for the SQL editor container (the Monaco editor parent)
        # We know its id or data-testid is schedule-sql-editor
        await page.wait_for_selector("[data-testid='schedule-sql-editor']")

        print("Scrolling down to SQL editor...")
        await page.evaluate("window.scrollBy(0, 800)")

        print("Taking screenshot...")
        await page.screenshot(path="/home/jules/verification/verification_2.png")

        await browser.close()

asyncio.run(main())
