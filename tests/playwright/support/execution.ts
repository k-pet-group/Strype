import { Page, expect, Locator } from "@playwright/test";

export async function startRunning(page: Page, extraTimeout?: boolean) : Promise<Locator> {
    // It should not be running:
    const button = page.locator("#runButton");
    // It can take a while for Pyodide to load up:
    await expect(button).toHaveText("Run", {timeout: (extraTimeout ? 120000: 60000)});
    // Click it:
    await page.click("#runButton");
    return button;
}

export async function runButtonShowsRun(button: Locator, extraTimeout?: boolean) : Promise<void> {
    // Firefox is incredibly slow to reinitialise on CI, so we have a huge timeout:
    await expect(button).toHaveText("Run", {timeout: (extraTimeout ? 120000 : 60000)});
}


export async function runToFinish(page: Page, extraTimeout?: boolean) : Promise<void> {
    const button = await startRunning(page);
    // Then it should not be running again, because it has finished:
    await runButtonShowsRun(button, extraTimeout);
}

export async function checkConsoleContent(page: Page, expectedContent : string | RegExp) : Promise<void> {
    const consoleLoc = page.locator("#peaConsole");
    await expect(consoleLoc).toHaveCount(1);
    await expect(consoleLoc).toHaveValue(expectedContent, {timeout: 3000});
}

export async function checkFrameErrorCount(page: Page, expectedCount: number) : Promise<void> {
    await expect(page.locator(".err-icon:visible")).toHaveCount(expectedCount);
}
