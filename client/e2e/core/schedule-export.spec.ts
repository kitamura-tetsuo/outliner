import { expect, test } from "@playwright/test";

test("downloads schedules as iCal", async ({ page }) => {
    // Navigate to the schedule page
    await page.goto("/schedule?pageId=test-page-id");

    // Click the download link
    const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.click('a[download="schedules.ics"]'),
    ]);

    // Verify the downloaded file
    const stream = await download.createReadStream();
    const content = await new Promise((resolve, reject) => {
        let data = "";
        stream.on("data", (chunk) => (data += chunk));
        stream.on("end", () => resolve(data));
        stream.on("error", reject);
    });

    expect(content).toContain("BEGIN:VCALENDAR");
    expect(content).toContain("END:VCALENDAR");
});
