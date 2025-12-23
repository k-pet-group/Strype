import {expect, Page, test} from "@playwright/test";
import {addFakeClipboard} from "../support/clipboard";
import fs from "fs";
import {doPagePaste} from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    // With regards to Chromium: several of these tests fail on Chromium in Playwright on Mac and
    // I can't figure out why.  I've tried them manually in Chrome and Chromium on the same
    // machine and it works fine, but I see in the video that the test fails in Playwright
    // (pressing right out of a comment frame puts the cursor at the beginning and makes a frame cursor).
    // Since it works in the real browsers, and on Webkit and Firefox, we just skip the tests in Chromium
    test.skip(testInfo.project.name == "chromium", "Cannot run in Chromium");

    addFakeClipboard(page);

    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    //scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

async function getFocusedId(page: Page) : Promise<string | null> {
    return await page.evaluate(() => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) {
            return null;
        }

        let node = sel.anchorNode;

        // If it's a text node, climb to its element parent
        if (node && node.nodeType === Node.TEXT_NODE) {
            node = node.parentElement;
        }

        // Ensure it’s inside a contenteditable
        if (!(node instanceof HTMLElement)) {
            return null;
        }
        if (!node.closest("[contenteditable=\"true\"],[contenteditable=\"plaintext-only\"]")) {
            return null;
        }

        // Escape commas ready for use in selector:
        return node.id ? node.id.replaceAll(",", "\\,") : null;
    });
}

async function checkErrorAfterExitingSlot(page: Page, keypresses : string[] = ["ArrowRight"]) : Promise<void> {
    const slotId = await getFocusedId(page);
    // Shouldn't have error until we leave:
    await expect(page.locator(`#${slotId}`)).not.toContainClass("error-slot");
    for (const key of keypresses) {
        await page.keyboard.press(key);
        await page.waitForTimeout(200);
    }
    await page.waitForTimeout(300);
    // Now should show an error:
    await expect(page.locator(`#${slotId}`)).toContainClass("error-slot");
}


test.describe("Check slots have errors", () => {
    test("Missing first operand", async ({page}) => {
        // Assignment, x = <err> / 1
        // The error is reported in the final slot
        await page.keyboard.type("=x=/1");
        await checkErrorAfterExitingSlot(page);
    });
    test("Missing second operand", async ({page}) => {
        // Assignment, x = 1 * <err>
        await page.keyboard.type("=x=1*");
        await checkErrorAfterExitingSlot(page);
    });
    test("Empty subscript", async ({page}) => {
        // Assignment, x = 1 * <err>
        await page.keyboard.type("=x=a[");
        await checkErrorAfterExitingSlot(page, ["ArrowRight", "ArrowRight"]);
    });
    test("Empty subscript (exit with arrow down)", async ({page}) => {
        // Assignment, x = 1 * <err>
        await page.keyboard.type("=x=a[");
        await checkErrorAfterExitingSlot(page, ["ArrowDown"]);
    });
    test("Invalid number", async ({page}) => {
        // Assignment, x = 1 * <err>
        await page.keyboard.type("=x=1a");
        await checkErrorAfterExitingSlot(page);
    });
    test("List of image and invalid number", async ({page}) => {
        await page.keyboard.type("=x=[");
        const image = fs.readFileSync("public/graphics_images/cat-test.jpg").toString("base64");
        await doPagePaste(page, image, "image/jpeg");
        await page.keyboard.type(",1a");
        await checkErrorAfterExitingSlot(page, ["ArrowRight", "ArrowRight"]);
    });
    test("No error on function descriptions", async ({page}) => {
        // As per bug #713 on Github, there was an issue where errors in the function header
        // could show errors on function description slots, so we check that doesn't happen:
        // Class with method, with header content "a, *"
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(200);
        await page.keyboard.type("cFoo");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowRight");
        console.log("Going to class frame cursor");
        await page.waitForTimeout(200);
        console.log("Entering new function");
        await page.keyboard.type("dfoo(a,*");
        const paramId = await getFocusedId(page);
        // Move into the function description slot
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        const descriptionId = await getFocusedId(page);
        // Sanity check:
        expect(descriptionId).not.toEqual(paramId);
        // Shouldn't have error before leaving::
        await expect(page.locator(`#${paramId}`)).not.toContainClass("error-slot");
        await expect(page.locator(`#${descriptionId}`)).not.toContainClass("error-slot");
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(500);
        // Now should show an error in params but not description:
        await expect(page.locator(`#${paramId}`)).toContainClass("error-slot");
        await expect(page.locator(`#${descriptionId}`)).not.toContainClass("error-slot");
    });
});
