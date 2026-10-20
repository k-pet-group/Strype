import {test, expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {save} from "../support/loading-saving";
import {setupStrypeTest} from "../support/general";
import {getDefaultStrypeProjectDocumentationFullLine, getDefaultStrypeProjectImportsFullLine, pressFrameShortcut, pressN, waitForEditorSettled} from "../support/editor";

// Typing the unpack operators "*" and "**" (see issue #848): they are unary, so they must neither
// be saved with a blank placeholder in front of them, nor lose the caret when "**" is formed from
// two typed "*" characters.

const docLiteral = getDefaultStrypeProjectDocumentationFullLine();
const importsLiteral = getDefaultStrypeProjectImportsFullLine();

// Wraps the given main-section lines in the default project (whose own main code is left in place):
function expectedProject(mainLines: string) : string {
    // (The trailing spaces after the last two lines are part of the saved format, hence the explicit escapes.)
    return "#(=> Strype:1:std\n" + docLiteral + "#(=> Section:Imports\n" + importsLiteral + "#(=> Section:Definitions\n#(=> Section:Main\n"
        + mainLines + "myString  = \"Hello from Strype\" \n" + "print(myString) \n" + "#(=> Section:End\n";
}

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 240000, skipPyodide: false});
});

test.describe("Typing unpack operators", () => {
    // Each entry is the text typed into a function call frame and the line it is expected to be saved as.
    // (Typed in one go, so this also checks no keystroke is lost straight after a "**".)
    const funcCallCases: [string, string][] = [
        ["f(*a)", "f(*a) \n"],
        ["f(**b)", "f(**b) \n"],
        ["f(*a,**b)", "f(*a,**b) \n"],
        ["f(a,*b)", "f(a,*b) \n"],
        ["f(a,**b)", "f(a,**b) \n"],
        ["f([*a,*b])", "f([*a,*b]) \n"],
        ["f({**a,**b})", "f({**a,**b}) \n"],
        ["f({\"k\":1,**d})", "f({\"k\":1,**d}) \n"],
    ];
    for (const [typed, expectedLine] of funcCallCases) {
        test("Function call frame: " + typed, async ({page}) => {
            await pressFrameShortcut(page, "c");
            await waitForEditorSettled(page);
            await page.keyboard.type(typed);
            await waitForEditorSettled(page);
            expect(readFileSync(await save(page), "utf-8")).toEqual(expectedProject(expectedLine));
        });
    }

    test("Assignment frame with starred target", async ({page}) => {
        await pressFrameShortcut(page, "=");
        await waitForEditorSettled(page);
        await page.keyboard.type("first,*rest");
        await waitForEditorSettled(page);
        // Move to the right-hand side:
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("x");
        await waitForEditorSettled(page);
        expect(readFileSync(await save(page), "utf-8")).toEqual(expectedProject("first,*rest  = x \n"));
    });

    // The match patterns, typed into the default case of a new match statement:
    const patternCases: [string, string][] = [
        ["[a,*rest]", "[a,*rest]"],
        ["[a,*_]", "[a,*_]"],
        ["[*_,z]", "[*_,z]"],
        ["{\"k\":v,**rest}", "{\"k\":v,**rest}"],
    ];
    for (const [typed, expectedPattern] of patternCases) {
        test("Match case pattern: " + typed, async ({page}) => {
            await pressFrameShortcut(page, "m");
            await waitForEditorSettled(page);
            await page.keyboard.type("x");
            await waitForEditorSettled(page);
            // Two arrow right takes us into the default case, then remove the default "_":
            await pressN("ArrowRight", 2, true)(page);
            await page.keyboard.press("Delete");
            await waitForEditorSettled(page);
            await page.keyboard.type(typed);
            await waitForEditorSettled(page);
            expect(readFileSync(await save(page), "utf-8")).toEqual(expectedProject(`match x  :
    case ${expectedPattern}  :
        pass
`));
        });
    }
});
