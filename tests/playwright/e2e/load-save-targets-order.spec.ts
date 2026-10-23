import { test, expect, Page } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { strypeElIds } from "../support/proxy";

// The load dialog's cloud targets: Google Drive is the primary cloud target by default, and the last cloud target used
// to load/save a project is promoted as primary target instead (swapping places with Google Drive), which is kept in
// the settings saved in the browser (see settingsStore.promotedCloudTarget). Actually loading/saving to a cloud target
// isn't possible here, so we check the layout restored from the saved settings.

const loadDlgSelector = "#load-strype-project-modal-dlg";

// Values of StrypeSyncTarget
const StrypeSyncTargetFS = 1, StrypeSyncTargetGH = 5;

async function seedPromotedCloudTarget(page: Page, promotedCloudTarget: number) {
    // Must be called before the page is loaded (i.e. before setupStrypeTest)
    await page.addInitScript((target) => {
        localStorage.setItem("StrypeSettingsState", JSON.stringify({promotedCloudTarget: target}));
    }, promotedCloudTarget);
}

async function openLoadDialogAndGetTargetsIds(page: Page): Promise<{primary: string[], secondary: string[]}> {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
    await expect(page.locator(`${loadDlgSelector} .project-target-button-container`)).toBeVisible();
    const getIds = (selector: string) => page.locator(`${loadDlgSelector} ${selector} > [id]`).evaluateAll((els) => els.map((el) => el.id));
    return {primary: await getIds(".project-target-button-container"), secondary: await getIds(".secondary-targets-container")};
}

test.describe("Load/save dialogs' targets order", () => {
    test("has Google Drive as primary cloud target by default", async ({page, browserName}, testInfo) => {
        await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
        expect(await openLoadDialogAndGetTargetsIds(page)).toEqual({
            primary: ["loadFromFSStrypeButton", "loadFromGDStrypeButton"],
            secondary: ["loadFromODStrypeButton", "loadFromGHStrypeButton", "loadFromGLStrypeButton"],
        });
    });

    test("swaps Google Drive with the promoted cloud target saved in the settings", async ({page, browserName}, testInfo) => {
        await seedPromotedCloudTarget(page, StrypeSyncTargetGH);
        await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
        expect(await openLoadDialogAndGetTargetsIds(page)).toEqual({
            primary: ["loadFromFSStrypeButton", "loadFromGHStrypeButton"],
            secondary: ["loadFromODStrypeButton", "loadFromGDStrypeButton", "loadFromGLStrypeButton"],
        });
    });

    test("ignores a saved promoted target that isn't a cloud target", async ({page, browserName}, testInfo) => {
        await seedPromotedCloudTarget(page, StrypeSyncTargetFS);
        await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
        expect(await openLoadDialogAndGetTargetsIds(page)).toEqual({
            primary: ["loadFromFSStrypeButton", "loadFromGDStrypeButton"],
            secondary: ["loadFromODStrypeButton", "loadFromGHStrypeButton", "loadFromGLStrypeButton"],
        });
    });
});
