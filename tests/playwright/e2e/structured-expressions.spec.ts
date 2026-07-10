import {test} from "@playwright/test";
import {assertStateOfFuncCallFrame, assertStateOfVarAssignFrame, doPagePaste, doTextHomeEndKeyPress, pressN, waitForEditorSettled} from "../support/editor";
import { skipPyodideLoading } from "../support/general";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    if (browserName === "webkit" && process.platform === "win32") {
        // On Windows+Webkit it just can't seem to load the page for some reason:
        testInfo.skip(true, "Skipping on Windows + WebKit due to unknown problems");
    }
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
    await skipPyodideLoading(page);
    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
});

test.describe("Function call frame to variable assignment frame transformation", () => {
    test("Just have \"=\"", async ({page}) => {
        // Make a function call and "=" right away
        await page.keyboard.type(" =");
        await waitForEditorSettled(page);
        await assertStateOfVarAssignFrame(page,"{}", "{$}({}){}");
    });

    test("Have \"a=\"", async ({page}) => {
        // Make a function call and "a=" right away
        await page.keyboard.type(" a=");
        await waitForEditorSettled(page);
        await assertStateOfVarAssignFrame(page,"{a}", "{$}({}){}");
    });


    test("Have \"abc123\" to \"abc=123\"", async ({page}) => {
        // Make a function call and "abc123" 
        await page.keyboard.type(" abc123");
        await waitForEditorSettled(page);
        // Get before "123" and transform to varassign
        await pressN("ArrowLeft", 3, true)(page);
        await page.keyboard.press("=");
        await waitForEditorSettled(page);
        await assertStateOfVarAssignFrame(page,"{abc}", "{$123}({}){}");
    });


    test("Have \"ab==456\" to \"a=b=456\"", async ({page}) => {
        // Make a function call and "ab456" 
        await page.keyboard.type(" ab456");
        await waitForEditorSettled(page);
        // Get before "456" and copy double equals
        await pressN("ArrowLeft", 3, true)(page);
        await waitForEditorSettled(page);
        await doPagePaste(page, "==");
        await waitForEditorSettled(page);
        // Get after "a" then transform
        await doTextHomeEndKeyPress(page, false, false),
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await page.keyboard.press("=");
        await waitForEditorSettled(page);
        await assertStateOfVarAssignFrame(page,"{a}", "{$b}=={456}({}){}");
    });    
});

test.describe("Variable assignment frame to function call frame transformation",() => {
    test("Empty content and forward deletion", async ({page}) => {
        // Make a varassign frame
        await page.keyboard.press("=");
        await waitForEditorSettled(page);
        // Transform
        await page.keyboard.press("Delete");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{$}");
    });

    test("Empty content and backward deletion", async ({page}) => {
        // Make a varassign frame
        await page.keyboard.type("=");       
        await waitForEditorSettled(page);
        // Go at the start of RHS      
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        // Transform
        await page.keyboard.press("Backspace");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{$}");
    });

    test("With content and forward deletion", async ({page}) => {
        // Make a varassign frame with content
        await page.keyboard.type("=a+(b)=");
        await waitForEditorSettled(page);
        await page.keyboard.type("(c+d");
        await waitForEditorSettled(page);
        // Go at the end of LHS
        await page.keyboard.press("ArrowUp");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowRight");
        await waitForEditorSettled(page);
        await doTextHomeEndKeyPress(page, true, false);
        await waitForEditorSettled(page);
        // Transform
        await page.keyboard.press("Delete");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{a}+{}({b}){$}({c}+{d}){}");
    });

    test("With content and backward deletion", async ({page}) => {
        // Make a varassign frame with content
        await page.keyboard.type("=[a+b]=");
        await waitForEditorSettled(page);
        await page.keyboard.type("c\"def");
        await waitForEditorSettled(page);
        // Go at the start of RHS
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowLeft");
        await waitForEditorSettled(page);
        await doTextHomeEndKeyPress(page, false, false);
        await waitForEditorSettled(page);
        // Transform
        await page.keyboard.press("Backspace");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{}[{a}+{b}]{$c}“def”{}");
    });

    test("With simple content and backward deletion, staying in frame", async ({page}) => {
        // Make a varassign frame with content
        await page.keyboard.type("=simple=");
        await waitForEditorSettled(page);
        await page.keyboard.type("content");
        await waitForEditorSettled(page);
        // Go at the start of RHS
        await doTextHomeEndKeyPress(page, false, false);
        await waitForEditorSettled(page);
        // Transform
        await page.keyboard.press("Backspace");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{simple$content}");
    });

    test("With simple content and forward deletion, staying in frame", async ({page}) => {
        // Make a varassign frame with content
        await page.keyboard.type("=foo=");
        await waitForEditorSettled(page);
        await page.keyboard.type("bar");
        await waitForEditorSettled(page);
        // Go at the start of RHS
        await doTextHomeEndKeyPress(page, false, false);
        await waitForEditorSettled(page);
        await page.keyboard.press("ArrowLeft");
        await waitForEditorSettled(page);      
        // Transform
        await page.keyboard.press("Delete");
        // Check result
        await waitForEditorSettled(page);
        await assertStateOfFuncCallFrame(page,"{foo$bar}");
    });
});
