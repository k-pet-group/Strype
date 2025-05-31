// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
import {WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME} from "@/helpers/sharedIdCssWithTests";

export let scssVars: {[varName: string]: string};
export let strypeElIds: {[varName: string]: (...args: any[]) => string};
beforeEach(() => {
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {
        // Only need to get the global variables if we haven't done so
        if(scssVars == undefined){
            cy.window().then((win) => {
                scssVars = (win as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME];
                strypeElIds = (win as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME];
            });
        }

        // Wait for code initialisation
        cy.wait(2000);
    });
});

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

export function withAC(inner : (acIDSel : string, frameId: number) => void, isInFuncCallFrame:boolean, skipSortedCheck?: boolean) : void {
    // We need a delay to make sure last DOM update has occurred:
    cy.wait(600);
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        // Find the auto-complete corresponding to the currently focused slot:
        // Must escape any commas in the ID because they can confuse CSS selectors:
        const acIDSel = "#" + ed.getAttribute("data-slot-focus-id")?.replace(",", "\\,") + "_AutoCompletion";
        // Should always be sorted:
        if (!skipSortedCheck) {
            checkAutocompleteSorted(acIDSel, isInFuncCallFrame);
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
    cy.get("#" + strypeElIds.getFrameUID(-3)).focus();
}

export function withSelection(inner : (arg0: { id: string, cursorPos : number }) => void) : void {
    // We need a delay to make sure last DOM update has occurred:
    cy.wait(200);
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        inner({id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")});
    });
}


// Given a selector for the auto-complete and text for an item, checks that exactly one item with that text
// exists in the autocomplete
export function checkExactlyOneItem(acIDSel : string, category: string | null, text : string) : void {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName + (category == null ? "" : " div[data-title='" + category + "']")).within(() => {
        // Logging; useful in case of failure but we don't want it on by default:
        // cy.findAllByText(text, { exact: true}).each(x => cy.log(x.get()[0].id));
        cy.findAllByText(text, { exact: true}).should("have.length", 1);
    });
}

// Given a selector for the auto-complete and text for an item, checks that no items with that text
// exists in the autocomplete
export function checkNoItems(acIDSel : string, text : string, exact? : boolean) : void {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).within(() => cy.findAllByText(text, { exact: exact ?? false}).should("not.exist"));
}

export function checkNoneAvailable(acIDSel : string) {
    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName).within(() => {
        cy.findAllByText("No completion available", { exact: true}).should("have.length", 1);
    });
}

export const MYVARS = "My variables";
export const MYFUNCS = "My functions";
export const BUILTIN = "Python";


// Checks all sections in the autocomplete are internally sorted (i.e. that the items
// within that section are in alphabetical order).  Also checks that the sections
// themselves are in the correct order.
export function checkAutocompleteSorted(acIDSel: string, isInFuncCallFrame: boolean) : void {
    // The autocomplete only updates after 500ms:
    cy.wait(1000);
    // Other items (like the names of variables when you do var.) will come out as -1,
    // which works nicely because they should be first 
    // (if we are in a function call definition (isInFuncCallFrame true) "My Functions"
    // comes before "My Variables", and the other way around if not):
    const intendedOrder = [
        ...(isInFuncCallFrame ? [MYFUNCS, MYVARS] : [MYVARS, MYFUNCS]),
        "microbit",
        "microbit.accelerometer",
        "time",
        BUILTIN,
    ];
    cy.get(acIDSel + " div.module:not(." + scssVars.acEmptyResultsContainerClassName + ") > em")
        .then((items) => [...items].map((item) => intendedOrder.indexOf(item.innerText.trim())))
        .should("be.sorted");

    cy.get(acIDSel + " ." + scssVars.acPopupContainerClassName + " ul > div").each((section) => {
        cy.wrap(section).find("li.ac-popup-item")
            // Replace opening bracket onwards as we want to check it's sorted by function name, ignoring params:
            .then((items) => [...items].map((item) => item.innerText.toLowerCase().replace(new RegExp("\\(.*"), "")))
            .should("beLocaleSorted");
    });
}
