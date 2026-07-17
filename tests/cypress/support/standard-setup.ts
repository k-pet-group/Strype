// This file has the standard beforeEach that most tests use.
// To use it, import standardBeforeEach and write: beforeEach(standardBeforeEach);

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "@/helpers/sharedIdCssWithTests";

export let scssVars: {[varName: string]: string};
export let strypeElIds: {[varName: string]: (...args: any[]) => string};
export function initialiseSupportStrypeGlobals() : void{
    // Only need to get the global variables if we haven't done so
    if(scssVars == undefined){
        cy.window().then((win) => {
            scssVars = (win as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME];
            strypeElIds = (win as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME];
        });
    }
}

export function standardBeforeEach() : void{
    cy.clearLocalStorage();
    cy.visit("/",  {onBeforeLoad: (win) => {
        win.localStorage.clear();
        win.sessionStorage.clear();
    }}).then(() => {
        initialiseSupportStrypeGlobals();
    });
    // Wait for the starting project to load fully:
    cy.get(".frame-div", { timeout: 10000 })
        .should("have.length.at.least", 2);
    
    // Register the "paste" command (unified for all Cypress tests here)
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Cypress.Commands.add("paste",
        {prevSubject : true},
        ($element, data: string | Buffer, type: string = "text/plain") => {
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
};
