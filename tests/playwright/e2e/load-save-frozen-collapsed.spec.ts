import {Page, test, expect} from "@playwright/test";
import {loadContent, save} from "../support/loading-saving";
import fs from "fs";
import en from "@/localisation/en/en_main.json";
import { CollapsedState } from "../../cypress/support/frame-types";
import {addFakeClipboard} from "../support/clipboard";
import { checkFrameXorTextCursor } from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(120_000); // 120 seconds

    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await addFakeClipboard(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});

async function saveAndCheck(page: Page, expectedSPY: string) {
    const path = await save(page, false);
    const saved = fs.readFileSync(path, "utf8");
    expect(saved).toEqual(expectedSPY);
}

async function clickFoldFor(page: Page, identifyingText: string) : Promise<void> {
    // Find the span with text "top1"
    const header = page.locator("span,div", { hasText: identifyingText });
    // Find its frame header ancestor:
    const ancestor = header.locator("xpath=ancestor::*[contains(@class, \"frame-header-div-line\")]");
    const control = ancestor.locator(":scope > .frame-controls-container > .folding-control");
    await control.hover();
    expect(await control.evaluate((el) => getComputedStyle(el).cursor)).toEqual("pointer");
    await control.click();
}

async function clickFoldChildrenFor(page: Page, identifyingText: string) : Promise<void> {
    // Find the span with text "top1"
    const header = page.locator("span,div", { hasText: identifyingText });
    // Find its frame header ancestor:
    const ancestor = header.locator("xpath=ancestor::*[contains(@class, \"frame-header\")]");
    const control = ancestor.locator(":scope > .frame-header-div-line > .fold-children-control");
    await control.hover();
    expect(await control.evaluate((el) => getComputedStyle(el).cursor)).toEqual("pointer");
    await control.click();
}

async function makeFrozen(page: Page, identifyingText: string) : Promise<void> {
    const ancestor = page.locator(".frame-header:has(span:has-text('" + identifyingText + "'), div:has-text('" + identifyingText + "'))");
    await ancestor.click({button: "right"});
    await page.getByRole("menuitem", {name: en.contextMenu.freeze, exact: true}).click({timeout: 2000});
}

async function makeUnfrozen(page: Page, identifyingText: string) : Promise<void> {
    const ancestor = page.locator(".frame-header:has(span:has-text('" + identifyingText + "'), div:has-text('" + identifyingText + "'))");
    await ancestor.click({button: "right"});
    await page.getByRole("menuitem", {name: en.contextMenu.unfreeze, exact: true}).click({timeout: 2000});
}

async function foldViaMenu(page: Page, identifyingText: string, foldTo: CollapsedState) : Promise<void> {
    const ancestor = page.locator(".frame-header:has(span:has-text('" + identifyingText + "'), div:has-text('" + identifyingText + "'))");
    await ancestor.click({button: "right"});
    let name : string;
    switch (foldTo) {
    case CollapsedState.FULLY_VISIBLE:
        name = en.contextMenu.collapseFull;
        break;
    case CollapsedState.HEADER_AND_DOC_VISIBLE:
        name = en.contextMenu.collapseDocumentation;
        break;
    case CollapsedState.ONLY_HEADER_VISIBLE:
        name = en.contextMenu.collapseHeader;
        break;
    }
    await page.getByRole("menuitem", {name}).click({timeout: 2000});
}

const alphaBeta =
    `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
def top1 ( ) :
    return 6 
class Alpha  :
    some_constant  = 5 
    def __init__ (self, ) :
        self.x  = 7 
class Beta  :
    def set_double (self,x ) :
        self.x  = x*2 
    def get_x (self, ) :
        return x 
    def set_x (self,x ) :
        self.x  = x 
def top2 ( ) :
    return 64 
#(=> Section:Main
#(=> Section:End
`;


// We have some functions and classes, and have a function to allow setting the states for any identifier:
function testState (states: Record<string, string> = {}, original = alphaBeta) {
    let lines = original.split(/\r?\n/);

    for (const [key, value] of Object.entries(states)) {
        let found = false;
        const newLines: string[] = [];

        for (const line of lines) {
            if (line.includes(key)) {
                found = true;
                const indentMatch = line.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : "";
                newLines.push(indent + "#(=> FrameState:" + value); // insert before the matching line
                newLines.push(line);
            }
            else {
                newLines.push(line);
            }
        }

        if (!found) {
            throw new Error(`Key "${key}" not found in text.`);
        }

        lines = newLines;
    }

    return lines.join("\n");
}

test.describe("Saves collapsed state after icon clicks", () => {
    test("Basic round trip", async ({page}) => {
        await loadContent(page, testState());
        await saveAndCheck(page, testState());
    });
    test("Fold the function once", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldFor(page, "top1");
        await saveAndCheck(page, testState({"top1": "FoldToHeader"}));
    });
    test("Fold the function twice and the other once", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldFor(page, "top1");
        await clickFoldFor(page, "top1");
        await clickFoldFor(page, "top2");
        await saveAndCheck(page, testState({"top1": "FoldToDocumentation", "top2": "FoldToHeader"}));
    });
    test("Fold the member functions too", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldFor(page, "top1");
        await clickFoldFor(page, "top1");
        await clickFoldFor(page, "top2");
        await clickFoldFor(page, "get_x");
        await clickFoldFor(page, "get_x");
        await clickFoldFor(page, "set_x");
        await saveAndCheck(page, testState({"get_x": "FoldToDocumentation", "set_x": "FoldToHeader", "top1": "FoldToDocumentation", "top2": "FoldToHeader"}));
    });
    test("Fold the Alpha member function using joint control", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldChildrenFor(page, "Alpha");
        await saveAndCheck(page, testState({"__init__": "FoldToHeader"}));
    });
    test("Fold the Beta member functions using joint control, twice", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldChildrenFor(page, "Beta");
        await clickFoldChildrenFor(page, "Beta");
        await saveAndCheck(page, testState({"set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
    });
    test("Freeze Alpha unfolded", async ({page}) => {
        await loadContent(page, testState());
        await makeFrozen(page, "Alpha");
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader"}));
    });

    test("Freeze Beta part-folded", async ({page}) => {
        await loadContent(page, testState());
        await clickFoldFor(page, "set_x");
        await clickFoldFor(page, "set_x");
        await makeFrozen(page, "Beta");
        // Freezing Beta should automatically fold in its children that are not already folded: 
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToHeader", "get_x": "FoldToHeader", "set_x": "FoldToDocumentation"}));
    });

    test("Freeze Alpha and Beta and top_2 in one go", async ({page}) => {
        await loadContent(page, testState());
        // Go to bottom of the definitions:
        await page.keyboard.press("ArrowUp");
        // Shift-control-up three times:
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press((process.platform == "darwin" ? "Alt" : "Control") + "+Shift+ArrowUp");
        }
        // Then do contect menu and freeze:
        await makeFrozen(page, "Beta"); 
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader", "Beta": "Frozen", "set_double": "FoldToHeader", "get_x": "FoldToHeader", "set_x": "FoldToHeader", "top2": "FoldToHeader;Frozen"}));
    });

    test("Attempt to freeze member function", async ({page}) => {
        await loadContent(page, testState());
        // Will Timeout when it doesn't find the menu item:
        await expect(makeFrozen(page, "set_x")).rejects.toThrow(/Timeout/i);
    });
    
    test("Freeze Beta then cycle its visibility", async ({page}) => {
        await loadContent(page, testState());
        await makeFrozen(page, "Beta");
        // Freezing Beta should automatically fold in its children that are not already folded:
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToHeader", "get_x": "FoldToHeader", "set_x": "FoldToHeader"}));
        await clickFoldChildrenFor(page, "Beta");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // You should be able to freely toggle frozen class visibility between fully visible (although its members are not visible)
        // and folded:
        await clickFoldFor(page, "Beta");
        await saveAndCheck(page, testState({"Beta": "FoldToHeader;Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        await clickFoldFor(page, "Beta");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // However, you should only be able to toggle the children between the two folded states:
        console.log("Doc to header:");
        await clickFoldChildrenFor(page, "Beta");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToHeader", "get_x": "FoldToHeader", "set_x": "FoldToHeader"}));
        console.log("Header back to doc:");
        await clickFoldChildrenFor(page, "Beta");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // Ditto when done individually:
        await clickFoldFor(page, "set_x");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToHeader"}));
        await clickFoldFor(page, "set_x");
        await saveAndCheck(page, testState({"Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
    });
    test("Load frozen Alpha then try to cycle child visibility with key", async ({page}) => {
        await loadContent(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader"}));
        // We should start at top of the body, so we need to go up once into functions, then thrice more to be above Alpha:
        await page.keyboard.press("ArrowUp");
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press((process.platform == "darwin" ? "Alt" : "Control") + "+ArrowUp");
        }
        // Then we go down to be inside, and down again past the top field:
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("ArrowDown");
        // Now we actually press the dot!  Would normally go back to fully visible but it should skip that and go to folded-doc:
        await page.keyboard.type(".");
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToDocumentation"}));
        // Use menu to change to fully folded:
        await foldViaMenu(page, "__init__", CollapsedState.ONLY_HEADER_VISIBLE);
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader"}));
        // Now check the menu item for fully visible is missing:
        await expect(foldViaMenu(page, "__init__", CollapsedState.FULLY_VISIBLE)).rejects.toThrow(/Timeout/i);
    });
    test("Freeze top1 then cycle its visibility with toggle", async ({page}) => {
        await loadContent(page, testState());
        await makeFrozen(page, "top1");
        await saveAndCheck(page, testState({"top1": "FoldToHeader;Frozen"}));
        // You should be able to freely toggle frozen function visibility between folded to header and folded to doc, but not fully visible:
        await clickFoldFor(page, "top1");
        await saveAndCheck(page, testState({"top1": "FoldToDocumentation;Frozen"}));
        await clickFoldFor(page, "top1");
        await saveAndCheck(page, testState({"top1": "FoldToHeader;Frozen"}));
        await clickFoldFor(page, "top1");
        await saveAndCheck(page, testState({"top1": "FoldToDocumentation;Frozen"}));

        // Back to header ahead of the next test, and freeze Beta:
        await clickFoldFor(page, "top1");
        await makeFrozen(page, "Beta");
        await saveAndCheck(page, testState({"top1": "FoldToHeader;Frozen", "Beta": "Frozen", "set_double": "FoldToHeader", "get_x": "FoldToHeader", "set_x": "FoldToHeader"}));
        await clickFoldChildrenFor(page, "Beta");
        // Click the toggle for all defs:
        await page.locator(".frame-container-header > .fold-children-control").click();
        // Should initially try to collapse everything because we have a mixed state:
        await saveAndCheck(page, testState({"top1": "FoldToHeader;Frozen", "Alpha": "FoldToHeader", "Beta": "FoldToHeader;Frozen", "top2": "FoldToHeader", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // Then should all fold to documentation where possible, which is all except classes:
        await page.locator(".frame-container-header > .fold-children-control").click();
        await saveAndCheck(page, testState({"top1": "FoldToDocumentation;Frozen", "Alpha": "FoldToHeader", "Beta": "FoldToHeader;Frozen", "top2": "FoldToDocumentation", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // Then should all fold out where possible, which is all except frozen items:
        await page.locator(".frame-container-header > .fold-children-control").click();
        await saveAndCheck(page, testState({"top1": "Frozen", "Beta": "Frozen", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        // Then to folded again ready for next test:
        await page.locator(".frame-container-header > .fold-children-control").click();
        await saveAndCheck(page, testState({"top1": "FoldToHeader;Frozen", "Alpha": "FoldToHeader", "Beta": "FoldToHeader;Frozen", "top2": "FoldToHeader", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
        
        // Unfreeze top1:
        await makeUnfrozen(page, "top1");
        await page.locator(".frame-container-header > .fold-children-control").click();
        // Should go back to documentation as frozen isn't part of the memory state:
        await saveAndCheck(page, testState({"top1": "FoldToDocumentation", "Alpha": "FoldToHeader", "Beta": "FoldToHeader;Frozen", "top2": "FoldToDocumentation", "set_double": "FoldToDocumentation", "get_x": "FoldToDocumentation", "set_x": "FoldToDocumentation"}));
    });
    test("Freezing prevents deletion of the whole frame and its member frames", async ({page}) => {
        await loadContent(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader", "top1": "FoldToDocumentation;Frozen"}));
        // We start at the top of the body, so one up to get to bottom of defs:
        await page.keyboard.press("ArrowUp");
        // Then two more at same level to get *below* Alpha:
        for (let i = 0; i < 2; i++) {
            await page.keyboard.press((process.platform == "darwin" ? "Alt" : "Control") + "+ArrowUp");
        }
        // We try backspace and delete and selection; if any of it deletes it will fail the test:
        await page.keyboard.press("Backspace");
        await page.keyboard.press("ArrowUp"); // Will go past because it's folded
        await page.keyboard.press("Delete");
        await page.keyboard.press("Shift+ArrowUp");
        // With selection, try deleting, cutting:
        await page.keyboard.press("Delete");
        await page.keyboard.press("Backspace");
        await page.keyboard.press((process.platform == "darwin" ? "Meta" : "Control") + "+x");
        // Break the selection:
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Delete");
        // Now go into the body and try deletion:
        await page.keyboard.press("Delete");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Delete");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Delete");
        // After all that, should be unaffected:
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader", "top1": "FoldToDocumentation;Frozen"}));
    });

    test("Freezing prevents focusing the text slots with right arrow", async ({page}) => {
        await loadContent(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader", "top1": "FoldToDocumentation;Frozen"}));
        // We start at the top of the body, so one up to get to bottom of defs:
        await page.keyboard.press("ArrowUp");
        // Then three more at same level to get above Alpha:
        for (let i = 0; i < 3; i++) {
            await page.keyboard.press((process.platform == "darwin" ? "Alt" : "Control") + "+ArrowUp");
        }
        // Right arrow should go past header and into frame, then right again should go past
        // the next frame, so right, and right again should both end up with a frame cursor:
        await page.keyboard.press("ArrowRight");
        checkFrameXorTextCursor(page, true);
        await page.keyboard.press("ArrowRight");
        checkFrameXorTextCursor(page, true);
        
    });

    test("Freezing prevents focusing the text slots with clicking", async ({page}) => {
        await loadContent(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader"}));
        await page.locator("span", {hasText: "Alpha"}).click();
        await page.waitForTimeout(3000);
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(3000);
        // That should put us before Alpha, then we press backspace it should delete top1 (line indexes 3 and 4):
        await saveAndCheck(page, testState({"Alpha": "Frozen", "__init__": "FoldToHeader"}).split(/\r?\n/).filter((_, i) => i < 3 || i > 4).join("\n"));
    });
});

const inputWithBlank = `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
class Alpha  :
    some_constant  = 5 
    def __init__ (self, ) :
        self.x  = ___strype_blank 
#(=> Section:Main
#(=> Section:End
`;

const inputWhichWillRuntimeError = `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
class Alpha  :
    some_constant  = 5 
    def __init__ (self,y ) :
        self.x  = len(y) 
#(=> Section:Main
Alpha(None) 
#(=> Section:End
`;

test.describe("Frozen state deals with errors", () => {
    test("Cannot freeze if there is a syntax error #1", async ({page}) => {
        await loadContent(page, inputWithBlank);
        // Wait a moment for errors to be checked:
        await page.waitForTimeout(2000);
        // Will Timeout when it doesn't find the menu item:
        await expect(makeFrozen(page, "Alpha")).rejects.toThrow(/Timeout/i);
        // Menu remains though so we need to dismiss it:
        await page.keyboard.press("Escape");
        // We should then not be frozen, so should be unmodified state:
        await saveAndCheck(page, inputWithBlank);
    });
    test("Can freeze if there is a runtime error #1", async ({page}) => {
        await loadContent(page, inputWhichWillRuntimeError);
        // Run to provoke the error, and check it is there:
        await page.getByText("Run").click();
        await expect(await page.locator(".fa-exclamation-triangle")).toBeVisible();
        expect(await page.locator("#peaConsole").inputValue()).toContain("object of type 'NoneType' has no len()");
        
        // Then try to freeze:
        await makeFrozen(page, "class ");
        // We should then be frozen, despite there being an error because it is a runtime error:
        await saveAndCheck(page, testState({"class": "Frozen", "__init__": "FoldToHeader"}, inputWhichWillRuntimeError));
    });
    test("Frozen frame unfolds if there is a runtime error #1", async ({page}) => {
        await loadContent(page, inputWhichWillRuntimeError);
        // Freeze:
        await makeFrozen(page, "class ");
        // We should then be frozen, despite there being an error because it is a runtime error:
        await saveAndCheck(page, testState({"class": "Frozen", "__init__": "FoldToHeader"}, inputWhichWillRuntimeError));
        
        // Run to provoke the error, and check it is there:
        await page.getByText("Run").click();
        await expect(await page.locator(".fa-exclamation-triangle")).toBeVisible();
        expect(await page.locator("#peaConsole").inputValue()).toContain("object of type 'NoneType' has no len()");
    });
    
    const inputWithTigerPythonError = `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
def foo (name,ID ) :
    # Mismatched format string:
    print(f"Student: {name} ({ID)") 
#(=> Section:Main
foo("Anon",7) 
#(=> Section:End
`;

    test("Cannot freeze if there is a syntax error #2", async ({page}) => {
        await loadContent(page, inputWithTigerPythonError);
        // Wait a moment for errors to be checked:
        await page.waitForTimeout(2000);
        // Will Timeout when it doesn't find the menu item:
        await expect(makeFrozen(page, "def")).rejects.toThrow(/Timeout/i);
        // Menu remains though so we need to dismiss it:
        await page.keyboard.press("Escape");
        // We should then not be frozen, so should be unmodified state:
        await saveAndCheck(page, inputWithTigerPythonError);
    });
});

test.describe("Folding state deals with errors", () => {
    test("Cannot fold if there is a syntax error #1", async ({page}) => {
        await loadContent(page, inputWithBlank);
        // Wait a moment for errors to be checked:
        await page.waitForTimeout(2000);
        // Will Timeout when it doesn't find the menu item:
        await expect(foldViaMenu(page, "Alpha", CollapsedState.ONLY_HEADER_VISIBLE)).rejects.toThrow(/Timeout/i);
        // Menu remains though so we need to dismiss it:
        await page.keyboard.press("Escape");
        // Try also via the clickable control:
        await clickFoldFor(page, "Alpha");
        
        // We should then not be folded, so should be unmodified state:
        await saveAndCheck(page, inputWithBlank);
    });
    test("Can fold if there is a runtime error #1", async ({page}) => {
        await loadContent(page, inputWhichWillRuntimeError);
        // Run to provoke the error, and check it is there:
        await page.getByText("Run").click();
        await expect(await page.locator(".fa-exclamation-triangle")).toBeVisible();
        expect(await page.locator("#peaConsole").inputValue()).toContain("object of type 'NoneType' has no len()");

        // Then try to fold:
        await clickFoldFor(page, "class");
        // We should then be folded, despite there being an error because it is a runtime error:
        await saveAndCheck(page, testState({"class": "FoldToHeader"}, inputWhichWillRuntimeError));
    });
    test("Folded frame unfolds if there is a runtime error #1", async ({page}) => {
        await loadContent(page, inputWhichWillRuntimeError);
        // Freeze:
        await clickFoldFor(page, "class ");
        // We should then be folded, despite there being an error because it is a runtime error:
        await saveAndCheck(page, testState({"class": "FoldToHeader"}, inputWhichWillRuntimeError));

        // Run to provoke the error, and check it is there:
        await page.getByText("Run").click();
        await expect(await page.locator(".fa-exclamation-triangle")).toBeVisible();
        expect(await page.locator("#peaConsole").inputValue()).toContain("object of type 'NoneType' has no len()");
    });

    const inputWithTigerPythonError = `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
def foo (name,ID ) :
    # Mismatched format string:
    print(f"Student: {name} ({ID)") 
#(=> Section:Main
foo("Anon",7) 
#(=> Section:End
`;

    test("Cannot fold if there is a syntax error #2", async ({page}) => {
        await loadContent(page, inputWithTigerPythonError);
        // Wait a moment for errors to be checked:
        await page.waitForTimeout(2000);
        // Will Timeout when it doesn't find the menu item:
        await expect(foldViaMenu(page, "def", CollapsedState.HEADER_AND_DOC_VISIBLE)).rejects.toThrow(/Timeout/i);
        // Menu remains though so we need to dismiss it:
        await page.keyboard.press("Escape");
        await clickFoldFor(page, "def");
        // We should then not be folded, so should be unmodified state:
        await saveAndCheck(page, inputWithTigerPythonError);
    });
    
    const inputWithNestedTigerPythonError = `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
class Alpha  :
    def hasNoError (self, ) :
        return 42 
    def __init__ (self,y ) :
        self.x  = f"{len(y)" 
#(=> Section:Main
Alpha(None) 
#(=> Section:End
`;

    test("Cannot fold if there is a syntax error #3", async ({page}) => {
        await loadContent(page, inputWithNestedTigerPythonError);
        // Wait a moment for errors to be checked:
        await page.waitForTimeout(2000);
        // Folding all children should not fold it:
        await clickFoldChildrenFor(page, "class");
        // We should then only have folded the one without an error:
        await saveAndCheck(page, testState({"hasNoError": "FoldToHeader"}, inputWithNestedTigerPythonError));
    });
});

test.describe("Multiple folded frozen frames and multi-line comments", () => {
    const input = `#(=> Strype:1:std
''' This is is a multi-line
project description with
lots
and
lots
of
lines. Also some quotes: "like this"
because why not.'''
#(=> Section:Imports
from strype.graphics import * 
from time import sleep 
#(=> Section:Definitions
def func1 (x,y ) :
    '''This is a multi-line comment with 
    different lines for explaining the params:
        - param x: The X coordinate
        - param y: The Y coordinate
        - returns: a magic number'''
    if x<0  :
        return -1 
    if y<0  :
        return -1 
    if x>=800  :
        return -1 
    if y>=600  :
        return -1 
    return 6 
def func2 (a,b ) :
    '''A much shorter line'''
    a  = b 
    b  = c 
    c  = d 
    d  = e 
    e  = f 
    f  = g 
#(=> Section:Main
sleep(5) 
#(=> Section:End
`;
    test("Load plain, fold, freeze, save", async ({page}) => {
        await loadContent(page, input);
        await clickFoldFor(page, "func1");
        await clickFoldFor(page, "func2");
        await makeFrozen(page, "func1");
        await makeFrozen(page, "func2");
        await saveAndCheck(page, testState({"func1": "FoldToHeader;Frozen", "func2": "FoldToHeader;Frozen"}, input));
    });

    test("Load when already folded and frozen, save again", async ({page}) => {
        const alreadyFoldedAndFrozen = testState({"func1": "FoldToHeader;Frozen", "func2": "FoldToHeader;Frozen"}, input);
        await loadContent(page, alreadyFoldedAndFrozen);
        await saveAndCheck(page, alreadyFoldedAndFrozen);
    });
    
});
