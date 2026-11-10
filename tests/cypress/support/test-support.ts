import path from "path";
import { strypeElIds } from "./standard-setup";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

export function cleanFromHTML(html: string) : string {
    // Get rid of the zero-width spaces which occur in the HTML:
    return html.replace("\u200B", "").replaceAll("\u00A0", " ");
}

// Keys that insert their frame type directly, without a Tab/Space prefix first (see
// alwaysDirectFrameShortcutKeys in src/helpers/editor.ts) -- every other key (any letter) needs
// the prefix to open the frame-commands pane first; typing the bare letter alone instead starts
// a func-call frame with that letter as its content (see "Typing a character at the bare frame
// caret starts a func-call frame"). Mirrored here (not imported) for the same reason
// tests/cypress/support/frame-types.ts is a manual copy of src/types/types.ts: pulling from src/
// into Cypress's test bundle for a helper like this isn't straightforward.
const ALWAYS_DIRECT_FRAME_SHORTCUT_KEYS = ["enter", "#", "="];

// Presses the keyboard shortcut that inserts a frame at the current blank "insert a new frame"
// caret -- e.g. pressFrameShortcut("i") for an if frame. Centralised so that if the app's own
// prefix requirement (or the prefix itself) ever changes again, only this needs updating, not
// every call site that inserts a frame this way.
export function pressFrameShortcut(key: string): void {
    // Settle first: a caller that just confirmed a slot (e.g. typing a condition then
    // {rightarrow} out of it) hands off to the store's leftRightKey(), which updates the store
    // synchronously but only moves real DOM focus onto the new bare-caret element once Vue's
    // reactive re-render catches up. If the Space below is sent before that happens, it lands on
    // the about-to-be-abandoned slot as literal text instead of opening the frame-commands pane
    // -- and the following letter, now arriving at a bare caret it was never meant for, starts an
    // unwanted func-call frame instead of the intended shortcut (observed as e.g. a nested "if"
    // shortcut producing a stray "iFalse(...)" func-call frame instead of a nested if):
    waitForEditorSettled();
    if (!ALWAYS_DIRECT_FRAME_SHORTCUT_KEYS.includes(key.toLowerCase())) {
        cy.get("body").type(" ");
    }
    cy.get("body").type(key);
}

// Convenience for the common "press a frame shortcut, then immediately keep typing into the
// frame it just created" pattern (e.g. a single combined action string like
// "ffoo{rightarrow}{rightarrow}bar{downarrow}" that used to work as one cy.get("body").type(...)
// call before frame shortcuts needed the Tab/Space prefix). Splits it into the shortcut press
// and the rest of the typing, rather than every call site doing that split by hand.
export function pressFrameShortcutThenType(key: string, rest: string): void {
    pressFrameShortcut(key);
    if (rest.length > 0) {
        cy.get("body").type(rest);
        waitForEditorSettled();
    }
}

export function getDefaultStrypeProjectDocumentationFullLine(mode: string): string {
    return (mode == "microbit") 
        ? "'''This is the default Strype starter project for micro:bit'''\n"
        : "'''This is the default Strype starter project'''\n";
}

export function getDefaultStrypeProjectImportFullLine(mode: string): string {
    return (mode == "microbit")
        ? "from microbit import *\n"
        : "from strype.graphics import * \nfrom strype.sound import * \n";
}

// Navigates to the top of the code (the top of Imports) from wherever the caret currently is,
// ready to type/paste a new import above whatever's already there. Implemented as repeated
// {home}{uparrow} presses rather than a fixed {uparrow} count: {home} is a no-op once already at
// the start of a line/frame and {uparrow} is a no-op once at the very top, so this reliably
// reaches the top regardless of how many frames (including default imports) precede it -- unlike
// an exact {uparrow} count, which breaks every time the starting project's shape changes.
export function navigateToTopOfCode(): void {
    cy.get("body").type("{home}{uparrow}{home}{uparrow}{home}{uparrow}");
}

// Navigates to the top of the code, then deletes whatever's currently in Imports (the 2 default
// imports on a fresh project) so tests that are specifically about typing/pasting a *new* import
// and checking autocomplete behave the same as when Imports started out empty, rather than having
// to account for the defaults now being there too. Leaves the caret at the top of Imports, ready
// for the test's own import to be typed/pasted.
export function clearDefaultImports(): void {
    navigateToTopOfCode();
    cy.then(() => deleteFramesUpTo("#frameContainer_-1"));
}

// Presses Delete (forward) against `containerSelector` until it's actually empty. `maxPresses`
// isn't a count of frames to remove -- the recursion always runs to an empty container, however
// many presses that takes, since deleting a top-level block frame removes its whole subtree
// (nested descendants included) in one press. It's purely a safety cap against infinite recursion
// if a press ever failed to remove a frame (an app bug, a stuck focus, a debounce race): each call
// passes `maxPresses - 1` down, so a genuinely stuck deletion still terminates -- with a failed
// assertion below in the caller -- instead of hanging. Callers should not need to pass it; the
// default is generous enough for any realistic number of frames. Uses Delete rather than Backspace:
// the app deliberately blocks Backspace from removing a function/class definition frame when the
// caret is inside its body (to avoid merging the body into the wrong container), which
// forward-Delete from above the frame doesn't hit, so Delete is the only one of the two that
// reliably clears block frames with children. Recurses through cy.then() (not a plain JS loop) so
// each check happens after the previous keypress has actually been applied to the DOM, rather than
// synchronously queuing every press upfront against stale state. Cypress.$ (bundled jQuery) is
// used to count rather than cy.get()/cy.find(), because both of those retry-and-fail if a selector
// matches zero elements -- but that's exactly the "we're done" case this needs to detect.
function deleteFramesUpTo(containerSelector: string, maxPresses = 100): void {
    if (maxPresses <= 0) {
        return;
    }
    cy.then(() => {
        if (Cypress.$(containerSelector + " .frame-div").length > 0) {
            cy.get("body").type("{del}");
            waitForEditorSettled();
            deleteFramesUpTo(containerSelector, maxPresses - 1);
        }
    });
}

export function focusEditorAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
    // Some callers invoke this right after another operation that changes the frame tree (e.g. a
    // file load), which can still be mid-render at this point -- settle first, otherwise the frame
    // counts read below can be stale and this ends up pressing Delete more times than there are
    // actual frames, which crashes the app rather than just failing an assertion:
    waitForEditorSettled();
    // Deletes every frame currently in Main, Definitions and Imports -- not just the default
    // project's frames, since this is also used to clear out whatever a previous operation (e.g. a
    // file load) left behind, which can include Definitions content that the default project never
    // has -- leaving a genuinely blank editor with the caret back at the top of Main, matching
    // where this helper has always left the caret, since most callers type/paste directly into
    // Main afterward (callers that instead want Imports, like enterImports() in
    // media-literals.cy.ts, already do their own extra {uparrow}{uparrow} from here).
    cy.then(() => {
        const totalCount = Cypress.$(".frame-div").length;
        // Reach the very top of the whole document regardless of the current caret position or how
        // deeply nested any block frame's content is. {uparrow} is a no-op once already at the
        // top, so pressing it more times than could possibly be needed is harmless -- but a block
        // frame's body is itself an extra caret stop beyond the one .frame-div element it counts
        // as, so totalCount alone can undershoot for nested content; multiplying it gives enough
        // headroom for that without needing to know the exact nesting depth:
        for (let i = 0; i < totalCount * 3 + 10; i++) {
            cy.get("body").type("{uparrow}");
        }
        waitForEditorSettled();
        // Clear top-down, container by container. {downarrow} from an empty/just-cleared container
        // reliably lands at the top of the next one:
        deleteFramesUpTo("#frameContainer_-1");
        cy.get("body").type("{downarrow}");
        waitForEditorSettled();
        deleteFramesUpTo("#frameContainer_-2");
        cy.get("body").type("{downarrow}");
        waitForEditorSettled();
        deleteFramesUpTo("#frameContainer_-3");
    });
    // The Python version's default project has a (starter) test function in the Testing section, which isn't showing
    // (so can't be navigated to) unless the My code heading is switched over to it, by clicking its arrow
    // (the micro:bit version has no Testing section):
    cy.then(() => {
        if (Cypress.$("#frameContainer_-4 .frame-div").length > 0) {
            // (Settling after each click, as the heading switching sections is not instant)
            cy.get(".frame-container-heading-arrows").click();
            waitForEditorSettled();
            deleteFramesUpTo("#frameContainer_-4");
            // Switch back to My code, which puts the frame cursor at the top of it again:
            cy.get(".frame-container-heading-arrows").click();
            waitForEditorSettled();
        }
    });
    cy.get(".frame-div").should("have.length", 0);
}

// Waits for the editor to settle after an action (typing, pasting, frame manipulation) rather
// than guessing how long it will take. Mirrors tests/playwright/support/editor.ts's
// waitForEditorSettled: some editor actions go through genuine debounce timers in the app (not
// just Vue reactivity), so this polls the focused slot and frame count -- exposed via #editor's
// data-slot-focus-id/data-slot-cursor attributes and .frame-div elements -- until they stop
// changing across consecutive checks.
//
// This drives its own fixed-interval setTimeout poll rather than Cypress's .should() retry --
// .should() re-runs its callback on Cypress's own internal retry cadence, which is NOT a fixed
// wall-clock interval: it slows down when the page is busy (e.g. re-rendering a large frame tree
// after pasting a big file), so "N consecutive stable reads" could need far more than N * (nominal
// interval) of real time and blow through the outer timeout despite the state genuinely having
// stabilised.
//
// Driving our own setTimeout loop (matching the Playwright port's approach) helps, but doesn't
// fully fix this: unlike Playwright (which drives its poll from Node, outside the browser),
// Cypress's poll runs *inside* the same browser main thread that's doing the actual re-rendering,
// so even a "fixed" setTimeout(check, 30) can't reliably fire every 30ms under heavy DOM churn --
// confirmed via a real CI failure pasting a 92-frame file, where 8 consecutive checks (of a
// required 15) ate the entire 10s budget because each check iteration itself was taking far
// longer than 30ms. The fix: track how long the state has been unchanged by *wall-clock time*
// (via Date.now()), not by counting how many poll iterations happened to land during that window
// -- that way "has this been stable for ~450ms" is answered correctly whether that took 3 slow
// polls or 15 fast ones.
export function waitForEditorSettled(timeoutMs = 10000): void {
    // cy.then()'s own command timeout (default 4000ms) must be longer than our internal bound,
    // otherwise Cypress kills the wait before our own poll loop gets a chance to resolve on its
    // own -- give it some headroom over timeoutMs (see waitForProjectNameOrTimeout below, which
    // hit the same issue):
    cy.window().then({timeout: timeoutMs + 5000}, (win) => {
        return new Cypress.Promise<void>((resolve, reject) => {
            const start = Date.now();
            let lastState: string | null = null;
            let lastFocusId = "";
            let stableSince = Date.now();
            const check = () => {
                const editorEl = win.document.querySelector("#editor");
                const focusId = editorEl?.getAttribute("data-slot-focus-id") ?? "";
                const cursor = editorEl?.getAttribute("data-slot-cursor") ?? "";
                const frameCount = win.document.querySelectorAll(".frame-div").length;
                // While a conversion is pending (see App.vue's data-pending-slot-conversion), the
                // app deliberately keeps focus/cursor unchanged for the whole debounce so in-flight
                // typing doesn't land at the wrong spot -- e.g. converting a function-call frame to
                // a variable assignment on typing "=" -- meaning focus/cursor/frameCount look
                // "stable" from the very first check even though the frame hasn't actually finished
                // converting yet. Fold it into the tracked state so any change in pending-ness (in
                // either direction) resets the stability clock, and so we never resolve while it's
                // still true:
                const pendingConversion = editorEl?.getAttribute("data-pending-slot-conversion") === "true";
                // A param prompt (e.g. a function call's argument placeholders) can still be waiting
                // on an async calculateParamPrompt() resolution (library data fetched over the
                // network) well after focus/cursor/frameCount have already settled -- see
                // LabelSlot.vue's data-param-prompt-pending, set by LabelSlotsStructure.vue while
                // that promise is in flight. Without checking it here, a caller reading the DOM right
                // after we resolve could see a stale/blank placeholder instead of the real one.
                const pendingParamPrompt = win.document.querySelector("[data-param-prompt-pending=\"true\"]") != null;
                const state = `${focusId}:${cursor}:${frameCount}:${pendingConversion}:${pendingParamPrompt}`;
                const now = Date.now();
                if (state !== lastState) {
                    stableSince = now;
                }
                lastState = state;
                lastFocusId = focusId;
                // A blank focus id (no slot focused) is also used by the app as a transient marker
                // while some restructuring is in flight -- frame-level pastes can legitimately end
                // up blank (a frame caret, not a slot) -- so we can't just refuse blank outright --
                // instead require the state to have been unchanged for longer (~450ms of wall-clock
                // time) before trusting a blank state than a real one (no minimum wait), comfortably
                // past any such transient:
                const requiredStableMs = lastFocusId === "" ? 450 : 0;
                if (!pendingConversion && !pendingParamPrompt && now - stableSince >= requiredStableMs) {
                    resolve();
                    return;
                }
                if (now - start > timeoutMs) {
                    reject(new Error(`editor state should stabilise: state "${state}" only stable for ${now - stableSince}ms (needed ${requiredStableMs}ms) after ${timeoutMs}ms`));
                    return;
                }
                setTimeout(check, 30);
            };
            check();
        });
    });
}

// Waits (bounded, best-effort) for the visible ".project-name" label to reach expectedName --
// the real signal that a file load has actually been applied (see waitForEditorSettled's
// sibling fix in loading-saving.ts for Playwright). Unlike a plain `.should("have.text", ...)`,
// this does not fail if the name never arrives: some callers deliberately load invalid content
// that gets rejected by the app, in which case the project name legitimately never changes, and
// that's for the caller's own assertions (e.g. an error banner) to check, not this helper.
// Keep the default bound well under 10000ms: on rejection, pythonToFrames.ts shows an error
// message that auto-dismisses after exactly 10000ms, and a bound too close to that risks racing
// past it before the caller's own assertion on that message gets a chance to see it.
export function waitForProjectNameOrTimeout(expectedName: string, timeoutMs = 5000): void {
    // cy.then()'s own command timeout (default 4000ms) must be longer than our internal bound,
    // otherwise Cypress fails the command before our best-effort wait ever gets to time out on
    // its own -- give it some headroom over timeoutMs:
    cy.window().then({timeout: timeoutMs + 5000}, (win) => {
        return new Cypress.Promise<void>((resolve) => {
            const start = Date.now();
            const check = () => {
                const el = win.document.querySelector(".project-name");
                if (el?.textContent === expectedName || Date.now() - start > timeoutMs) {
                    resolve();
                    return;
                }
                setTimeout(check, 100);
            };
            check();
        });
    });
}

export function getDownloadedFileContent(strypeElIds: {[varName: string]: (...args: any[]) => string}, filename: string, firstSave?: boolean) : Cypress.Chainable<string> {
    const downloadsFolder = Cypress.config("downloadsFolder");
    const destFile = path.join(downloadsFolder, filename);
    return cy.task("deleteFile", destFile).then(() => {
        // Save is located in the menu, so we need to open it first, then find the link and click on it
        // Force these because sometimes cypress gives false alarm about webpack overlay being on top:
        cy.get("button#" + strypeElIds.getEditorMenuUID()).click({force: true});
        // Note we use the ID because cy.contains is awkward when "Save" and "Save as" begin the same.
        cy.get("#saveStrypeProjLink").click({force: true});
        if (firstSave) {
            // For testing, we always want to save to this device:
            cy.contains(en.appMessage.targetFS).click({force: true});
            cy.contains("button:visible", en.buttonLabel.save).click();
        }

        return cy.readFile(destFile);
    });
}
