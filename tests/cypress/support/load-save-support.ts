// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

import path from "path";

export function checkDownloadedFileEquals(strypeElIds: {[varName: string]: (...args: any[]) => string}, fullContent: string, filename: string, firstSave?: boolean) : void {
    const downloadsFolder = Cypress.config("downloadsFolder");
    const destFile = path.join(downloadsFolder, filename);
    cy.task("deleteFile", destFile);
    // Save is located in the menu, so we need to open it first, then find the link and click on it
    // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
    cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
    // Note we use the ID because cy.contains is awkward when "Save" and "Save as" begin the same.
    cy.get("#saveStrypeProjLink").click({force: true});
    if (firstSave) {
        // For testing, we always want to save to this device:
        cy.contains(en.appMessage.targetFS).click({force: true});
        cy.contains(en.buttonLabel.ok).click({force: true});
    }

    cy.readFile(destFile).then((p : string) => {
        // Print out full version in message (without escaped \n), to make it easier to diff:
        expect(p, "Actual unescaped:\n" + p).to.equal(fullContent.replaceAll("\r\n", "\n"));
    });
}

export function loadFile(strypeElIds: {[varName: string]: (...args: any[]) => string}, filepath: string) : void {
    cy.get("#" + strypeElIds.getEditorMenuUID()).click();
    cy.get("#" + strypeElIds.getLoadProjectLinkId()).click();
    // If the current state of the project is modified,
    // we first need to discard the changes (we check the button is available)
    cy.get("button").contains(en.buttonLabel.discardChanges).should("exist").click();
    cy.wait(2000);
    // The "button" for the target selection is now a div element.
    cy.get("#" + strypeElIds.getLoadFromFSStrypeButtonId()).click();
    // Must force because the <input> is hidden:
    cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(filepath, {force: true});
    cy.wait(4000);
}
