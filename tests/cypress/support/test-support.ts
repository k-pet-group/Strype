import path from "path";
import { strypeElIds } from "./standard-setup";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

export function cleanFromHTML(html: string) : string {
    // Get rid of the zero-width spaces which occur in the HTML:
    return html.replace("\u200B", "").replaceAll("\u00A0", " ");
}

export function getDefaultStrypeProjectDocumentationFullLine(mode: string): string {
    return (mode == "microbit") 
        ? "'''This is the default Strype starter project for micro:bit'''\n"
        : "'''This is the default Strype starter project'''\n";
}

export function focusEditorAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
    // Delete existing content (bit of a hack - and it seems having the second backspace separately avoiding test failure):
    cy.get("body").type("{uparrow}{uparrow}{uparrow}{del}{downarrow}{downarrow}{downarrow}{downarrow}{backspace}");
    cy.get("body").type("{backspace}");
}

export function getDownloadedFileContent(strypeElIds: {[varName: string]: (...args: any[]) => string}, filename: string, firstSave?: boolean) : Cypress.Chainable<string> {
    const downloadsFolder = Cypress.config("downloadsFolder");
    const destFile = path.join(downloadsFolder, filename);
    return cy.task("deleteFile", destFile).then(() => {
        // Save is located in the menu, so we need to open it first, then find the link and click on it
        // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
        // Note we use the ID because cy.contains is awkward when "Save" and "Save as" begin the same.
        cy.get("#saveStrypeProjLink").click({force: true});
        if (firstSave) {
            // For testing, we always want to save to this device:
            cy.contains(en.appMessage.targetFS).click({force: true});
            cy.contains("button:visible", en.buttonLabel.save).click();
        }

        return cy.readFile(destFile);
    });
}