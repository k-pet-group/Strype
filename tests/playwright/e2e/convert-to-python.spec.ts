import {test, expect, Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {enterCode} from "../support/editor";
import {runToFinish} from "../support/execution";
import {setupStrypeTest} from "../support/general";
import {strypeElIds} from "../support/proxy";
import en from "../../../src/localisation/en/en_main.json";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 180000});
});

async function clickConvertToPython(page: Page) : Promise<void> {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.getByText(en.appMenu.downloadPython).click();
}

test.describe("Convert to Python file", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/458
    test("Is not prevented by a runtime error from the last run", async ({page}) => {
        await enterCode(page, ["", "", "print('Before')\nprint(1 / 0)\n"]);
        await runToFinish(page);
        // Check that the runtime error was shown on the frame (it's flagged with the runtime error class):
        const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
        await expect(page.locator("." + scssVars.runtimeErrorClassName)).toHaveCount(1);

        const [download] = await Promise.all([
            page.waitForEvent("download"),
            clickConvertToPython(page),
        ]);
        expect(readFileSync(await download.path(), "utf-8")).toContain("print(1 / 0)");
    });

    test("Is still prevented by a real error in the code", async ({page}) => {
        // A try with no except or finally isn't valid Python:
        await enterCode(page, ["", "", "try :\n    print(1)\nexcept ___strype_dummy:\n    pass\n"]);
        let downloaded = false;
        page.on("download", () => downloaded = true);
        await clickConvertToPython(page);
        await expect(page.getByText(en.appMessage.preCompiledErrorNeedFix).and(page.locator(":visible"))).toBeVisible();
        expect(downloaded).toBe(false);
    });
});
