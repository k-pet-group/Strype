
// This does the beforeEach bits for us:
import "../support/autocomplete-test-support";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";
import {strypeElIds} from "../support/autocomplete-test-support";

describe("Demo dialog", () => {
    // We want to minimise the amount of times we click "Examples" because each time
    // hits Github and we get easily blocked if we do that from one IP enough.
    // So we test the prescence of things in one long test rather than many small tests:
    it("Adds another library to the demos dialog", () => {
        if (Cypress.env("mode") == "microbit") {
            // Demos don't show in microbit
            return;
        }
        
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
        cy.contains(en.appMenu.loadDemoProject as string).click({force: true});
        // Check the main three categories are there:
        cy.contains(".list-group-item", "Console").should("exist");
        cy.contains(".list-group-item", "Graphics").should("exist");
        cy.contains(".list-group-item", "Turtle").should("exist");
        cy.contains(".list-group-item", "Graphics").click();
        cy.contains(".open-demo-dlg-name", "Knock knock").should("exist");
        cy.get(".modal-dialog input").type("http://localhost:8089/test-library/");
        cy.contains(".btn", "Add").click();
        cy.contains(".list-group-item", "test-library").should("exist");
        cy.contains(".list-group-item", "test-library").click();
        cy.contains(".open-demo-dlg-name", "My First Demo").should("exist");
        cy.contains(".open-demo-dlg-name", "My First Demo").click();
        cy.contains(".btn", "OK").click();
        cy.wait(2000);
        // Check part of the code actually shows:
        cy.contains("Demo of a demo").should("exist");
    });
});
