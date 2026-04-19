import { Page, test, expect } from "@playwright/test";
import { load, save } from "../support/loading-saving";
import { createBrowserProxy } from "../support/proxy";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME } from "@/helpers/sharedIdCssWithTests";
import { readFileSync } from "node:fs";
import { addFakeClipboard } from "../support/clipboard";
import { skipPyodideLoading } from "../support/general";

//let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await addFakeClipboard(page);
    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(90000); // 90 seconds

    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    //scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});


async function testLongRoundTripLoadShareNewLoadSave(page: Page, filepath: string) {
    // First load the file into the editor:
    await load(page, filepath);
    // Then copy the link:
    await page.locator("#" + await strypeElIds.getEditorMenuUID()).click();
    await page.locator("#" + await strypeElIds.getShareProjectLinkId()).click();
    await page.locator("#shareMethodSnapshotButton").click();
    await page.waitForTimeout(1000);
    // Now should be on the clipboard:
    const shareLink : string = await page.evaluate("navigator.clipboard.readText()");
    // Now we make a new project:
    await page.locator("#" + await strypeElIds.getEditorMenuUID()).click();
    await page.locator("#" + await strypeElIds.getNewProjectLinkId()).click();
    await page.waitForTimeout(2000);
    // Should be no need to tell it we want to discard changes, because unchanged since load

    // Quick sanity check that it is a new project; should only be two frames:
    await expect(page.locator(".frame-header")).toHaveCount(2);

    console.log("Visiting share link: " + shareLink.slice(0, 75));
    
    // Now we visit the link:
    await page.goto(shareLink);
    // Need to do some initialisation again after changing page:
    await page.waitForSelector("body");
    //scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    await page.locator("*:visible", {hasText: /^Continue$/}).click();

    // And check that when we save it, we get original content:
    const output = readFileSync(await save(page), "utf8").replace(/\r\n/g, "\n");
    expect(output).toEqual(readFileSync(filepath, "utf8").replace(/\r\n/g, "\n"));
}


// Actually fully round trip by loading the file, sharing, then loading the sharing link then saving:
test.describe("Fully round-trip the sharing", () => {
    const filesToCheck = [
        "tests/cypress/fixtures/project-basic.spy",
        "tests/cypress/fixtures/project-libraries-disable.spy",
        "tests/cypress/fixtures/default-parameter-values.spy",
        "tests/cypress/fixtures/format-strings.spy",
        "tests/cypress/fixtures/grapheme-strings.spy",
        "tests/cypress/fixtures/oop-crab-no-images.spy",
        "tests/cypress/fixtures/project-complex-disable-collapse.spy",
    ];
    filesToCheck.forEach((file) => {
        test("Round trips file " + file, async ({page}) => {
            await testLongRoundTripLoadShareNewLoadSave(page, file);
        });
    });
});
