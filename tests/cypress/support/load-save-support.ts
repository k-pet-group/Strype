// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

import { getDownloadedFileContent } from "./test-support";

export function checkDownloadedFileEquals(strypeElIds: {[varName: string]: (...args: any[]) => string}, fullContent: string, filename: string, firstSave?: boolean) : void {
    getDownloadedFileContent(strypeElIds, filename, firstSave).then((p) => {
        // Print out full version in message (without escaped \n), to make it easier to diff:
        expect(p, "Actual unescaped:\n" + p).to.equal(fullContent.replaceAll("\r\n", "\n"));
    });
}

export function loadFile(strypeElIds: {[varName: string]: (...args: any[]) => string}, filepath: string) : void {
    cy.get("#" + strypeElIds.getEditorMenuUID()).click();
    cy.get("#" + strypeElIds.getLoadProjectLinkId()).click();
    // If the current state of the project is modified,
    // we first need to discard the changes (we check the button is available)
    // Clicking discard closes this dialog and opens the real load-target one (which contains the
    // "load from FS" button below) via an event -- Cypress's own click retry-ability (waiting for
    // the target to be visible/actionable) covers that transition, no fixed wait needed:
    cy.get("button").contains(en.buttonLabel.discardChanges).should("exist").click();
    // The "button" for the target selection is now a div element.
    cy.get("#" + strypeElIds.getLoadFromFSStrypeButtonId()).click();
    // Must force because the <input> is hidden:
    cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(filepath, {force: true});
}
