require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();
// For the beforeEach part:
import "../support/param-prompt-support";
import {testRawFuncs} from "../support/param-prompt-support";


describe("Parameter prompts objects graphics", () => {
    // Each item is a triple: the module, the function name within the module, the list of param names
    const rawFuncs : [string | null | [string, string], string, string[]][] = [];
    if (Cypress.env("mode") !== "microbit") {
        rawFuncs.push(["strype.graphics", "Actor(s).move", ["distance"]]);
        rawFuncs.push(["strype.graphics", "Actor(t).set_location", ["x", "y"]]);
        rawFuncs.push(["strype.graphics", "get_background().draw_circle", ["centre_x", "centre_y", "radius"]]);
        rawFuncs.push(["strype.graphics", "load_image(‘’).draw_text", ["text", "x", "y", "font_size=32", "max_width=0", "max_height=0", "font_family=None"]]);
    }
    // TODO remove the true param once we've investigated fully qualified imports
    // (I think TigerPython 1.1.2 doesn't support it, but need to check further.)
    testRawFuncs(rawFuncs, true);
});
