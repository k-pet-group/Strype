// This file tests loading and saving, especially the new .spy file format (basically, .py + annotations)
// but also loading old files, which we want to support for a while.

// We have two kinds of things to test.  One is loading .spy files, which we then check can be saved again to get
// the same result.  The other is that if we enter some code (especially code with metadata-required things like disabled frames)
// it should save correctly.

// eslint-disable-next-line @typescript-eslint/no-var-requires
require("cypress-terminal-report/src/installLogsCollector")();
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

import path from "path";
import i18n from "@/i18n";
import "../support/expression-test-support";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";
import { getDefaultStrypeProjectDocumentationFullLine } from "../support/test-support";


// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
let scssVars: {[varName: string]: string};
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

const defaultProjectDocFullLine = getDefaultStrypeProjectDocumentationFullLine(Cypress.env("mode"));

function focusEditorPasteAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
    // Delete existing content (bit of a hack):
    cy.get("body").type("{uparrow}{uparrow}{uparrow}{del}{downarrow}{downarrow}{downarrow}{downarrow}{backspace}{backspace}");
}

function checkDownloadedFileEquals(fullContent: string, filename: string, firstSave?: boolean) : void {
    const downloadsFolder = Cypress.config("downloadsFolder");
    const destFile = path.join(downloadsFolder, filename);
    cy.task("deleteFile", destFile);
    // Save is located in the menu, so we need to open it first, then find the link and click on it
    // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
    cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
    cy.contains(i18n.t("appMenu.saveProject") as string).click({force: true});
    if (firstSave) {
        // For testing, we always want to save to this device:
        cy.contains(i18n.t("appMessage.targetFS") as string).click({force: true});
        cy.contains(i18n.t("OK") as string).click({force: true});
    }

    cy.readFile(destFile).then((p : string) => {
        // Print out full version in message (without escaped \n), to make it easier to diff:
        expect(p, "Actual unescaped:\n" + p).to.equal(fullContent.replaceAll("\r\n", "\n"));
    });
}

function adjustIfMicrobit(filepath: string) {
    if (Cypress.env("mode") === "microbit") {
        const dest = "cypress/downloads/temp.spy";
        cy.readFile(filepath).then((content : string) => {
            const lines = content.split(/\r?\n/);
            // Replace std with mb on the top line:
            lines[0] = lines[0].replace(/std/g, "mb");
            // Microbit doesn't store any PythonExecutionArea layout info (which is prefixed pea) because it doesn't have it:
            const updated = lines.filter((line : string) => !line.includes("#(=> pea")).join("\n");
            cy.writeFile(dest, updated);
        });
        filepath = dest;
    }
    return filepath;
}

function testRoundTripImportAndDownload(filepath: string) {
    filepath = adjustIfMicrobit(filepath);

    // The filename is a path, fixture just needs the filename:
    cy.readFile(filepath).then((spy) => {
        // Delete existing:
        focusEditorPasteAndClear();

        cy.get("#" + strypeElIds.getEditorMenuUID()).click();
        cy.get("#" + strypeElIds.getLoadProjectLinkId()).click();
        // If the current state of the project is modified,
        // we first need to discard the changes (we check the button is available)
        cy.get("button").contains(i18n.t("buttonLabel.discardChanges") as string).should("exist").click();
        cy.wait(2000);
        // The "button" for the target selection is now a div element.
        cy.get("#" + strypeElIds.getLoadFromFSStrypeButtonId()).click();
        // Must force because the <input> is hidden:
        cy.get("#" + strypeElIds.getImportFileInputId()).selectFile(filepath, {force : true});
        cy.wait(2000);
        
        // We must make sure there are no comment frames starting "(=>" because that would indicate
        // our special comments have become comment frames, rather than being processed:
        // Making sure there's zero items is awkward in Cypress so we drop to doing it manually:
        cy.document().then((doc) => {
            const spans = Array.from(doc.querySelectorAll("span.comment-slot"));
            const matching = spans.filter((el) => el.textContent?.trim().startsWith("(=>"));
            expect(matching.length).to.eq(0);
        });
        
        // We make sure there are no slots containing ___strype_ because they should have been processed:
        cy.document().then((doc) => {
            const spans = Array.from(doc.querySelectorAll("span"));
            const matching = spans.filter((el) => el.textContent?.includes("___strype_"));
            expect(matching.length).to.eq(0);
        });

        checkDownloadedFileEquals(spy.replaceAll("\r\n", "\n"), filepath.split("/").pop() ?? "My project.spy");
    });
}

function testEntryDisableAndSave(commands: string, disableFrames: string[], filepath: string) {
    filepath = adjustIfMicrobit(filepath);
    
    cy.readFile(filepath).then((spy) => {
        // Delete existing:
        focusEditorPasteAndClear();
        
        cy.get("body").type(commands);
        
        disableFrames.forEach((txt) => {
            cy.contains("span." + scssVars.labelSlotInputClassName, txt).rightclick();
            cy.contains("*", i18n.t("contextMenu.disable") as string).click();
        });

        // The files will contain the default project documentation, so we need to include it in the code
        checkDownloadedFileEquals(spy.replaceAll("\r\n", "\n").replace("\n", "\n" + defaultProjectDocFullLine), "My project.spy", true);
    });
} 

describe("Loads and re-saves fixture files", () => {
    it("Loads a basic project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic.spy");
    });
    it("Loads a basic trisection project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic-trisection.spy");
    });
    it("Outputs a dummy for solo try", () => {
        // Make an empty try, which should save with a placeholder:
        testEntryDisableAndSave("tpmsg{enter}{downarrow}{backspace}", [], "tests/cypress/fixtures/project-try-solo.spy");
    });
    it("Loads and saves a solo try", () => {
        // Make an empty try, which should save with a placeholder:
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-try-solo.spy");
    });
});

describe("Tests disabling frames", () => {
    it("Outputs a dummy for try with disabled except", () => {
        // Make an empty try, which should save with a placeholder:
        testEntryDisableAndSave("tpmsg{enter}{rightarrow}extype{rightarrow}pword", ["extype"], "tests/cypress/fixtures/project-try-disabled-except.spy");
    });
    it("Loads and saves a try with disabled except", () => {
        // Make an empty try, which should save with a placeholder:
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-try-disabled-except.spy");
    });
    
    it("Save a basic disable project", () => {
        testEntryDisableAndSave("=msg=\"Hello\"{enter} print(msg)", ["print"], "tests/cypress/fixtures/project-basic-disable.spy");
    });
    it("Loads and saves a basic disable project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic-disable.spy");
    });

    
    it("Loads and saves a complex disable project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-complex-disable.spy");
    });
});

describe("Tests collapsing frames", () => {
    it("Loads and saves a simple collapsed project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic-trisection-collapse.spy");
    });
    it("Loads and saves a complex disable project", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-complex-disable-collapse.spy");
    });
});

describe("Tests blanks", () => {
    it("Outputs a file with lots of blanks", () => {
        // import x as ___strype_blank
        // from ___strype_blank import ___strype_blank
        // def ___strype_blank ( ) :
        //     if ___strype_blank  :
        //         ( )
        //     return
        // raise ___strype_blank
        // ___strype_blank = 1 + ___strype_blank * ___strype_blank / () - __strype_blank
        testEntryDisableAndSave("{uparrow}{uparrow}" +
            "ix {rightarrow}f{downarrow}{downarrow}" +
            "f{downarrow}i{rightarrow} {downarrow}{downarrow}r{rightarrow}{downarrow}{downarrow}" +
            "a{rightarrow}={rightarrow}1+*/()-", [], "tests/cypress/fixtures/project-blanks.spy");
    });
    it("Loads and saves with lots of blanks", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-blanks.spy");
    });
    
});

describe("Tests invalid characters", () => {
    it("Outputs a file with invalid chars", () => {
        testEntryDisableAndSave("{uparrow}{uparrow}" +
            "i100{rightarrow}ffoo{rightarrow}£1000{downarrow}i50{downarrow}ifoo（）{downarrow}{downarrow}" +
            "f#include{rightarrow}100,abc,#35{downarrow}r$50{downarrow}{downarrow}{downarrow}" +
            " 100($50, 24.24a)", [], "tests/cypress/fixtures/project-invalid-chars.spy");
    });
    it("Loads and saves a file with invalid chars", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-invalid-chars.spy");
    });
});

describe("Tests saving layout metadata", () => {
    if (Cypress.env("mode") === "microbit") {
        return;
    }
    it("Saves changed layout to tabsExpanded", () => {
        focusEditorPasteAndClear();
        cy.get("#" + strypeElIds.getPEATabContentContainerDivId()).trigger("mouseenter");
        cy.get("div[title='" + i18n.t("PEA.PEA-layout-tabs-expanded") + "']").click();

        // Since the default code contains a project doc, we need to include it to the code
        cy.readFile("tests/cypress/fixtures/project-layout-tabs-expanded.spy").then((f) => checkDownloadedFileEquals(f.replace("#(=> Section:Imports", defaultProjectDocFullLine + "#(=> Section:Imports"), "My project.spy", true));
    });
    it("Saves changed layout to tabsExpanded and back", () => {
        focusEditorPasteAndClear();
        cy.get("#" + strypeElIds.getPEATabContentContainerDivId()).trigger("mouseenter");
        cy.get("div[title='" + i18n.t("PEA.PEA-layout-tabs-expanded") + "']").click();
        cy.get("div[title='" + i18n.t("PEA.PEA-layout-tabs-collapsed") + "']").click();

        // Since the default code contains a project doc, we need to include it to the code
        cy.readFile("tests/cypress/fixtures/project-layout-tabs-expanded-collapsed.spy").then((f) => checkDownloadedFileEquals(f.replace("#(=> Section:Imports", defaultProjectDocFullLine + "#(=> Section:Imports"), "My project.spy", true));
    });
    it("Loads and saves a file with tabsExpanded layout", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-layout-tabs-expanded.spy");
    });
    //it("Loads and saves a file with tabsExpanded layout and collapsed", () => {
    //    testRoundTripImportAndDownload("tests/cypress/fixtures/project-layout-tabs-expanded-collapsed.spy");
    //});
});


describe("Tests loading/saving library frames", () => {
    it("Saves libraries", () => {
        // Doesn't really disable, but easy comparison to next item:
        testEntryDisableAndSave("{uparrow}{uparrow}lfoo{rightarrow}ibar{rightarrow}lhttps://www.google.com/{rightarrow}", [], "tests/cypress/fixtures/project-libraries.spy");
    });
    it("Saves disabled libraries", () => {
        // Disable the foo library:
        testEntryDisableAndSave("{uparrow}{uparrow}lfoo{rightarrow}ibar{rightarrow}lhttps://www.google.com/{rightarrow}", ["foo"], "tests/cypress/fixtures/project-libraries-disable.spy");
    });
    it ("Saves and loads libraries", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-libraries.spy");
    });
    it ("Saves and loads disabled libraries", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-libraries-disable.spy");
    });
});

describe("Tests loading project descriptions", () => {
    it("Loads a project with docs", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-documented.spy");
    });
    it("Loads a project with docs when there is already a project description", () => {
        focusEditorPasteAndClear();
        cy.get("body").type("{uparrow}{uparrow}{leftarrow}Temporary description.");
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-documented.spy");
    });
    it("Loads a project description over the top of another", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-documented.spy");
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-documented-2.spy");
    });
    it("Loads a project without description over the top of another with description", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-documented.spy");
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic-trisection.spy");
    });
    it("Loads a project without docs when there is already a project description", () => {
        focusEditorPasteAndClear();
        cy.get("body").type("{uparrow}{uparrow}{leftarrow}Temporary description.");
        testRoundTripImportAndDownload("tests/cypress/fixtures/project-basic.spy");
    });
});

describe("Tests loading/saving classes", () => {
    it("Loads/saves classes without images", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/oop-crab-no-images.spy");
    });
    it("Loads/saves classes with images", () => {
        if (Cypress.env("mode") == "microbit") {
            // No image literals in microbit mode:
            return;
        }
        testRoundTripImportAndDownload("tests/cypress/fixtures/oop-crab.spy");
    });
    it("Loads/saves classes with format strings", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/students.spy");
    });
});

describe("Tests loading/saving format strings", () => {
    it("Loads/saves format strings", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/format-strings.spy");
    });
});

describe("Tests loading/saving grapheme clusters (like emojis) in strings", () => {
    it("Loads/saves grapheme clusters in strings", () => {
        testRoundTripImportAndDownload("tests/cypress/fixtures/grapheme-strings.spy");
    });
});
