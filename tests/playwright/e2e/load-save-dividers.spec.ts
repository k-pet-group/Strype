import {Page, test, expect} from "@playwright/test";
import {load, save} from "../support/loading-saving";
import fs from "fs";

test.beforeEach(async ({ page, browserName }, testInfo) => {

    await page.goto("./", {waitUntil: "load"});
    await page.waitForSelector("body");
    //scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    //strypeElIds = await page.evaluate(() => (window as any)["StrypeHTMLELementsIDsGlobals"]);
    await page.evaluate(() => {
        (window as any).Playwright = true;
    });
    // Make browser's console.log output visible in our logs (useful for debugging):
    page.on("console", (msg) => {
        console.log("Browser log:", msg.text());
    });
});


async function loadHeader(page: Page, spyToLoad: string) : Promise<void> {
    const path = "tests/cypress/downloads/toload.spy";
    fs.writeFileSync(path, spyToLoad + `
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
#(=> Section:End`.trimStart());
    await load(page, path);
}

async function getSplitterPos(page: Page, locator: string) {
    const splitter = await page.locator(locator);
    const box = await splitter.boundingBox({timeout: 5000});
    if (!box) {
        throw new Error("Could not get splitter position");
    }
    return box;
}

async function dragDividerTo(page: Page, locator: string, x: number, y: number) : Promise<void> {
    const box = await getSplitterPos(page, locator);

    const currentX = box.x + box.width / 2;
    const currentY = box.y + box.height / 2;
    
    await page.mouse.move(currentX, currentY);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 1 });
    await page.mouse.up();

}

async function saveAndCheck(page: Page, dividerStates: RegExp[]) {
    const path = await save(page);
    const saved = fs.readFileSync(path, "utf8");
    const savedLines = saved.split(/\r?\n/);
    expect(savedLines[0]).toEqual("#(=> Strype:1:std");
    for (let i = 0; i < dividerStates.length; i++) {
        expect(savedLines[1 + i]).toMatch(/^#\(=> .*/);
        expect(savedLines[1 + i].slice("#(=> ".length)).toMatch(dividerStates[i]);
    }
    expect(savedLines.slice(1 + dividerStates.length)).toEqual(`
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
myString  = "Hello from Python!" 
print(myString) 
#(=> Section:End
`.trimStart().split(/\r?\n/));
}

const CODE_VS_SIDEBAR = ".strype-split-theme.splitpanes.splitpanes--vertical > .splitpanes__splitter";
const COMMANDS_VS_PEA = ".splitpanes.splitpanes--horizontal.strype-commands-pea-splitter-theme > .splitpanes__splitter";

test.describe("Divider states", () => {
    test("Saves main divider state", async ({page}) => {
        await page.waitForTimeout(10 * 1000);
        await dragDividerTo(page, CODE_VS_SIDEBAR, 10, 300);
        await saveAndCheck(page, [/editorCommandsSplitterPane2Size:\{"tabsCollapsed":67\}/]);
    });
    test("Saves secondary divider state", async ({page}) => {
        await page.waitForTimeout(10 * 1000);
        await dragDividerTo(page, COMMANDS_VS_PEA, 1000, 10);
        await saveAndCheck(page, [/peaCommandsSplitterPane2Size:\{"tabsCollapsed":9[0-9].?[0-9]*\}/]);
    });
    test("Saves main and secondary divider state", async ({page}) => {
        await page.waitForTimeout(10 * 1000);
        await dragDividerTo(page, COMMANDS_VS_PEA, 1000, 10);
        await page.waitForTimeout(5 * 1000);
        await dragDividerTo(page, CODE_VS_SIDEBAR, 10, 300);
        
        await saveAndCheck(page, [/editorCommandsSplitterPane2Size:\{"tabsCollapsed":67\}/, /peaCommandsSplitterPane2Size:\{"tabsCollapsed":9[0-9].?[0-9]*\}/]);
    });
    
    test("Loads main divider state", async ({page}) => {
        loadHeader(page, `
#(=> Strype:1:std
#(=> editorCommandsSplitterPane2Size:{"tabsCollapsed":50}
#(=> peaLayoutMode:tabsCollapsed
`.trimStart());
        await page.waitForTimeout(10 * 1000);
        // Now check divider is in right position:
        const pos = await getSplitterPos(page, CODE_VS_SIDEBAR);
        const viewport = page.viewportSize();
        expect(Math.abs((viewport?.width ?? 9999) / 2 - pos.x)).toBeLessThanOrEqual(5);
    });
    test("Loads secondary divider state", async ({page}) => {
        loadHeader(page, `
#(=> Strype:1:std
#(=> peaCommandsSplitterPane2Size:{"tabsCollapsed":50}
#(=> peaLayoutMode:tabsCollapsed
`.trimStart());
        await page.waitForTimeout(10 * 1000);
        // Now check divider is in right position:
        const pos = await getSplitterPos(page, COMMANDS_VS_PEA);
        const viewport = page.viewportSize();
        expect(Math.abs((viewport?.height ?? 9999) / 2 - pos.y)).toBeLessThanOrEqual(5);
    });
    test("Loads main and secondary divider state", async ({page}) => {
        loadHeader(page, `
#(=> Strype:1:std
#(=> editorCommandsSplitterPane2Size:{"tabsCollapsed":50}
#(=> peaCommandsSplitterPane2Size:{"tabsCollapsed":50}
#(=> peaLayoutMode:tabsCollapsed
`.trimStart());
        await page.waitForTimeout(10 * 1000);
        // Now check divider is in right position:
        const posA = await getSplitterPos(page, CODE_VS_SIDEBAR);
        const posB = await getSplitterPos(page, COMMANDS_VS_PEA);
        const viewport = page.viewportSize();
        expect(Math.abs((viewport?.width ?? 9999) / 2 - posA.x)).toBeLessThanOrEqual(5);
        expect(Math.abs((viewport?.height ?? 9999) / 2 - posB.y)).toBeLessThanOrEqual(5);
    });
});

