import path from "path";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";
import {focusEditor} from "../support/expression-test-support";

// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
export let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => string};
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {
        // Only need to get the global variables if we haven't done so
        if(scssVars == undefined){
            cy.window().then((win) => {
                scssVars = (win as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME];
                strypeElIds = (win as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME];
            });
        }
        // The Strype IDs and CSS class names aren't directly used in the test
        // but they are used in the support file, so we make them available.
        cy.initialiseSupportStrypeGlobals();

        // Wait for code initialisation
        cy.wait(2000);
    });
});

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

export function focusEditorAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
    // Delete existing content (bit of a hack):
    cy.get("body").type("{uparrow}{uparrow}{uparrow}{del}{downarrow}{downarrow}{downarrow}{downarrow}{backspace}{backspace}");
}

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
        cy.wait(500);
        // For testing, we always want to save to this device:
        cy.get("#saveStrypeFileNameInput").clear();
        cy.get("#saveStrypeFileNameInput").type("main");
        cy.contains(en.appMessage.targetFS).click({force: true});
        cy.contains(en.buttonLabel.ok).click({force: true});
    }
    
    cy.wait(1000);

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
export function testRoundTripPasteAndDownload(code: string, extraSetup?: string | (() => void), expected?: string, retainExisting?: boolean, format? : "py" | "spy", afterPaste?: () => void) : void {
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
        cy.get("button").contains(en.buttonLabel.discardChanges).should("exist").click();
        cy.wait(2000);
        // The "button" for the target selection is now a div element.
        cy.get("#" + strypeElIds.getLoadFromFSStrypeButtonId()).click();
        // Must force because the <input> is hidden:
        cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(filepath, {force : true});
        cy.wait(2000);

        checkDownloadedCodeEquals(expected ?? py);
        // Refocus the editor and go to the bottom:
        cy.get("#" + strypeElIds.getFrameUID(-3)).focus();
        cy.get("body").type("{end}");
    });
}
