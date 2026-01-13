import {test, expect} from "@playwright/test";
import {checkFrameXorTextCursor, doTextHomeEndKeyPress} from "../support/editor";
import {readFileSync} from "node:fs";
import {loadContent, save, testPlaywrightRoundTripImportAndDownload} from "../support/loading-saving";

const defaultStandardStrypeProjectDocLiteralWithDotSpace = "This is the default Strype starter project. ";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});

test.describe("Project description selection", () => {
    test("Starts valid", async ({page}) => {
        await checkFrameXorTextCursor(page);
    });
    test("Enter project description by typing", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type(". A project description");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''${defaultStandardStrypeProjectDocLiteralWithDotSpace}A project description'''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart());
    });
    
    // Because of macOS handling home and end differently we used different shortcuts for different platforms (see doTextHomeEndKeyPress()),
    // therefore, select all is either an object with the boolean properties "isGoingForward" (for home/end) and "isShiftEnabled" (for shift);
    // OR text key strings when these can be used independently of the plaform
    const selectAllCombinations = [
        [{isGoingForward: true, isShiftEnabled: false}, {isGoingForward: false, isShiftEnabled: true}],  // for ["End", "Shift+Home"]
        [{isGoingForward: false, isShiftEnabled: false}, {isGoingForward: true, isShiftEnabled: true}], // for ["Home", "Shift+End"]
        [process.platform == "darwin" ? "Meta+A" : "Control+A"],
    ] as (string | {isGoingForward: boolean, isShiftEnabled: boolean})[][];
    for (const selectAll of selectAllCombinations) {
        for (const deleteCommand of [["Backspace"], ["Delete"], [/*no press, just overtype*/]]) {
            test("Replace project description via " + JSON.stringify(selectAll) + " then " + JSON.stringify(deleteCommand), async ({page}, testInfo) => {
                await page.keyboard.press("Home");
                await page.keyboard.press("ArrowUp");
                await page.keyboard.press("ArrowUp");
                await page.keyboard.press("ArrowLeft");
                await page.keyboard.type(". Initial project description");
                await page.waitForTimeout(2000);
                for (const key of selectAll) {
                    if(typeof key == "string"){
                        await page.keyboard.press(key);
                    }
                    else{
                        await doTextHomeEndKeyPress(page, key.isGoingForward, key.isShiftEnabled);
                    }
                    await page.waitForTimeout(2000);
                }
                await page.waitForTimeout(2000);
                for (const key of deleteCommand) {
                    await page.keyboard.press(key);
                }
                await page.waitForTimeout(2000);
                await page.keyboard.type("The replacement");
                expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''The replacement'''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart());
            });
        }
    }

    test("Enter project and function description with quotes in it", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type(". \"This is in double quotes\" and ''this is in doubled single quotes'' and this is an unmatched apostrophe of someone's.");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.type("f");
        await page.keyboard.type("foo");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.type("\"This is in double quotes\" and ''this is in doubled single quotes'' and this is also an unmatched apostrophe of someone's.");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''${defaultStandardStrypeProjectDocLiteralWithDotSpace}"This is in double quotes" and \\'\\'this is in doubled single quotes\\'\\' and this is an unmatched apostrophe of someone\\'s.'''
#(=> Section:Imports
#(=> Section:Definitions
def foo ( ) :
    '''"This is in double quotes" and \\'\\'this is in doubled single quotes\\'\\' and this is also an unmatched apostrophe of someone\\'s.'''
    pass
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart());
    });

    test("Enter project and function description with newlines in it", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type(". This has");
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("three");
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("lines.");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.type("f");
        await page.keyboard.type("foo");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.type("This has");
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("four");
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("lines");
        await page.keyboard.press("Shift+Enter");
        await page.keyboard.type("in total.");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''${defaultStandardStrypeProjectDocLiteralWithDotSpace}This has
three
lines.'''
#(=> Section:Imports
#(=> Section:Definitions
def foo ( ) :
    '''This has
    four
    lines
    in total.'''
    pass
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart());
    });

    test("Enter project description with triple quotes in it", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type(". This has horrible quotes: \"\"\" ''' \"\"\" ''' and backslashes by quotes \\' and some doubles to end: '' ''");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''${defaultStandardStrypeProjectDocLiteralWithDotSpace}This has horrible quotes: """ \\'\\'\\' """ \\'\\'\\' and backslashes by quotes \\\\\\' and some doubles to end: \\'\\' \\'\\''''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart());
    });
    
    // Round trip the last two above:
    test("Round trip awkward quotes #1", async ({page}, testInfo) => {
        await testPlaywrightRoundTripImportAndDownload(page, "tests/cypress/fixtures/project-documented-quotes.spy");
    });

    test("Round trip awkward quotes #2", async ({page}, testInfo) => {
        await testPlaywrightRoundTripImportAndDownload(page, "tests/cypress/fixtures/project-documented-quotes-2.spy");
    });

    test("Round trip awkward quotes #3", async ({page}, testInfo) => {
        await testPlaywrightRoundTripImportAndDownload(page, "tests/cypress/fixtures/project-documented-quotes-3.spy");
    });
});

test.describe("Up/down in description slots", () => {
    const multilineExample = `
#(=> Strype:1:std
'''One
two
three
four'''
#(=> Section:Imports
#(=> Section:Definitions
def foo ( ) :
    '''Five
    six
    seven
    eight'''
    return -4 
#(=> Section:Main
myString  = "Hello from Strype" 
print(myString) 
#(=> Section:End
`.trimStart();
    
    
    test("Navigates up/down in funcdoc slots then edits #1", async ({page}) => {
        await loadContent(page, multilineExample);
        // Cursor all the way to end, then back up to function:
        for (let i = 0; i < 30; i++) {
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(300);
        }
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        await page.keyboard.press(process.platform == "darwin" ? "Alt+ArrowUp" : "Control+ArrowUp");
        await page.waitForTimeout(300);
        // Then go into function, type "a" before header, down three times which should take us to before seven, and type "b"
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(200);
        await page.keyboard.type("a");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
        await page.keyboard.press("ArrowDown");
        await page.waitForTimeout(200);
        await page.keyboard.type("b");
        await page.waitForTimeout(200);
        const expected = multilineExample.replace("foo", "afoo").replace("seven", "bseven");
        expect(readFileSync(await save(page, false), "utf-8")).toEqual(expected);
    });
    test("Navigates up/down in funcdoc slots then edits #2", async ({page}) => {
        test.setTimeout(90_000);
        await loadContent(page, multilineExample);
        // Cursor all the way to end, then back up to function:
        for (let i = 0; i < 30; i++) {
            await page.keyboard.press("ArrowDown");
            await page.waitForTimeout(300);
        }
        // Get us beneath function header:
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press("ArrowUp");
            await page.waitForTimeout(300);
        }
        // Go left into header, then five times past "Eight":
        for (let i = 0; i < 1 + 5; i++) {
            await page.keyboard.press("ArrowLeft");
            await page.waitForTimeout(300);
        }
        // Then up one:
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(300);
        await page.keyboard.type("a");
        await page.waitForTimeout(200);
        const expected = multilineExample.replace("seven", "aseven");
        expect(readFileSync(await save(page, false), "utf-8")).toEqual(expected);
    });
});
