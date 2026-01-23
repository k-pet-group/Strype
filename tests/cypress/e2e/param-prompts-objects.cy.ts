require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();
// For the beforeEach part:
import "../support/param-prompt-support";
import {testRawFuncs} from "../support/param-prompt-support";


describe("Parameter prompts objects", () => {
    // Each item is a triple: the module, the function name within the module, the list of param names
    const rawFuncs : [string | null | [string, string], string, string[]][] = [];
    rawFuncs.push([null, "str(8).center", ["width"]]);
    if (Cypress.env("mode") !== "microbit") {
        rawFuncs.push(["turtle", "Turtle().write", ["arg", "move=False", "align='left'", "font=('Arial', 8, 'normal')"]]);
        rawFuncs.push([["http://localhost:8089/test-library/", "mediacomp"], "Pixel(‘’,1,2,3).set_color", ["color"]]);
    }
    // TODO remove the true param once we've investigated fully qualified imports
    // (I think TigerPython 1.1.2 doesn't support it, but need to check further.)
    testRawFuncs(rawFuncs, true);
});
