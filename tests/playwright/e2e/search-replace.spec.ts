import {test, expect, Locator, Page} from "@playwright/test";
import {readFileSync} from "node:fs";
import {setupStrypeTest} from "../support/general";
import {waitForEditorSettled} from "../support/editor";
import {loadContent, save} from "../support/loading-saving";
import {strypeElIds} from "../support/proxy";
import en from "../../../src/localisation/en/en_main.json";

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Tests for the search and replace widget (SearchReplaceWidget.vue, helpers/searchReplace.ts)

const findShortcut = "ControlOrMeta+f";
const searchReplaceShortcut = "ControlOrMeta+Shift+f";

const projectCode = `#(=> Strype:1:std
'''A project about myString'''
#(=> Section:Imports
#(=> Section:Definitions
def greet (name ) :
    '''Greets someone
    with a second line
    '''
    print("Hi " + name) 
#(=> Section:Main
myString  = "Hello from myString" 
print(myString) 
greet(myString) 
#(=> Section:End
`;

const widget = (page: Page) => page.locator("#searchReplaceWidget");
const searchInput = (page: Page) => page.locator("#searchReplaceSearchInput");
const replaceInput = (page: Page) => page.locator("#searchReplaceReplaceInput");
const status = (page: Page) => page.locator("#searchReplaceStatus");
const toggleReplaceButton = (page: Page) => page.locator("#searchReplaceToggleReplaceButton");

async function getBox(locator: Locator): Promise<{x: number, y: number, width: number, height: number}> {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    return box as {x: number, y: number, width: number, height: number};
}

async function getSavedCode(page: Page): Promise<string> {
    return readFileSync(await save(page, false), "utf8").replace(/\r\n/g, "\n");
}

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 120000, skipPyodide: true});
    await loadContent(page, projectCode);
    await waitForEditorSettled(page);
});

test("The shortcut opens the widget and the matches wrap around", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await expect(widget(page)).toBeVisible();
    await expect(searchInput(page)).toBeFocused();
    await page.keyboard.type("myString");
    // Project doc, assignment's left-hand side, string, print argument, greet argument
    await expect(status(page)).toHaveText(/^\d of 5$/);
    const firstStatus = await status(page).textContent();
    const firstIndex = parseInt(firstStatus as string);
    for (let i = 1; i <= 5; i++) {
        await page.keyboard.press("Enter");
        await expect(status(page)).toHaveText(`${((firstIndex - 1 + i) % 5) + 1} of 5`);
    }
    // And backwards
    await page.keyboard.press("Shift+Enter");
    await expect(status(page)).toHaveText(`${((firstIndex + 3) % 5) + 1} of 5`);
    // Typing in the widget mustn't have changed the code
    await page.keyboard.press("Escape");
    await expect(widget(page)).toBeHidden();
    expect(await getSavedCode(page)).toEqual(projectCode);
});

test("Find only, with the replace part folded, which can be unfolded", async ({page}) => {
    await page.keyboard.press(findShortcut);
    await expect(widget(page)).toBeVisible();
    await expect(widget(page).locator(".search-replace-title")).toHaveText("Find");
    await expect(searchInput(page)).toBeFocused();
    await expect(replaceInput(page)).toBeHidden();
    await expect(toggleReplaceButton(page)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.type("myString");
    await expect(status(page)).toHaveText(/^\d of 5$/);
    const firstIndex = parseInt(await status(page).textContent() as string);
    // The previous and next buttons
    await page.locator("#searchReplaceNextButton").click();
    await expect(status(page)).toHaveText(`${(firstIndex % 5) + 1} of 5`);
    await page.locator("#searchReplacePreviousButton").click();
    await expect(status(page)).toHaveText(`${firstIndex} of 5`);
    // Unfolding the replace part (the focus goes in the replace field), and folding it again
    await toggleReplaceButton(page).click();
    await expect(replaceInput(page)).toBeFocused();
    await expect(toggleReplaceButton(page)).toHaveAttribute("aria-expanded", "true");
    await expect(widget(page).locator(".search-replace-title")).toHaveText("Find and replace");
    await toggleReplaceButton(page).click();
    await expect(replaceInput(page)).toBeHidden();
    await expect(searchInput(page)).toBeFocused();
    // The shortcuts, when the widget is already opened, fold or unfold the replace part
    await page.keyboard.press(searchReplaceShortcut);
    await expect(replaceInput(page)).toBeVisible();
    await expect(searchInput(page)).toBeFocused();
    await page.keyboard.press(findShortcut);
    await expect(replaceInput(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(widget(page)).toBeHidden();
    expect(await getSavedCode(page)).toEqual(projectCode);
});

test("The search text is empty at first, then the editor's selected text or the previous search text", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await expect(searchInput(page)).toBeFocused();
    await expect(searchInput(page)).toHaveValue("");
    await page.keyboard.type("myString");
    await expect(status(page)).toHaveText(/of 5$/);
    // Closing leaves the current match selected in the editor: we reduce the selection to "my" (in a slot)
    await page.keyboard.press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press("Shift+ArrowLeft");
    await page.keyboard.press(searchReplaceShortcut);
    await expect(searchInput(page)).toHaveValue("my");
    await expect(searchInput(page)).toBeFocused();
    // Without a selection, the previous search text is kept
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    await page.keyboard.press(searchReplaceShortcut);
    await expect(searchInput(page)).toHaveValue("my");
});

test("The project can be edited after clicking outside the widget, which closes it", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await page.keyboard.type("myString");
    await replaceInput(page).fill("other");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("5 replaced");
    // Clicking in the code closes the widget, and the code can be edited from there
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    await page.locator(".frame-header:has-text('greet(')").last().locator(`.${scssVars.labelSlotInputClassName}`, {hasText: /^other$/}).click();
    await expect(widget(page)).toBeHidden();
    // (End goes after the closing bracket: we come back into the argument's slot)
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.type("2");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replaceAll("myString", "other").replace("greet(other)", "greet(other2)"));
});

test("The widget can be moved by its header, and closed by its cross", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await expect(widget(page)).toBeVisible();
    const header = widget(page).locator(".search-replace-header");
    const closeButton = widget(page).locator(".search-replace-close-btn");
    // The cross is at the top right of the widget
    const widgetBox = await getBox(widget(page));
    const closeBox = await getBox(closeButton);
    expect(closeBox.y - widgetBox.y).toBeLessThan(widgetBox.height / 4);
    expect(widgetBox.x + widgetBox.width - (closeBox.x + closeBox.width)).toBeLessThan(widgetBox.width / 4);
    // The buttons are on the right of their input, and the replace part is below the search part
    const searchBox = await getBox(searchInput(page));
    const nextBox = await getBox(page.locator("#searchReplaceNextButton"));
    const replaceBox = await getBox(replaceInput(page));
    const replaceAllBox = await getBox(page.locator("#searchReplaceReplaceAllButton"));
    expect(nextBox.x).toBeGreaterThan(searchBox.x + searchBox.width);
    expect(nextBox.y).toBeLessThan(searchBox.y + searchBox.height);
    expect(replaceAllBox.x).toBeGreaterThan(replaceBox.x + replaceBox.width);
    expect(replaceAllBox.y).toBeLessThan(replaceBox.y + replaceBox.height);
    expect(replaceBox.y).toBeGreaterThan(searchBox.y + searchBox.height);
    // Drag the header to the left and down
    const headerBox = await getBox(header);
    await page.mouse.move(headerBox.x + 20, headerBox.y + headerBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(headerBox.x - 80, headerBox.y + headerBox.height / 2 + 60, {steps: 5});
    await page.mouse.up();
    await expect(widget(page)).toBeVisible();
    const movedBox = await getBox(widget(page));
    expect(Math.round(movedBox.x)).toEqual(Math.round(widgetBox.x - 100));
    expect(Math.round(movedBox.y)).toEqual(Math.round(widgetBox.y + 60));
    // Closing with the cross, then opening again: the widget is still where it was moved to
    await closeButton.click();
    await expect(widget(page)).toBeHidden();
    await page.keyboard.press(searchReplaceShortcut);
    await expect(widget(page)).toBeVisible();
    const reopenedBox = await getBox(widget(page));
    expect(Math.round(reopenedBox.x)).toEqual(Math.round(movedBox.x));
    expect(Math.round(reopenedBox.y)).toEqual(Math.round(movedBox.y));
});

test("Closing the widget leaves the current match selected in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await page.keyboard.type("myString");
    await expect(status(page)).toHaveText(/of 5$/);
    // Go to the last match: greet(myString)
    while (await status(page).textContent() != "5 of 5") {
        await page.keyboard.press("Enter");
    }
    await page.keyboard.press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.type("someText");
    // Close the autocompletion, then leave the slot
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("greet(myString)", "greet(someText)"));
});

test("Closing the widget after a replacement leaves the caret after the replacement in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("someone");
    await expect(status(page)).toHaveText(/of 5$/);
    // Go to the last match: greet(myString), and replace it (the current match is then another one)
    while (await status(page).textContent() != "5 of 5") {
        await searchInput(page).press("Enter");
    }
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText(/of 4$/);
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.type("Else");
    // Close the autocompletion, then leave the slot
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("greet(myString)", "greet(someoneElse)"));
});

test("The match options work", async ({page}) => {
    await page.keyboard.press(findShortcut);
    await page.keyboard.type("mystring");
    await expect(status(page)).toHaveText(/of 5$/);
    await widget(page).getByLabel("Match case").check();
    await expect(status(page)).toHaveText("No results");
    await widget(page).getByLabel("Match case").uncheck();
    await searchInput(page).fill("String");
    await expect(status(page)).toHaveText(/of 5$/);
    await widget(page).getByLabel("Whole word").check();
    await expect(status(page)).toHaveText("No results");
    await widget(page).getByLabel("Whole word").uncheck();
    await expect(status(page)).toHaveText(/of 5$/);
});

test("Replace one by one, undo, and the project is modified", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await expect(widget(page)).toBeVisible();
    await expect(searchInput(page)).toBeFocused();
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("greeting");
    await expect(status(page)).toHaveText(/of 5$/);
    // Replacing each match one by one (Enter in the replace field), wherever we started we replace all of them by wrapping around
    for (let i = 4; i >= 0; i--) {
        await replaceInput(page).press("Enter");
        await expect(status(page)).toHaveText((i == 0) ? "No results" : new RegExp(`of ${i}$`));
    }
    await expect(page.locator("#searchReplaceReplaceButton")).toBeDisabled();
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replaceAll("myString", "greeting"));

    // Each replacement can be undone
    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    expect((await getSavedCode(page)).match(/myString/g)?.length).toEqual(1);
});

test("Replace all, as a single undo step", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("message");
    await expect(status(page)).toHaveText(/of 5$/);
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("5 replaced");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replaceAll("myString", "message"));

    await page.keyboard.press("Escape");
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode);
});

test("Replacements can change the structure of the code", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    // A match across several slots (function call's name, brackets and argument)
    await searchInput(page).fill("print(myString)");
    await replaceInput(page).fill("print(len(myString) + 1)");
    await expect(status(page)).toHaveText("1 of 1");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    // A replacement in a string remains in the string, a match spanning an operator and a slot gets re-parsed
    await searchInput(page).fill("+ name");
    await replaceInput(page).fill("+ name.upper()");
    await expect(status(page)).toHaveText("1 of 1");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    await searchInput(page).fill("Hello");
    await replaceInput(page).fill("Hello('you') +");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode
        .replace("print(myString)", "print(len(myString) + 1)")
        .replace("\"Hi \" + name", "\"Hi \" + name.upper()")
        .replace("\"Hello from myString\"", "\"Hello('you') + from myString\""));
});

test("The widget can be opened from the frame context menu, and the project is marked modified after a replacement", async ({page}) => {
    await page.locator(".frame-header:has-text('print')").first().click({button: "right"});
    await page.getByRole("menuitem", {name: new RegExp("^" + escapeRegExp(en.contextMenu.searchReplace))}).click({timeout: 2000});
    await expect(widget(page)).toBeVisible();
    await expect(searchInput(page)).toBeFocused();
    await expect(replaceInput(page)).toBeVisible();
    await page.keyboard.type("greet");
    await replaceInput(page).fill("welcome");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("3 replaced");
    await page.keyboard.press("Escape");
    // The project being modified, loading another project asks what to do with the changes
    await page.click("#" + await strypeElIds(page).getEditorMenuUID());
    await page.click("#" + await strypeElIds(page).getLoadProjectLinkId());
    await expect(page.locator("#save-on-load-project-modal-dlg")).toBeVisible();
});
