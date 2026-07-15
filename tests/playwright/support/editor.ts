import {Page, expect, ElementHandle} from "@playwright/test";
import {WINDOW_STRYPE_NEXTTICK_PROPNAME} from "@/helpers/sharedIdCssWithTests";

async function readEditorState(page: Page) : Promise<{focusId: string, cursor: string, frameCount: number}> {
    return page.evaluate(() => {
        const editor = document.querySelector("#editor");
        return {
            focusId: editor?.getAttribute("data-slot-focus-id") ?? "",
            cursor: editor?.getAttribute("data-slot-cursor") ?? "",
            frameCount: document.querySelectorAll(".frame-div").length,
        };
    });
}

// Waits for the editor to settle after an action, rather than guessing how long it will take.
// Most keystrokes only need Vue's reactivity to flush (a couple of nextTicks, plus one macrotask
// turn for logic deferred via a zero-delay setTimeout) -- this resolves in a few ms. But some
// editor actions (e.g. converting a function-call frame to a variable assignment when typing "=",
// see LabelSlotsStructure.vue) go through a genuine debounce timer (300ms there; similar 200ms/
// 1000ms timers exist elsewhere in the editor) that nextTick cannot wait through. So after
// flushing reactivity, we additionally poll the focused slot and frame count until they stop
// changing, bounded by timeoutMs (comfortably above the largest known timer).
export async function waitForEditorSettled(page: Page, timeoutMs = 4000) : Promise<void> {
    await page.evaluate(async (prop) => {
        await (window as any)[prop]();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await (window as any)[prop]();
    }, WINDOW_STRYPE_NEXTTICK_PROPNAME);

    const start = Date.now();
    let last = await readEditorState(page);
    let stableCount = 0;
    while (Date.now() - start < timeoutMs) {
        await page.waitForTimeout(30);
        const cur = await readEditorState(page);
        if (cur.focusId === last.focusId && cur.cursor === last.cursor && cur.frameCount === last.frameCount) {
            stableCount++;
            // A blank focus id (no slot focused) is also used by the app as a transient marker
            // while some restructuring is in flight -- e.g. converting a function-call frame to a
            // variable assignment on typing "=" holds focus blank for a genuine ~300ms debounce
            // (see LabelSlotsStructure.vue), and that blank reading is itself stable across many
            // consecutive polls during the whole debounce window, which would otherwise fool this
            // into returning mid-restructure. Frame-level pastes can legitimately end up blank too
            // (a frame caret, not a slot), so we can't just refuse blank outright -- instead
            // require more consecutive stable reads (~450ms) before trusting a blank state than a
            // real one (~30ms), comfortably past the known debounce:
            if (stableCount >= (cur.focusId === "" ? 15 : 1)) {
                return;
            }
        }
        else {
            stableCount = 0;
        }
        last = cur;
    }
}

// This enumeration is used for the media slots placeholder when parsing slots
// Don't use "_" in the values as they will be scrapped by the parser later.
export enum MEDIA_SLOT_PARSED_PLACEHOLDER {
    unknown="<unknown-media>", // Doesn't match anything of Strype's media, but used for the tests sanity checks
    image="<media-img>",
    sound="<media-snd>",
}

// If the last param is given, we check for frame cursor (true) or text (false)
// If it's not given, no specific check, just check only one or the other is visible
// Returns the cursor or focused HTML Element
export async function checkFrameXorTextCursor(page: Page, specificFrameCursor?: boolean, message?: string) : Promise<ElementHandle> {
    // Check exactly one caret visible or focused input field:
    const frameCursors = await page.evaluateHandle(() => {
        const scssVars = (window as any)["StrypeSCSSVarsGlobals"];
        const visibleFrameCursorElements = document.querySelectorAll("."+ scssVars.caretClassName + ":not(." + scssVars.invisibleClassName +")");
        return visibleFrameCursorElements;
    });
    const frameCursorIds : string[] = await frameCursors.evaluate((nodes) => {
        const r = [];
        for (let i = 0; i < nodes.length; i++) {
            r.push("#" + (nodes[i].id ?? "<unknown>"));
        }
        return r;
    });
    const numFrameCursors = frameCursorIds.length;
    const textCursorNode = (await page.evaluateHandle(() => {
        return document?.getSelection()?.focusNode;
    })).asElement();
    const hasTextCursor = textCursorNode != null;
    expect(numFrameCursors, (message ?? "") + " ids: [" + frameCursorIds.join(", ") + "]").toEqual(hasTextCursor ? 0 : 1);
    if (specificFrameCursor !== undefined) {
        if (specificFrameCursor == true) {
            expect(numFrameCursors, message).toEqual(1);
        }
        else {
            expect(hasTextCursor, message).toEqual(true);
        }
    }
    return hasTextCursor ? textCursorNode : await frameCursors.evaluateHandle((nodes) => nodes[0]);
}

export async function checkTextSlotCursorPos(page: Page, expectedPos: number): Promise<void> {
    // A one-shot check here used to race against setDocumentSelection(): plain same-slot cursor
    // moves (e.g. arrow-right within a string literal, see LabelSlotsStructure.vue's onLRKeyDown)
    // only update the real DOM selection directly and don't touch the "data-slot-cursor" attribute
    // that waitForEditorSettled() watches, so that wait gives no protection for this specific case.
    // Poll the real selection instead of trusting a single snapshot.
    await expect.poll(() => page.evaluate(() => document?.getSelection()?.focusOffset)).toEqual(expectedPos);
}

async function getSelection(page: Page) : Promise<{ id: string, cursorPos : number }> {
    // We need a delay to make sure last DOM update has occurred:
    await page.waitForSelector("#editor");
    return page.locator("#editor").evaluate((ed) => {
        return {id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")};
    });
}

async function assertLabelSlotsContent(page: Page, expectedState: string, options?: {isInStatementFrame?: boolean, mediaInfo?: {mediaType: "img" | "snd", endOfB64: string}[]}) {
    const info = {...await getSelection(page), mediaClassName: "", media: MEDIA_SLOT_PARSED_PLACEHOLDER};
    const scssVars = await page.evaluate(() => {
        return (window as any)["StrypeSCSSVarsGlobals"];
    });

    // Only parse media if we have indicated any media info (see mediaInfo in options)
    const s = await page.locator("#frameContainer_-3" + " ." + scssVars.frameHeaderClassName).first().locator(`.${scssVars.labelSlotInputClassName}, .${scssVars.frameColouredLabelClassName}${(options?.mediaInfo) ? (", ." + scssVars.labelSlotMediaClassName) : ""}`).evaluateAll((parts, data) => {
        const  {info, mediaPlaceHolders, mediaClassName} = data;
        let s = "";
        if (!parts) {
            // Try to debug an occasional seemingly impossible failure:
            console.log("Parts is null which I'm sure shouldn't happen");
        }
        // If we're in a block frame like "if", we ignore the first and last part:
        const parseOffset = (info.options?.isInStatementFrame) ? 0 : 1;

        let mediaInfoCounter = 0;
        for (let i = 1; i < parts.length - parseOffset; i++) {
            const p: any = parts[i];

            let text = (p.value || p.textContent || "").replace("\u200B", "");

            // Handling of media: we don't make strict comparison for media:
            // instead, based on mediaInfos, we check the start of the slots based on the media type, 
            // and the content of the media solely based on a few last characters based on the media info property "endOfB64".
            // Media appear as <img> in the editor (their representation).
            let isMediaSlot = false;
            if(info?.options?.mediaInfo && p.tagName == "IMG" && p.classList.contains(mediaClassName)){
                isMediaSlot = false;
                // Fist check the media info array is in line with what we are parsing
                if(mediaInfoCounter >= info.options.mediaInfo.length){
                    throw new Error("A media slot has been parsed but it does not match a media info array entry.");
                }
                let mediaPlaceHolderText = mediaPlaceHolders.unknown;
                const {mediaType, endOfB64} = info.options.mediaInfo[mediaInfoCounter];
                const pDataCode = p.getAttribute("data-code");
                
                // Check the media type is in line with the media info
                const dataCodePreamble = (mediaType == "img") ? "load_image(\"data:image/" : "load_sound(\"data:audio/";
                if(!pDataCode?.startsWith(dataCodePreamble)){
                    throw new Error("Did not find the expected media type.");
                }
                mediaPlaceHolderText = (mediaType == "img") ? mediaPlaceHolders.image : mediaPlaceHolders.sound;
                
                // Check the media content is (loosely) in line with the media info
                if(!pDataCode.endsWith(endOfB64+"\")")){
                    throw new Error("Did not find the expected media content ending.");
                }

                // The checks passed, we can now render the text as expected
                text += mediaPlaceHolderText;
                isMediaSlot = true;

                // Increment the counter for the next media we'll parse
                mediaInfoCounter++;
            }


            // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
            if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
            }
            // Don't put curly brackets around strings, operators or brackets, or media:
            if (!p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameStringSlotClassName) && !p.classList.contains((window as any)["StrypeSCSSVarsGlobals"].frameOperatorSlotClassName) && !/[([)\]$]/.exec(p.textContent) && !isMediaSlot) {
                text = "{" + text + "}";
            }
            s += text;
        }
        return s;
    }, {info: {...info, options: options}, mediaPlaceHolders: MEDIA_SLOT_PARSED_PLACEHOLDER, mediaClassName: scssVars.labelSlotMediaClassName});
    // There is no correspondence for _ (indicating a null operator) in the Strype interface so just ignore that:
    expect(s).toEqual(expectedState.replaceAll("_", ""));
}

export async function assertStateOfIfFrame(page: Page, expectedState : string, mediaInfo?: {mediaType: "img" | "snd", endOfB64: string}[]) : Promise<void> {
    await assertLabelSlotsContent(page, expectedState, {mediaInfo});
}

export async function assertStateOfFuncCallFrame(page: Page, expectedState : string, mediaInfo?: {mediaType: "img" | "snd", endOfB64: string}[]) : Promise<void> {
    await assertLabelSlotsContent(page, expectedState, {isInStatementFrame: true, mediaInfo});
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
    await assertLabelSlotsContent(page, `${expectedLHSState}{ ⇐ }${expectedRHSState}`, {isInStatementFrame: true});
}

export async function typeIndividually(page: Page, content: string, settleTimeoutMs = 4000) : Promise<void> {
    for (let i = 0; i < content.length; i++) {
        if (content[i] == "\n") {
            await page.keyboard.press("Shift+Enter");
        }
        else {
            await page.keyboard.type(content[i]);
        }
        await waitForEditorSettled(page, settleTimeoutMs);
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
    await waitForEditorSettled(page);
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
    await waitForEditorSettled(page);
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
                await waitForEditorSettled(page);
            }
        }
    };
}

export function getDefaultStrypeProjectDocumentationFullLine(): string {
    return "'''This is the default Strype starter project'''\n";
}

// Deletes every frame currently in Main, Definitions and Imports -- not just the default
// project's frames (2 default imports plus the myString assignment and print call in Main), since
// this is also used to clear out whatever a previous operation left behind, which can include
// Definitions content that the default project never has -- leaving a genuinely blank editor
// (0 frames) with the caret positioned at the top of Imports, ready for fresh content. Reads the
// frame counts from the DOM rather than hard-coding them so this doesn't go stale if a section's
// content changes shape.
export async function clearDefaultProject(page: Page) : Promise<void> {
    const mainCount = await page.locator("#frameContainer_-3 .frame-div").count();
    const defsCount = await page.locator("#frameContainer_-2 .frame-div").count();
    const importsCount = await page.locator("#frameContainer_-1 .frame-div").count();
    // The default caret starts at the top of Main; deleting forward removes its frames one by one.
    // Each deletion can go through a delayed-removal debounce (LabelSlot.vue), so settle after
    // every single keypress rather than firing them all at once -- otherwise a later press (e.g.
    // the ArrowUp navigation, or a Backspace in Definitions/Imports) can race ahead of a
    // still-in-flight removal and land on/delete the wrong frame (or, worse, crash the app by
    // deleting more times than there are frames left):
    for (let i = 0; i < mainCount; i++) {
        await page.keyboard.press("Delete");
        await waitForEditorSettled(page);
    }
    // Navigate up one level at a time, deleting backward to clear Definitions then Imports:
    await page.keyboard.press("ArrowUp");
    await waitForEditorSettled(page);
    for (let i = 0; i < defsCount; i++) {
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
    }
    await page.keyboard.press("ArrowUp");
    await waitForEditorSettled(page);
    for (let i = 0; i < importsCount; i++) {
        await page.keyboard.press("Backspace");
        await waitForEditorSettled(page);
    }
    // Belt-and-braces check that we truly ended up at 0, on top of the settling above:
    await expect(page.locator(".frame-div")).toHaveCount(0, {timeout: 4000});
}

export async function enterCode(page: Page, codeSections : string[]) : Promise<void> {
    await clearDefaultProject(page);
    for (const codeSection of codeSections) {
        // doPagePaste already waits for the editor (including frame count) to settle:
        await doPagePaste(page, codeSection);
        await page.keyboard.press("ArrowDown");
    }
}
