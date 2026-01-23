import {strypeElIds} from "./proxy";
import {Page, expect} from "@playwright/test";
import en from "../../../src/localisation/en/en_main.json";
import {readFileSync} from "node:fs";
import fs from "fs";
import { randomUUID } from "node:crypto";


export async function load(page: Page, filepath: string) : Promise<void> {

    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
    // A modification update might arise because we had changed something in the editor:
    // so we check if this situation happened, and discard changes if so.
    await page.waitForTimeout(2000);
    const discardChangesButton = page.locator("button.btn-secondary");
    if(await discardChangesButton.count() > 0) {
        const discardChangesButtonContent = await discardChangesButton.textContent();
        if(discardChangesButtonContent == "Discard changes"){
            await discardChangesButton.click();
        }
    }
    // The "button" for the target selection is now a div element.
    await page.click("#" + await strypeElIds(page).getLoadFromFSStrypeButtonId());
    // Must force because the <input> is hidden:
    await page.setInputFiles("#" + await strypeElIds(page).getImportFileInputId(), filepath);
    await page.waitForTimeout(2000);
}

export async function loadContent(page: Page, spyToLoad: string) : Promise<void> {
    // The recursive option stops it failing if the dir exists:
    fs.mkdirSync("tests/cypress/downloads/", { recursive: true });
    const path = `tests/cypress/downloads/toload-${randomUUID()}.spy`;
    fs.writeFileSync(path, spyToLoad);
    await load(page, path);
}

// Returns the file path
export async function save(page: Page, firstSave = true) : Promise<string> {
    // Save is located in the menu, so we need to open it first, then find the link and click on it:
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());

    let download;
    if (firstSave) {
        await page.click("#" + await strypeElIds(page).getSaveProjectLinkId());
        // For testing, we always want to save to this device:
        await page.getByText(en.appMessage.targetFS).click();
        [download] = await Promise.all([
            page.waitForEvent("download"),
            page.click("button.btn:has-text('OK')"),
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
