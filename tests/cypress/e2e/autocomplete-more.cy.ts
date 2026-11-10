import { scssVars } from "../support/standard-setup";
import {clearDefaultImports, pressFrameShortcut, pressFrameShortcutThenType, waitForEditorSettled} from "../support/test-support";

require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
// Get all the beforeEach parts:
import "../support/autocomplete-test-support";
import {checkExactlyOneItem, checkNoItems, checkNoneAvailable, focusEditorAC, MYVARS, withAC} from "../support/autocomplete-test-support";

// Needed for the "be.sorted" assertion:
chai.use(require("chai-sorted"));
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();


describe("Control flow", () => {
    it("Offers auto-complete for return of input() function", () => {
        focusEditorAC();
        // Go up to functions section, add a function named "foo", a description "bar", then go into body:
        cy.get("body").type("{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}{rightarrow}bar{downarrow}");
        cy.get("body").type("=level=input('Choose a level between 1 and 6:'){downarrow}");
        pressFrameShortcutThenType("i", "level.");
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
        cy.get("body").type("{downarrow}");
        pressFrameShortcutThenType("f", "index,val{rightarrow}enumerate(myString){rightarrow}  ");
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
        cy.get("body").type("{uparrow}");
        pressFrameShortcut("f");
        cy.get("body").type("getGuess{rightarrow}alreadyGuessed{rightarrow}{downarrow}");
        cy.get("body").type("=guess=input('Guess a letter:'){downarrow}");
        pressFrameShortcut("i");
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
        cy.get("body").type("{uparrow}");
        pressFrameShortcutThenType("f", "getGuess{rightarrow}alreadyGuessed{rightarrow}{downarrow}");
        cy.get("body").type("=guess=input('Guess a letter:'){downarrow}");
        pressFrameShortcut("i");
        cy.get("body").type("guess==''{downarrow}");
        pressFrameShortcut("l");
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

describe("Function params: types inferred from callers", () => {
    // TigerPython can infer the type of an untyped function/method parameter by looking at
    // the arguments used at its call sites elsewhere in the code, so member completion inside
    // the body can work even though the parameter has no annotation or default value.
    it("Shows string members for a top-level function param, inferred from a caller", () => {
        focusEditorAC();
        // A caller elsewhere in "My code" gives evidence that s is a string:
        cy.get("body").type("foo(\"hi\"){enter}");
        // Go up to functions section and define foo(s):
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}s{rightarrow}{downarrow}");
        cy.get("body").type("s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
            checkExactlyOneItem(acIDSel, null, "upper()");
        }, false, true);
    });

    it("Shows int members (not string members) for a top-level function param, inferred from a caller", () => {
        focusEditorAC();
        cy.get("body").type("foo(5){enter}");
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}n{rightarrow}{downarrow}");
        cy.get("body").type("n.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "bit_length()");
            checkNoItems(acIDSel, "lower()");
            checkNoItems(acIDSel, "upper()");
        }, false, true);
    });

    it("Shows no completions for a top-level function param called with mixed types", () => {
        focusEditorAC();
        // Two callers give conflicting evidence (str and int), which share no members:
        cy.get("body").type("foo(\"hi\"){enter}");
        cy.get("body").type("foo(5){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}s{rightarrow}{downarrow}");
        cy.get("body").type("s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoneAvailable(acIDSel);
        }, false, true);
    });

    // TigerPython only picks up call-site evidence for a parameter's type when the call is textually
    // *after* the callee's own definition -- confirmed directly against the installed
    // @tigerpython/tpparser package: the same class, with only the two methods' order swapped, goes
    // from 0 completions to resolving correctly. For top-level functions this is never an issue,
    // since Strype always generates "Definitions" before "My code", so a call in My code is always
    // after its definition; but *within* a class body, methods are emitted in whatever order the user
    // added them, so a sibling method that calls another one has to be defined after it for that call
    // to count as evidence. These tests define the callee (myF) before the sibling caller (helper)
    // for that reason. (This may be related to the separate, more precisely diagnosed limitation
    // covered below, in "Function params: types inferred from callers (Actor, multiple params)":
    // TigerPython can't resolve the type of a call argument that is itself a "My code" variable
    // assigned after the point where "Definitions" -- which is generated in the same order it appears
    // in the editor -- uses it, even though it can forward-reference a plain variable's own type.)
    it("Shows string members for a class method param, inferred from a sibling method caller", () => {
        focusEditorAC();
        // Make a class frame "foo" (default __init__(self, bar)), myF(self, s) itself, then a
        // "helper" method (defined after myF) calling myF with a string:
        cy.get("body").type("{uparrow}");
        pressFrameShortcut("c");
        cy.get("body").type("foo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("myF{rightarrow}s{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("helper{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("self.myF(\"hi\"){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
            checkExactlyOneItem(acIDSel, null, "upper()");
        }, false, true);
    });

    it("Shows int members (not string members) for a class method param, inferred from a sibling method caller", () => {
        focusEditorAC();
        cy.get("body").type("{uparrow}");
        pressFrameShortcut("c");
        cy.get("body").type("foo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("myF{rightarrow}n{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("helper{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("self.myF(5){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}n.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "bit_length()");
            checkNoItems(acIDSel, "lower()");
        }, false, true);
    });

    it("Shows no completions for a class method param called with mixed types", () => {
        focusEditorAC();
        cy.get("body").type("{uparrow}");
        pressFrameShortcut("c");
        cy.get("body").type("foo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("myF{rightarrow}s{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("helper{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("self.myF(\"hi\"){enter}");
        cy.get("body").type("self.myF(5){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}{uparrow}s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoneAvailable(acIDSel);
        }, false, true);
    });
});

describe("Function params: types inferred from callers (Actor, multiple params)", () => {
    if (Cypress.env("mode") === "microbit") {
        // Actor is part of strype.graphics, not available in microbit mode:
        return;
    }

    it("Shows Actor members for a top-level function param, inferred from a caller", () => {
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        pressFrameShortcutThenType("=", "myActor=Actor(\"cat-test.jpg\",0,0,\"t\"){enter}");
        cy.get("body").type("foo(myActor){enter}");
        waitForEditorSettled();
        cy.get("body").type("{uparrow}{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}a{rightarrow}{downarrow}");
        cy.get("body").type("a.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false, true);
    });

    it("Infers 3+ top-level function params independently from a single caller", () => {
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        pressFrameShortcutThenType("=", "myActor=Actor(\"cat-test.jpg\",0,0,\"t\"){enter}");
        // One caller gives evidence for all 3 params at once (string, int, Actor):
        cy.get("body").type("foo(\"hi\",5,myActor){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}s,n,a{rightarrow}{downarrow}");
        cy.get("body").type("s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
        }, false, true);
        // Close the popup and move to the next parameter's check on the next line:
        cy.get("body").type("{esc}");
        cy.get("body").type("{downarrow}");
        cy.get("body").type("n.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "bit_length()");
            checkNoItems(acIDSel, "lower()");
        }, false, true);
        cy.get("body").type("{esc}");
        cy.get("body").type("{downarrow}");
        cy.get("body").type("a.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false, true);
    });

    // This is the exact shape of the bug found in the "particles.spy" example (public/demos/graphics):
    // a for-loop variable drawn from get_actors() is passed as a call argument, meant to give the
    // callee's own parameter its Actor type. This is NOT a TigerPython limitation: getCodeWithoutErrors()
    // in parser.ts generates code for autocomplete with `excludeComments: true`, which
    // (see parseBlock()'s `passBlock` handling) omits a for/while loop's own header line entirely from the
    // generated code while still including its body content (unindented, as if it were never in a loop).
    // So whenever the frame being completed is itself inside a loop, or evidence for the completion (e.g.
    // a call site) sits inside a loop, that loop's header -- the only place informing TigerPython what the
    // loop variable actually is -- is missing from what TigerPython gets to see. Confirmed directly: adding
    // a temporary console.log of the exact `totalCode` string sent to TPyParser.autoCompleteExt() (see
    // AutoCompletion.vue's buildTotalCodeAndOffset call) showed "for p in get_actors():" is simply absent,
    // leaving the probe as `___strype_ac_probe_wrap___(p.___strype_ac_probe_ident___)` with `p` an
    // undefined bare name. Swapping the for-loop for a plain variable assignment + indexing (see
    // "Shows completions for an element of a get_actors() list" above) avoids the loop entirely and works
    // fine, confirming the loop-exclusion (not list[T] support, and not TigerPython at all) is the cause.
    // This needs a Strype-side fix in parser.ts, not an upstream TigerPython report.
    it("Shows Actor members for a top-level function param, inferred from a get_actors() for-loop variable (blocked by Strype's loop-exclusion in getCodeWithoutErrors(), not TigerPython)", () => {
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        pressFrameShortcutThenType("=", "a=Actor(\"cat-test.jpg\",0,0,\"t\"){enter}");
        pressFrameShortcutThenType("f", "p{rightarrow}get_actors(){rightarrow}foo(p){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}x{rightarrow}{downarrow}");
        cy.get("body").type("x.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false, true);
    });

    // Simpler, more direct isolation of the same root cause as above -- no extra function-call
    // indirection, just completing directly on the for-loop variable itself:
    it("Shows Actor members for a get_actors() for-loop variable directly (blocked by Strype's loop-exclusion in getCodeWithoutErrors(), not TigerPython)", () => {
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        pressFrameShortcutThenType("f", "p{rightarrow}get_actors(){rightarrow}p.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "is_at_edge(distance)");
            checkExactlyOneItem(acIDSel, null, "move(distance)");
        }, false, true);
    });

    it("Shows no completions for a class method param whose sibling-caller evidence is a 'My code' variable", () => {
        // myActor is assigned in "My code", which -- matching the editor's actual section order -- is
        // generated after "Definitions". TigerPython can forward-reference a plain variable's own type
        // (see "Global variable type inference inside functions" below), but not the type of a variable
        // passed as a call argument when inferring the callee's parameter type from that call site: the
        // argument's assignment has to come first. See getCodeWithoutErrors() in parser.ts. (myF is
        // defined before helper -- see the comment above "Function params: types inferred from
        // callers" -- so that this test isolates the "My code" variable limitation on its own, rather
        // than also tripping the separate call-must-be-after-definition ordering requirement.)
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        cy.get("body").type("=myActor=Actor(\"cat-test.jpg\",0,0,\"t\"){enter}");
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcut("c");
        cy.get("body").type("foo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("myF{rightarrow}a{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("helper{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("self.myF(myActor){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}a.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoneAvailable(acIDSel);
        }, false, true);
    });

    it("Infers 3+ class method params independently from a single sibling method caller", () => {
        focusEditorAC();
        clearDefaultImports();
        pressFrameShortcutThenType("f", "strype.graphics{rightarrow}*{rightarrow}{downarrow}{downarrow}");
        cy.get("body").type("=myActor=Actor(\"cat-test.jpg\",0,0,\"t\"){enter}");
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcut("c");
        cy.get("body").type("foo{downarrow}{downarrow}{downarrow}{leftarrow}{leftarrow}bar{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("myF{rightarrow}s,n,a{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcut("f");
        cy.get("body").type("helper{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("self.myF(\"hi\",5,myActor){enter}");
        cy.get("body").type("{uparrow}{uparrow}{uparrow}s.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
        }, false, true);
        cy.get("body").type("{esc}");
        cy.get("body").type("{downarrow}");
        cy.get("body").type("n.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "bit_length()");
            checkNoItems(acIDSel, "lower()");
        }, false, true);
        cy.get("body").type("{esc}");
        cy.get("body").type("{downarrow}");
        cy.get("body").type("a.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        // Unlike s and n above (literal call-site arguments), myActor is a "My code" variable -- see the
        // "Shows no completions for a class method param whose sibling-caller evidence is a 'My code'
        // variable" test above for why this specific combination doesn't currently work.
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkNoneAvailable(acIDSel);
        }, false, true);
    });
});

describe("Global variable type inference inside functions", () => {
    // Code is generated for autocomplete in the same section order it appears in the editor (imports,
    // then Definitions, then "My code"), yet a function can still see the type of a variable assigned
    // later in "My code": TigerPython forward-references a plain variable's own assignment regardless
    // of which direction it's textually offset in. (This is unlike the narrower case in "Function
    // params: types inferred from callers (Actor, multiple params)" above, where the variable isn't
    // looked up directly but is instead passed as a call argument used to infer a callee's parameter
    // type -- that specific, more indirect kind of forward reference isn't resolved by TigerPython.)
    // These two tests check the direct case: one with the variable declared "global" in the function
    // first (as real Python requires if you want to *assign* to it), one without (valid Python too,
    // since merely *reading* a global from inside a function never requires the "global" keyword --
    // it's only needed for assignment).
    it("Shows string members for a variable declared 'global' in a function, assigned in My code", () => {
        focusEditorAC();
        // Assign a = "hi" in "My code":
        cy.get("body").type("=a=\"hi\"{enter}");
        // Go up to Definitions and make a function foo() with body: global a / a.<dot>
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "foo{rightarrow}{rightarrow}{downarrow}");
        pressFrameShortcutThenType("g", "a{enter}");
        cy.get("body").type("a.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
            checkExactlyOneItem(acIDSel, null, "upper()");
        }, false, true);
    });

    it("Shows string members for a variable used without 'global' in a function, assigned in My code", () => {
        focusEditorAC();
        // Assign b = "bye" in "My code":
        cy.get("body").type("=b=\"bye\"{enter}");
        // Go up to Definitions and make a function bar() with body: b.<dot> (no "global" needed to read b):
        cy.get("body").type("{uparrow}{uparrow}");
        pressFrameShortcutThenType("f", "bar{rightarrow}{rightarrow}{downarrow}");
        cy.get("body").type("b.");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "lower()");
            checkExactlyOneItem(acIDSel, null, "upper()");
        }, false, true);
    });
});

describe("Overlapping imports", () => {
    it("Offers all imports from module even where is overlapping from import:", () => {
        focusEditorAC();
        // Add two imports: import math, and from math import sin, cos
        clearDefaultImports();
        pressFrameShortcutThenType("i", "math{downarrow}");
        pressFrameShortcutThenType("f", "math{rightarrow}sin,cos{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body, make a function call with math.:
        cy.get("body").type("math.");
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
        pressFrameShortcutThenType("f", "datetime{rightarrow}date{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body: Ctrl+Space at the bare frame caret creates an empty
        // func-call frame and triggers autocomplete in it in one go (see Commands.vue's
        // Ctrl+Space handler):
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
        pressFrameShortcutThenType("f", "datetime{rightarrow}date{downarrow}{downarrow}{downarrow}");
        // Now we're back in main body, make a function call with math.:
        cy.get("body").type("date.");
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

    it("Offers file path auto-complete for a token matching after any punctuation separator", () => {
        focusEditorAC();
        // Make a print and open a string:
        cy.get("body").type("p\"pr");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // "pr" should match both "/books/pride-and-prejudice.txt" (after "/") and
            // "/books/three-men-in-a-boat.txt" doesn't contain "pr" but exercises that only
            // matching files are offered:
            checkExactlyOneItem(acIDSel, null, "/books/pride-and-prejudice.txt");
            checkNoItems(acIDSel, "/books/three-men-in-a-boat.txt");
        }, false);
    });

    it("Offers file path auto-complete for a token matching after a hyphen or dot separator", () => {
        focusEditorAC();
        // Make a print and open a string, and type "and" which only occurs after a hyphen in
        // "pride-and-prejudice.txt", and "txt" which only occurs after a dot:
        cy.get("body").type("p\"and");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "/books/pride-and-prejudice.txt");
        }, false);

        cy.get("body").type("{esc}{backspace}{backspace}{backspace}txt");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            // "txt" occurs after a "." in every book file, so all of them should match:
            checkExactlyOneItem(acIDSel, null, "/books/pride-and-prejudice.txt");
            checkExactlyOneItem(acIDSel, null, "/books/three-men-in-a-boat.txt");
            checkExactlyOneItem(acIDSel, null, "/books/winnie-the-pooh.txt");
        }, false);
    });
});

describe("Local files", () => {
    // microbit mode has no File system tab at all -- its PEA area shows the micro:bit device panel
    // instead of the graphics/console/files tabs (see PythonExecutionArea.vue), so there's no
    // upload UI to seed "/local" with in the first place:
    if (Cypress.env("mode") === "microbit") {
        return;
    }

    // Uploads two files into "/local" via the File system tab's upload button, so the tests below
    // can check they show up in string-literal auto-complete alongside the built-in assets above.
    // No cloud drive is connected in these tests, so "/local" is the working directory and the
    // files should be offered without the "/local/" prefix (see AutoCompletion.vue's
    // localFileCompletions()).
    function uploadToLocal(fileName: string): void {
        cy.get("#filesPEATab", {timeout: 15 * 1000}).click();
        cy.get(".file-system-tree-upload-input").selectFile({
            contents: Cypress.Buffer.from("content of " + fileName),
            fileName: fileName,
        }, {force: true});
    }

    beforeEach(() => {
        focusEditorAC();
        uploadToLocal("my-data.txt");
        uploadToLocal("other-notes.txt");
    });

    it("Offers auto-complete in string literal for local files, without the /local prefix", () => {
        focusEditorAC();
        // Make a print and open a string:
        cy.get("body").type("p\"");
        cy.wait(500);
        // Trigger auto-complete:
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "/books/three-men-in-a-boat.txt");
            checkExactlyOneItem(acIDSel, null, "my-data.txt");
            checkExactlyOneItem(acIDSel, null, "other-notes.txt");
            checkNoItems(acIDSel, "/local/my-data.txt");
        }, false);
    });

    it("Offers file path auto-complete for a token matching a local file", () => {
        focusEditorAC();
        cy.get("body").type("p\"my-dat");
        cy.wait(500);
        cy.get("body").type("{ctrl} ");
        withAC((acIDSel, frameId) => {
            cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).should("be.visible");
            checkExactlyOneItem(acIDSel, null, "my-data.txt");
            checkNoItems(acIDSel, "other-notes.txt");
        }, false);
    });
});
