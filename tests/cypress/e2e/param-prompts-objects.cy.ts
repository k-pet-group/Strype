require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();
// For the beforeEach part:
import "../support/param-prompt-support";
import {assertState, focusEditorAC, testRawFuncs, withFrameId} from "../support/param-prompt-support";


describe("Parameter prompts objects", () => {
    // Each item is a triple: the module, the function name within the module, the list of param names
    const rawFuncs : [string | null | [string, string], string, string[]][] = [];
    rawFuncs.push([null, "str(8).center", ["width"]]);
    if (Cypress.env("mode") !== "microbit") {
        rawFuncs.push(["turtle", "Turtle().write", ["text", "move=False", "align='left'", "font=('arial', 8, 'normal')"]]);
        rawFuncs.push([["http://localhost:8089/test-library/", "mediacomp"], "Pixel(‘’,1,2,3).set_color", ["color"]]);
    }
    // TODO remove the true param once we've investigated fully qualified imports
    // (I think TigerPython 1.1.2 doesn't support it, but need to check further.)
    testRawFuncs(rawFuncs, true);
});

describe("Parameter prompts on a variable", () => {
    // Regression test for https://github.com/k-pet-group/Strype/issues/1116
    // The default project has a variable myString, which TigerPython knows is a string:
    it("Only shows the optional parameters of myString.split while the cursor is inside the brackets", () => {
        focusEditorAC();
        cy.get("body").type("{downarrow}{downarrow}");
        cy.get("body").type("myString.split(");
        withFrameId((frameId) => {
            assertState(frameId, "myString.split($)", "myString.split(sep=...)");
            // Once we leave the brackets, optional parameters should no longer be shown:
            cy.get("body").type("{ctrl+alt+downarrow}");
            assertState(frameId, "myString.split()", "myString.split()");
        });
    });
});
