

import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";
import {cleanFromHTML} from "./test-support";

// Must clear all local storage between tests to reset the state,
// and also retrieve the shared CSS and HTML elements IDs exposed
// by Strype via the Window object of the app.
let scssVars: {[varName: string]: string};
let strypeElIds: {[varName: string]: (...args: any[]) => string};
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
    });
});


function withSelection(inner : (arg0: { id: string, cursorPos : number }) => void) : void {
    // We need a delay to make sure last DOM update has occurred:
    cy.wait(200);
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        inner({id : ed.getAttribute("data-slot-focus-id") || "", cursorPos : parseInt(ed.getAttribute("data-slot-cursor") || "-2")});
    });
}

const BUILTIN = "Python";

// Checks that the first labelslot in the given frame has content equivalent to expectedState (with a dollar indicating cursor position),
// and equivalent to expectedStateWithPlaceholders if you count placeholders as the text for blank spans
// If the last parameter is missing, it's assumed that expectedStateWithPlaceholders is the same as expectedState
// (but without the dollar)
function assertState(frameId: number, expectedState : string, expectedStateWithPlaceholders?: string) : void {
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


function withFrameId(inner : (frameId: number) => void) : void {
    // We need a delay to make sure last DOM update has occurred:
    cy.wait(600);
    cy.get("#" + strypeElIds.getEditorID()).then((eds) => {
        const ed = eds.get()[0];
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const frameId = parseInt(new RegExp("input_frame_(\\d+)").exec(ed.getAttribute("data-slot-focus-id"))[1]);
        // Call the inner function:
        inner(frameId);
    });
}

function focusEditorAC(): void {
    // Not totally sure why this hack is necessary, I think it's to give focus into the webpage via an initial click:
    // (on the main code container frame -- would be better to retrieve it properly but the file won't compile if we use Apps.ts and/or the store)
    cy.get("#" + strypeElIds.getFrameUID(-3)).focus();
}

// Param is tuple:
//  - First item is null (no module), string (module name) or [string, string] (library + module name)
//  - Second item is func name, possibly including dots
//  - Third item is param list which should be shown (i.e. excluding those with a default value)
export function testRawFuncs(rawFuncs: [string | [string, string] | null, string, string[]][], skipFullyQualifiedVersion?: boolean) : void {
    const funcs: {
        keyboardTypingToImport?: string,
        funcName: string,
        params: string[],
        displayName: string,
        acSection: string,
        acName: string
    }[] = [];
    for (const rawFunc of rawFuncs) {
        if (rawFunc[0] != null) {
            let module: any;
            let libraryTyping;
            if (typeof rawFunc[0] == "string") {
                // No library:
                libraryTyping = "";
                module = rawFunc[0];
            }
            else {
                // Enter the library:
                libraryTyping = "l" + rawFunc[0][0] + "{rightarrow}";
                module = rawFunc[0][1];
            }


            // We need some kind of import; test three ways:
            // The "import module" frame:
            if (!skipFullyQualifiedVersion) {
                funcs.push({
                    keyboardTypingToImport: "{uparrow}{uparrow}" + libraryTyping + "i" + module + "{rightarrow}{downarrow}{downarrow}",
                    funcName: module + "." + rawFunc[1],
                    params: rawFunc[2],
                    acSection: module,
                    acName: rawFunc[1],
                    displayName: rawFunc[1] + " with import frame",
                });
            }
            // The "from module import *" frame:
            funcs.push({
                keyboardTypingToImport: "{uparrow}{uparrow}" + libraryTyping + "f" + module + "{rightarrow}*{rightarrow}{downarrow}{downarrow}",
                funcName: rawFunc[1],
                params: rawFunc[2],
                acSection: module,
                acName: rawFunc[1],
                displayName: rawFunc[1] + " with from-import-* frame",
            });
            // The "from module import funcName" frame:
            // Note that if funcName has a dot, we need to only use the part before the dot or opening bracket:
            funcs.push({
                keyboardTypingToImport: "{uparrow}{uparrow}" + libraryTyping + "f" + module + "{rightarrow}" + (rawFunc[1].match(/^[A-Za-z0-9_]+/)?.[0] ?? rawFunc[1]) + "{rightarrow}{downarrow}{downarrow}",
                funcName: rawFunc[1],
                params: rawFunc[2],
                acName: rawFunc[1],
                acSection: module,
                displayName: rawFunc[1] + " with from-import-funcName frame",
            });
        }
        else {
            // No import necessary
            funcs.push({
                funcName: rawFunc[1],
                params: rawFunc[2],
                acSection: BUILTIN,
                acName: rawFunc[1],
                displayName: rawFunc[1],
            });
        }
    }

    for (const func of funcs) {
        it("Shows prompts after manually writing function name and brackets for " + func.displayName, () => {
            focusEditorAC();
            if (func.keyboardTypingToImport) {
                cy.get("body").type(func.keyboardTypingToImport);
            }
            cy.get("body").type(" " + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            withFrameId((frameId) => assertState(frameId, func.funcName + "($)", func.funcName + "(" + func.params.join(", ") + ")"));
        });
        it("Shows prompts after manually writing function name and brackets AND commas for " + func.displayName, () => {
            focusEditorAC();
            if (func.keyboardTypingToImport) {
                cy.get("body").type(func.keyboardTypingToImport);
            }
            cy.get("body").type(" " + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            // Type commas for num params minus 1:
            for (let i = 0; i < func.params.length; i++) {
                if (i > 0) {
                    cy.get("body").type(",");
                }
                withFrameId((frameId) => assertState(frameId,
                    func.funcName + "(" + ",".repeat(i) + "$)",
                    func.funcName + "(" + func.params.slice(0, i).join(",") + (i > 0 ? "," : "") + func.params.slice(i).join(", ") + ")"));
            }

        });

        it("Shows prompts in nested function (part 1) " + func.displayName, () => {
            focusEditorAC();
            if (func.keyboardTypingToImport) {
                cy.get("body").type(func.keyboardTypingToImport);
            }
            cy.get("body").type(" abs(" + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            withFrameId((frameId) => assertState(frameId, "abs(" + func.funcName + "($))", "abs(" + func.funcName + "(" + func.params.join(", ") + "))"));
        });

        it("Shows prompts in nested function (part 2) " + func.displayName, () => {
            focusEditorAC();
            if (func.keyboardTypingToImport) {
                cy.get("body").type(func.keyboardTypingToImport);
            }
            cy.get("body").type(" max(0," + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            withFrameId((frameId) => assertState(frameId, "max(0," + func.funcName + "($))", "max(0," + func.funcName + "(" + func.params.join(", ") + "))"));
        });
    }
}
