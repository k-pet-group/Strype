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

export async function typeIndividually(page: Page, content: string, timeout = 75) : Promise<void> {
    for (let i = 0; i < content.length; i++) {
        await page.keyboard.type(content[i]);
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
}
