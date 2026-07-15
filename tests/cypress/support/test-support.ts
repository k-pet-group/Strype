import path from "path";
import { strypeElIds } from "./standard-setup";
// imports the locale files we need for the locales used by this test
import en from "@/localisation/en/en_main.json";

export function cleanFromHTML(html: string) : string {
    // Get rid of the zero-width spaces which occur in the HTML:
    return html.replace("\u200B", "").replaceAll("\u00A0", " ");
}

export function getDefaultStrypeProjectDocumentationFullLine(mode: string): string {
    return (mode == "microbit") 
        ? "'''This is the default Strype starter project for micro:bit'''\n"
        : "'''This is the default Strype starter project'''\n";
}

export function getDefaultStrypeProjectImportFullLine(mode: string): string {
    return (mode == "microbit") 
        ? "from microbit import *\n"
        : "";
}

export function focusEditorAndClear(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
    // Delete existing content (bit of a hack - and it seems having the second backspace separately avoiding test failure):
    cy.get("body").type("{uparrow}{uparrow}{uparrow}{del}{downarrow}{downarrow}{downarrow}{downarrow}{backspace}");
    cy.get("body").type("{backspace}");
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
                const state = `${focusId}:${cursor}:${frameCount}`;
                const now = Date.now();
                if (state !== lastState) {
                    stableSince = now;
                }
                lastState = state;
                lastFocusId = focusId;
                // A blank focus id (no slot focused) is also used by the app as a transient marker
                // while some restructuring is in flight -- e.g. converting a function-call frame to
                // a variable assignment on typing "=" holds focus blank for a genuine ~300ms
                // debounce (see LabelSlotsStructure.vue) -- and that blank reading is itself stable
                // across many consecutive checks during the whole debounce window, which would
                // otherwise fool this into passing mid-restructure. Frame-level pastes can
                // legitimately end up blank too (a frame caret, not a slot), so we can't just
                // refuse blank outright -- instead require the state to have been unchanged for
                // longer (~450ms of wall-clock time) before trusting a blank state than a real one
                // (no minimum wait), comfortably past the known debounce:
                const requiredStableMs = lastFocusId === "" ? 450 : 0;
                if (now - stableSince >= requiredStableMs) {
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
