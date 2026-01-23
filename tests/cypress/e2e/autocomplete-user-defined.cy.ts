require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import "../support/autocomplete-test-support";
import {BUILTIN, MYFUNCS, MYVARS, checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, focusEditorAC, withAC, assertState, scssVars, MYCLASSES} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
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
        // Go up to functions section, add a function named "foo", a description "bar", then come back down and make a function call frame:
        cy.get("body").type("{uparrow}ffoo{rightarrow}{rightarrow}bar{downarrow}{downarrow}{downarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYFUNCS, "foo()");
            cy.get("body").type("foo");
            cy.wait(600);
            // Check docs show:
            cy.get(acIDSel).contains("bar");
            cy.get("body").type("{enter}");
            assertState(frameId, "foo($)");
        }, true);
    });

    it("Offers auto-complete for user-defined functions with *", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo" then come back down and make a function call frame:
        cy.get("body").type("{uparrow}ffoo(a,*,b){downarrow}{downarrow}{downarrow}{downarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYFUNCS, "foo(a, b)");
            cy.get("body").type("foo");
            cy.wait(600);
            cy.get("body").type("{enter}");
            assertState(frameId, "foo($)", "foo(a, b=)");
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
        cy.get("body").type("{uparrow}{uparrow}ffoo{rightarrow}{rightarrow}{rightarrow} ");
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
        }, false);

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
        }, false);
    });

    it("Offers auto-complete for user-defined function parameters", () => {
        focusEditorAC();
        // Make a function frame with "foo(myParam)" 
        // then make a function call frame inside:
        cy.get("body").type("{uparrow}ffoo(myParam{rightarrow}{rightarrow} ");
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "myParam");
            // Go out of this call and into the main body:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}{downarrow}");
        }, false);
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

    it("Offers auto-complete for user-defined classes", () => {
        focusEditorAC();
        // Go up to definitions section, add a class named "foo", a documentation "bar", then come back down and make a class call frame:
        cy.get("body").type("{uparrow}cfoo{rightarrow}bar{downarrow}{downarrow}{downarrow}{downarrow}{downarrow} ");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYCLASSES, "foo()");
            cy.get("body").type("foo");
            cy.wait(600);
            // Check docs show:
            cy.get(acIDSel).contains("bar");
            cy.get("body").type("{enter}");
            assertState(frameId, "foo($)");
        }, true);
    });

    it("Offers auto-complete for user-defined class's parameters", () => {
        focusEditorAC();
        // Make a class frame with "foo" and the params for the init function "bar, vaz",
        // then make a function call frame inside:
        cy.get("body").type("{uparrow}cfoo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar,vaz{rightarrow}{rightarrow}");
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "self");
            checkExactlyOneItem(acIDSel, MYVARS, "bar");
            checkExactlyOneItem(acIDSel, MYVARS, "vaz");
            checkExactlyOneItem(acIDSel, MYCLASSES, "foo(bar, vaz)");
            // Go out of this call and into the main body:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}{downarrow}{downarrow}");
        }, false);
        // Make a function call and check "self, bar, vaz" don't show there:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "self", true);
            checkNoItems(acIDSel, "bar", true);
            checkNoItems(acIDSel, "vaz", true);
            checkExactlyOneItem(acIDSel, MYCLASSES, "foo(bar, vaz)");
        }, true);
    });

    it("Offers auto-complete for user-defined class's function parameters", () => {
        focusEditorAC();
        // Make a class frame with "foo" and the params for the init function "bar",
        // then add function definition "myF" frame with parameters "vaz, param2" and go inside:
        cy.get("body").type("{uparrow}cfoo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}fmyF{rightarrow}vaz,param2{rightarrow}{rightarrow}");
        // Trigger auto-completion:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYVARS, "self");
            checkExactlyOneItem(acIDSel, MYVARS, "vaz");
            checkExactlyOneItem(acIDSel, MYVARS, "param2");
            checkNoItems(acIDSel, "bar", true);
            // Go out of this call and into the main body:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}{downarrow}{downarrow}");
        }, false);
        // Make a function call and check "self, bar, vaz, param2", and the classes function, don't show there:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "self", true);
            checkNoItems(acIDSel, "bar", true);
            checkNoItems(acIDSel, "vaz", true);
            checkNoItems(acIDSel, "param2", true);
            checkNoItems(acIDSel, "__init__", true);
            checkNoItems(acIDSel, "myF", true);
            // Validated the class suggestion then move past the brackets and add point
            cy.get("body").type("{enter}");
            cy.wait(500);
            cy.get("body").type("{rightarrow}.");
        }, true);
        // Triggers the autocompletion and see that the class's function is listed
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "foo()", "myF(vaz, param2)");
        }, true);
    });

    it("Offers auto-complete for user-defined class overwriting " + ((Cypress.env("mode") == "microbit") ? "microbit's NeoPixel" : "Strype Graphics' Actor"), () => {
        const isTestingMicrobitVersion = Cypress.env("mode") == "microbit";
        const parentImport = (isTestingMicrobitVersion) ? ["neopixel", "NeoPixel"] : ["strype.graphics", "Actor"];
        const parentClassName = (isTestingMicrobitVersion) ? "NeoPixel" : "Actor";
        const parentClassInitParamsToTest = (isTestingMicrobitVersion) ? "pin, n, bpp" : "image, x, y, tag";
        const parentClassMethodWithParamsToTest = (isTestingMicrobitVersion) ? "fill(colour)" : "get_in_range(distance)";
        const parentClassMethodWithoutParamsToTest = (isTestingMicrobitVersion) ? "clear()" : "remove()";
        focusEditorAC();
        // Add the right import to get Actor or NeoPixel
        cy.get("body").type(`{uparrow}{uparrow}f${parentImport[0]}{rightarrow}${parentImport[1]}{downarrow}{downarrow}`);
        // Make a class frame with "foo(<parent class>)" and delete the init function, add a function "myF", then go to my code
        cy.get("body").type(`cfoo(${parentClassName}{downarrow}{downarrow}{del}fmyF{downarrow}{downarrow}{downarrow}{downarrow}{downarrow}`);
        // Trigger auto-completion on a function call frame:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, MYCLASSES, `foo(${parentClassInitParamsToTest})`);
            checkNoItems(acIDSel, "foo()", true);
            // Go out of this call and into the main body:
            cy.get("body").type("{backspace}");
            cy.wait(500);
            cy.get("body").type("{downarrow}{downarrow}{downarrow}");
        }, true);
        // Make a function call and check "self" doesn't show there:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoItems(acIDSel, "self", true);           
            // Validated the class suggestion then move past the brackets and add point
            cy.get("body").type("{enter}");
            cy.wait(500);
            cy.get("body").type("{rightarrow}.");
        }, true);
        // Triggers the autocompletion and see that some Actor or NeoPixel methods are listed
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "foo()", parentClassMethodWithParamsToTest);
            checkExactlyOneItem(acIDSel, "foo()", parentClassMethodWithoutParamsToTest);
            checkExactlyOneItem(acIDSel, "foo()", "myF()");
        }, true);
    });
});

