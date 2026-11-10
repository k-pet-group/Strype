import { scssVars } from "../support/standard-setup";
import {clearDefaultImports, pressFrameShortcut, pressFrameShortcutThenType, waitForEditorSettled} from "../support/test-support";

require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import "../support/autocomplete-test-support";
import {checkAutocompleteSorted, checkExactlyOneItem, checkNoItems, focusEditorAC, withAC} from "../support/autocomplete-test-support";

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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function frame and trigger auto-complete:
        // Ctrl+Space at the bare frame caret creates an empty func-call frame and triggers
        // autocomplete in it in one go (see Commands.vue's Ctrl+Space handler):
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function frame and trigger auto-complete:
        // Ctrl+Space at the bare frame caret creates an empty func-call frame and triggers
        // autocomplete in it in one go (see Commands.vue's Ctrl+Space handler):
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, "strype.graphics", "Actor(image, x, y, tag)");
        }, false);
    });

    it("Shows completions for return of graphics load_image", () => {
        focusEditorAC();
        // Add graphics import:
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.sound{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" c");
        cy.wait(500);
        cy.get("body").type("load_sound('a').{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_samples()");
        }, false);
    });

    it("Shows completions for image literal", () => {
        cy.readFile("src/assetsFilesystem/images/cat-test.jpg", null).then((catJPEG) => {
            focusEditorAC();
            // Add graphics import:
            clearDefaultImports();
            pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
            // Add a function call frame and trigger auto-complete:
            cy.get("body").type(" c");
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
                checkExactlyOneItem(acIDSel, null, "draw_image(image, x, y)");
                checkExactlyOneItem(acIDSel, null, "clone(scale, rotate, flip)");
                checkExactlyOneItem(acIDSel, null, "draw_circle(centre_x, centre_y, radius)");
            }, false);
        });
    });

    it("Shows completions for audio literal", () => {
        cy.readFile("src/assetsFilesystem/sounds/meow.wav", null).then((catWAV) => {
            focusEditorAC();
            // Add graphics import:
            clearDefaultImports();
            pressFrameShortcutThenType("f", "strype.sound{rightarrow}*{rightarrow}{downarrow}{downarrow}");
            // Add a function call frame and trigger auto-complete:
            cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an actor:
        cy.get("body").type("=a=Actor('cat-test.jpg'){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" c");
        cy.wait(500);
        cy.get("body").type("a.{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
            checkExactlyOneItem(acIDSel, null, "get_all_touching(tag)");
            checkExactlyOneItem(acIDSel, null, "set_location(x, y)");
            checkNoItems(acIDSel, "__name__");
            // Shouldn't show methods from top-level:
            checkNoItems(acIDSel, "stop()");
            checkNoItems(acIDSel, "pause(seconds)");
            // Narrow down to exactly one method and check its documentation shows.
            // (This is a regression test: documentation for methods on library classes
            // like Actor used to be missing entirely, because the .py to .pyi conversion
            // used to register strype.graphics with the autocomplete engine stripped out
            // all docstrings.)
            cy.get("body").type("set_loc");
            cy.wait(600);
            checkExactlyOneItem(acIDSel, null, "set_location(x, y)");
            cy.get(acIDSel).contains("Set the location of the actor.");
        }, false);
    });

    it("Shows completions for an element of a get_actors() list (blocked on TigerPython list[T] support)", () => {
        focusEditorAC();
        // Add graphics import:
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an actor, then fetch the list of all actors:
        cy.get("body").type("=a=Actor('cat-test.jpg'){rightarrow}");
        cy.get("body").type("=all_actors=get_actors(){rightarrow}");
        // Add a function frame and trigger auto-complete after indexing into the list:
        cy.get("body").type(" c");
        cy.wait(500);
        cy.get("body").type("all_actors[0].{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false);
    });

    it("Shows completions for the result of pop() on a list of actors (regression test for #1003)", () => {
        focusEditorAC();
        // Add graphics import:
        clearDefaultImports();
        cy.get("body").type("from strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an actor, then fetch the list of all actors:
        cy.get("body").type(" =a=Actor('cat-test.jpg')");
        cy.get("body").type("{rightarrow}");
        waitForEditorSettled();
        cy.get("body").type(" =all_actors=get_actors()");
        cy.get("body").type("{rightarrow}");
        waitForEditorSettled();
        cy.get("body").type("all_actors.pop().");
        waitForEditorSettled();
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
            // pop() should be inferred as returning an Actor (the list's item type), not a
            // list -- Actor.remove() takes no arguments, but list.remove(x) requires one, so
            // seeing "remove()" here (and not "remove(x)") confirms pop() wasn't confused
            // with list.pop():
            checkExactlyOneItem(acIDSel, null, "remove()");
            checkNoItems(acIDSel, "remove(x)", true);
        }, false);
    });

    it("Shows completions for the result of get_actor_at() (blocked on TigerPython Optional/union return type support)", () => {
        focusEditorAC();
        // Add graphics import:
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an actor so that there is something for get_actor_at to find:
        cy.get("body").type("=a=Actor('cat-test.jpg'){rightarrow}");
        // Add a function frame and trigger auto-complete on the (Actor | None) result:
        cy.get("body").type(" c");
        cy.wait(500);
        cy.get("body").type("get_actor_at(0,0).{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false);
    });

    it("Shows completions for Image methods", () => {
        focusEditorAC();
        // Add graphics import:
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=e=Image(100, 100){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=e=Image(100, 100){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Make an image:
        cy.get("body").type("=a=Actor('blah'){rightarrow}");
        // Add a function frame and trigger auto-complete:
        cy.get("body").type(" c");
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
        clearDefaultImports();
        pressFrameShortcut("f");
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
            cy.get(acIDSel + ":visible").should("not.exist");
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
        // Ctrl+Space at the bare frame caret creates an empty func-call frame and triggers
        // autocomplete in it in one go (see Commands.vue's Ctrl+Space handler):
        cy.get("body").type("{ctrl} ");
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
        clearDefaultImports();
        pressFrameShortcutThenType("l", "http://localhost:8089/test-library/{rightarrow}");
        pressFrameShortcut("i");
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
        clearDefaultImports();
        pressFrameShortcutThenType("l", "http://localhost:8089/test-library/{rightarrow}");
        pressFrameShortcut("f");
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
            cy.get(acIDSel + ":visible").should("not.exist");
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
        // Ctrl+Space at the bare frame caret creates an empty func-call frame and triggers
        // autocomplete in it in one go (see Commands.vue's Ctrl+Space handler):
        cy.get("body").type("{ctrl} ");
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
        clearDefaultImports();
        pressFrameShortcutThenType("l", "http://localhost:8089/test-library{rightarrow}");
        pressFrameShortcut("i");
        cy.wait(500);
        // Trigger autocomplete, type "mediacom" then press enter to complete and right arrow to leave frame:
        cy.get("body").type("{ctrl} ");
        cy.get("body").type("mediacom");
        cy.wait(600);
        cy.get("body").type("{enter}{rightarrow}");
        // Back down to main body, add a function frame and type "mediacomp." then trigger auto-complete:
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type("mediacomp.{ctrl} ");
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
        clearDefaultImports();
        pressFrameShortcutThenType("l", "http://localhost:8089/test-library{rightarrow}");
        pressFrameShortcutThenType("f", "mediacomp{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        // Add a function call frame and trigger auto-complete:
        cy.get("body").type(" c");
        cy.wait(500);
        cy.get("body").type("makeSound('a').{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "get_samples()");
        }, false);
    });
});
