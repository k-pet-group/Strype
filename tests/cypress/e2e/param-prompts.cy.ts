// eslint-disable-next-line @typescript-eslint/no-var-requires
require("cypress-terminal-report/src/installLogsCollector")();
import "@testing-library/cypress/add-commands";
import failOnConsoleError from "cypress-fail-on-console-error";
failOnConsoleError();
// For the beforeEach part:
import "../support/param-prompt-support";
import {testRawFuncs} from "../support/param-prompt-support";

const isMicrobit = Cypress.env("mode") === "microbit";

describe("Parameter prompts", () => { 
    // Each item is a triple: the module, the function name within the module, the list of param names
    const rawFuncs : [string | null | [string, string], string, string[]][] = [
        [null, "abs", ["x"]],
        [null, "dir", (isMicrobit) ? ["o=Ellipsis"] : []],
        [null, "setattr", ["obj", "name", "value"]],
        [null, "open", ["file", "mode='r'", "buffering=-1", "encoding=None", "errors=None", "newline=None", "closefd=True", "opener=None"]],
        ["collections", "namedtuple", ["typename", "field_names", "*", "rename=False", "defaults=None", "module=None"]],
        // These are object oriented items, so we are checking the self has been removed:
        ["random", "randint", ["a, b"]],
    ];
    testRawFuncs(rawFuncs);
});
