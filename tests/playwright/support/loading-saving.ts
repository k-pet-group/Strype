import {strypeElIds} from "./proxy";
import {Page, expect} from "@playwright/test";
import en from "../../../src/localisation/en/en_main.json";
import {readFileSync} from "node:fs";
import fs from "fs";
import { randomUUID } from "node:crypto";
import path from "node:path";


export async function load(page: Page, filepath: string) : Promise<void> {
    // Wait for page load:
    await page.waitForSelector(".frame-container");
    
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
    // A modification update might arise because we had changed something in the editor: Menu.vue's
    // openLoadProjectModal() only shows the "discard changes" dialog when the project has unsaved
    // changes, so this may legitimately never appear -- wait for it with a bounded timeout rather
    // than assuming it needs a fixed delay to show up:
    const discardChangesButton = page.locator("#save-on-load-project-modal-dlg button.btn-secondary");
    if (await discardChangesButton.waitFor({state: "visible", timeout: 5000}).then(() => true).catch(() => false)) {
        await discardChangesButton.click();
    }
    const [fileChooser] = await Promise.all([
        page.waitForEvent("filechooser"),
        // The "button" for the target selection is now a div element.
        page.click("#" + await strypeElIds(page).getLoadFromFSStrypeButtonId()),
    ]);
    await fileChooser.setFiles(filepath);
    // Menu.vue's selectedFile() shows a progress overlay while it *reads* the file, but hides it
    // again as soon as reading is done -- before the state is actually applied (onFileLoaded() is
    // only called inside a separate, un-awaited .then() chain), so the overlay disappearing isn't
    // a reliable "load has finished" signal. Once onFileLoaded() does run, it sets
    // appStore.projectName from the loaded file's name, which the visible ".project-name" label
    // mirrors -- wait for that instead, since it only updates once the new state is truly in place:
    const expectedProjectName = path.basename(filepath, path.extname(filepath));
    await expect(page.locator(".project-name")).toHaveText(expectedProjectName, {timeout: 30000});
}

export async function loadContent(page: Page, spyToLoad: string) : Promise<void> {
    // The recursive option stops it failing if the dir exists:
    fs.mkdirSync("tests/cypress/downloads/", { recursive: true });
    const path = `tests/cypress/downloads/toload-${randomUUID()}.spy`;
    fs.writeFileSync(path, spyToLoad);
    await load(page, path);
}

// Returns the file path
export async function save(page: Page, firstSave = true, projectName? : string) : Promise<string> {
    // Wait for page load:
    await page.waitForSelector(".frame-container");
    
    // Save is located in the menu, so we need to open it first, then find the link and click on it.
    // The menu's slide-open animation is covered by Playwright's own actionability checks on the
    // click below (it waits for the target to be visible and stable), so no manual wait is needed:
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());

    let download;
    if (firstSave) {
        await page.click("#" + await strypeElIds(page).getSaveProjectLinkId());
        // The save dialog (ModalDlg) itself renders with no-animation, so most elements below are
        // usable as soon as they're actionable. But the filename input is special: Menu.vue's
        // onStrypeMenuShownModalDlg sets its default value and focuses it via a genuine
        // setTimeout ~500ms after the dialog is shown. If we fill in our own name before that
        // timer fires, it gets silently overwritten back to the default project name (confirmed
        // via a real CI failure) -- wait for that setup to finish (it ends by focusing the input)
        // before filling in ours, bounded so we don't hang if it never fires:
        if (projectName) {
            const nameInput = page.locator("#saveStrypeFileNameInput");
            await nameInput.evaluate((el) => new Promise<void>((resolve) => {
                if (document.activeElement === el) {
                    resolve();
                    return;
                }
                el.addEventListener("focus", () => resolve(), {once: true});
                setTimeout(resolve, 3000);
            }));
            await nameInput.fill(projectName);
        }
        // For testing, we always want to save to this device:
        await page.locator("span:visible").getByText(en.appMessage.targetFS).click();
        [download] = await Promise.all([
            page.waitForEvent("download"),
            page.locator("button.btn:visible", {hasText: en.buttonLabel.save}).click(),
        ]);
    }
    else {
        [download] = await Promise.all([
            page.waitForEvent("download"),
            page.click("#" + await strypeElIds(page).getSaveProjectLinkId()),
        ]);
    }
    const filePath = await download.path();
    return filePath;
}

export async function testPlaywrightRoundTripImportAndDownload(page:Page, filepath: string) : Promise<void> {
    await load(page, filepath);
    const expected = readFileSync(filepath, "utf8").replace(/\r\n/g, "\n");
    const output = readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
    expect(output).toEqual(expected);
}
