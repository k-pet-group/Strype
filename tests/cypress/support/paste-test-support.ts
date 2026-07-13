import path from "path";
import {focusEditor} from "../support/expression-test-support";

// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";
import { standardBeforeEach, strypeElIds } from "./standard-setup";
import { focusEditorAndClear, waitForEditorSettled, waitForProjectNameOrTimeout } from "./test-support";

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
beforeEach(standardBeforeEach);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
Cypress.Commands.add("paste",
    {prevSubject : true},
    ($element, data) => {
        const clipboardData = new DataTransfer();
        clipboardData.setData("text", data);
        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        });

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cy.get($element).then(() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            $element[0].dispatchEvent(pasteEvent);
        });
    });

export function checkDownloadedCodeEquals(fullCode: string, format: "py" | "spy" = "py") : void {
    const downloadsFolder = Cypress.config("downloadsFolder");
    cy.task("deleteFile", path.join(downloadsFolder, "main.py"));
    // Conversion to Python is located in the menu, so we need to open it first, then find the link and click on it
    // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
    cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
    if (format == "py") {
        cy.contains(en.appMenu.downloadPython).click({force: true});
    }
    else {
        cy.contains(en.appMenu.saveProject).click({force: true});
        // Menu.vue's onStrypeMenuShownModalDlg sets the filename input's default value and
        // focuses it via a genuine setTimeout ~500ms after the dialog is shown. If we clear/type
        // before that timer fires, it gets silently overwritten back to the default project name
        // (this is the exact same race found and fixed in the Playwright equivalent, save() in
        // tests/playwright/support/loading-saving.ts) -- wait for that setup to finish (it ends
        // by focusing the input) before typing in ours:
        cy.get("#saveStrypeFileNameInput", {timeout: 10000}).should(($el) => {
            // Use the element's own document (not the bare global `document`, which in a Cypress
            // spec file refers to the test runner's document, not the AUT's):
            expect($el[0].ownerDocument.activeElement).to.eq($el[0]);
        });
        // For testing, we always want to save to this device:
        cy.get("#saveStrypeFileNameInput").clear();
        cy.get("#saveStrypeFileNameInput").type("main");
        cy.contains(en.appMessage.targetFS).click({force: true});
        cy.contains("button:visible", en.buttonLabel.save).click();
    }

    // cy.readFile already polls until the file exists (up to its own timeout), so no wait is
    // needed here beforehand:
    cy.readFile(path.join(downloadsFolder, "main." + format)).then((p : string) => {
        // Before comparing, we fix up a few oddities of our generated code:
        // Get rid of any spaces at end of lines:
        p = p.replaceAll(/ +\n/g, "\n");
        // Get rid of spaces before colons at end of line:
        p = p.replaceAll(/ +:\n/g, ":\n");
        // Get rid of spaces before closing brackets:
        p = p.replace(/ +([)\]}])/g, "$1");
        // Get rid of any multiple spaces between words:
        p = p.replace(/([^ \n])  +([^ ])/g, "$1 $2");
        // Print out full version in message (without escaped \n), to make it easier to diff:
        expect(p, "Actual unescaped:\n" + p).to.equal(fullCode.replaceAll("\r\n", "\n"));
    });
}

// if expected is missing, use the original code
export function testRoundTripPasteAndDownload(code: string, extraSetup?: string | (() => void), expected?: string, retainExisting?: boolean, format? : "py" | "spy", afterPaste?: () => void, settleTimeoutMs?: number) : void {
    if (retainExisting) {
        focusEditor();
    }
    else {
        // Delete existing:
        focusEditorAndClear();
    }
    if (extraSetup) {
        if (typeof extraSetup == "string") {
            cy.get("body").type(extraSetup);
        }
        else {
            extraSetup();
        }
    }
    // Get rid of any Windows file endings:
    code = code.replaceAll(/\r\n/g, "\n");
    
    (cy.get("body") as any).paste(code);
    
    if (afterPaste) {
        afterPaste();
    }
    
    // We make sure our pasting has completed before saving, so that the save mechanism is based on an loaded file...
    waitForEditorSettled(settleTimeoutMs);

    checkDownloadedCodeEquals(expected ?? code, format ?? "py");
    // Refocus the editor and go to the bottom:
    cy.get("#" + strypeElIds.getFrameUID(-3)).focus();
    cy.get("body").type("{end}");
}

export function testRoundTripImportAndDownload(filepath: string, expected?: string) : void {
    // The filename is a path, fixture just needs the filename:
    cy.readFile(filepath).then((py) => {
        // Delete existing:
        focusEditorAndClear();

        cy.get("#" + strypeElIds.getEditorMenuUID()).click();
        cy.get("#" + strypeElIds.getLoadProjectLinkId()).click();
        // If the current state of the project is modified,
        // we first need to discard the changes (we check the button is available)
        // Clicking discard closes this dialog and opens the real load-target one (which contains
        // the "load from FS" button below) via an event -- Cypress's own click retry-ability
        // (waiting for the target to be visible/actionable) covers that transition, no fixed wait
        // needed:
        cy.get("button").contains(en.buttonLabel.discardChanges).should("exist").click();
        // The "button" for the target selection is now a div element.
        cy.get("#" + strypeElIds.getLoadFromFSStrypeButtonId()).click();
        // Must force because the <input> is hidden:
        cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(filepath, {force : true});
        // Menu.vue's selectedFile() only sets appStore.projectName (which the visible
        // ".project-name" label mirrors) once the new project's state has actually been applied --
        // wait for that instead of guessing how long loading a given file will take (same fix as
        // load() in tests/playwright/support/loading-saving.ts). Some callers here deliberately
        // load invalid content that the app rejects, in which case the name never changes -- that
        // is for the caller's own subsequent assertions to check, so this wait is best-effort:
        const expectedProjectName = path.basename(filepath, path.extname(filepath));
        waitForProjectNameOrTimeout(expectedProjectName);

        checkDownloadedCodeEquals(expected ?? py);
        // Refocus the editor and go to the bottom:
        cy.get("#" + strypeElIds.getFrameUID(-3)).focus();
        cy.get("body").type("{end}");
    });
}
