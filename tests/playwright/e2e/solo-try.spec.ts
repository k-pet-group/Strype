import {test, expect} from "@playwright/test";
import {enterCode, doPagePaste, waitForEditorSettled} from "../support/editor";
import {addFakeClipboard} from "../support/clipboard";
import {checkConsoleContent, runButtonShowsRun, startRunning} from "../support/execution";
import {setupStrypeTest} from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await addFakeClipboard(page);
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000});
});

// A try with no except/finally isn't valid Python, so Strype saves/copies it with a dummy except.
const SOLO_TRY_SPY_CODE = "try :\n    myString  = \"Hello\" \n    print(myString + 2) \nexcept ___strype_dummy:\n    pass\n";

test.describe("Try frame without except or finally", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/998
    test("Can be copied and pasted back", async ({page}) => {
        await enterCode(page, ["", "", SOLO_TRY_SPY_CODE]);
        const frameCountBefore = await page.locator(".frame-div").count();
        await page.keyboard.press("Shift+ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("ControlOrMeta+c");
        await waitForEditorSettled(page);
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toBe(SOLO_TRY_SPY_CODE);

        await page.keyboard.press("ArrowDown");
        await doPagePaste(page, clipboard);
        await waitForEditorSettled(page);
        // The second copy should have the same number of frames again, and no error banner:
        await expect(page.locator(".frame-div")).toHaveCount(frameCountBefore * 2);
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page.locator("." + scssVars.messageBannerContainerClassName)).toHaveCount(0);
    });

    // Regression test for https://github.com/k-pet-group/Strype/issues/999
    test("Is not run, and is flagged as an error instead", async ({page}) => {
        await enterCode(page, ["", "", SOLO_TRY_SPY_CODE]);
        await startRunning(page);
        // The try frame itself is the only thing flagged as an error:
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page.locator(".frame-div." + scssVars.errorClassName + ", .frame-header." + scssVars.errorClassName)).toHaveCount(1);
        // And it didn't run, so we're back to being able to run:
        await runButtonShowsRun(page.locator("#runButton"));
        // Nothing was run, so nothing (e.g. a NameError for the dummy) should be in the console:
        await checkConsoleContent(page, "");
    });
});
