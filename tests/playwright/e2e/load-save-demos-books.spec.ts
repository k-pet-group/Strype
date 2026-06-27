import {test, expect} from "@playwright/test";
import {save} from "../support/loading-saving";
import {readFileSync} from "node:fs";
import {skipPyodideLoading} from "../support/general";
import {createBrowserProxy} from "../support/proxy";
import {WINDOW_STRYPE_HTMLIDS_PROPNAME} from "@/helpers/sharedIdCssWithTests";
import {doPagePaste} from "../support/editor";

let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    testInfo.setTimeout(240_000);

    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    // Wait for content to load:
    await expect(page.locator(".frame-div")).toHaveCount(2);
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});

test.describe("Load/save book projects", () => {
    for (let i = 0; i <= 2; i++) {
        test(`Load and save fireworks after moving up ${i} times`, async ({page}) => {
            // There was a bug where fireworks would sometimes load weirdly, e.g.
            // the comment would be blank in the body, or the imports or defs would end up
            // in the main code section.  It was caused by having the frame cursor in the
            // imports or defs
            const original = readFileSync("public/book_projects/chapter02/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
            for (let j = 0; j < i; j++) {
                await page.keyboard.press("ArrowUp");
            }
            await page.click("#" + await strypeElIds.getEditorMenuUID());
            await page.waitForTimeout(1000);
            await page.locator("." + scssVars.strypeMenuItemClassName, {hasText: "Book..."}).click();
            await page.waitForTimeout(1000);
            await page.locator(".open-book-dlg-book-group-item", {hasText: "Chapter 2"}).click();
            await page.waitForTimeout(500);
            await page.locator(".open-book-dlg-name", {hasText: "fireworks"}).click({clickCount: 2});
            await page.waitForTimeout(3000);
            const output = readFileSync(await save(page, true), "utf8").replace(/\r\n/g, "\n");
            expect(output).toEqual(original);
        });

        test(`Paste fireworks after moving up ${i} times`, async ({page}) => {
            // Check same as above but with pasting:
            const original = readFileSync("public/book_projects/chapter02/fireworks.spy", "utf8").replace(/\r\n/g, "\n");
            await page.keyboard.press("Delete");
            await page.keyboard.press("Delete");
            for (let j = 0; j < i; j++) {
                await page.keyboard.press("ArrowUp");
            }
            await doPagePaste(page, original);
            await page.waitForTimeout(3000);
            const output = readFileSync(await save(page, true), "utf8").replace(/\r\n/g, "\n");
            expect(output).toEqual(original);
        });
    }
});
