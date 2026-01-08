import {Page, test, expect} from "@playwright/test";
import {doPagePaste} from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(90000); // 90 seconds
    
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

async function enterCode(page: Page, codeSections : string[]) : Promise<void> {
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(500);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    for (const codeSection of codeSections) {
        await doPagePaste(page, codeSection);
        await page.waitForTimeout(1000);
        await page.keyboard.press("ArrowDown");
    }
}

async function checkConsoleContent(page: Page, expectedContent : string) {
    const actual = await page.locator("#peaConsole").inputValue();
    expect(actual).toEqual(expectedContent);
}

async function startRunning(page: Page) {
    // It should not be running:
    const button = page.locator("#runButton");
    await expect(button).toHaveText("Run");
    // Click it:
    await page.click("#runButton");
    return button;
}

async function runToFinish(page: Page) {
    const button = await startRunning(page);
    // Then it should not be running again, because it has finished:
    await expect(button).toHaveText("Run");
}

test.describe("Check console after execution", () => {
    test("Check default code works", async ({page}) => {
        await page.click("#runButton");
        await runToFinish(page);
        await checkConsoleContent(page, "Hello from Strype\n");
    });

    test("Check two prints work", async ({page}) => {
        await enterCode(page, ["", "", "print('Hello')\nprint('World')\n"]);
        await page.click("#runButton");
        await runToFinish(page);
        await checkConsoleContent(page, "Hello\nWorld\n");
    });

    test("Check format string works", async ({page}) => {
        await enterCode(page, ["", "", "x=1\ny=2\nprint(f'X is {x}')\nprint(f'Y is {y}')\nprint(f\"Total is {x+y}\")"]);
        await page.click("#runButton");
        await runToFinish(page);
        await checkConsoleContent(page, "X is 1\nY is 2\nTotal is 3\n");
    });

    test("Check raw string works", async ({page}) => {
        // In raw strings with r prefix, newlines should not be recognised as escapes:
        await enterCode(page, ["", "", "print('Line 1\\nLine 2')\nprint(r\"Line 3.0\\nLine 3.1\")"]);
        await page.click("#runButton");
        await runToFinish(page);
        await checkConsoleContent(page, "Line 1\nLine 2\nLine 3.0\\nLine 3.1\n");
    });
});

test.describe("Test stdin works", () => {
    test("Check input/output works", async ({page}) => {
        await enterCode(page, ["", "", "name = input('What is your name?\\n')\nprint('Hello ' + name)\n"]);
        const button = await startRunning(page);
        await expect(page.locator("#peaConsole")).toBeEnabled();
        await expect(page.locator("#peaConsole")).toBeFocused();
        await page.locator("#peaConsole").pressSequentially("George\n", {delay: 75});
        // Then it should not be running again, because it has finished:
        await expect(button).toHaveText("Run");
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\n");
    });

    test("Check multiple input works", async ({page}) => {
        await enterCode(page, ["", "", "name = input('What is your name?\\n')\nprint('Hello ' + name)\nspecies = input('What is your species?\\n')\nprint('Hello ' + name + ' the ' + species)\n"]);
        const button = await startRunning(page);
        await expect(page.locator("#peaConsole")).toBeEnabled();
        await expect(page.locator("#peaConsole")).toBeFocused();
        await page.locator("#peaConsole").pressSequentially("George\n", {delay: 75});
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\nWhat is your species?\n");
        // Should still be running:
        await expect(button).toContainText("Stop");
        await page.locator("#peaConsole").pressSequentially("cat\n", {delay: 75});
        await checkConsoleContent(page, "What is your name?\nGeorge\nHello George\nWhat is your species?\ncat\nHello George the cat\n");
        // Then it should not be running again, because it has finished:
        await expect(button).toHaveText("Run");
    });
});
