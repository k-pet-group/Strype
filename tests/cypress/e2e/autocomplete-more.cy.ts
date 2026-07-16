import { scssVars } from "../support/standard-setup";
import { clearDefaultImports } from "../support/test-support";

require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
// Get all the beforeEach parts:
import "../support/autocomplete-test-support";
import {checkExactlyOneItem, checkNoItems, focusEditorAC, MYVARS, withAC} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();


describe("Control flow", () => {
    it("Offers auto-complete for return of input() function", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo", a description "bar", then go into body:
        cy.get("body").type("{uparrow}ffoo{rightarrow}{rightarrow}bar{downarrow}");
        cy.get("body").type("=level=input('Choose a level between 1 and 6:'){downarrow}");
        cy.get("body").type("ilevel.");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, null, "lower()");
            checkExactlyOneItem(acIDSel, null, "upper()");
        }, false);
    });
});

describe("Loop vars", () => {
    it("Offers both loop vars in for loop", () => {
        focusEditorAC();
        // Go down and enter for index, val in enumerate(myString), then function call in body:
        cy.get("body").type("{downarrow}findex,val{rightarrow}enumerate(myString){rightarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, MYVARS, "index");
            checkExactlyOneItem(acIDSel, MYVARS, "val");
        }, true);
    });
});

describe("Function params", () => {
    it("Shows function param in if", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo", a description "bar", then go into body:
        cy.get("body").type("{uparrow}fgetGuess{rightarrow}alreadyGuessed{rightarrow}{downarrow}");
        cy.get("body").type("=guess=input('Guess a letter:'){downarrow}");
        cy.get("body").type("i");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, MYVARS, "guess");
            checkExactlyOneItem(acIDSel, MYVARS, "alreadyGuessed");
        }, false);
    });
    it("Shows function param in elif", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo", a description "bar", then go into body:
        cy.get("body").type("{uparrow}fgetGuess{rightarrow}alreadyGuessed{rightarrow}{downarrow}");
        cy.get("body").type("=guess=input('Guess a letter:'){downarrow}");
        cy.get("body").type("iguess==''{downarrow}l");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, MYVARS, "guess");
            checkExactlyOneItem(acIDSel, MYVARS, "alreadyGuessed");
        }, false);
    });
});

describe("Overlapping imports", () => {
    it("Offers all imports from module even where is overlapping from import:", () => {
        focusEditorAC();
        // Add two imports: import math, and from math import sin, cos
        clearDefaultImports();
        cy.get("body").type("imath{downarrow}fmath{rightarrow}sin,cos{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body, make a function call with math.:
        cy.get("body").type(" math.");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, "math", "sin(x)");
            checkExactlyOneItem(acIDSel, "math", "cos(x)");
            checkExactlyOneItem(acIDSel, "math", "tan(x)");
        }, true);
    });
});

describe("Import of structured items", () => {
    if (Cypress.env("mode") === "microbit") {
        return;
    }
    it("Shows today in fully qualified date", () => {
        focusEditorAC();
        // Add import: from datetime import date
        clearDefaultImports();
        cy.get("body").type("fdatetime{rightarrow}date{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body, make a function call with math.:
        cy.get("body").type(" ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, "datetime", "date.today()");
        }, true);
    });
    it("Shows today in after date.", () => {
        focusEditorAC();
        // Add import: from datetime import date
        clearDefaultImports();
        cy.get("body").type("fdatetime{rightarrow}date{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body, make a function call with math.:
        cy.get("body").type(" date.");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "<any>");
            checkExactlyOneItem(acIDSel, "date", "today()");
        }, true);
    });
});

describe("Asset files", () => {
    it("Offers auto-complete in string literal for assets", () => {
        focusEditorAC();
        // Make a print and open a string:
        cy.get("body").type("p\"");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "len");
            checkExactlyOneItem(acIDSel, null, "/books/three-men-in-a-boat.txt");
            checkNoItems(acIDSel, "cat-test");
        }, false);
    });
});
