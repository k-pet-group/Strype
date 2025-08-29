// eslint-disable-next-line @typescript-eslint/no-var-requires
require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import "../support/autocomplete-test-support";
import {BUILTIN, checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, checkNoneAvailable, focusEditorAC, withAC, assertState} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
// eslint-disable-next-line @typescript-eslint/no-var-requires
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();


describe("Built-ins", () => {
    it("Has built-ins, that narrow down when you type", () => {
        focusEditorAC();
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
            // We had a previous bug with multiple sum items in microbit:
            checkExactlyOneItem(acIDSel, BUILTIN, "sum(iterable, start)");
            checkExactlyOneItem(acIDSel, BUILTIN, "ZeroDivisionError()");
            checkExactlyOneItem(acIDSel, BUILTIN, "zip()");
            checkNoItems(acIDSel, "__name__");
            // Once we type "a", should show things beginning with A but not the others:
            cy.get("body").type("a");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
            checkNoItems(acIDSel, "ZeroDivisionError");
            checkNoItems(acIDSel, "zip");
            checkAutocompleteSorted(acIDSel, true);
            // Once we type "b", should show things beginning with AB but not the others:
            cy.get("body").type("b");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkNoItems(acIDSel, "AssertionError");
            checkNoItems(acIDSel, "ZeroDivisionError");
            checkNoItems(acIDSel, "zip");
            checkAutocompleteSorted(acIDSel, true);
            // Check docs are showing for built-in function:
            cy.get(acIDSel).contains("Return the absolute value of the argument.");
            
            // Now complete and check content:
            cy.get("body").type("s");
            cy.wait(600);

            cy.get("body").type("{enter}");
            assertState(frameId, "abs($)", "abs(x)");
        }, true);
    });
    it("Shows text when no documentation available", () => {
        focusEditorAC();
        // Add a function frame and trigger auto-complete:
        const targetNoDocs = Cypress.env("mode") === "microbit" ? "function" : "buffer";
        cy.get("body").type(" " + targetNoDocs);
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel).should("be.visible");
            // buffer is a Skulpt-only function with no documentation available:
            // function is a type with no docs (note: used "ellipsis" before, but with new API it has 2 entries)
            
            checkExactlyOneItem(acIDSel, BUILTIN, targetNoDocs + (Cypress.env("mode") === "microbit" ? "()" : ""));
            cy.get("body").type("{downarrow}");
            // Check docs are showing even though there's no documentation:
            const acIDDoc = acIDSel.replace("#", "#popupAC").replace("_AutoCompletion", "documentation");
            cy.get(acIDDoc).should("be.visible");
            cy.get(acIDDoc).contains("No documentation available");
        }, true);
    });
});

// This is the Python version:
//const UPPER_DOC = "Return a copy of the string converted to uppercase.";
// but TigerPython has its own:
const UPPER_DOC = "Return a copy of the string with all the cased characters converted to uppercase.";

describe("Behaviour with operators, brackets and complex expressions", () => {
    const prefixesWhichShouldShowBuiltins = ["0+", "1.6-", "not ", "1**(2+6)", "[a,", "array[", "~", "(1*", "{3:"];
    const prefixesWhichShouldShowStringMembers = ["\"a\".", "'a'.upper().", "myString.", "(\"a\").", "(\"a\".upper()).", "[\"a\"][0]."];
    const prefixesWhichShouldShowNone = ["z..", "123", "123.", "\"", "\"abc", "\"abc.", "'", "totally_unique_stem", "nonexistentvariable."];

    for (const prefix of prefixesWhichShouldShowBuiltins) {
        it("Shows built-ins, if you autocomplete after " + prefix, () => {
            focusEditorAC();
            // Add a function frame and trigger auto-complete:
            cy.get("body").type(" ");
            cy.wait(500);
            cy.get("body").type(prefix);
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
                checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
                // We had a previous bug with multiple sum items in microbit:
                checkExactlyOneItem(acIDSel, BUILTIN, "sum(iterable, start)");
                checkExactlyOneItem(acIDSel, BUILTIN, "ZeroDivisionError()");
                checkExactlyOneItem(acIDSel, BUILTIN, "zip()");
                checkNoItems(acIDSel, "__name__");
                // Once we type "a", should show things beginning with A but not the others:
                cy.get("body").type("a");
                cy.wait(600);
                checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
                checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
                checkNoItems(acIDSel, "ZeroDivisionError");
                checkNoItems(acIDSel, "zip");
                checkAutocompleteSorted(acIDSel, true);
                // Once we type "b", should show things beginning with AB but not the others:
                cy.get("body").type("b");
                cy.wait(600);
                checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
                checkNoItems(acIDSel, "AssertionError");
                checkNoItems(acIDSel, "ZeroDivisionError");
                checkNoItems(acIDSel, "zip");
                checkAutocompleteSorted(acIDSel, true);
                // Check docs are showing for built-in function:
                cy.get(acIDSel).contains("Return the absolute value of the argument.");
            }, true);
        });
    }

    for (const prefix of prefixesWhichShouldShowStringMembers) {
        it("Shows string members, if you autocomplete after " + prefix, () => {
            focusEditorAC();
            // Add a function frame (after the default line assigning to myString) and trigger auto-complete:
            cy.get("body").type("{downarrow} ");
            cy.wait(500);
            cy.get("body").type(prefix);
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "lower()");
                checkExactlyOneItem(acIDSel, null, "upper()");
                checkNoItems(acIDSel, "divmod");
                cy.get("body").type("u");
                cy.wait(600);
                checkNoItems(acIDSel, "lower");
                checkExactlyOneItem(acIDSel, null, "upper()");
                checkNoItems(acIDSel, "divmod");
                checkAutocompleteSorted(acIDSel, true);
                // Check docs show:
                cy.get("body").type("pper");
                cy.get(acIDSel).contains(UPPER_DOC);
            }, true);
        });
    }

    for (const prefix of prefixesWhichShouldShowNone) {
        it("Shows no completions, if you autocomplete after " + prefix, () => {
            focusEditorAC();
            // Add a function frame and trigger auto-complete:
            cy.get("body").type(" ");
            cy.wait(500);
            cy.get("body").type(prefix);
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkNoneAvailable(acIDSel);
                checkNoItems(acIDSel, "abs(x)");
                checkNoItems(acIDSel, "AssertionError");
                checkNoItems(acIDSel, "ZeroDivisionError");
                checkNoItems(acIDSel, "zip");
            }, true, true);
        });
    }
});

describe("Control flow", () => {
    it("Shows autocomplete when in a try", () => {
        // There was a bug where if you autocompleted inside a try, it would be missing
        // any of the following frames (even if they were present in the code)

        focusEditorAC();
        // Go down then add a try then a print then a method call on myString.: 
        cy.get("body").type("{downarrow}{downarrow}tpmyString{downarrow} myString.{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "capitalize()");
            checkExactlyOneItem(acIDSel, null, "lower()");
        }, true);
    });
});
