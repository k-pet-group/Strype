import {test, expect, Locator} from "@playwright/test";
import {readFileSync} from "node:fs";
import {save} from "../support/loading-saving";
import {skipPyodideLoading} from "../support/general";
import {doPagePaste, getDefaultStrypeProjectDocumentationFullLine, pressN, waitForEditorSettled} from "../support/editor";

const defaultStandardStrypeProjectDocLiteral = getDefaultStrypeProjectDocumentationFullLine();

const initialProjectCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`;

const mainCodeMultiVarsCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
[myString,anotherString]  = ["Hello from Strype"," Bye..."] 
print(myString+anotherString) 
print(myString) 
print(anotherString.strip()) 
#(=> Section:End
`;

const mainCodeMultiVarsOneFGlolabOneGLocalCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
def testF (anotherString ) :
    print(myString) 
    print(anotherString) 
#(=> Section:Main
[myString,anotherString]  = ["Hello from Strype"," Bye..."] 
print(myString+anotherString) 
print(myString) 
print(anotherString.strip()) 
testF(anotherString) 
#(=> Section:End
`;

const singleLocaleInFunctionCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
def testF (myString ) :
    print(myString) 
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
testF(myString) 
#(=> Section:End
`;

const withFunction1CodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
def testF (myString1,iter1 ) :
    global iter2 
    print(iter1) 
    print(iter2) 
    print(myString1) 
    print(myString2) 
#(=> Section:Main
for iter1,iter2  in enumerate(range(5))  :
    myString1  = "Hello from Strype" 
    myString2  = "Hello from Strype" 
    print(iter1) 
    print(iter2) 
    testF(myString1,"test") 
    testF(myString2,"test2") 
print(iter1) 
print(iter2) 
print(myString1) 
print(myString2) 
#(=> Section:End
`;

const getWithFunction2CodeLiteral = (globalLine: string): string => {
    return `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
def testF ( ) :${globalLine}
    for iter  in range(5)  :
        print(iter) 
    print(iter) 
#(=> Section:Main
print(iter) 
#(=> Section:End
`;
};

const importCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
import datetime as dt 
#(=> Section:Definitions
def testF ( ) :
    print(dt.date.fromisocalendar()) 
#(=> Section:Main
for i  in range(5)  :
    today  = dt.date.today() 
    new_day  = today+dt.timedelta(days=i) 
    print(new_day) 
print(dt.datetime.today()) 
#(=> Section:End
`;

const classCodeLiteral = `
#(=> Strype:1:std
${defaultStandardStrypeProjectDocLiteral}#(=> Section:Imports
#(=> Section:Definitions
class MyClass  :
    var  = 2 
    def __init__ (self, ) :
        pass
    def testF (self, ) :
        print(self.var+4) 
#(=> Section:Main
print(MyClass().var) 
MyClass().testF() 
var  = "Strype" 
print(var) 
testF() 
#(=> Section:End
`;

let renameButton: Locator;
// The Ctrl+R keyboard shortcut is only actually handled by the app (see App.vue's keydown
// handler) when `.popover.show:has(.<renameIdentifierPopoverClassName>)` matches -- i.e. once
// Bootstrap's fade-in transition has added the "show" class to the popover, which happens some
// time *after* the button inside it first becomes visible/rendered. Waiting only for the button
// to be visible (as `renameButton` does) can resolve during that gap and fire the shortcut before
// the app is ready to handle it, so anywhere we're about to press the shortcut we wait on this
// locator instead, matching the app's own guard condition exactly:
let openedPopoverLocator: Locator;
const renameKBShortcut = "Control+r";
const wordWiseNavigationLeft = process.platform == "darwin" ? "Alt+ArrowLeft" : "Control+ArrowLeft";
const wordWiseNavigationRight = process.platform == "darwin" ? "Alt+ArrowRight" : "Control+ArrowRight";
let scssVars: {[varName: string]: string};
test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }

    // These tests can take longer than the default 30 seconds:
    testInfo.setTimeout(240000); // 240 seconds

    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    renameButton = page.locator(`.${scssVars.renameIdentifierPopoverClassName} button:visible`);
    openedPopoverLocator = page.locator(`.popover.show:has(.${scssVars.renameIdentifierPopoverClassName})`);
});

test.describe("Basic interaction", () => {
    test("KB shortcut, change", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        // Losing focus triggers an async check (looking for other uses of the identifier in the
        // code) before the popup appears, so wait for the popup itself rather than just the
        // editor's own state settling:
        await expect(openedPopoverLocator).toBeVisible();
        // Rename
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(initialProjectCodeLiteral.replaceAll("myString", "_new_myString").trimStart());
    });

    test("KB shortcut, cancel", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Escape rename
        await page.keyboard.press("Escape");
        // Check no popup is still displayed
        await expect(renameButton).toBeHidden();
    });

    test("Click, change", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Rename
        await renameButton.click();
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(initialProjectCodeLiteral.replaceAll("myString", "_new_myString").trimStart());
    });

    test("Disappear when frame added by keyboard", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Add a frame
        await page.keyboard.press("i");
        // Check no popup is still displayed
        await expect(renameButton).toBeHidden();
    });

    test("Disappear when frame added by click", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Add a frame (which ever one)
        await page.locator(".frame-cmd-btn").first().click();
        // Check no popup is still displayed
        await expect(renameButton).toBeHidden();
    });

    test("Disappear when clicking away", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Click the Strype menu
        await page.locator("#showHideMenu").click();
        // Check no popup is still displayed
        await expect(renameButton).toBeHidden();
    });

    test("Staying when clicking on popup", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(renameButton).toBeVisible();
        // Click the popup
        await page.locator(`.${scssVars.renameIdentifierPopoverClassName}:visible`).click();
        // Check popup is still displayed
        await expect(renameButton).toBeVisible();
    });
});

test.describe("Variable changes in main section", () => {
    test("Single variable", async ({page}) => {
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // Rename uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(initialProjectCodeLiteral.replaceAll("myString", "_new_myString").trimStart());
    });

    test("Multi variables", async ({page}) => {
        // pressN(..., true) already waits for the editor to settle after each press:
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, mainCodeMultiVarsCodeLiteral);
        // Rename both variables
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await pressN("ArrowRight", 2, true)(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press(wordWiseNavigationRight);
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(mainCodeMultiVarsCodeLiteral.replaceAll("myString", "_new_myString").replaceAll("anotherString","_new_anotherString").trimStart());
    });

    test("Multi variables and one global one local in function", async ({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, mainCodeMultiVarsOneFGlolabOneGLocalCodeLiteral);
        // Rename both variables
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await pressN("ArrowRight", 2, true)(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press(wordWiseNavigationRight);
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results after preparing the expected code (not all variables will be updated)
        let modifiedCode = mainCodeMultiVarsOneFGlolabOneGLocalCodeLiteral;
        modifiedCode = modifiedCode.replaceAll("myString", "_new_myString");
        let matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("anotherString", (match) => {
            // Skip the 2 first matches
            matchCounter++;
            return (matchCounter > 1) ? ("_new_" + match ): match;            
        });
        expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
    });

    test("For frame and one global one local in function", async ({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, withFunction1CodeLiteral);
        // Rename variables in for header
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press(wordWiseNavigationRight);
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Rename variables in for body and rename all uses
        for(let _ = 0; _ < 2; _++){
            await page.keyboard.press("ArrowRight");
            await waitForEditorSettled(page);
            await page.keyboard.type("_new_");
            await waitForEditorSettled(page);
            await page.keyboard.press("ArrowDown");
            await expect(openedPopoverLocator).toBeVisible();
            await page.keyboard.press(renameKBShortcut);
            await expect(renameButton).toBeHidden();
        }
        // Check results after preparing the expected code (not all variables will be updated)
        let modifiedCode = withFunction1CodeLiteral;
        let matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("myString1", (match) => {
            // Ignore 2 first matches
            matchCounter++;
            return (matchCounter > 1) ? ("_new_" + match ): match;            
        });        
        modifiedCode = modifiedCode.replaceAll("myString2", "_new_myString2");
        matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("iter1", (match) => {
            // Ignore 2 first matches
            matchCounter++;
            return (matchCounter > 1) ? ("_new_" + match ): match;            
        });
        modifiedCode = modifiedCode.replaceAll("iter2", "_new_iter2");
        expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
    });
});

test.describe("Variable changes in functions", () => {
    test("Single local", async ({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, singleLocaleInFunctionCodeLiteral);
        // Rename local variable
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.press(wordWiseNavigationRight);
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results after preparing the expected code (not all variables will be updated)
        let modifiedCode = singleLocaleInFunctionCodeLiteral;
        let matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("myString", (match) => {
            // Only the 2 first matches
            matchCounter++;
            return (matchCounter < 2) ? ("_new_" + match ): match;            
        });
        expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
    });

    test("Global", async ({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, withFunction1CodeLiteral);
        // Rename variable
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(withFunction1CodeLiteral.replaceAll("iter2", "_new_iter2").trimStart());
    });

    test("For frame (local)", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        const withFunction2CodeLiteral = getWithFunction2CodeLiteral("");
        await doPagePaste(page, withFunction2CodeLiteral);
        // Rename local variable
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results after preparing the expected code (not all variables will be updated)
        let modifiedCode = withFunction2CodeLiteral;
        let matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("iter", (match) => {
            // Only the 3 first matches
            matchCounter++;
            return (matchCounter < 3) ? ("_new_" + match ): match;
        });
        expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
    });

    test("For frame (global)", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        const withFunction2CodeLiteral = getWithFunction2CodeLiteral("\n    global iter ");
        await doPagePaste(page, withFunction2CodeLiteral);
        // Rename global variable
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(withFunction2CodeLiteral.replaceAll("iter", "_new_iter").trimStart());
    });
});

test("Variable change in class", async({page}) => {
    await pressN("Delete", 2, true)(page);
    // Paste intial code
    await doPagePaste(page, classCodeLiteral);
    // Rename import name binding
    await page.keyboard.press("PageUp");
    await waitForEditorSettled(page);
    await pressN("ArrowDown", 2, true)(page);
    await page.keyboard.press("ArrowRight");
    await waitForEditorSettled(page);
    await page.keyboard.type("_new_");
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowDown");
    await expect(openedPopoverLocator).toBeVisible();
    // And rename all uses
    await page.keyboard.press(renameKBShortcut);
    await expect(renameButton).toBeHidden();
    // Check results after preparing the expected code (not all variables will be updated)
    let modifiedCode = classCodeLiteral;
    let matchCounter = -1;
    modifiedCode = modifiedCode.replaceAll("var", (match) => {
        // Only the 3 first matches
        matchCounter++;
        return (matchCounter < 3) ? ("_new_" + match ): match;            
    });
    expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
});

test.describe("Changes in import", () => {
    test("Name binding (after as)", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, importCodeLiteral);
        // Rename import name binding
        await page.keyboard.press("Control+Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowLeft");
        await waitForEditorSettled(page);
        await page.keyboard.press(wordWiseNavigationLeft);
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(importCodeLiteral.replaceAll("dt", "_new_dt").trimStart());
    });

    test("Module name (before as : should NOT change", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, importCodeLiteral);
        // Rename import name binding
        await page.keyboard.press("Control+Home");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        // Losing focus here does trigger the same async popup-eligibility check as elsewhere, but
        // this case is deliberately testing that it decides NOT to show a popup (renaming the
        // module name, not the "as" binding) -- there's no positive state to wait for, so give
        // the check a fixed real-time window to (wrongly) show the popup before asserting it
        // hasn't:
        await page.waitForTimeout(400);
        // Check that no popup shows
        await expect(renameButton).toBeHidden();
    });


});

test.describe("Function change", () => {
    test("User defined function", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, singleLocaleInFunctionCodeLiteral);
        // Rename function
        await page.keyboard.press("PageUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results
        expect(readFileSync(await save(page), "utf-8")).toEqual(singleLocaleInFunctionCodeLiteral.replaceAll("testF", "_new_testF").trimStart());
    });

    test("Class function", async({page}) => {
        await pressN("Delete", 2, true)(page);
        // Paste intial code
        await doPagePaste(page, classCodeLiteral);
        // Rename import name binding
        await page.keyboard.press("Home");
        await waitForEditorSettled(page);
        await pressN("ArrowUp", 5, true)(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.type("_new_");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowDown");
        await expect(openedPopoverLocator).toBeVisible();
        // And rename all uses
        await page.keyboard.press(renameKBShortcut);
        await expect(renameButton).toBeHidden();
        // Check results after preparing the expected code (not all variables will be updated)
        let modifiedCode = classCodeLiteral;
        let matchCounter = -1;
        modifiedCode = modifiedCode.replaceAll("testF", (match) => {
            // Only the 2 first matches
            matchCounter++;
            return (matchCounter < 2) ? ("_new_" + match ): match;
        });
        expect(readFileSync(await save(page), "utf-8")).toEqual(modifiedCode.trimStart());
    });

});

test("Class change", async({page}) => {
    await pressN("Delete", 2, true)(page);
    // Paste intial code
    await doPagePaste(page, classCodeLiteral);
    // Rename local variable
    await page.keyboard.press("PageUp");
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowDown");
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowRight");
    await waitForEditorSettled(page);
    await page.keyboard.type("_new_");
    await waitForEditorSettled(page);
    await page.keyboard.press("ArrowDown");
    await expect(openedPopoverLocator).toBeVisible();
    // And rename all uses
    await page.keyboard.press(renameKBShortcut);
    await expect(renameButton).toBeHidden();
    // Check results
    expect(readFileSync(await save(page), "utf-8")).toEqual(classCodeLiteral.replaceAll("MyClass", "_new_MyClass").trimStart());
});