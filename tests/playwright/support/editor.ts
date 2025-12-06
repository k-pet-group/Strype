import {Page, expect} from "@playwright/test";

// If the last param is given, we check for frame cursor (true) or text (false)
// If it's not given, no specific check, just check only one or the other is visible
export async function checkFrameXorTextCursor(page: Page, specificFrameCursor?: boolean, message?: string) : Promise<void> {
    // Check exactly one caret visible or focused input field:
    const numFrameCursors = await page.evaluate(() => {
        const scssVars = (window as any)["StrypeSCSSVarsGlobals"];
        const visibleFrameCursorElements = document.querySelectorAll("."+ scssVars.caretClassName + ":not(." + scssVars.invisibleClassName +")");
        return visibleFrameCursorElements.length;
    });
    const hasTextCursor = await page.evaluate(() => {
        return document?.getSelection()?.focusNode != null;
    });
    expect(numFrameCursors, message).toEqual(hasTextCursor ? 0 : 1);
    if (specificFrameCursor !== undefined) {
        if (specificFrameCursor == true) {
            expect(numFrameCursors, message).toEqual(1);
        }
        else {
            expect(hasTextCursor, message).toEqual(true);
        }
    }
}

export async function checkTextSlotCursorPos(page: Page, expectedPos: number): Promise<void> {
    const docSelectionFocusOffset = await page.evaluate(() =>{
        return document?.getSelection()?.focusOffset;
    });
    expect(docSelectionFocusOffset).toEqual(expectedPos);
}

async function getSelection(page: Page) : Promise<{ id: string, cursorPos : number }> {
    // We need a delay to make sure last DOM update has occurred:
    await page.waitForSelector("#editor");
    return page.locator("#editor").evaluate((ed) => {
        return {id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")};
    });
}

async function assertLabelSlotsContent(page: Page, expectedState: string, isInStatementFrame?: boolean) {
    const info = await getSelection(page);
    const scssVars = await page.evaluate(() => {
        return (window as any)["StrypeSCSSVarsGlobals"];
    });
    const s = await page.locator("#frameContainer_-3" + " ." + scssVars.frameHeaderClassName).first().locator("." + scssVars.labelSlotInputClassName + ", ." + scssVars.frameColouredLabelClassName).evaluateAll((parts, info: { id: string, cursorPos : number, isInStatementFrame?: boolean }) => {
        let s = "";
        if (!parts) {
            // Try to debug an occasional seemingly impossible failure:
            console.log("Parts is null which I'm sure shouldn't happen");
        }
        // If we're in a block frame like "if", we ignore the first and last part:
        const parseOffset = (info.isInStatementFrame) ? 0 : 1;
        for (let i = 1; i < parts.length - parseOffset; i++) {
            const p: any = parts[i];

            let text = (p.value || p.textContent || "").replace("\u200B", "");

            // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
            if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
            }
            // Don't put curly brackets around strings, operators or brackets:
            if (!p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameStringSlotClassName) && !p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameOperatorSlotClassName) && !/[([)\]$]/.exec(p.textContent)) {
                text = "{" + text + "}";
            }
            s += text;
        }
        return s;
    }, {...info, isInStatementFrame: isInStatementFrame});
    // There is no correspondence for _ (indicating a null operator) in the Strype interface so just ignore that:
    expect(s).toEqual(expectedState.replaceAll("_", ""));
}

export async function assertStateOfIfFrame(page: Page, expectedState : string) : Promise<void> {
    await assertLabelSlotsContent(page, expectedState);
}

export async function assertStateOfVarAssignFrame(page: Page, expectedLHSState : string, expectedRHSState: string) : Promise<void> {
    // 1 - Check the equal operator exists:
    const scssVars = await page.evaluate(() => {
        return (window as any)["StrypeSCSSVarsGlobals"];
    });
    const firstHeader = await page.locator("#frameContainer_-3" + " ." + scssVars.frameHeaderClassName).first();
    const varassignLabelSlot = await firstHeader.locator(".frame-header-label-varassign" + "." + scssVars.frameColouredLabelClassName);    
    const varassignLabelSlotCount = await varassignLabelSlot.count();
    // Make an existence test, doing that will avoid having another test triggering timeouts if the varassign slot doesn't exist (we have 2 as the first label slots struct as en empty label).
    expect(varassignLabelSlotCount, "No varassign label slot label (with \"⇐\") is on the frame.").toEqual(2);
    // Now check its content just in case...
    const varassignLabelSlotContent = await varassignLabelSlot.last().textContent();
    expect(varassignLabelSlotContent).toEqual(" ⇐ ");
    
    // 2 - Check the expected text part:
    await assertLabelSlotsContent(page, `${expectedLHSState}{ ⇐ }${expectedRHSState}`, true);
}

export async function typeIndividually(page: Page, content: string, timeout = 75) : Promise<void> {
    for (let i = 0; i < content.length; i++) {
        if (content[i] == "\n") {
            await page.keyboard.press("Shift+Enter");
        }
        else {
            await page.keyboard.type(content[i]);
        }
        await page.waitForTimeout(timeout);
    }
}

export async function doPagePaste(page: Page, clipboardContent: string, clipboardContentType = "text") : Promise<void> {
    await page.evaluate(({clipboardContent, clipboardContentType}) => {
        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer(),
        });

        // Set custom clipboard data for the paste event
        if (clipboardContentType.startsWith("text")) {
            pasteEvent.clipboardData?.setData(clipboardContentType, clipboardContent);
        }
        else {
            const byteCharacters = atob(clipboardContent);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const file = new File([new Blob([new Uint8Array(byteNumbers)], {type: clipboardContentType})], "anon", { type: clipboardContentType});
            pasteEvent.clipboardData?.items.add(file);
        }

        // Dispatch the paste event to the whole document
        document.activeElement?.dispatchEvent(pasteEvent);
    }, {clipboardContent, clipboardContentType});
    await page.waitForTimeout(300);
}

export async function doTextHomeEndKeyPress(page: Page, isGoingForward: boolean, isShiftEnabled: boolean) : Promise<void> {
    // This methods is a helper to handle the tricky case of "home" or "end" actions for text navigation.
    // With Windows, home and end keys are dedicated keys and their action moves the caret at the start/end of a line.
    // With macOS, there is no dedicated key, but equivalent action is obtained by ⌘+Left/Right.
    if(process.platform == "darwin"){
        await page.keyboard.press(`${isShiftEnabled ? "Shift+" : ""}Meta+${isGoingForward ? "ArrowRight" : "ArrowLeft"}`);
    }
    else{
        await page.keyboard.press(`${isShiftEnabled ? "Shift+" : ""}${isGoingForward ? "End" : "Home"}`);
    }
    await page.waitForTimeout(200);
} 

export function pressN(key: string, n : number, enforceWaitBetween?: boolean) : ((page: Page) => Promise<void>) {
    return async (page) => {
        for (let i = 0; i < n; i++) {
            // Handle the issue with macOS for home/end, see the method details
            if(process.platform == "darwin" && (key == "Home" || key == "End")){
                await doTextHomeEndKeyPress(page, (key == "End"), false);
                return;
            }            
            await page.keyboard.press(key); 
            if(enforceWaitBetween){
                await page.waitForTimeout(100);
            }
        }
    };
}

export function getDefaultStrypeProjectDocumentationFullLine(): string {
    return "'''This is the default Strype starter project'''\n";
}
