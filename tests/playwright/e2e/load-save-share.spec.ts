import { Page, test, expect } from "@playwright/test";
import { load, save } from "../support/loading-saving";
import { createBrowserProxy } from "../support/proxy";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME } from "@/helpers/sharedIdCssWithTests";
import { readFileSync } from "node:fs";
import { setupStrypeTest } from "../support/general";

//let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => Promise<string>};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 90000, skipPyodide: true, fakeClipboard: true});
    strypeElIds = createBrowserProxy(page, WINDOW_STRYPE_HTMLIDS_PROPNAME);
});


async function testLongRoundTripLoadShareNewLoadSave(page: Page, filepath: string) {
    // First load the file into the editor:
    await load(page, filepath);
    // Then copy the link:
    await page.locator("#" + await strypeElIds.getEditorMenuUID()).click();
    await page.locator("#" + await strypeElIds.getShareProjectLinkId()).click();
    await page.locator("#shareMethodSnapshotButton").click();
    // The clipboard write (Menu.vue's copySnapshotLink) is fire-and-forget with no DOM signal
    // tied to its completion, so poll the clipboard itself until the link lands rather than
    // guessing how long the write takes:
    await expect.poll(() => page.evaluate("navigator.clipboard.readText()")).not.toBe("<empty>");
    // Now should be on the clipboard:
    const shareLink : string = await page.evaluate("navigator.clipboard.readText()");
    // Now we make a new project:
    await page.locator("#" + await strypeElIds.getEditorMenuUID()).click();
    await page.locator("#" + await strypeElIds.getNewProjectLinkId()).click();
    // "New project" triggers a full page reload (App.vue's onHideModalDlg navigates to
    // "?new_project"), so wait for that reload to complete before touching the freshly
    // mounted editor:
    await page.waitForURL(/\?new_project/);
    await page.waitForSelector("body");
    // Should be no need to tell it we want to discard changes, because unchanged since load

    // Quick sanity check that it is a new project; should only be two frames. Give this a
    // generous timeout since the reload above can take a while to finish mounting:
    await expect(page.locator(".frame-header")).toHaveCount(2, { timeout: 20000 });

    console.log("Visiting share link: " + shareLink.slice(0, 75));
    
    // Now we visit the link:
    await page.goto(shareLink);
    // Need to do some initialisation again after changing page:
    await page.waitForSelector("body");
    //scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });

    // And check that when we save it, we get original content:
    const output = readFileSync(await save(page), "utf8").replace(/\r\n/g, "\n");
    expect(output).toEqual(readFileSync(filepath, "utf8").replace(/\r\n/g, "\n"));
}


// Actually fully round trip by loading the file, sharing, then loading the sharing link then saving:
test.describe("Fully round-trip the sharing", () => {
    const filesToCheck = [
        "tests/cypress/fixtures/project-basic.spy",
        "tests/cypress/fixtures/project-except-as.spy",
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
