import { test, expect, Page } from "@playwright/test";
import { setupStrypeTest } from "../support/general";
import { strypeElIds } from "../support/proxy";
import { waitForEditorSettled } from "../support/editor";

// The frame keyboard shortcuts ("." to fold/unfold frames, and Ctrl/Cmd + C, X, D or / to copy, cut, duplicate or
// disable/enable the selected frames) must not apply while typing in a text field outside the frames, e.g. in a dialog:
// these keys must act on the text field instead (App.vue's keydown handler used to catch them because no frame was
// being edited).

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

// Opens the save dialog and returns its (focused) project name input
async function openSaveDialogNameInput(page: Page) {
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getSaveProjectLinkId());
    const nameInput = page.locator("#saveStrypeFileNameInput");
    // Menu.vue sets the input's default value and focuses it with a delay after the dialog is shown (see save() in
    // loading-saving.ts): we wait for that, so it doesn't override what we type
    await expect(nameInput).toBeFocused({timeout: 10000});
    return nameInput;
}

test("typing \".\" in a dialog's text field types it there", async ({page}) => {
    const nameInput = await openSaveDialogNameInput(page);
    await nameInput.press("ControlOrMeta+a");
    await page.keyboard.type("my.project.v2");
    await expect(nameInput).toHaveValue("my.project.v2");
});

test("Ctrl/Cmd + D or / in a dialog's text field don't act on the selected frames", async ({page}) => {
    // Select the frame below the frame cursor
    await page.keyboard.press("Shift+ArrowDown");
    await waitForEditorSettled(page);
    const frames = page.locator(".frame-div");
    const frameCount = await frames.count();
    await expect(page.locator(".frame-div.disabled")).toHaveCount(0);

    const nameInput = await openSaveDialogNameInput(page);
    await nameInput.press("ControlOrMeta+d");
    await nameInput.press("ControlOrMeta+/");
    await page.keyboard.press("Escape");
    await expect(nameInput).toBeHidden();

    await waitForEditorSettled(page);
    await expect(frames).toHaveCount(frameCount);
    await expect(page.locator(".frame-div.disabled")).toHaveCount(0);
});
