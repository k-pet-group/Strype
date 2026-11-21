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

test("Closing the widget after a replacement leaves the next match selected in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("someone");
    await expect(status(page)).toHaveText(/of 5$/);
    // Go to the match before last: print(myString), and replace it (the current match is then the next one: greet(myString))
    while (await status(page).textContent() != "4 of 5") {
        await searchInput(page).press("Enter");
    }
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("4 of 4");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.type("someText");
    // Close the autocompletion, then leave the slot
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("print(myString)", "print(someone)").replace("greet(myString)", "greet(someText)"));
});

test("Closing the widget after replacing the only match leaves the caret after the replacement in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("Hello");
    await replaceInput(page).fill("Bye");
    await expect(status(page)).toHaveText("1 of 1");
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("No results");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.type("!");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("Hello from", "Bye! from"));
});

test("Closing the widget after replacing all leaves the caret after the last replacement in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("someone");
    await expect(status(page)).toHaveText(/of 5$/);
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("5 replaced");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.type("Else");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replaceAll("myString", "someone").replace("greet(someone)", "greet(someoneElse)"));
});

test("Pasting in the widget pastes in its fields, not in the editor", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await expect(searchInput(page)).toBeFocused();
    // (the frame cursor, still shown in the editor, mustn't take the paste: the browser's own paste in the field must happen)
    const isPasteCancelled = await page.evaluate(() => {
        const pasteEvent = new ClipboardEvent("paste", {bubbles: true, cancelable: true, clipboardData: new DataTransfer()});
        pasteEvent.clipboardData?.setData("text/plain", "x = 1");
        document.activeElement?.dispatchEvent(pasteEvent);
        return pasteEvent.defaultPrevented;
    });
    expect(isPasteCancelled).toBe(false);
    await expect(widget(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode);
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

test("Undoing a replacement puts the text cursor after the replaced text", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("message");
    await expect(status(page)).toHaveText(/of 5$/);
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("5 replaced");
    // (the replace all button, now disabled, doesn't keep the focus)
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    // The text cursor goes after the first replaced text: in the project documentation
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    await page.keyboard.type("X");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("about myString", "about myStringX"));
});

test("Redoing a replacement puts the text cursor after the replacement", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    await searchInput(page).fill("myString");
    await replaceInput(page).fill("message");
    await expect(status(page)).toHaveText(/of 5$/);
    // Replace the last match: greet(myString)
    while (await status(page).textContent() != "5 of 5") {
        await searchInput(page).press("Enter");
    }
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText(/of 4$/);
    // Closing selects the next match: we leave its slot (the frame caret is then elsewhere)
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    await page.keyboard.press("ControlOrMeta+y");
    await waitForEditorSettled(page);
    await page.keyboard.type("Y");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("greet(myString)", "greet(messageY)"));
});

// Gets the text of the header of the frame where the text cursor is (empty if there is no text cursor in a slot)
async function getTextCursorFrameHeaderText(page: Page): Promise<string> {
    return page.evaluate(() => {
        const focusNode = document.getSelection()?.focusNode;
        const element = (focusNode instanceof Element) ? focusNode : focusNode?.parentElement;
        const slot = element?.closest("[id^='input_frame']");
        return (slot?.closest(".frame-header")?.textContent ?? "").replace(/​/g, "");
    });
}

test("Redoing a replacement after undoing several ones puts the text cursor after that replacement", async ({page}) => {
    await page.keyboard.press(searchReplaceShortcut);
    // (the replacements change the structure of the code: the labels are re-parsed)
    await searchInput(page).fill("(myString)");
    await replaceInput(page).fill("(myString + 1)");
    await expect(status(page)).toHaveText(/of 2$/);
    // Replace print(myString), then greet(myString)
    while (await status(page).textContent() != "1 of 2") {
        await searchInput(page).press("Enter");
    }
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("1 of 1");
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("No results");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    // Undoing both, then redoing the first one: the text cursor is after that first replacement (not where the second one is)
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    await page.keyboard.press("ControlOrMeta+z");
    await waitForEditorSettled(page);
    await page.keyboard.press("ControlOrMeta+y");
    await waitForEditorSettled(page);
    expect(await getTextCursorFrameHeaderText(page)).toMatch(/^print\(/);
    // And redoing the second one
    await page.keyboard.press("ControlOrMeta+y");
    await waitForEditorSettled(page);
    expect(await getTextCursorFrameHeaderText(page)).toMatch(/^greet\(/);
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode.replace("print(myString)", "print(myString + 1)").replace("greet(myString)", "greet(myString + 1)"));
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

// Gets how the slots of the frames of the main code are rendered: for each frame header, the text and the classes
// of each of its slots (code, string, operator with its precedence spacing tier...)
async function getRenderedMainCodeSlots(page: Page): Promise<string[][]> {
    const scssVars = await page.evaluate(() => (window as any)["StrypeSCSSVarsGlobals"]);
    const headers = page.locator("#frameContainer_-3 ." + scssVars.frameHeaderClassName);
    const result: string[][] = [];
    for (const header of await headers.all()) {
        result.push(await header.locator("." + scssVars.labelSlotInputClassName).evaluateAll((slots) => slots.map((slot) =>
            (slot.textContent ?? "").replace(/​/g, "") + " [" + [...slot.classList].sort().join(" ") + "]")));
    }
    return result;
}

test("Replacements with operators render the slots as if the code was loaded", async ({page}) => {
    await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
total  = price + tax
if price and tax  :
    print(price * tax, total)
#(=> Section:End
`);
    await waitForEditorSettled(page);
    await page.keyboard.press(searchReplaceShortcut);
    await widget(page).getByLabel("Match case").check();
    // A textual operator replaced by a symbol operator
    await searchInput(page).fill("and");
    await replaceInput(page).fill("-");
    await expect(status(page)).toHaveText("1 of 1");
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("No results");
    // A symbol operator replaced by textual operators (typed without spaces around them, as the search shows the symbol)
    await searchInput(page).fill("+");
    await replaceInput(page).fill("and not");
    await expect(status(page)).toHaveText("1 of 1");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    // Operators of different precedences, in a match spanning several slots and in a match within a single slot
    await searchInput(page).fill("price * tax");
    await replaceInput(page).fill("price//tax+1");
    await expect(status(page)).toHaveText("1 of 1");
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("No results");
    await widget(page).getByLabel("Whole word").check();
    await searchInput(page).fill("total");
    await replaceInput(page).fill("subtotal**2");
    // (the first one is the assignment's left-hand side)
    await expect(status(page)).toHaveText(/of 2$/);
    while (await status(page).textContent() != "2 of 2") {
        await searchInput(page).press("Enter");
    }
    await replaceInput(page).press("Enter");
    await expect(status(page)).toHaveText("1 of 1");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);

    const savedCode = await getSavedCode(page);
    // (we don't check the exact spacing of the saved code)
    expect(savedCode.replace(/ +/g, " ").replace(/ $/gm, "")).toContain("total = price and not tax\nif price - tax :\n print(price // tax + 1,subtotal ** 2)\n");
    const renderedSlots = await getRenderedMainCodeSlots(page);
    await loadContent(page, savedCode);
    await waitForEditorSettled(page);
    expect(renderedSlots).toEqual(await getRenderedMainCodeSlots(page));
});

test("Replacements within a single slot that aren't a simple token render the slots as if the code was loaded", async ({page}) => {
    await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
price  = tax * raw
print("Hello from Strype")
#(=> Section:End
`);
    await waitForEditorSettled(page);
    await page.keyboard.press(searchReplaceShortcut);
    await widget(page).getByLabel("Match case").check();
    // A name replaced by a keyword operator, which must become an operator
    await searchInput(page).fill("tax");
    await replaceInput(page).fill("and");
    await expect(status(page)).toHaveText("1 of 1");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    // Quotes inserted in a string, which end the string
    await searchInput(page).fill("Hello");
    await replaceInput(page).fill("\"hi\"");
    await expect(status(page)).toHaveText("1 of 1");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("1 replaced");
    await replaceInput(page).press("Escape");
    await expect(widget(page)).toBeHidden();
    await waitForEditorSettled(page);

    const savedCode = await getSavedCode(page);
    const renderedSlots = await getRenderedMainCodeSlots(page);
    await loadContent(page, savedCode);
    await waitForEditorSettled(page);
    expect(renderedSlots).toEqual(await getRenderedMainCodeSlots(page));
});

// Right-clicks near the bottom right corner of an element (which is empty for the code part and the left pane with our small project)
async function rightClickBottomOf(page: Page, elementId: string): Promise<void> {
    const box = await getBox(page.locator("#" + elementId));
    await page.mouse.click(box.x + box.width - 20, box.y + box.height - 20, {button: "right"});
}

const menuItem = (page: Page, label: string) => page.getByRole("menuitem", {name: new RegExp("^" + escapeRegExp(label))});

test("The widget can be opened from the editor's background context menu, and the project is marked modified after a replacement", async ({page}) => {
    await rightClickBottomOf(page, await strypeElIds(page).getEditorMiddleUID());
    await menuItem(page, en.contextMenu.searchReplace).click({timeout: 2000});
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

test("The editor's background context menu has undo, redo and find, but not the frame context menu", async ({page}) => {
    // The frame context menu doesn't have find any more
    await page.locator(".frame-header:has-text('print')").first().click({button: "right"});
    await expect(menuItem(page, en.contextMenu.delete).first()).toBeVisible();
    await expect(menuItem(page, en.contextMenu.find)).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.locator(".mx-context-menu")).toHaveCount(0);

    // On the left pane's background (below its buttons): undo and redo (both disabled since nothing was done yet), then find and find and replace, with their shortcuts
    const menuBox = await getBox(page.locator("#" + await strypeElIds(page).getMenuLeftPaneUID()));
    const editorBox = await getBox(page.locator("#" + await strypeElIds(page).getEditorMiddleUID()));
    await page.mouse.click(menuBox.x + menuBox.width / 2, editorBox.y + editorBox.height - 20, {button: "right"});
    const shortcutPrefix = (process.platform == "darwin") ? "⌘" : "Ctrl+";
    for (const [label, shortcut] of [[en.contextMenu.undo, "Z"], [en.contextMenu.redo, "Y"], [en.contextMenu.find, "F"], [en.contextMenu.searchReplace, (process.platform == "darwin") ? "⇧F" : "Shift+F"]]) {
        await expect(menuItem(page, label)).toBeVisible();
        await expect(menuItem(page, label)).toContainText(shortcutPrefix + shortcut);
    }
    await expect(page.locator(".mx-context-menu .mx-context-menu-item.disabled")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator(".mx-context-menu")).toHaveCount(0);

    // Do a change, then undo and redo it from the menu of the code part's background
    await page.keyboard.press(searchReplaceShortcut);
    await page.keyboard.type("greet");
    await replaceInput(page).fill("welcome");
    await page.locator("#searchReplaceReplaceAllButton").click();
    await expect(status(page)).toHaveText("3 replaced");
    await widget(page).locator(".search-replace-close-btn").click();
    await expect(widget(page)).toBeHidden();
    await waitForEditorSettled(page);
    const replacedCode = await getSavedCode(page);
    expect(replacedCode).toContain("welcome");
    await rightClickBottomOf(page, await strypeElIds(page).getEditorMiddleUID());
    await menuItem(page, en.contextMenu.undo).click({timeout: 2000});
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(projectCode);
    await rightClickBottomOf(page, await strypeElIds(page).getEditorMiddleUID());
    await menuItem(page, en.contextMenu.redo).click({timeout: 2000});
    await waitForEditorSettled(page);
    expect(await getSavedCode(page)).toEqual(replacedCode);

    // No menu on the left pane's buttons, nor on the right pane
    await page.locator("#" + await strypeElIds(page).getMenuLeftPaneUID() + " .menu-icon-entry").first().click({button: "right"});
    await expect(page.locator(".mx-context-menu")).toHaveCount(0);
    await rightClickBottomOf(page, await strypeElIds(page).getCommandsRightPaneContainerId());
    await expect(page.locator(".mx-context-menu")).toHaveCount(0);
});

test("Going to a match in the section that isn't showing (My code or Test code) switches to it", async ({page, browserName}) => {
    await loadContent(page, `#(=> Strype:1:std
#(=> Section:Imports
#(=> Section:Definitions
#(=> Section:Main
check = 1 
#(=> Section:Testing
def test_check ( ) :
    assert check == 1 
#(=> Section:End
`);
    await waitForEditorSettled(page);
    const selectedTab = page.locator("#frameContainer_-3 .frame-container-header .frame-container-tab-selected");
    const mainAssignment = page.locator("#frameContainer_-3 .frame-div[data-frameType='varassign']");
    const testAssert = page.locator("#frameContainer_-4 .frame-div[data-frameType='assert']");
    await expect(selectedTab).toHaveAttribute("data-tab", "main");
    await page.keyboard.press(findShortcut);
    // The search starts from the frame cursor, which loading leaves below the last frame of My code: the first match
    // is in Test code, which is shown as soon as the search is typed
    await page.keyboard.type("chec");
    await expect(selectedTab).toHaveAttribute("data-tab", "tests");
    await expect(testAssert).toBeVisible();
    // The popup is still opened, with the focus in the search field, which still has its text cursor so the user can carry on typing:
    // switching the section clears the document's selection, which leaves an input unable to take what the user types in the browser
    // (Playwright's typing would still work, so we check the selection itself; Firefox keeps an input's text cursor out of the
    // document's selection, which then has no range, so we can't check it there)
    await expect(searchInput(page)).toBeFocused();
    if (browserName != "firefox") {
        await expect.poll(() => page.evaluate(() => document.getSelection()?.rangeCount)).toEqual(1);
    }
    await page.keyboard.type("k");
    await expect(searchInput(page)).toHaveValue("check");
    // The assignment in My code, the test function's name and the assert in Test code: we go to the match in My code
    await expect(status(page)).toHaveText(/^\d of 3$/);
    const firstIndex = parseInt(await status(page).textContent() as string);
    for (let i = firstIndex; i <= 3 && firstIndex > 1; i++) {
        await page.keyboard.press("Enter");
    }
    await expect(status(page)).toHaveText("1 of 3");
    await expect(selectedTab).toHaveAttribute("data-tab", "main");
    await expect(mainAssignment).toBeVisible();
    // The next match is in Test code: it is shown
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("2 of 3");
    await expect(selectedTab).toHaveAttribute("data-tab", "tests");
    await expect(testAssert).toBeVisible();
    await expect(mainAssignment).toBeHidden();
    await expect(searchInput(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("3 of 3");
    await expect(selectedTab).toHaveAttribute("data-tab", "tests");
    // Wrapping around goes back to My code, and going backwards to Test code again
    await page.keyboard.press("Enter");
    await expect(status(page)).toHaveText("1 of 3");
    await expect(selectedTab).toHaveAttribute("data-tab", "main");
    await expect(mainAssignment).toBeVisible();
    await page.keyboard.press("Shift+Enter");
    await expect(status(page)).toHaveText("3 of 3");
    await expect(selectedTab).toHaveAttribute("data-tab", "tests");
    // Closing leaves the current match selected in the editor, in Test code
    await page.keyboard.press("Escape");
    await expect(widget(page)).toBeHidden();
    await expect(selectedTab).toHaveAttribute("data-tab", "tests");
    await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toEqual("check");
});
