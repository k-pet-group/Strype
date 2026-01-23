require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import "../support/autocomplete-test-support";
import {checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, focusEditorAC, withAC, scssVars} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();


describe("Graphics library", () => {
    if (Cypress.env("mode") == "microbit") {
        // No graphics support in microbit mode:
        return;
    }
    it("Shows completions for graphics standalone functions", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, "strype.graphics", "load_image(name)");
            checkExactlyOneItem(acIDSel, "strype.graphics", "stop()");
            checkExactlyOneItem(acIDSel, "strype.graphics", "pause(seconds)");
            checkNoItems(acIDSel, "__name__");
            // Shouldn't show methods from Actor at top-level:
            checkNoItems(acIDSel, "is_at_edge(distance)");
            checkNoItems(acIDSel, "remove()");
        }, false);
    });

    it("Shows completions for object constructor", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, "strype.graphics", "Actor(image, x, y, tag)");
        }, false);
    });

    it("Shows completions for return of graphics load_image", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("load_image('a').{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_width()");
        }, false);
    });

    it("Shows completions for return of graphics get_background", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("get_background().{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_width()");
        }, false);
    });

    it("Shows completions for return of sound load_sound", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.sound{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("load_sound('a').{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_samples()");
        }, false);
    });

    it("Shows completions for image literal", () => {
        cy.readFile("public/graphics_images/cat-test.jpg", null).then((catJPEG) => {
            focusEditorAC();
            // Add graphics import:
            cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
            // Add a function call frame and trigger auto-complete:
            cy.get("body").type(" {del}");
            cy.wait(500);
            (cy.focused() as any).paste(catJPEG, "image/jpeg");
            cy.wait(500);
            cy.get("body").type(".");
            cy.wait(300);
            cy.get("body").type("{ctrl} ");
            cy.wait(1000);
            withAC((acIDSel, frameId) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "get_width()");
            }, false);
        });
    });

    it("Shows completions for audio literal", () => {
        cy.readFile("public/sounds/cat-test-meow.wav", null).then((catWAV) => {
            focusEditorAC();
            // Add graphics import:
            cy.get("body").type("{uparrow}{uparrow}fstrype.sound{rightarrow}*{rightarrow}{downarrow}{downarrow}");
            // Add a function call frame and trigger auto-complete:
            cy.get("body").type(" {del}");
            cy.wait(500);
            (cy.focused() as any).paste(catWAV, "audio/wav");
            cy.wait(500);
            cy.get("body").type(".");
            cy.wait(300);
            cy.get("body").type("{ctrl} ");
            cy.wait(1000);
            withAC((acIDSel, frameId) => {
                cy.get(acIDSel).should("be.visible");
                checkExactlyOneItem(acIDSel, null, "get_samples()");
            }, false);
        });
    });

    it("Shows completions for Actor methods", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an actor:
        cy.get("body").type("=a=Actor('cat-test.jpg'){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("a.{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge()");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
            checkExactlyOneItem(acIDSel, null, "get_all_touching()");
            checkExactlyOneItem(acIDSel, null, "set_location(x, y)");
            checkNoItems(acIDSel, "__name__");
            // Shouldn't show methods from top-level:
            checkNoItems(acIDSel, "stop()");
            checkNoItems(acIDSel, "pause(seconds)");
        }, false);
    });

    it("Shows completions for Image methods", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=e=Image(100, 100){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("e.{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_width()");
            checkExactlyOneItem(acIDSel, null, "fill()");
            // Shouldn't show methods from top-level:
            checkNoItems(acIDSel, "stop()");
            checkNoItems(acIDSel, "pause(seconds)");
        }, false);
    });

    it("Shows completions for Image methods on clone()", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=e=Image(100, 100){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("e.clone().{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_width()");
            checkExactlyOneItem(acIDSel, null, "fill()");
            // Shouldn't show methods from top-level:
            checkNoItems(acIDSel, "stop()");
            checkNoItems(acIDSel, "pause(seconds)");
        }, false);
    });

    it("Shows completions for Image methods on Actor.get_image()", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}fstrype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=a=Actor('blah'){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("a.get_image().{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_width()");
            checkExactlyOneItem(acIDSel, null, "fill()");
            // Shouldn't show methods from top-level:
            checkNoItems(acIDSel, "stop()");
            checkNoItems(acIDSel, "pause(seconds)");
        }, false);
    });

    it("Offers auto-complete in RHS of from...import frames", () => {
        focusEditorAC();

        // Go up to imports, add library, add import, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}f");
        cy.wait(500);
        // Fill in time in the LHS then go across to the RHS:
        cy.get("body").type("strype.graphics{rightarrow}");
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "*");
            checkExactlyOneItem(acIDSel, null, "load_image");
            checkNoItems(acIDSel, "load_image(name)"); // Shouldn't show brackets in import, even though it is a function
            // Once we type first character, should be the same:
            cy.get("body").type("load");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, null, "load_image");
            checkNoItems(acIDSel, "*");
            checkAutocompleteSorted(acIDSel, false);
            cy.get(acIDSel).contains("Load the given image");
            // Type rest of target then enter a comma:
            cy.get("body").type("_image" + ",");
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
            checkExactlyOneItem(acIDSel, null, "load_image");
            // Remove comma, to make it import just the one valid item:
            cy.get("body").type("{backspace}");
        }, false);
        // Now check in the body for docs on the autocomplete (we should be in a function call frame):
        cy.get("body").type("{rightarrow}{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "strype.graphics", "load_image(name)");
            checkNoItems(acIDSel, "pause");
            // Once we type it, should be the same:
            cy.get("body").type("load_image");
            cy.wait(600);
            // Check documentation is showing for it:
            cy.get(acIDSel).contains("Load the given image");
        }, true);
    });
});

describe("Modules from libraries", () => {
    if (Cypress.env("mode") == "microbit") {
        // No library support in microbit mode:
        return;
    }
    
    it("Offers auto-complete in import frames based on libraries", () => {
        focusEditorAC();
        // Go up to imports, add library, add import, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}lhttp://localhost:8089/test-library/{rightarrow}i");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            checkExactlyOneItem(acIDSel, null, "mediacomp");
            checkAutocompleteSorted(acIDSel, false);
        }, false);
    });

    it("Offers auto-complete in RHS of from...import frames", () => {
        focusEditorAC();

        // Go up to imports, add library, add import, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}lhttp://localhost:8089/test-library/{rightarrow}f");
        cy.wait(500);
        // Fill in time in the LHS then go across to the RHS:
        cy.get("body").type("mediacomp{rightarrow}");
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "*");
            checkExactlyOneItem(acIDSel, null, "makeSound");
            checkNoItems(acIDSel, "makeSound(path)"); // Shouldn't show brackets in import, even though it is a function
            // Once we type first character, should be the same:
            cy.get("body").type("makeSo");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, null, "makeSound");
            checkNoItems(acIDSel, "*");
            checkAutocompleteSorted(acIDSel, false);
            cy.get(acIDSel).contains("Takes a filename as input");
            // Type rest of target then enter a comma:
            cy.get("body").type("und" + ",");
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
            checkExactlyOneItem(acIDSel, null, "makeSound");
            // Remove comma, to make it import just the one valid item:
            cy.get("body").type("{backspace}");
        }, false);
        // Now check in the body for docs on the autocomplete (we should be in a function call frame):
        cy.get("body").type("{rightarrow}{downarrow}{downarrow}");
        cy.get("body").type(" {ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, "mediacomp", "makeSound(path)");
            checkNoItems(acIDSel, "makeEmptySoundBySeconds");
            // Once we type it, should be the same:
            cy.get("body").type("makeSound");
            cy.wait(600);
            // Check documentation is showing for it:
            cy.get(acIDSel).contains("Takes a filename as input");
        }, true);
    });
    
    it("Offers auto-completion for imported modules", () => {
        focusEditorAC();
        // Go up to imports, add library, add import, then trigger auto-complete:
        cy.get("body").type("{uparrow}{uparrow}lhttp://localhost:8089/test-library{rightarrow}i");
        cy.wait(500);
        // Trigger autocomplete, type "mediacom" then press enter to complete and right arrow to leave frame:
        cy.get("body").type("{ctrl} ");
        cy.get("body").type("mediacom");
        cy.wait(600);
        cy.get("body").type("{enter}{rightarrow}");
        // Back down to main body, add a function frame and type "mediacomp." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type(" mediacomp.{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // Should have time related queries, but not the standard completions:
            checkExactlyOneItem(acIDSel, "mediacomp", "makeEmptySoundBySeconds(duration)");
            checkNoItems(acIDSel, "len");
            checkNoItems(acIDSel, "abs");
            checkAutocompleteSorted(acIDSel, true);
        }, true);
    });

    it("Shows completions for return of makeSound", () => {
        focusEditorAC();
        // Add graphics import:
        cy.get("body").type("{uparrow}{uparrow}lhttp://localhost:8089/test-library{rightarrow}fmediacomp{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" ");
        cy.wait(500);
        cy.get("body").type("makeSound('a').{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_samples()");
        }, false);
    });
});
