// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
import {cleanFromHTML, waitForEditorSettled} from "../support/test-support";
import { scssVars, standardBeforeEach, strypeElIds } from "./standard-setup";

beforeEach(standardBeforeEach);

chai.Assertion.addMethod("beLocaleSorted", function () {
    const $element = this._obj;

    new chai.Assertion($element).to.be.exist;

    const actual = [...$element] as string[];
    // Important to spread again to make a copy, as sort sorts in-place:
    const expected = [...actual].sort((a, b) => a.localeCompare(b));
    expect(actual).to.deep.equal(expected);
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
Cypress.Commands.add("paste",
    {prevSubject : true},
    ($element, data : string | Buffer, type : string) => {
        const clipboardData = new DataTransfer();
        if (typeof data === "string") {
            clipboardData.setData(type, data);
        }
        else {
            const file = new File([new Blob([new Uint8Array(data)], {type: type})], "anon", { type: type });
            clipboardData.items.add(file);
        }

        const pasteEvent = new ClipboardEvent("paste", {
            bubbles: true,
            cancelable: true,
            clipboardData,
        });

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        cy.get($element).then(() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            $element[0].dispatchEvent(pasteEvent);
        });
    });

export function withAC(inner : (acIDSel : string, frameId: number) => void, isInMyCodeFuncCallFrame:boolean, skipSortedCheck?: boolean) : void {
    // We need to make sure last DOM update has occurred:
    waitForEditorSettled();
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        // Find the auto-complete corresponding to the currently focused slot:
        // Must escape any commas in the ID because they can confuse CSS selectors:
        const acIDSel = "#" + ed.getAttribute("data-slot-focus-id")?.replace(",", "\\,") + "_AutoCompletion";
        // Should always be sorted:
        if (!skipSortedCheck) {
            checkAutocompleteSorted(acIDSel, isInMyCodeFuncCallFrame);
        }
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const frameId = parseInt(new RegExp("input_frame_(\\d+)").exec(acIDSel)[1]);
        // Call the inner function:
        inner(acIDSel, frameId);
    });
}

export function focusEditorAC(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
}

export function withSelection(inner : (arg0: { id: string, cursorPos : number }) => void) : void {
    // We need to make sure last DOM update has occurred:
    waitForEditorSettled();
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        inner({id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")});
    });
}


// Given a selector for the auto-complete and text for an item, checks that exactly one item with that text
// exists in the autocomplete
export function checkExactlyOneItem(acIDSel : string, category: string | null, text : string) : void {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName + ">.popup:first-of-type" + (category == null ? "" : " div[data-title='" + category + "']")).within(() => {
        // Logging; useful in case of failure but we don't want it on by default:
        // cy.findAllByText(text, { exact: true}).each(x => cy.log(x.get()[0].id));
        cy.findAllByText((content, element) => {
            // From https://stackoverflow.com/questions/68209510/how-to-access-text-broken-by-multiple-elements-in-testing-library
            const hasText = (element : Element | null) => element?.textContent?.replaceAll(/\u200B/g, "") === text;
            const elementHasText = hasText(element);
            const childrenDontHaveText : boolean = Array.from(element?.children || []).every((child) => !hasText(child));
            return elementHasText && childrenDontHaveText;
        }).should("have.length", 1);
    });
}

// Given a selector for the auto-complete and text for an item, checks that no items with that text
// exists in the autocomplete
export function checkNoItems(acIDSel : string, text : string, exact? : boolean) : void {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).within(() => cy.findAllByText(text, { exact: exact ?? false}).should("not.exist"));
}

export function checkNoneAvailable(acIDSel : string) : void {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).within(() => {
        cy.findAllByText("No completion available", { exact: true}).should("have.length", 1);
    });
}

export const MYVARS = "My variables";
export const MYFUNCS = "My functions";
export const MYCLASSES = "My classes";
export const BUILTIN = "Python";


// Checks all sections in the autocomplete are internally sorted (i.e. that the items
// within that section are in alphabetical order).  Also checks that the sections
// themselves are in the correct order.
export function checkAutocompleteSorted(acIDSel: string, isInFuncCallFrame: boolean) : void {
    // Wait for the autocomplete popup's rendered items to stop changing (no known fixed-duration
    // debounce was found backing this in the app -- but the popup can still take a moment to
    // filter/render after focus, and this is a one-shot check further down with no built-in
    // retry, so make sure it's actually settled first):
    let lastState: string | null = null;
    let stableCount = 0;
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName, {timeout: 10000}).should(($ac) => {
        const state = $ac.text();
        if (state === lastState) {
            stableCount++;
        }
        else {
            stableCount = 0;
        }
        lastState = state;
        expect(stableCount, "autocomplete popup should stabilise").to.be.at.least(1);
    });
    // Other items (like the names of variables when you do var.) will come out as -1,
    // which works nicely because they should be first 
    // (if we are in a function call definition (isInFuncCallFrame true) "My Functions"
    // and "My Classes" come before "My Variables", and the other way around if not):
    const intendedOrder = [
        ...(isInFuncCallFrame ? [MYFUNCS, MYCLASSES, MYVARS] : [MYVARS, MYFUNCS, MYCLASSES]),
        "microbit",
        "microbit.accelerometer",
        "neopixel",
        "time",
        "strype.graphics",
        "strype.sound",
        BUILTIN,
    ];
    cy.get(acIDSel + " div.ac-module-header:not(." + scssVars.acEmptyResultsContainerClassName + ")")
        .then((items) => [...items].map((item) => intendedOrder.indexOf(item.innerText.trim())))
        .should("be.sorted");

    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName + " ul > div").each((section) => {
        cy.wrap(section).find("li.ac-popup-item")
            // Replace opening bracket onwards as we want to check it's sorted by function name, ignoring params:
            .then((items) => [...items].map((item) => item.innerText.toLowerCase().replace(new RegExp("\\(.*"), "")))
            .should("beLocaleSorted");
    });
}

// Checks that the first labelslot in the given frame has content equivalent to expectedState (with a dollar indicating cursor position),
// and equivalent to expectedStateWithPlaceholders if you count placeholders as the text for blank spans
// If the last parameter is missing, it's assumed that expectedStateWithPlaceholders is the same as expectedState
// (but without the dollar)
export function assertState(frameId: number, expectedState : string, expectedStateWithPlaceholders?: string) : void {
    expectedStateWithPlaceholders = expectedStateWithPlaceholders ?? expectedState.replaceAll("$", "");
    withSelection((info) => {
        cy.get("#" + strypeElIds.getFrameHeaderUID(frameId) + " #" + strypeElIds.getFrameLabelSlotsStructureUID(frameId, 0) + " ." + scssVars.labelSlotInputClassName).then((parts) => {
            let content = "";
            let contentWithPlaceholders = "";
            for (let i = 0; i < parts.length; i++) {
                const p : any = parts[i];
                let text = cleanFromHTML(p.value || p.textContent || "");

                // If the text for a span is blank, use the placeholder since that's what the user will be seeing:
                if (!text) {
                    // Get rid of zero-width spaces (trim() doesn't seem to do this):
                    contentWithPlaceholders += p.getAttribute("placeholder")?.replace(/\u200B/g,"") ?? "";
                }
                else {
                    contentWithPlaceholders += text;
                }

                // If we're the focused slot, put a dollar sign in to indicate the current cursor position:
                if (info.id === p.getAttribute("id") && info.cursorPos >= 0) {
                    text = text.substring(0, info.cursorPos) + "$" + text.substring(info.cursorPos);
                }

                content += text;
            }
            expect(content).to.equal(expectedState);
            expect(contentWithPlaceholders).to.equal(expectedStateWithPlaceholders);
        });
    });
}
