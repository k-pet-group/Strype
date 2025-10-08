import {test, expect} from "@playwright/test";
import {checkFrameXorTextCursor} from "../support/editor";
import {readFileSync} from "node:fs";
import {save, testPlaywrightRoundTripImportAndDownload} from "../support/loading-saving";

// The tests in this file can't run in parallel because they download
// to the same filenames, so need to run one at a time.
test.describe.configure({ mode: "serial" });

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
        await page.keyboard.type("A project description");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''A project description'''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Python!" 
print(myString) 
#(=> Section:End
`.trimStart());
    });
    
    for (const selectAll of [["End", "Shift+Home"], ["Home", "Shift+End"], [process.platform == "darwin" ? "Meta+A" : "Control+A"]]) {
        for (const deleteCommand of [["Backspace"], ["Delete"], [/*no press, just overtype*/]]) {
            test("Replace project description via " + JSON.stringify(selectAll) + " then " + JSON.stringify(deleteCommand), async ({page}, testInfo) => {
                await page.keyboard.press("Home");
                await page.keyboard.press("ArrowUp");
                await page.keyboard.press("ArrowUp");
                await page.keyboard.press("ArrowLeft");
                await page.keyboard.type("Initial project description");
                for (const key of selectAll) {
                    await page.keyboard.press(key);
                }
                await page.waitForTimeout(200);
                for (const key of deleteCommand) {
                    await page.keyboard.press(key);
                }
                await page.waitForTimeout(200);
                await page.keyboard.type("The replacement");
                expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''The replacement'''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Python!" 
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
        await page.keyboard.type("\"This is in double quotes\" and ''this is in doubled single quotes'' and this is an unmatched apostrophe of someone's.");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowDown");
        await page.keyboard.type("f");
        await page.keyboard.type("foo");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.type("\"This is in double quotes\" and ''this is in doubled single quotes'' and this is also an unmatched apostrophe of someone's.");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''"This is in double quotes" and \\'\\'this is in doubled single quotes\\'\\' and this is an unmatched apostrophe of someone\\'s.'''
#(=> Section:Imports
#(=> Section:Definitions
def foo ( ) :
    '''"This is in double quotes" and \\'\\'this is in doubled single quotes\\'\\' and this is also an unmatched apostrophe of someone\\'s.'''
    pass
#(=> Section:Main
myString  = "Hello from Python!" 
print(myString) 
#(=> Section:End
`.trimStart());
    });

    test("Enter project and function description with newlines in it", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type("This has");
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
'''This has
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
myString  = "Hello from Python!" 
print(myString) 
#(=> Section:End
`.trimStart());
    });

    test("Enter project description with triple quotes in it", async ({page}, testInfo) => {
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowUp");
        await page.keyboard.press("ArrowLeft");
        await page.keyboard.type("This has horrible quotes: \"\"\" ''' \"\"\" ''' and backslashes by quotes \\' and some doubles to end: '' ''");
        expect(readFileSync(await save(page), "utf-8")).toEqual(`
#(=> Strype:1:std
'''This has horrible quotes: """ \\'\\'\\' """ \\'\\'\\' and backslashes by quotes \\\\\\' and some doubles to end: \\'\\' \\'\\''''
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Python!" 
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
