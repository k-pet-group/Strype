// eslint-disable-next-line @typescript-eslint/no-var-requires
require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import "../support/autocomplete-test-support";
import {BUILTIN, MYFUNCS, MYVARS, checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, focusEditorAC, withAC, assertState, scssVars} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
// eslint-disable-next-line @typescript-eslint/no-var-requires
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

// This is the Python version:
//const UPPER_DOC = "Return a copy of the string converted to uppercase.";
// but TigerPython has its own:
const UPPER_DOC = "Return a copy of the string with all the cased characters converted to uppercase.";

describe("User-defined items", () => {
    it("Offers auto-complete for user-defined functions", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo" then come back down and make a function call frame:
        cy.get("body").type("{uparrow}ffoo{downarrow}{downarrow}{downarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYFUNCS, "foo()");
            cy.get("body").type("foo");
            cy.wait(600);
            cy.get("body").type("{enter}");
            assertState(frameId, "foo($)");
        }, true);
    });

    it("Offers auto-complete for user-defined functions with *", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo" then come back down and make a function call frame:
        cy.get("body").type("{uparrow}ffoo(a,*,b){downarrow}{downarrow}{downarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYFUNCS, "foo(a, b)");
            cy.get("body").type("foo");
            cy.wait(600);
            cy.get("body").type("{enter}");
            assertState(frameId, "foo($)", "foo(a, b)");
        }, true);
    });

    it("Offers auto-complete for user-defined variables", () => {
        focusEditorAC();
        // Make an assignment frame that says "myVar=23", then make a function call frame beneath:
        cy.get("body").type("=myVar=23{enter} ");
        cy.wait(500);
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myVar");
            // Not a function, so shouldn't show brackets:
            checkNoItems(acIDSel, "myVar()");
        }, true);
    });

    it("Offers auto-complete for user-defined variables but inside functions", () => {
        focusEditorAC();
        // Make an assignment frame that says "myVar=<string>", then make a function definition:
        cy.get("body").type("=myVar=\"hello\"{enter}");
        cy.get("body").type("{uparrow}{uparrow}ffoo{rightarrow}{rightarrow} ");
        cy.wait(500);
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myVar");
            // Not a function, so shouldn't show brackets:
            checkNoItems(acIDSel, "myVar()");
            // Fill it in:
            cy.get("body").type("myV");
            cy.wait(1000);
            cy.get("body").type("{enter}");
        }, true);

        // Now check members complete on it:
        cy.get("body").type(".");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "myVar", "lower()");
            checkExactlyOneItem(acIDSel, "myVar", "upper()");
            checkNoItems(acIDSel, "divmod");
            cy.get("body").type("u");
            cy.wait(600);
            checkNoItems(acIDSel, "lower");
            checkExactlyOneItem(acIDSel, "myVar", "upper()");
            checkNoItems(acIDSel, "divmod");
            checkAutocompleteSorted(acIDSel, true);
            // Check docs show:
            cy.get("body").type("pper");
            cy.get(acIDSel).contains(UPPER_DOC);
        }, true);
    });

    it("Offers auto-complete for user-defined function parameters", () => {
        focusEditorAC();
        // Make a function frame with "foo(myParam)" 
        // then make a function call frame inside:
        cy.get("body").type("{uparrow}ffoo(myParam{rightarrow} ");
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myParam");
            // Go out of this call and into the main body:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}{downarrow}");
        }, true);
        // Make a function call and check myParam doesn't show there:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "myParam", true);
        }, true);
    });

    it("Offers auto-complete for for-loop iterating variables", () => {
        focusEditorAC();
        // Make a for loop:
        cy.get("body").type("fmyIterator{rightarrow}imaginaryList{rightarrow}");
        // Trigger auto-completion in a new function call frame:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myIterator");
            checkNoItems(acIDSel, "imaginaryList");
            // Go out of this call and beneath the loop:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}");
        }, true);
        // Make a function call and check myIterator shows there -- Python semantics
        // are that the loop variable is available after the loop:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myIterator");
            checkNoItems(acIDSel, "imaginaryList");
        }, true);
    });

    it("Offers auto-complete for items on user-defined variables", () => {
        focusEditorAC();
        // Make an assignment frame myVar="hi" then add a function call frame beneath with "myVar."
        cy.get("body").type("=myVar=\"hi{enter} myVar.");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "myVar", "lower()");
            checkExactlyOneItem(acIDSel, "myVar", "upper()");
            checkNoItems(acIDSel, "divmod");
            cy.get("body").type("u");
            cy.wait(600);
            checkNoItems(acIDSel, "lower");
            checkExactlyOneItem(acIDSel, "myVar", "upper()");
            checkNoItems(acIDSel, "divmod");
            checkAutocompleteSorted(acIDSel, true);
            // Check docs show:
            cy.get("body").type("pper");
            cy.get(acIDSel).contains(UPPER_DOC);
        }, true);
    });

    it("Offers auto-complete for user-defined variables but not before declaration", () => {
        focusEditorAC();
        // Make an assignment frame with myVar=23, then go before it and add a function call frame:
        cy.get("body").type("=myVar=23{enter}{uparrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkNoItems(acIDSel, "myVar");
        }, true);
    });
});

