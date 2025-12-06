import {test} from "@playwright/test";
import {assertStateOfVarAssignFrame, doPagePaste, doTextHomeEndKeyPress, pressN} from "../support/editor";

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

test.describe("Function definition to variable assigment transformation", () => {
    test("Just have \"=\"", async ({page}) => {
        // Make a function call and "=" right away
        await page.keyboard.type(" =");
        await page.waitForTimeout(1000);
        await assertStateOfVarAssignFrame(page,"{}", "{$}({}){}");
    });

    test("Have \"a=\"", async ({page}) => {
        // Make a function call and "a=" right away
        await page.keyboard.type(" a=");
        await page.waitForTimeout(1000);
        await assertStateOfVarAssignFrame(page,"{a}", "{$}({}){}");
    });


    test("Have \"abc123\" to \"abc=123\"", async ({page}) => {
        // Make a function call and "abc123" 
        await page.keyboard.type(" abc123");
        await page.waitForTimeout(300);
        // Get before "123" and transform to varassign
        await pressN("ArrowLeft", 3, true)(page);
        await page.keyboard.press("=");
        await page.waitForTimeout(1000);
        await assertStateOfVarAssignFrame(page,"{abc}", "{$123}({}){}");
    });


    test("Have \"ab==456\" to \"a=b=456\"", async ({page}) => {
        // Make a function call and "ab456" 
        await page.keyboard.type(" ab456");
        await page.waitForTimeout(50);
        // Get before "456" and copy double equals
        await pressN("ArrowLeft", 3, true)(page);
        await page.waitForTimeout(150);
        await doPagePaste(page, "==");
        await page.waitForTimeout(50);
        // Get after "a" then transform
        await doTextHomeEndKeyPress(page, false, false),
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(150);
        await page.keyboard.press("=");
        await page.waitForTimeout(1000);
        await assertStateOfVarAssignFrame(page,"{a}", "{$b}=={456}({}){}");
    });    
});
