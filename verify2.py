import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={'width': 1920, 'height': 2000})
        page = await context.new_page()

        print("Navigating to app...")
        await page.goto("http://localhost:7090/")

        print("Wait for page load...")
        try:
            await page.wait_for_selector("text=+ Create New Outliner", timeout=5000)
            await page.get_by_role("button", name="+ Create New Outliner").click()
        except Exception:
            pass

        print("Waiting for page load...")
        await page.wait_for_selector("text=Show sidebar")

        print("Opening sidebar...")
        await page.get_by_text("Show sidebar").click()

        print("Clicking Add new scheduled SQL...")
        await page.get_by_role("button", name="Add new scheduled SQL").click()

        print("Waiting for Scheduled SQL page...")
        await page.wait_for_url("**/schedules/**")

        print("Waiting for data-testid...")
        await page.wait_for_selector("[data-testid='schedule-sql-editor']")

        print("Taking screenshot...")
        await page.screenshot(path="/home/jules/verification/verification_2.png", full_page=True)

        await browser.close()

asyncio.run(main())
