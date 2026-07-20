import {test, expect, Page} from "@playwright/test";
import {enterCode} from "../support/editor";
import {setupStrypeTest} from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// Mirrors Cypress's assertVisibleError() in paste-python.cy.ts: the message banner and its close
// button are exposed via the same CSS classes on window.StrypeSCSSVarsGlobals.
async function assertMessageBanner(page: Page, expectedText: RegExp | null) : Promise<void> {
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    const banner = page.locator("." + scssVars.messageBannerContainerClassName);
    if (expectedText != null) {
        await expect(banner.locator("span").first()).toHaveText(expectedText);
        await banner.locator("." + scssVars.messageBannerCrossClassName).click();
    }
    // Whether it never existed, or we just closed it, it should now not exist:
    await expect(banner).toHaveCount(0);
}

// Regression test for https://github.com/k-pet-group/Strype/issues/757 : a blank line immediately
// before elif/else/except/finally used to be dedented to that keyword's own (shallower) indent,
// which split the compound statement in two and made the whole paste fail to parse.
test.describe("Pasting handles a blank line before a joint continuation", () => {
    test("Allows a blank line before elif", async ({page}) => {
        await enterCode(page, ["", "", "if True:\n    a()\n\nelif True:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("elif");
    });

    test("Allows a blank line before else", async ({page}) => {
        await enterCode(page, ["", "", "if True:\n    a()\n\nelse:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("else");
    });

    test("Allows a blank line before except", async ({page}) => {
        await enterCode(page, ["", "", "try:\n    a()\n\nexcept:\n    b()\n"]);
        await assertMessageBanner(page, null);
        await expect(page.locator("#frameContainer_-3")).toContainText("except");
    });
});
