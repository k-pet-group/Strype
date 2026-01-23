

import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "../../../src/helpers/sharedIdCssWithTests";
import {cleanFromHTML} from "./test-support";
import {Signature, SignatureArg} from "tigerpython-parser";

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
                    contentWithPlaceholders += p.getAttribute("placeholder")?.replace(/\u200B/g,"").replaceAll("\"","'") ?? "";
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
    cy.get("#" + strypeElIds.getFrameUID(-3), {timeout: 15 * 1000}).focus();
}

// Param is tuple:
//  - First item is null (no module), string (module name) or [string, string] (library + module name)
//  - Second item is func name, possibly including dots
function calcSignature(rawParams: string[]) : Signature {
    const slashIndex = rawParams.findIndex((p) => p == "/");
    const starIndex = rawParams.findIndex((p) => p.startsWith("*") && !p.startsWith("**"));
    const doubleStarIndex = rawParams.findIndex((p) => p.startsWith("**"));
    const posOnly = rawParams.slice(0, slashIndex == -1 ? 0 : slashIndex);
    const posOrKey = rawParams.slice(slashIndex + 1, starIndex == -1 ? rawParams.length : starIndex);
    const keyOnly = rawParams.slice(starIndex == -1 ? rawParams.length : starIndex + 1, doubleStarIndex == -1 ? rawParams.length : doubleStarIndex);
    function makeArg(p: string) : SignatureArg {
        if (p.includes("=")) {
            const [name, defaultValue] = p.split("=");
            return {name, defaultValue, argType: null};
        }
        else {
            return {name: p, defaultValue: null, argType: null};
        }
    }
    return {
        positionalOnlyArgs: posOnly.map(makeArg),
        positionalOrKeywordArgs: posOrKey.map(makeArg),
        keywordOnlyArgs: keyOnly.map(makeArg),
        varArgs: starIndex != -1 && rawParams[starIndex].length > 1 ? {name: rawParams[starIndex].slice(0), argType: null} : null,
        varKwargs: doubleStarIndex != -1 && rawParams[doubleStarIndex].length > 1 ? {name: rawParams[doubleStarIndex].slice(0), argType: null} : null,
        firstParamIsSelfOrCls: false,
    };
}

//  - Third item is param list, including * and similar if appropriate.
export function testRawFuncs(rawFuncs: [string | [string, string] | {class?: string, udf: string} | null, string, string[]][], skipFullyQualifiedVersion?: boolean) : void {
    const funcs: {
        keyboardTypingToImport?: string,
        funcName: string, 
        params: Signature,
        displayName: string,
        acSection: string,
        acName: string
    }[] = [];
    for (const rawFunc of rawFuncs) {
        const params = calcSignature(rawFunc[2]);
        if (rawFunc[0] != null) {
            let module: any;
            let libraryTyping;
            if ((rawFunc[0] as any)?.udf) {
                const isTestingFunctionInClass = ((rawFunc[0] as any)?.class);
                const classTypePreamble = (isTestingFunctionInClass)
                    ? `c${(rawFunc[0] as any)?.class}{rightarrow}{rightarrow}`
                    : "";            
                funcs.push({
                    keyboardTypingToImport: "{uparrow}" + classTypePreamble + "f" + (rawFunc[0] as any)?.udf + "{downarrow}{downarrow}",
                    funcName: rawFunc[1],
                    params: params,
                    acSection: (isTestingFunctionInClass) ? "self" : "My functions",
                    acName: rawFunc[1],
                    displayName: rawFunc[1] + " udf: " + (rawFunc[0] as any)?.udf,
                });
                continue;
            }
            else if (typeof rawFunc[0] == "string") {
                // No library:
                libraryTyping = "";
                module = rawFunc[0];
            }
            else if (Array.isArray(rawFunc[0])) {
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
                    params: params,
                    acSection: module,
                    acName: rawFunc[1],
                    displayName: rawFunc[1] + " with import frame",
                });
            }
            // The "from module import *" frame:
            funcs.push({
                keyboardTypingToImport: "{uparrow}{uparrow}" + libraryTyping + "f" + module + "{rightarrow}*{rightarrow}{downarrow}{downarrow}",
                funcName: rawFunc[1],
                params: params,
                acSection: module,
                acName: rawFunc[1],
                displayName: rawFunc[1] + " with from-import-* frame",
            });
            // The "from module import funcName" frame:
            // Note that if funcName has a dot, we need to only use the part before the dot or opening bracket:
            funcs.push({
                keyboardTypingToImport: "{uparrow}{uparrow}" + libraryTyping + "f" + module + "{rightarrow}" + (rawFunc[1].match(/^[A-Za-z0-9_]+/)?.[0] ?? rawFunc[1]) + "{rightarrow}{downarrow}{downarrow}",
                funcName: rawFunc[1],
                params: params,
                acName: rawFunc[1],
                acSection: module,
                displayName: rawFunc[1] + " with from-import-funcName frame",
            });
        }
        else {
            // No import necessary
            funcs.push({
                funcName: rawFunc[1],
                params: params,
                acSection: BUILTIN,
                acName: rawFunc[1],
                displayName: rawFunc[1],
            });
        }
    }
    testFuncs([
        ...funcs.map((f) => ({...f, defocus: false})),
        ...funcs.map((f) => ({...f, defocus: true})),
    ]);
}
function argToString(s: SignatureArg) : string {
    return s.name + (s.defaultValue != null ? "=" + s.defaultValue : "");
}
function emptyDisplay(sig: Signature, defocused: boolean) {
    return [
        ...sig.positionalOnlyArgs,
        ...sig.positionalOrKeywordArgs,
        ...(!defocused && sig.varArgs != null ? [{name: sig.varArgs.name, defaultValue: null, argType: null}] : []),
        // Make sure the = shows up after the keyword-only if they don't have a default:
        ...sig.keywordOnlyArgs.map((k) => ({...k, defaultValue: k.defaultValue ?? ""})),
        ...(!defocused && sig.varKwargs != null ? [{name: sig.varKwargs.name, defaultValue: null, argType: null}] : []),
    ].filter((p) => !defocused || p?.defaultValue == null).map(argToString).join(", ");
}

function insertKeyboardTypingToImport(keyboardTypingToImport: string | undefined){
    // Some frames, like class, requires a pause after the key to inser them has been hit,
    // so the body/joint sections loads in the editor.
    // As we don't have an exact way to know when such case arises in func.keyboardTypingToImport,
    // we just delay all key hit reasonably.
    if (keyboardTypingToImport) {
        cy.get("body").type(keyboardTypingToImport, {delay: 100});
    }
}

function testFuncs(funcs: {
        keyboardTypingToImport?: string,
        funcName: string,
        params: Signature,
        displayName: string,
        acSection: string,
        acName: string
    }[]) {
    for (const func of funcs) {
        const defocus = function() {
            // The frame might wrap so add modifiers to make sure we move down to frame cursor:
            cy.get("body").type("{ctrl+alt+downarrow}");
            cy.wait(500);
        };
        it("Shows prompts after manually writing function name and brackets for " + func.displayName, () => {
            focusEditorAC();
            insertKeyboardTypingToImport(func.keyboardTypingToImport);
            cy.get("body").type(" " + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            withFrameId((frameId) => {
                assertState(frameId, func.funcName + "($)", func.funcName + "(" + emptyDisplay(func.params, false) + ")");
            });
            withFrameId((frameId) => {
                defocus();
                assertState(frameId, func.funcName + "()", func.funcName + "(" + emptyDisplay(func.params, true) + ")");
            });
        });
        it("Shows prompts after manually writing function name and brackets AND commas for " + func.displayName, () => {
            focusEditorAC();
            insertKeyboardTypingToImport(func.keyboardTypingToImport);
            cy.get("body").type(" " + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            const extra = [
                ...func.params.varArgs ? [func.params.varArgs.name] : "",
                ...func.params.varKwargs ? [func.params.varKwargs.name] : [],
            ].join(", ");
            const extraArg = extra ? [{name: extra, defaultValue: null, argType: null}] : [];
            const positional = [...func.params.positionalOnlyArgs, ...func.params.positionalOrKeywordArgs];
            // Type commas for num params minus 1:
            for (let i = 0; i < positional.length + extraArg.length; i++) {
                if (i > 0) {
                    cy.get("body").type(",");
                }
                withFrameId((frameId) => assertState(frameId,
                    func.funcName + "(" + ",".repeat(i) + "$)",
                    func.funcName + "(" + positional.slice(0, i).map((s) => s.name).join(",") + (i > 0 ? "," : "") + [...positional.slice(i), ...func.params.keywordOnlyArgs, ...extraArg].map(argToString).join(", ") + ")"));
            }
        });

        it("Shows prompts in nested function " + func.displayName, () => {
            focusEditorAC();
            insertKeyboardTypingToImport(func.keyboardTypingToImport);
            cy.get("body").type(" max(0," + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
            withFrameId((frameId) => {
                assertState(frameId, "max(0," + func.funcName + "($))", "max(0," + func.funcName + "(" + emptyDisplay(func.params, false) + "))");
            });
            withFrameId((frameId) => {
                defocus();
                assertState(frameId, "max(0," + func.funcName + "())", "max(0," + func.funcName + "(" + emptyDisplay(func.params, true) + "))");
            });
        });
        
        if (func.params.positionalOrKeywordArgs.length >= 3) {
            it("Hides positional params and prev used named params once name entered " + func.displayName, () => {
                focusEditorAC();
                insertKeyboardTypingToImport(func.keyboardTypingToImport);
                // We pick an arbitrary param to pass from the middle:
                const midParam = Math.floor(func.params.positionalOrKeywordArgs.length / 2);
                // We enter first one, then named middle one:
                cy.get("body").type(" " + func.funcName.replaceAll(/[‘’]/g, "'") + "(");
                const midName = func.params.positionalOrKeywordArgs[midParam].name;
                cy.get("body").type("0, " + midName + "=0,");
                // Now it should hide the first param, and the middle one, and show the others as keyword possibilities
                withFrameId((frameId) => {
                    assertState(frameId,
                        func.funcName + "(0," + midName + "=0," + "$)",
                        func.funcName + "(0," + midName + "=0," + [...func.params.positionalOnlyArgs, ...func.params.positionalOrKeywordArgs.slice(1, midParam), ...func.params.positionalOrKeywordArgs.slice(midParam + 1), ...func.params.keywordOnlyArgs].map((s) => argToString(s.defaultValue != null ? s : {...s, defaultValue: ""})).join(", ") + ")");
                });
                withFrameId((frameId) => {
                    defocus();
                    assertState(frameId,
                        func.funcName + "(0," + midName + "=0," + ")",
                        func.funcName + "(0," + midName + "=0," + [...func.params.positionalOnlyArgs, ...func.params.positionalOrKeywordArgs.slice(1, midParam), ...func.params.positionalOrKeywordArgs.slice(midParam + 1)].filter((p) => p.defaultValue == null).map((s) => argToString(s.defaultValue != null ? s : {...s, defaultValue: ""})).join(", ") + ")");
                });
            });
        }
    }
}
