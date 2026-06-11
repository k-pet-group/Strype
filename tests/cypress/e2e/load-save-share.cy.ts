// This file tests loading and sharing via the spy: protocol that encodes the full source file
// into the URL

require("cypress-terminal-report/src/installLogsCollector")();
import { focusEditorAndClear, getDefaultStrypeProjectDocumentationFullLine } from "../support/test-support";
import { initialiseSupportStrypeGlobals, standardBeforeEach, strypeElIds } from "../support/standard-setup";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

import {deflateRaw} from "pako";
import "../support/expression-test-support";
import {checkDownloadedFileEquals} from "../support/load-save-support";

beforeEach(standardBeforeEach);

const defaultProjectDocFullLine = getDefaultStrypeProjectDocumentationFullLine(Cypress.env("mode"));

function adjustIfMicrobit(filepath: string) {
    if (Cypress.env("mode") === "microbit") {
        const dest = "cypress/downloads/temp.spy";
        cy.readFile(filepath).then((content) => {
            const lines = content.split(/\r?\n/);
            // Replace std with mb on the top line:
            lines[0] = lines[0].replace(/std/g, "mb");
            const updated = lines.join("\n");
            cy.writeFile(dest, updated);
        });
        filepath = dest;
    }
    return filepath;
}

function encodeBase64URI(spyContent: string) {
    // The content needs to be zipped then turned into base64:
    const compressed: Uint8Array = deflateRaw(spyContent);

    let binary = "";
    for (let i = 0; i < compressed.length; i++) {
        binary += String.fromCharCode(compressed[i]);
    }

    // Step 3: Base64-encode, then make URL-safe
    return btoa(binary)
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function testLoadingFromCalculatedShareLink(filepath: string) {
    filepath = adjustIfMicrobit(filepath);

    // The filename is a path, fixture just needs the filename:
    cy.readFile(filepath).then((spy) => {
        cy.visit("/?shared_proj_id=spy:" + encodeBase64URI(spy),  {onBeforeLoad: (win) => {
            win.localStorage.clear();
            win.sessionStorage.clear();
        }}).then(() => {
            // The Strype IDs and CSS class names aren't directly used in the test
            // but they are used in the support file, so we make them available.
            initialiseSupportStrypeGlobals();

            // Wait for code initialisation
            cy.wait(2000);
        });

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

        checkDownloadedFileEquals(strypeElIds, spy.replaceAll("\r\n", "\n"), "My project.spy", true);
    });
}

describe("Loads and re-saves fixture files", () => {
    it("Loads a basic project", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-basic.spy");
    });
    it("Loads a basic trisection project", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-basic-trisection.spy");
    });
    it("Loads and saves a solo try", () => {
        // Make an empty try, which should save with a placeholder:
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-try-solo.spy");
    });
    it("Loads a basic trisection project", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/grapheme-strings.spy");
    });
});

describe("Tests disabling frames", () => {
    it("Loads and saves a try with disabled except", () => {
        // Make an empty try, which should save with a placeholder:
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-try-disabled-except.spy");
    });
    it("Loads and saves a basic disable project", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-basic-disable.spy");
    });
    
    it("Loads and saves a complex disable project", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-complex-disable.spy");
    });
});

describe("Tests blanks", () => {
    it("Loads and saves with lots of blanks", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-blanks.spy");
    });

});

describe("Tests invalid characters", () => {
    it("Loads and saves a file with invalid chars", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-invalid-chars.spy");
    });
});

describe("Tests saving layout metadata", () => {
    if (Cypress.env("mode") === "microbit") {
        return;
    }
    it("Saves changed layout to tabsExpanded", () => {
        focusEditorAndClear();
        cy.get("#" + strypeElIds.getPEATabContentContainerDivId()).trigger("mouseenter");
        cy.get("div[title='" + en.PEA["PEA-layout-tabs-expanded"] + "']").click();

        cy.readFile("tests/cypress/fixtures/project-layout-tabs-expanded.spy").then((f) => checkDownloadedFileEquals(strypeElIds, f.replace("#(=> Section:Imports", defaultProjectDocFullLine + "#(=> Section:Imports"), "My project.spy", true));
    });
    it("Saves changed layout to tabsExpanded and back", () => {
        focusEditorAndClear();
        cy.get("#" + strypeElIds.getPEATabContentContainerDivId()).trigger("mouseenter");
        cy.get("div[title='" + en.PEA["PEA-layout-tabs-expanded"]).click();
        cy.wait(1000);
        cy.get("div[title='" + en.PEA["PEA-layout-tabs-collapsed"] + "']").click();

        // Since the default code contains a project doc, we need to include it to the code
        cy.readFile("tests/cypress/fixtures/project-layout-tabs-expanded-collapsed.spy").then((f) => checkDownloadedFileEquals(strypeElIds, f.replace("#(=> Section:Imports", defaultProjectDocFullLine + "#(=> Section:Imports"), "My project.spy", true));
    });
    it("Loads and saves a file with tabsExpanded layout", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-layout-tabs-expanded.spy");
    });
    //it("Loads and saves a file with tabsExpanded layout and collapsed", () => {
    //    testRoundTripImportAndDownload("tests/cypress/fixtures/project-layout-tabs-expanded-collapsed.spy");
    //});
});


describe("Tests loading/saving library frames", () => {
    it ("Saves and loads libraries", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-libraries.spy");
    });
    it ("Saves and loads disabled libraries", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-libraries-disable.spy");
    });
});

describe("Tests loading project descriptions", () => {
    it("Loads a project with docs", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-documented.spy");
    });
    it("Loads a project with docs when there is already a project description", () => {
        focusEditorAndClear();
        cy.get("body").type("{uparrow}{uparrow}{leftarrow}Temporary description.");
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-documented.spy");
    });
    it("Loads a project description over the top of another", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-documented.spy");
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-documented-2.spy");
    });
    it("Loads a project without description over the top of another with description", () => {
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-documented.spy");
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-basic-trisection.spy");
    });
    it("Loads a project without docs when there is already a project description", () => {
        focusEditorAndClear();
        cy.get("body").type("{uparrow}{uparrow}{leftarrow}Temporary description.");
        testLoadingFromCalculatedShareLink("tests/cypress/fixtures/project-basic.spy");
    });
});
