import {Page, expect} from "@playwright/test";
import {AllFrameTypesIdentifier} from "../../cypress/support/frame-types";
import {checkFrameXorTextCursor, doTextHomeEndKeyPress, pressN, waitForEditorSettled} from "./editor";

// ---------------------------------------------------------------------------------------------
// Centralised configuration for the keyword-frame-conversion mechanism (see
// keywordFrameConversions / checkSlotRefactoring in src/components/LabelSlotsStructure.vue):
// typing a Python keyword immediately followed by a trigger character, at the start of a
// func-call frame, converts that frame into the matching keyword-led frame type, preserving
// whatever followed the keyword into the new frame's slot(s).
//
// The trigger character is centralised in ONE place (DEFAULT_CONVERSION_TRIGGER, with a
// per-keyword override on KeywordConversionDef) rather than hard-coded into every test, so that
// if the app's own trigger changes -- e.g. switches from a space to Tab, or some frame types
// (e.g. "wrapping"/block types like if/while/for, which already have a body to disambiguate
// them) stop needing an explicit trigger at all -- only this file needs updating.
// ---------------------------------------------------------------------------------------------

// The character typed immediately after a keyword that fires the conversion, unless the
// keyword's own KeywordConversionDef overrides it. Must match the character(s) tested for in
// keywordFrameConversionRegex in src/components/LabelSlotsStructure.vue.
export const DEFAULT_CONVERSION_TRIGGER = " ";

export interface KeywordConversionDef {
    keyword: string; // the word the user types, e.g. "return", "class", "def", "from"
    targetType: string; // AllFrameTypesIdentifier value
    slots: 0 | 1 | 2;
    splitWord?: string; // for keyword-based 2-slot splits: "in" (for), "as" (with), "import" (from-import)
    splitAtBrackets?: boolean; // funcdef only: split at "(" ... ")" instead of a keyword
    isJoint?: boolean; // elif/else/except/finally: only valid as the last statement of a joint-eligible body
    endsWithColon?: boolean; // try/else/finally: typing the keyword immediately followed by ":" (no
    // space) also converts, since that colon is the rest of the frame's own fixed label
}

// Mirrors keywordFrameConversions in src/components/LabelSlotsStructure.vue. Kept as a manual
// copy for the same reason tests/cypress/support/frame-types.ts is a manual copy of
// src/types/types.ts (see that file's header comment): importing straight from src/components
// into a Playwright spec breaks Playwright's Node-based test loader (Vue/i18n side effects).
export const keywordConversionDefs: KeywordConversionDef[] = [
    {keyword: "if", targetType: AllFrameTypesIdentifier.if, slots: 1},
    {keyword: "while", targetType: AllFrameTypesIdentifier.while, slots: 1},
    {keyword: "return", targetType: AllFrameTypesIdentifier.return, slots: 1},
    {keyword: "global", targetType: AllFrameTypesIdentifier.global, slots: 1},
    {keyword: "raise", targetType: AllFrameTypesIdentifier.raise, slots: 1},
    {keyword: "assert", targetType: AllFrameTypesIdentifier.assert, slots: 1},
    {keyword: "match", targetType: AllFrameTypesIdentifier.match, slots: 1},
    {keyword: "case", targetType: AllFrameTypesIdentifier.case, slots: 1},
    {keyword: "library", targetType: AllFrameTypesIdentifier.library, slots: 1},
    {keyword: "import", targetType: AllFrameTypesIdentifier.import, slots: 1},
    {keyword: "class", targetType: AllFrameTypesIdentifier.classdef, slots: 1},
    {keyword: "for", targetType: AllFrameTypesIdentifier.for, slots: 2, splitWord: "in"},
    {keyword: "with", targetType: AllFrameTypesIdentifier.with, slots: 2, splitWord: "as"},
    {keyword: "from", targetType: AllFrameTypesIdentifier.fromimport, slots: 2, splitWord: "import"},
    {keyword: "def", targetType: AllFrameTypesIdentifier.funcdef, slots: 2, splitAtBrackets: true},
    {keyword: "break", targetType: AllFrameTypesIdentifier.break, slots: 0},
    {keyword: "continue", targetType: AllFrameTypesIdentifier.continue, slots: 0},
    {keyword: "try", targetType: AllFrameTypesIdentifier.try, slots: 0, endsWithColon: true},
    {keyword: "elif", targetType: AllFrameTypesIdentifier.elif, slots: 1, isJoint: true},
    {keyword: "else", targetType: AllFrameTypesIdentifier.else, slots: 0, isJoint: true, endsWithColon: true},
    {keyword: "except", targetType: AllFrameTypesIdentifier.except, slots: 1, isJoint: true, endsWithColon: true},
    {keyword: "finally", targetType: AllFrameTypesIdentifier.finally, slots: 0, isJoint: true, endsWithColon: true},
];

export function getKeywordConversionDef(keyword: string): KeywordConversionDef {
    const def = keywordConversionDefs.find((d) => d.keyword === keyword);
    if (!def) {
        throw new Error(`No keyword conversion def for "${keyword}" -- check keywordConversionDefs is in sync with keywordFrameConversions in src/components/LabelSlotsStructure.vue.`);
    }
    return def;
}

// Reads the ID of whichever frame currently has an editable slot focused, via the same
// #editor data-slot-focus-id attribute waitForEditorSettled() polls. Used to identify the frame
// a conversion just happened to (or on) without needing to know its container or nesting depth.
export async function getFocusedFrameId(page: Page): Promise<number> {
    const focusId = await page.locator("#editor").getAttribute("data-slot-focus-id");
    const match = focusId?.match(/^input_frame_(-?\d+)_/);
    if (!match) {
        throw new Error(`No slot is currently focused (data-slot-focus-id="${focusId}") -- cannot tell which frame is being edited.`);
    }
    return parseInt(match[1], 10);
}

// Types `keyword` followed by its configured trigger character, then `restOfLine` (if given),
// all as one flowing sequence -- matching how a real user types e.g. "for x in y" without
// pausing after the keyword. This matters for multi-slot splits (see splitWord on
// KeywordConversionDef): the conversion fires as soon as the keyword is followed by the
// trigger, so anything typed *after* that point lands as ordinary editing in the already-
// converted frame's first slot rather than going through the split logic -- restOfLine must be
// part of the same typed sequence to be seen by it. If the caret was on a blank "insert a new
// frame" line, the first character typed is what starts a func-call frame there -- so the
// frame's ID is only read back (via getFocusedFrameId) once that first character has landed,
// which also means this works identically whether a func-call frame already existed (with no
// other content -- see relocateFrameToContainer's callers for clearing it first) or is being
// created fresh here.
//
// If this location/frame-type combination is valid (see isKeywordFrameConversionValid in
// LabelSlotsStructure.vue), the func-call frame converts into the matching frame type; if not,
// it stays a func-call frame with the typed text as its literal content. Either way this
// resolves once the conversion's debounce has settled.
//
// Returns the frame's ID, captured right after the first character lands: for 0-slot
// conversions (break/continue/try) the frame ends up with no editable slot at all afterwards,
// so this is the only reliable time to capture it -- and it's equally valid for 1-/2-slot
// conversions, since the frame ID never changes across the conversion.
// Shared plumbing for typeConversionTrigger/ViaEnter/ViaColon below: they all type the keyword's
// first character, wait for the frame to settle so its ID can be read, then type whatever remains
// of the trigger sequence -- differing only in what that remainder is, and whether Enter gets
// pressed afterwards.
async function typeConversionTriggerImpl(page: Page, keyword: string, mode: "type" | "enter" | "colon", restOfLine?: string): Promise<number> {
    await page.keyboard.type(keyword[0]);
    await waitForEditorSettled(page);
    const frameId = await getFocusedFrameId(page);
    const remainder = mode === "colon" ? keyword.slice(1) + ":"
        : mode === "enter" ? keyword.slice(1)
            : keyword.slice(1) + DEFAULT_CONVERSION_TRIGGER + (restOfLine ?? "");
    if (remainder.length > 0) {
        await page.keyboard.type(remainder);
    }
    await waitForEditorSettled(page);
    if (mode === "enter") {
        await page.keyboard.press("Enter");
        await waitForEditorSettled(page);
    }
    return frameId;
}

export async function typeConversionTrigger(page: Page, keyword: string, restOfLine?: string) : Promise<number> {
    return typeConversionTriggerImpl(page, keyword, "type", restOfLine);
}

// Like typeConversionTrigger, but presses Enter instead of the space trigger character -- and,
// unlike typeConversionTrigger, never takes a restOfLine: typing anything (including a real space)
// after the bare keyword would already have fired the conversion via the usual space trigger
// before Enter is even reached, so Enter's own behaviour (treating a bare keyword as though a
// space had been typed -- see checkSlotRefactoring's triggeredByEnter option, LabelSlotsStructure.
// vue) is only actually exercised by the bare keyword on its own.
export async function typeConversionTriggerViaEnter(page: Page, keyword: string): Promise<number> {
    return typeConversionTriggerImpl(page, keyword, "enter");
}

// Like typeConversionTriggerViaEnter, but types ":" as the trigger instead of pressing Enter --
// e.g. "else:" typed directly, with no space before the colon. Only meaningful for keywords with
// endsWithColon set (try/else/finally): their own fixed label already ends in " :", so the colon
// the user types *is* the rest of that label, not left-over content. Never takes a restOfLine for
// the same reason typeConversionTriggerViaEnter doesn't (see its own comment).
export async function typeConversionTriggerViaColon(page: Page, keyword: string): Promise<number> {
    return typeConversionTriggerImpl(page, keyword, "colon");
}

// Wraps one of the typeConversionTrigger* functions above with an upfront check that `keyword` is
// actually a recognised one (see getKeywordConversionDef) -- used at every call site where the
// keyword is expected to be valid, so a typo or an out-of-sync keywordConversionDefs table fails
// fast with a clear error instead of the conversion just silently not happening.
function withKeywordCheck<Args extends unknown[]>(fn: (page: Page, keyword: string, ...args: Args) => Promise<number>) {
    return async (page: Page, keyword: string, ...args: Args): Promise<number> => {
        getKeywordConversionDef(keyword);
        return await fn(page, keyword, ...args);
    };
}

export const typeKeywordConversionTrigger = withKeywordCheck(typeConversionTrigger);
export const typeKeywordConversionTriggerViaEnter = withKeywordCheck(typeConversionTriggerViaEnter);
export const typeKeywordConversionTriggerViaColon = withKeywordCheck(typeConversionTriggerViaColon);

// Clears whatever text content a frame's first editable slot currently holds, by focusing it
// and backspacing over all of it. Needed before typeKeywordConversionTrigger() when the frame
// already has throwaway placeholder content (e.g. from creating it before relocating it via
// relocateFrameToContainer) -- otherwise the keyword would be typed after that leftover text
// instead of at the start, and never match the conversion's "starts with keyword" check.
// Deliberately uses repeated Backspace rather than select-all-then-Delete: a selection-based
// deletion was observed to leave the store's own anchor/focus-slot-cursor bookkeeping out of
// sync with a plain click + keystroke flow, silently preventing the very next keyword
// conversion from being recognised even though the typed text that followed was otherwise
// correct -- Backspace goes through the same per-keystroke path as normal typing, avoiding that.
export async function clearFrameContent(page: Page, frameId: number, contentLength: number): Promise<void> {
    await page.locator(`#frameHeader_${frameId} .label-slot-input`).first().click();
    await waitForEditorSettled(page);
    // Home (not End): a func-call frame's first label always ends with its own auto-appended,
    // still-empty call brackets, so "end" of the whole label lands *inside* those brackets (the
    // args slot), past this field entirely -- backspacing from there deletes the empty "()" pair
    // instead of this field's own content. Home reliably lands at the start of this (first) field
    // instead, then ArrowRight the known content length gets back to just after it.
    await doTextHomeEndKeyPress(page, false, false);
    await pressN("ArrowRight", contentLength, true)(page);
    for (let i = 0; i < contentLength; i++) {
        await page.keyboard.press("Backspace");
    }
    await waitForEditorSettled(page);
}

// Asserts that the frame with the given ID is of the given type, by checking its header for the
// frame-header-label-<type> CSS class the app renders (see FrameHeader.vue). Checks DOM
// presence rather than visibility, and for at least one match rather than exactly one, because:
// that class is applied per label (so multi-label types like for-loops, with "for ", " in ",
// " :", match more than once), and func-call's own label is deliberately hidden (showLabel:
// false in FuncCallDefinition -- func-call frames show no literal label text) so it would never
// be "visible" even when correctly matched. Works for a frame at any nesting depth/container,
// unlike assertStateOfIfFrame/assertStateOfFuncCallFrame (in ./editor) which are hard-coded to
// the first frame in Main -- use those instead when precise per-slot structure (operators,
// cursor position) matters, not just "did it convert".
export async function assertFrameType(page: Page, frameId: number, frameType: string): Promise<void> {
    await expect(page.locator(`#frameHeader_${frameId} .frame-header-label-${frameType}`)).not.toHaveCount(0);
}

// Asserts the given frame is still a plain function call -- i.e. a keyword-conversion attempt
// did NOT fire, typically because isKeywordFrameConversionValid rejected it for this location.
export async function assertConversionDidNotHappen(page: Page, frameId: number): Promise<void> {
    await assertFrameType(page, frameId, AllFrameTypesIdentifier.funccall);
}

// Asserts that, after a 0-slot conversion (break/continue/try/else/finally -- frame types with no
// editable content for the caret to land in), there IS a single visible frame-level (blue) caret,
// and that it's at the expected position (body vs below) of the given frame -- rather than focus
// having silently disappeared (neither a text cursor nor a frame caret visible), which is what
// happens if the store's caretVisibility is left pointing at a position nothing renders.
// Mirrors getCaretUID's id format (src/helpers/editor.ts): "caret_" + CaretPosition + "_" + frameId,
// where CaretPosition's own string values ("caretBody"/"caretBelow") are hardcoded here for the
// same reason this file doesn't import CaretPosition itself -- see the header comment above.
export async function assertFrameCaretPosition(page: Page, frameId: number, position: "body" | "below"): Promise<void> {
    const caretElement = await checkFrameXorTextCursor(page, true, `Expected a visible frame caret for frame ${frameId} at position "${position}"`);
    const id = await caretElement.evaluate((el: Element) => el.id);
    expect(id).toEqual(`caret_${position === "body" ? "caretBody" : "caretBelow"}_${frameId}`);
}

// Lightweight text content check for a frame's header (all its labels and slots concatenated),
// good enough to confirm a keyword conversion split typed text into roughly the right slot(s).
// Use assertStateOfIfFrame/assertStateOfFuncCallFrame (in ./editor) instead when the precise
// per-slot structure matters (they're Main-only, hard-coded to the first frame there).
export async function getFrameHeaderText(page: Page, frameId: number): Promise<string> {
    const text = await page.locator(`#frameHeader_${frameId}`).innerText();
    return text.replace(/\u200B/g, "");
}

export async function getFirstSlotText(page: Page, frameId: number): Promise<string> {
    const text = await page.locator(`#frameHeader_${frameId} .label-slot-input`).first().innerText();
    return text.replace(/\u200B/g, "");
}

// Well-known negative frame IDs for the three top-level containers (see
// ContainerTypesIdentifiers in tests/cypress/support/frame-types.ts and the equivalent in
// src/types/types.ts) -- stable across the app, already relied on elsewhere in the test suite
// (e.g. "#frameContainer_-3" in ./editor.ts's assertLabelSlotsContent).
export const IMPORTS_CONTAINER_ID = -1;
export const DEFS_CONTAINER_ID = -2;
export const MAIN_CONTAINER_ID = -3;

// Presses ArrowDown repeatedly (up to maxPresses) until the visible frame-level (blue) caret is
// at the given position of the given frame, per getCaretUID's id format ("caret_" + CaretPosition +
// "_" + frameId -- see assertFrameCaretPosition's comment for why those string values are
// hardcoded here). Needed to reach the "directly after a block, not nested in its body" position
// the after-the-root joint-frame tests exercise: for a still-empty body, ArrowDown from editing
// the header first lands on the nested "body" stop (case (1) of generateAvailableFrameCommands'
// joint rule, store.ts), then a further ArrowDown moves on to "below" (a normal sibling position
// one level up) -- polling rather than hard-coding a press count keeps this robust to either
// starting state (a still-focused text slot, or an already-frame-level caret e.g. after creating a
// slot-less type like try).
export async function navigateToFrameCaret(page: Page, frameId: number, position: "body" | "below", maxPresses = 6): Promise<void> {
    const targetId = `caret_${position === "body" ? "caretBody" : "caretBelow"}_${frameId}`;
    for (let i = 0; i < maxPresses; i++) {
        const currentId = await page.evaluate(() => {
            const scssVars = (window as unknown as {StrypeSCSSVarsGlobals: {caretClassName: string, invisibleClassName: string}}).StrypeSCSSVarsGlobals;
            return document.querySelector("." + scssVars.caretClassName + ":not(." + scssVars.invisibleClassName + ")")?.id ?? null;
        });
        if (currentId === targetId) {
            return;
        }
        await page.keyboard.press("ArrowDown");
        await waitForEditorSettled(page);
    }
    throw new Error(`Could not navigate to caret "${targetId}" within ${maxPresses} ArrowDown presses.`);
}

// Reads a frame's jointParentId straight from the Pinia store (0 if it isn't currently a joint
// frame) -- used to confirm WHICH root a converted elif/else/except/finally actually attached to,
// which the DOM alone doesn't disambiguate when there's nested if/try structure (see the "after an
// if" joint-frame tests). Same store-access pattern as relocateFrameToContainer below.
export async function getJointParentId(page: Page, frameId: number): Promise<number> {
    return await page.evaluate((frameId) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        return store.frameObjects[frameId].jointParentId;
    }, frameId);
}

// Directly inserts a plain func-call frame with the given code as the name field, immediately
// after afterFrameId in its parent's childrenIds, by mutating the Pinia store from the page
// context. Returns the new frame's id.
//
// Used instead of navigating there and typing it interactively when a test needs a trailing
// sibling to already exist next to a frame it's still mid-edit on (see the "trailing statement"
// joint-frame test): going via the UI would mean leaving that frame's focused slot and coming
// back, which was observed to be flaky on Chromium (a click back into the slot can land before
// the newly-typed sibling's own async creation -- see createFuncCallFrameIn's comment on that same
// race -- has fully finished internally, silently failing to move focus). Mutating the store
// directly leaves the original frame's focus/edit state completely undisturbed.
//
// Same store-access pattern as relocateFrameToContainer below. Reuses afterFrameId's own
// (JSON-cloned) frameType rather than importing FuncCallDefinition, since the two are the same
// type in every current caller; clone rather than share the reference for the same
// undo/redo-safety reason addFrameWithCommand's own frame construction always clones it
// (store.ts). The slot structure mirrors what addFrameWithCommand builds for a fresh func-call:
// name field, then its auto-appended (still-empty) call-brackets.
export async function insertBlankFuncCallAfter(page: Page, afterFrameId: number, code: string): Promise<number> {
    return await page.evaluate(({afterFrameId, code}) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const afterFrame = store.frameObjects[afterFrameId];
        const parentId = afterFrame.parentId;
        const newId = store.nextAvailableId++;
        store.frameObjects[newId] = {
            frameType: JSON.parse(JSON.stringify(afterFrame.frameType)),
            id: newId,
            isDisabled: false,
            isSelected: false,
            isVisible: true,
            parentId,
            childrenIds: [],
            jointParentId: 0,
            jointFrameIds: [],
            caretVisibility: "none",
            labelSlotsDict: {
                0: {
                    shown: true,
                    slotStructures: {
                        fields: [{code}, {openingBracketValue: "(", fields: [{code: ""}], operators: []}, {code: ""}],
                        operators: [{code: ""}, {code: ""}],
                    },
                },
            },
        };
        const siblings = store.frameObjects[parentId].childrenIds;
        siblings.splice(siblings.indexOf(afterFrameId) + 1, 0, newId);
        return newId;
    }, {afterFrameId, code});
}

// Directly relocates a frame to a different parent container by mutating the Pinia store from
// the page context, then waits for the app to re-render and settle.
//
// This exists for placements that are awkward to reach by typing: the Imports/Definitions
// containers don't offer func-call as a frame-insertion command, although bare typing at their
// blank-line caret does still create one (see createFuncCallFrameIn in the spec). Such frames can
// also arise through other paths not modelled by typing -- an older saved project, say -- which is
// what isKeywordFrameConversionValid's location gating and the "frame not allowed here" check
// handle, so it's worth being able to construct them directly.
//
// This reaches into Vue/Pinia internals (the #app element's __vue_app__ instance) rather than a
// stable, intentionally-exposed test hook -- compare src/helpers/sharedIdCssWithTests.ts, the
// established pattern this codebase uses for that -- because no such hook currently exists for
// store mutation. If this ever breaks (e.g. a Vue/Pinia upgrade changes these internals), the
// fix is either to add a proper exposed hook there, or -- simplest -- delete the handful of
// tests using it, since they cover a deliberately-unreachable-by-typing edge case, not everyday
// behaviour.
export async function relocateFrameToContainer(page: Page, frameId: number, newParentId: number): Promise<void> {
    await page.evaluate(({frameId, newParentId}) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const frame = store.frameObjects[frameId];
        const oldParentId = frame.parentId;
        store.frameObjects[oldParentId].childrenIds = store.frameObjects[oldParentId].childrenIds.filter((id: number) => id !== frameId);
        frame.parentId = newParentId;
        store.frameObjects[newParentId].childrenIds.push(frameId);
    }, {frameId, newParentId});
    await waitForEditorSettled(page);
    // Moving a frame to a different parent container means Vue must unmount its FrameHeader
    // from the old container's component tree and mount a fresh one under the new container
    // (containers are separate component instances, so this can't be a simple DOM move) -- which
    // is meant to re-register that frame's entry in vueComponentsAPIHandler (see
    // src/helpers/vueComponentAPI.ts) via the new instance's mounted() hook. In practice, typing
    // into a slot relocated this way can still throw ("Cannot read properties of undefined
    // (reading 'setHasErroneousSlot')" from checkSlotRefactoring) even after this extra wait --
    // i.e. this raw store-mutation move doesn't reliably take the component through a real
    // mount/unmount cycle at all. Kept anyway since it doesn't hurt the read-only uses (checking
    // error state after relocating -- see focusThenBlurFrame's callers) even though it isn't a
    // full fix; see the skipped tests in keyword-frame-conversion.spec.ts for where this
    // incompleteness actually bites (typing into a relocated frame), and their comments for the
    // proper fix this would need.
    await page.waitForTimeout(500);
}

// Focuses the given frame's first editable slot then blurs it (via Escape), which is what
// actually re-runs the frame-placement error check for that frame (see lastBlurredFrameId in
// store.ts and its use in LabelSlotsStructure.vue) -- merely mutating the store, as
// relocateFrameToContainer does, doesn't by itself trigger a re-check.
export async function focusThenBlurFrame(page: Page, frameId: number): Promise<void> {
    await page.locator(`#frameHeader_${frameId} .label-slot-input`).first().click();
    await waitForEditorSettled(page);
    await page.keyboard.press("Escape");
    await waitForEditorSettled(page);
}

// Asserts whether the given frame currently shows the app's frame-level error styling (the
// same mechanism the "frame not allowed here" check and the pre-existing "match must contain a
// case" check both use -- see setFrameErroneous/atParsingError in store.ts and Frame.vue).
export async function assertFrameHasError(page: Page, frameId: number, expectedToHaveError: boolean): Promise<void> {
    const scssVars = await page.evaluate(() => (window as unknown as {StrypeSCSSVarsGlobals: {errorClassName: string}}).StrypeSCSSVarsGlobals);
    await expect(page.locator(`#frame_id_${frameId}.${scssVars.errorClassName}`)).toHaveCount(expectedToHaveError ? 1 : 0);
}

// Finds the ID of the (first) frame of the given type currently in the document, by reading the
// id="frameHeader_<id>" attribute off its header. Useful for frame types with no editable slot
// at all (e.g. try, break, continue), where getFocusedFrameId can't be used because there's
// nothing for the caret to land in/near after the frame is created via a direct shortcut
// (as opposed to typeKeywordConversionTrigger, which captures the ID before that happens).
export async function getFrameIdByType(page: Page, frameType: string): Promise<number> {
    const id = await page.locator(`[id^="frameHeader_"]:has(.frame-header-label-${frameType})`).first().getAttribute("id");
    if (!id) {
        throw new Error(`No frame of type "${frameType}" found in the document.`);
    }
    return parseInt(id.replace("frameHeader_", ""), 10);
}
