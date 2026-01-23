require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
// Get all the beforeEach parts:
import "../support/autocomplete-test-support";
import { BUILTIN, checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, checkNoneAvailable, focusEditorAC, MYCLASSES, MYFUNCS, MYVARS, scssVars, withAC } from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();

describe("Modules", () => {
    it("Offers auto-complete in import frames", () => {
        focusEditorAC();
        // Go up to imports, add one, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}i");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            if (Cypress.env("mode") == "microbit") {
                cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkExactlyOneItem(acIDSel, null, "random");
                checkExactlyOneItem(acIDSel, null, "time");
                checkNoItems(acIDSel, "mediacomp");
                checkNoItems(acIDSel, "signal");
                // Once we type "m", should show things beginning with M but not the others:
                cy.get("body").type("m");
                cy.wait(600);
                checkExactlyOneItem(acIDSel, null, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkNoItems(acIDSel, "random");
                checkNoItems(acIDSel, "time");
                checkAutocompleteSorted(acIDSel, false);
                // Once we type "i", should show things beginning with MI but not the others:
                cy.get("body").type("i");
                cy.wait(600);
                checkNoItems(acIDSel, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkNoItems(acIDSel, "random");
                checkNoItems(acIDSel, "time");
                checkAutocompleteSorted(acIDSel, false);
                cy.get(acIDSel).contains("Pins, images, sounds, temperature and volume.");
            }
            else {
                cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkExactlyOneItem(acIDSel, null, "signal");
                checkExactlyOneItem(acIDSel, null, "webbrowser");
                checkNoItems(acIDSel, "mediacomp");
                checkNoItems(acIDSel, "microbit");
                // Once we type "a", should show things beginning with A but not the others:
                cy.get("body").type("a");
                cy.wait(500);
                checkExactlyOneItem(acIDSel, null, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkNoItems(acIDSel, "signal");
                checkNoItems(acIDSel, "webbrowser");
                checkAutocompleteSorted(acIDSel, false);
                // Once we type "r", should show things beginning with AR but not the others:
                cy.get("body").type("r");
                checkNoItems(acIDSel, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkNoItems(acIDSel, "signal");
                checkNoItems(acIDSel, "webbrowser");
                checkAutocompleteSorted(acIDSel, false);
                cy.get(acIDSel).contains("Efficient arrays of numeric values.");
            }
        }, false);
    });

    it("Offers auto-complete in LHS of from...import frames", () => {
        focusEditorAC();
        // Go up to imports, add one, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            if (Cypress.env("mode") == "microbit") {
                cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkExactlyOneItem(acIDSel, null, "random");
                checkExactlyOneItem(acIDSel, null, "time");
                checkNoItems(acIDSel, "signal");
                // Once we type "m", should show things beginning with M but not the others:
                cy.get("body").type("m");
                cy.wait(600);
                checkExactlyOneItem(acIDSel, null, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkNoItems(acIDSel, "random");
                checkNoItems(acIDSel, "time");
                checkAutocompleteSorted(acIDSel, false);
                // Once we type "i", should show things beginning with MI but not the others:
                cy.get("body").type("i");
                cy.wait(600);
                checkNoItems(acIDSel, "machine");
                checkExactlyOneItem(acIDSel, null, "microbit");
                checkNoItems(acIDSel, "random");
                checkNoItems(acIDSel, "time");
                checkAutocompleteSorted(acIDSel, false);
            }
            else {
                cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkExactlyOneItem(acIDSel, null, "signal");
                checkExactlyOneItem(acIDSel, null, "webbrowser");
                checkNoItems(acIDSel, "microbit");
                // Once we type "a", should show things beginning with A but not the others:
                cy.get("body").type("a");
                cy.wait(500);
                checkExactlyOneItem(acIDSel, null, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkNoItems(acIDSel, "signal");
                checkNoItems(acIDSel, "webbrowser");
                checkAutocompleteSorted(acIDSel, false);
                // Once we type "r", should show things beginning with AR but not the others:
                cy.get("body").type("r");
                checkNoItems(acIDSel, "antigravity");
                checkExactlyOneItem(acIDSel, null, "array");
                checkNoItems(acIDSel, "signal");
                checkNoItems(acIDSel, "webbrowser");
                checkAutocompleteSorted(acIDSel, false);
            }
        }, false);
    });

    it("Offers auto-complete in RHS of from...import frames", () => {
        focusEditorAC();

        const target = Cypress.env("mode") == "microbit" ? "ticks_add" : "gmtime";
        const targetParams = Cypress.env("mode") == "microbit" ? "(ticks, delta)" : "()";
        const nonAvailable = Cypress.env("mode") == "microbit" ? "gmtime" : "ticks_add";
        const targetDoc = Cypress.env("mode") == "microbit" ? "Offset ticks value by a given number, which can be either positive or negative." : "Convert seconds since the Epoch to a time tuple expressing UTC";

        // Go up to imports, add one, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        // Fill in time in the LHS then go across to the RHS:
        cy.get("body").type("time{rightarrow}");
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "*");
            checkExactlyOneItem(acIDSel, null, target);
            checkNoItems(acIDSel, target + targetParams); // Shouldn't show brackets in import, even though it is a function
            checkNoItems(acIDSel, nonAvailable);
            // Once we type first character, should be the same:
            cy.get("body").type(target.at(0) || "");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, null, target);
            checkNoItems(acIDSel, nonAvailable);
            checkNoItems(acIDSel, "*");
            checkAutocompleteSorted(acIDSel, false);
            cy.get(acIDSel).contains(targetDoc);
            // Type rest of target then enter a comma:
            cy.get("body").type(target.substring(1) + ",");
            cy.wait(500);
            // That should have dismissed the autocomplete and put us in a new slot:
            cy.get(acIDSel).should("not.be.visible");
        }, false);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        // We can check same item again; we don't deduplicate based on what is already imported:
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "*");
            checkExactlyOneItem(acIDSel, null, target);
            checkNoItems(acIDSel, nonAvailable);
            // Once we type first character, should be the same:
            cy.get("body").type(target.at(0) || "");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, null, target);
            checkNoItems(acIDSel, nonAvailable);
            checkNoItems(acIDSel, "*");
            checkAutocompleteSorted(acIDSel, false);
            cy.get(acIDSel).contains(targetDoc);
            // Remove character and comma, to make it import just the one valid item:
            cy.get("body").type("{backspace}{backspace}");
        }, false);
        // Now check in the body for docs on the autocomplete (we should be in a function call frame):
        cy.get("body").type("{rightarrow}{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "time", target + targetParams);
            checkNoItems(acIDSel, nonAvailable);
            // Once we type first character, should be the same:
            cy.get("body").type(target);
            cy.wait(600);
            checkExactlyOneItem(acIDSel, "time", target + targetParams);
            checkNoItems(acIDSel, nonAvailable);
            checkNoItems(acIDSel, "*");
            checkAutocompleteSorted(acIDSel, true);
            // Check documentation is showing for it:
            cy.get(acIDSel).contains(targetDoc);
        }, true);
    });

    it("Offers auto-completion for imported modules", () => {
        // This works on microbit without using Skulpt because we have special cases to look up microbit in our precalculated JSON        
        focusEditorAC();
        // Go up to imports and add an import frame:
        cy.get("body").type("{uparrow}{uparrow}i");
        cy.wait(500);
        // Trigger autocomplete, type "tim" then press enter to complete and right arrow to leave frame:
        cy.get("body").type("{ctrl} ");
        cy.get("body").type("tim");
        cy.wait(600);
        cy.get("body").type("{enter}{rightarrow}");
        // Back down to main body, add a function frame and type "time." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" time.{ctrl} ");
        withAC((acIDSel) => {
            // Microbit and Python have different items in the time module, so pick accordingly:
            const target = Cypress.env("mode") == "microbit" ? "ticks_add(ticks, delta)" : "gmtime()";
            const nonAvailable = Cypress.env("mode") == "microbit" ? "gmtime()" : "ticks_add(ticks, delta)";
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should have time related queries, but not the standard completions:
            checkExactlyOneItem(acIDSel, "time", target);
            checkNoItems(acIDSel, nonAvailable);
            // TODO: revert to "sleep(seconds)" for microbit when we fix TP 
            checkExactlyOneItem(acIDSel, "time", Cypress.env("mode") === "microbit" ? "sleep(object)" : "sleep()");
            checkNoItems(acIDSel, "abs");
            checkNoItems(acIDSel, "AssertionError");
            // Type first letter of the target:
            cy.get("body").type(target.at(0) || "");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, "time", target);
            checkNoItems(acIDSel, "sleep");
            checkNoItems(acIDSel, "abs");
            checkNoItems(acIDSel, "AssertionError");
            checkAutocompleteSorted(acIDSel, true);
        }, true);
    });

    it("Offers auto-completion for imported modules with a from import *", () => {
        focusEditorAC();
        // Go up to the imports and add a "from..import.." frame
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        // Trigger autocomplete (in first section), type "tim" and hit enter to auto-complete, then right arrow to go across to the second part of the frame:
        cy.get("body").type("{ctrl} ");
        cy.get("body").type("tim");
        cy.wait(600);
        cy.get("body").type("{enter}{rightarrow}");
        // Put * in the second bit, then back down to main section, make a function frame and hit auto-complete:
        cy.get("body").type("*{rightarrow}");
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            // Microbit and Python have different items in the time module, so pick accordingly:
            const target = Cypress.env("mode") == "microbit" ? "ticks_add(ticks, delta)" : "gmtime()";
            const nonAvailable = Cypress.env("mode") == "microbit" ? "gmtime" : "ticks_add";
            const sleepCall = Cypress.env("mode") == "microbit" ? "sleep_ms(ms)" : "sleep()";
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should have time related queries, but not the standard completions:
            checkExactlyOneItem(acIDSel, "time", target);
            checkNoItems(acIDSel, nonAvailable);
            checkNoItems(acIDSel, "__name__");
            checkExactlyOneItem(acIDSel, "time", sleepCall);
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
            cy.get("body").type(target.at(0) || "");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, "time", target);
            checkNoItems(acIDSel, sleepCall);
            checkNoItems(acIDSel, "abs", true);
            checkNoItems(acIDSel, "AssertionError");
            checkAutocompleteSorted(acIDSel, true);
        }, true);
    });
});


describe("Versions", () => {
    if (Cypress.env("mode") == "microbit") {
        it("Shows versions for relevant modules on function autocomplete", () => {
            focusEditorAC();
            // Add a function frame and trigger auto-complete:
            cy.get("body").type(" ");
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "compass");
                checkExactlyOneItem(acIDSel, null, "speaker");
                cy.get(acIDSel + " li:contains('compass') > .api-item-version:contains('v2')").should("not.exist");
                cy.get(acIDSel + " li:contains('speaker') > .api-item-version:contains('v2')").should("exist");
            }, true);
        });
    }
});

describe("Nested modules", () => {
    // Technically, microbit.accelerometer is a nested object not a nested module, but I think
    // in terms of the autocomplete tests here, it should function in exactly the same way: 
    const targetModule = Cypress.env("mode") == "microbit" ? "microbit.accelerometer" : "urllib.request";
    const targetFunction = Cypress.env("mode") == "microbit" ? "get_x" : "urlopen";
    const targetFunctionWithParam = Cypress.env("mode") == "microbit" ? "get_x()" : "urlopen(url, data, timeout, cafile, capath, cadefault, context)";

    it("Offers auto-completion for modules with names a.b when imported as a.b", () => {
        // This works on microbit without using Skulpt because we have special cases to look up microbit in our precalculated JSON
        focusEditorAC();
        // Go up to imports and add an import frame:
        cy.get("body").type("{uparrow}{uparrow}i");
        cy.wait(500);
        // Type whole module as one item:
        cy.get("body").type(targetModule);
        cy.get("body").type("{rightarrow}");
        // Back down to main body, add a function frame and type "<submodule>." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" " + targetModule + ".{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // The modules we are retrieving are generated in our API files (see changes of commit 3073c074090c68dfb5cfc633686aa3916e55f0ca),
            // therefore, we will have the parameters in the autocompletion data.
            checkExactlyOneItem(acIDSel, targetModule, targetFunctionWithParam);
            checkNoItems(acIDSel, "abs");
        }, true);
    });

    it("Offers auto-completion for modules with names a.b when imported as a.b.* with from", () => {
        focusEditorAC();
        // Go up to imports and add a from import frame:
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        // Type whole module as one item:
        cy.get("body").type(targetModule);
        cy.get("body").type("{rightarrow}*{rightarrow}");
        // Back down to main body, add a function frame and type "<submodule>." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, targetModule, targetFunctionWithParam);
            checkExactlyOneItem(acIDSel, null, "abs(x)");
        }, true);
    });

    it("Offers auto-completion for modules with names a.b when imported as a.b.func with from", () => {
        focusEditorAC();
        // Go up to imports and add a from import frame:
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        // Type whole module as one item:
        cy.get("body").type(targetModule);
        cy.get("body").type("{rightarrow}" + targetFunction + "{rightarrow}");
        // Back down to main body, add a function frame and type "<submodule>." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, targetModule, targetFunctionWithParam);
            checkExactlyOneItem(acIDSel, null, "abs(x)");
        }, true);
    });

    it("Deals with different microbit items correctly", () => {
        if (Cypress.env("mode") == "microbit") {
            // In microbit, compass is a module microbit.compass, but it is also reexported by the microbit
            // module.  So if you do "from microbit import *" as we do by default, you should see compass.
            // Whereas button_a is an object in that module, but that should also be visible with the default import:
            focusEditorAC();
            // Add a function frame and trigger auto-complete:
            cy.get("body").type(" ");
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, "microbit", "button_a");
                checkExactlyOneItem(acIDSel, "microbit", "compass");
                checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            }, true);
            // Now let's delete the import and check they both vanish:
            cy.get("body").type("{leftarrow}{uparrow}{uparrow}{backspace}{downarrow}{downarrow}");
            // Enter frame again:
            cy.get("body").type(" ");
            cy.wait(500);
            cy.get("body").type("{ctrl} ");
            withAC((acIDSel) => {
                cy.get(acIDSel).should("be.visible");
                checkNoItems(acIDSel, "button_a");
                checkNoItems(acIDSel, "compass");
                checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            }, true);
        }
    });
});

describe("Imported items", () => {
    const targetModule = "time";
    const targetFunction = Cypress.env("mode") == "microbit" ? "ticks_add(ticks, delta)" : "gmtime()";

    it("Doesn't offer auto-complete when module is not imported", () => {
        focusEditorAC();
        cy.get("body").type(" " + targetModule + ".{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should show nothing available if we haven't imported the module:
            checkNoneAvailable(acIDSel);
            checkNoItems(acIDSel, targetFunction);
        }, true, true);
    });

    it("Offers auto-complete when module is imported", () => {
        focusEditorAC();
        // Go up to imports and add an import frame:
        cy.get("body").type("{uparrow}{uparrow}i");
        cy.wait(500);
        // Type whole module as one item:
        cy.get("body").type(targetModule);
        cy.get("body").type("{rightarrow}");
        // Back down to main body, add a function frame and type "<submodule>." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" " + targetModule + ".{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should show because it's imported:
            checkExactlyOneItem(acIDSel, targetModule, targetFunction);
            checkNoItems(acIDSel, "abs");
        }, true);
    });

    it("Doesn't offer auto-complete on original name when module is imported using as", () => {
        focusEditorAC();
        // Go up to imports and add an import frame:
        cy.get("body").type("{uparrow}{uparrow}i");
        cy.wait(500);
        // Space bar alone should give us the "as", so this imports as "t":
        cy.get("body").type(targetModule + " t{rightarrow}");
        // Back down to main body, add a function frame and type "<module>." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" " + targetModule + ".{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should show nothing available if we haven't imported the module itself, only used a from:
            checkNoneAvailable(acIDSel);
            checkNoItems(acIDSel, targetFunction);
        }, true, true);
        // Then if we delete back to "t" and type ".":
        cy.get("body").type("{backspace}{backspace}{backspace}{backspace}.{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should show because we're using the correct alias now:
            checkExactlyOneItem(acIDSel, "t", targetFunction);
            checkNoItems(acIDSel, "abs");
        }, true);
    });
});

describe("Underscore handling", () => {
    const importFunc = Cypress.env("mode") === "microbit" ? "__import__(name, globals, locals, fromlist, level)" : "__import__(name)";

    it("Does not offer underscore items at top-level until typed", () => {
        focusEditorAC();
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
            checkNoItems(acIDSel, "__doc__");
            checkNoItems(acIDSel, "__import__");
            checkNoItems(acIDSel, "__name__");
            // Once we type "_", should show things beginning with _ but not the others:
            cy.get("body").type("_");
            cy.wait(600);
            checkNoItems(acIDSel, "abs(x)");
            checkNoItems(acIDSel, "AssertionError");
            checkExactlyOneItem(acIDSel, BUILTIN, importFunc);
            checkAutocompleteSorted(acIDSel, true);
            // Check docs are showing for built-in function:
            cy.get(acIDSel).contains("Import a module.");
        }, true);
    });
    // Python rules say we never import anything with underscores from modules with import *:
    it("Does not offer underscore items on modules at all", () => {
        // Go up to imports and add a from time import *
        cy.get("body").type("{uparrow}{uparrow}ftime{rightarrow}*{rightarrow}");
        cy.get("body").type("{downarrow}{downarrow}");

        focusEditorAC();
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, "AssertionError()");
            checkExactlyOneItem(acIDSel, "time", Cypress.env("mode") == "microbit" ? "ticks_add(ticks, delta)" : "gmtime()");
            checkNoItems(acIDSel, "__doc__");
            checkNoItems(acIDSel, "__import__");
            checkNoItems(acIDSel, "__name__");
            // Once we type "_", should show things beginning with _ but not the others:
            cy.get("body").type("_");
            cy.wait(600);
            checkNoItems(acIDSel, "abs(x)");
            checkNoItems(acIDSel, "AssertionError");
            checkNoItems(acIDSel, "gmtime");
            checkNoItems(acIDSel, "ticks_add");
            checkExactlyOneItem(acIDSel, BUILTIN, importFunc);
            checkNoItems(acIDSel, "__doc__");
            checkNoItems(acIDSel, "__name__");
            checkAutocompleteSorted(acIDSel, true);
            // Now cancel this:
            cy.get("body").type("{backspace}{backspace}");
        }, true);
    });
    /* TODO restore once TigerPython supports these items:
    it("Does not offer underscore items on object until typed", () => {
        focusEditorAC();
        // Add a string variable named myVar:
        cy.get("body").type("=myVar=\"hi{enter}");
        // Add a function frame and trigger auto-complete on myVar.:
        cy.get("body").type(" myVar.");
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, "myVar", "upper()");
            checkNoItems(acIDSel, "__doc__");
            checkNoItems(acIDSel, "__import__");
            checkNoItems(acIDSel, "__name__");
            // Once we type "_", should show things beginning with _ but not the others:
            cy.get("body").type("_");
            checkNoItems(acIDSel, "upper");
            checkExactlyOneItem(acIDSel, "myVar", "__doc__");
            checkNoItems(acIDSel, "__doc__()"); // Not a function, so shouldn't be a bracket
            checkExactlyOneItem(acIDSel, "myVar", "__dir__()");
            checkExactlyOneItem(acIDSel, "myVar", "__class__()");
            cy.get("body").type("_dir");
            cy.wait(600);
            checkAutocompleteSorted(acIDSel, true);
            // Check docs are showing for built-in function:
            cy.get(acIDSel).contains("Default dir() implementation.");
        }, true);
    });
     */
    it("Offers user's own definitions, even if they start with underscores", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "__myFunction" then come down the function definition:
        cy.get("body").type("{uparrow}f__myFunction{rightarrow}myParam{downarrow}{downarrow}{downarrow}");
        // Make a class called _myClass then come back down the "my code" section
        cy.get("body").type("c__myClass{downarrow}{downarrow}{downarrow}{downarrow}{downarrow}{downarrow}");
        // Make a variable called __myVar:
        cy.get("body").type("=__myVar=42{enter}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, BUILTIN, "abs(x)");
            checkNoItems(acIDSel, "__doc__");
            checkNoItems(acIDSel, "__import__");
            checkNoItems(acIDSel, "__name__");
            checkExactlyOneItem(acIDSel, MYFUNCS,"__myFunction(myParam)");
            checkExactlyOneItem(acIDSel, MYCLASSES,"__myClass()");
            checkExactlyOneItem(acIDSel, MYVARS, "__myVar");
            checkNoItems(acIDSel, "__myVar()");
            // Once we type "_", should show things beginning with _ but not the others:
            cy.get("body").type("_");
            cy.wait(600);
            checkNoItems(acIDSel, "abs(x)");
            checkExactlyOneItem(acIDSel, BUILTIN, importFunc);
            checkExactlyOneItem(acIDSel, MYFUNCS, "__myFunction(myParam)");
            checkExactlyOneItem(acIDSel, MYCLASSES,"__myClass()");
            checkExactlyOneItem(acIDSel, MYVARS, "__myVar");
            checkAutocompleteSorted(acIDSel, true);
        }, true);
    });
});
