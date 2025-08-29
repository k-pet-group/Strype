import {AcResultsWithCategory, AllFrameTypesIdentifier, BaseSlot, FrameObject, AcResultType, SlotsStructure, FieldSlot, StringSlot, isFieldBaseSlot} from "@/types/types";

import {useStore} from "@/store/store";
import {extractFormalParamsFromSlot, getMatchingBracket, transformFieldPlaceholders} from "@/helpers/editor";
import {getAllEnabledUserDefinedFunctions} from "@/helpers/storeMethods";
import i18n from "@/i18n";
import {Signature, TPyParser} from "tigerpython-parser";
import {getAvailablePyPyiFromLibrary, getPossibleImports, getTextFileFromLibraries} from "@/helpers/libraryManager";
import Parser from "@/parser/parser";
import { z } from "zod";
import {extractPYI} from "@/helpers/python-pyi";
/* IFTRUE_isPython */
import { pythonBuiltins } from "@/autocompletion/pythonBuiltins";
import skulptPythonAPI from "@/autocompletion/skulpt-api.json";
import {OUR_PUBLIC_LIBRARY_MODULES} from "@/autocompletion/ac-skulpt";
import graphicsMod from "../../public/public_libraries/strype/graphics.py";
import soundMod from "../../public/public_libraries/strype/sound.py";
import turtleMod from "../../public/pyi/turtle.pyi";
TPyParser.defineModule("strype.graphics", extractPYI(graphicsMod), "pyi");
TPyParser.defineModule("strype.sound", extractPYI(soundMod), "pyi");
TPyParser.defineModule("turtle", turtleMod, "pyi");
/* FITRUE_isPython */
/* IFTRUE_isMicrobit */
import microbitPythonAPI from "@/autocompletion/microbit-api.json";
import microbitDescriptions from "@/autocompletion/microbit.json";
// Import all the micro:bit PYI files and load the modules in TigerPython.
// If these files need update, replace "audio.pyi" in the root folder
// by the one in /microbit/ because it seems reimports don't work well.
// Remove "VERSIONS" as well.
const mbPYIContextFolderContext = require.context("../../public/public_libraries/microbit/");
const mbPYContextPaths = mbPYIContextFolderContext.keys();
mbPYContextPaths.forEach((mbPYContextPath) => {
    if(mbPYContextPath.endsWith("pyi")) {        
        const mbPYIAsModule = mbPYIContextFolderContext(mbPYContextPath); // Immediately loads the module
        // Module paths start with "./" and finish with ".pyi", 
        // to get the module name we scrap these off, change "/"
        // to "." and remove the file name altogether if we have "__init__".
        const moduleName = mbPYContextPath.slice(2, -4).replaceAll("/", ".").replace(".__init__", "");
        TPyParser.defineModule(moduleName, (mbPYIAsModule as any).default, "pyi");
    }   
});
/* FITRUE_isMicrobit */

// Given a FieldSlot, get the program code corresponding to it, to use
// as the prefix (context) for code completion.
export function getContentForACPrefix(item : FieldSlot, excludeLast? : boolean) : string {
    if ("quote" in item) {
        // It's a string literal
        const ss = item as StringSlot;
        return ss.quote + ss.code + ss.quote;
    }
    else if ("mediaType" in item) {
        // It's a media literal
        if (item.mediaType.startsWith("image/")) {
            return "load_image('')";
        }
        else if (item.mediaType.startsWith("audio/")) {
            return "load_sound('')";
        }
        else {
            return "";
        }
    }
    else if ("code" in item) {
        const basic = item as BaseSlot;
        return basic.code;
    }
    else {
        // Must be a SlotsStructure, then
        const struct = item as SlotsStructure;
        let glued = "";
        for (let i = 0; i < struct.fields.length - (excludeLast ? 1 : 0); i++) {
            glued += getContentForACPrefix(struct.fields[i]);
            if (i < struct.operators.length) {
                // Only add dot if we are not the final operator before the excluded last:
                if (struct.operators[i].code === "." || struct.operators[i].code === "") {
                    if (!excludeLast || i != struct.operators.length - 1) {
                        glued += struct.operators[i].code;
                    }
                }
                else {
                    // Non dot operators (comma, plus, etc) break up the expression, so ignore everything before:
                    glued = "";
                }
            }
        }
        if (struct.openingBracketValue) {
            return struct.openingBracketValue + glued + getMatchingBracket(struct.openingBracketValue, true);
        }
        else {
            return glued;
        }
    }
}

// Check every time you're in a slot and see how to show the AC (for the code section)
// the full AC content isn't recreated every time, but only do so when we detect a change of context.
// The return is a token (or null if code completion is invalid here)
// and context (prefix) which is the part before a dot before the token.
export function getCandidatesForAC(slotCode: SlotsStructure, location: number[]): {tokenAC: string | null; contextAC: string} {
    // If anything goes wrong we make sure not to throw an exception; just show the AC with "No completion available":
    try {
        if (location.length == 1) {
            let fieldIndex = location[0];
            const ourField = slotCode.fields[fieldIndex];
            // We only offer completions for basic slots that are not string literals:
            if (ourField != undefined && ("code" in ourField && !("quote" in ourField))) {
                let prefix = "";
                // Glue together any previous slots that are joined by dots (or blank operators):
                if (fieldIndex > 0 && slotCode.operators[fieldIndex - 1].code === ".") {
                    while (fieldIndex > 0 && (slotCode.operators[fieldIndex - 1].code === "." || slotCode.operators[fieldIndex - 1].code === "")) {
                        fieldIndex -= 1;
                        prefix = getContentForACPrefix(slotCode.fields[fieldIndex]) + (prefix ? slotCode.operators[fieldIndex].code : "") + prefix;
                    }
                }
                
                return {tokenAC: ourField.code, contextAC: prefix};
            }
        }
        else {
            // We are in a bracket.  We can ignore everything at higher levels for autocompletion,
            // because it doesn't affect the autocompletion.  That is, if you have "myVar." and hit ctrl-space,
            // it doesn't matter if the code is just "myVar." or "len(myVar.)", being in a bracket doesn't matter.
            // So just dig down to the next level:
            return getCandidatesForAC(slotCode.fields[location[0]] as SlotsStructure, location.slice(1));
        }
    }
    catch (e) {
        console.log("Exception while constructing code for autocompletion:" + e);
    }
    return {tokenAC: null, contextAC: ""};
}

// Given a slot, find all identifiers that are between two commas (or between a comma
// and the start/end of the slot) and add them to the given set.
export function extractCommaSeparatedNames(slot: SlotsStructure) : string[] {
    const found : string[] = [];
    let validOpBefore = true;
    const ops = slot.operators;
    const fields = slot.fields;
    for (let i = 0; i < fields.length; i++) {
        const validOpAfter = i == fields.length - 1 || ops[i].code === ",";
        if ((fields[i] as BaseSlot).code) {
            if (validOpBefore && validOpAfter) {
                found.push((fields[i] as BaseSlot).code);
            }
        }
        validOpBefore = validOpAfter;
    }
    return found;
}

function getAllUserDefinedVariablesWithinUpTo(framesForParentId: FrameObject[], frameId?: number) : { found : Set<string>, complete: boolean} {
    const soFar = new Set<string>();
    for (const frame of framesForParentId) {
        if (frameId !== undefined && frameId == frame.id) {
            return {found: soFar, complete: true};
        }
        // Get LHS from assignments:
        if (frame.frameType.type === AllFrameTypesIdentifier.varassign && !frame.isDisabled) {
            // We may have all sorts on the LHS.  We want any slots which are plain,
            // and which are adjoined by either the beginning of the slot, the end,
            // or a comma
            extractCommaSeparatedNames(frame.labelSlotsDict[0].slotStructures).forEach((x) => soFar.add(x));
        }
        // Get iterator variables from for loops:
        if (frame.frameType.type === AllFrameTypesIdentifier.for && !frame.isDisabled) {
            if ((frame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code) {
                soFar.add((frame.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot).code);
            }
        }
        
        // Now go through children:
        for (const childrenId of frame.childrenIds) {
            const childFrame = useStore().frameObjects[childrenId];
            const childResult = getAllUserDefinedVariablesWithinUpTo([childFrame], frameId);
            childResult.found.forEach((item) => soFar.add(item));
            if (childResult.complete) {
                return {found: soFar, complete : true};
            }
        }
    }
    return {found: soFar, complete: false};
}

export function getAllUserDefinedVariablesUpTo(frameId: number) : Set<string> {
    // First we need to go up the tree, to find the top-most parent (either top-level frames or a user-defined function)
    let curFrameId = frameId;
    for (;;) {
        const frame = useStore().frameObjects[curFrameId];
        const parentId = frame.parentId;
        if (parentId == useStore().getFuncDefsFrameContainerId) {
            // It's a user-defined function, process accordingly
            const available = getAllUserDefinedVariablesWithinUpTo(useStore().getFramesForParentId(curFrameId), frameId).found;
            // Also add all variables from the body:
            getAllUserDefinedVariablesWithinUpTo(useStore().getFramesForParentId(useStore().getMainCodeFrameContainerId)).found
                .forEach((v) => available.add(v));
            // Also add any parameters from the function:
            // Sanity check the frame type:
            if (frame.frameType.type === AllFrameTypesIdentifier.funcdef) {
                extractCommaSeparatedNames(frame.labelSlotsDict[1].slotStructures).forEach((x) => available.add(x));
            }
            return available;
        }
        else if (parentId <= 0) {
            // Reached top-level, go backwards from here:
            return getAllUserDefinedVariablesWithinUpTo(useStore().getFramesForParentId(parentId), frameId).found;
        }
        curFrameId = parentId;
    }
}

export async function getAllExplicitlyImportedItems(context: string) : Promise<AcResultsWithCategory> {
    // Reset the aliases dictionary
    const importedAliasedModules: {[alias: string]: string} = {};

    // To get library imports, we first get the libraries:
    const p = new Parser();
    // We only need to parse the imports container:
    p.parseJustImports();
    // Then we can get the libraries and look for imports:
    let fromLibraries : Record<string, AcResultType[]> = {};
    for (const library of p.getLibraries()) {
        // Check for autocomplete.json:
        const acBuffer = await getTextFileFromLibraries([library], "autocomplete.json");
        if (acBuffer != null) {
            const ac = AcResultsWithCategorySchema.parse(JSON.parse(acBuffer));
            if (ac != null) {
                fromLibraries = {...fromLibraries, ...ac};
            }
        }
    }
    

    const soFar : AcResultsWithCategory = {};
    const imports : FrameObject[] = Object.values(useStore().frameObjects) as FrameObject[];
    loopImportFrames: for (let i = 0; i < imports.length; i++) {
        const frame = imports[i];
        if (!frame.isDisabled && (frame.frameType.type === AllFrameTypesIdentifier.fromimport || frame.frameType.type === AllFrameTypesIdentifier.import)) {
            // We need to distinguish 2 cases: when explicit imports are done with "from...import..." or just "import...".
            // In the latter, if context is empty, we add the module under the section "Imported modules" in the A/C.
            // Otherwise we only add it if the module matches the context.
            const isSimpleImport = (frame.frameType.type === AllFrameTypesIdentifier.import);
            let module = "";
            for (let j = 0; j < frame.labelSlotsDict[0].slotStructures.fields.length; j++) {
                module += (frame.labelSlotsDict[0].slotStructures.fields[j] as BaseSlot).code;
                if (j < frame.labelSlotsDict[0].slotStructures.operators.length) {
                    // Should be a dot or a comma or "as" (for simple imports):
                    if (frame.labelSlotsDict[0].slotStructures.operators[j].code !== "." && (!isSimpleImport || (isSimpleImport && frame.labelSlotsDict[0].slotStructures.operators[j].code !== "," && frame.labelSlotsDict[0].slotStructures.operators[j].code !== "as"))) {
                        // Error; ignore this import
                        continue loopImportFrames;
                    }
                    else if(isSimpleImport && (frame.labelSlotsDict[0].slotStructures.operators[j].code === "," || frame.labelSlotsDict[0].slotStructures.operators[j].code === "as")){
                        // When we import several modules at once we process them one by one
                        if(frame.labelSlotsDict[0].slotStructures.operators[j].code == "as") {
                            // If we have an alias, we feed the module alias dictionary so we can know what module
                            // the alias refers to, and we use the name of alias as module for a/c.
                            // If no alias name is provided, we don't add the module/alias at all
                            const aliasName = (frame.labelSlotsDict[0].slotStructures.fields[j + 1] as BaseSlot).code;
                            if(aliasName.length > 0){
                                importedAliasedModules[aliasName] = module;
                                doGetAllExplicitlyImportedItems(frame, aliasName, true, soFar, context, importedAliasedModules, fromLibraries);    
                                // We already retrieved the alias, so we skip a slot for the next module
                                j++;
                            }                 
                        }
                        else{
                            doGetAllExplicitlyImportedItems(frame, module, true, soFar, context, importedAliasedModules, fromLibraries);
                        }
                        module = "";
                        continue;
                    }
                    module += frame.labelSlotsDict[0].slotStructures.operators[j].code;
                }
            }

            // If the module is empty (which happens when user has only added a frame), we skip it
            if(module.length > 0) {
                doGetAllExplicitlyImportedItems(frame, module, isSimpleImport, soFar, context, importedAliasedModules, fromLibraries);
            }
        }
    }
    return soFar;
}

function doGetAllExplicitlyImportedItems(frame: FrameObject, module: string, isSimpleImport: boolean, soFar: AcResultsWithCategory, context: string, importedAliasedModules: {[alias: string]: string}, availableLibraries: AcResultsWithCategory): void {
    const importedModulesCategory = i18n.t("autoCompletion.importedModules") as string;
    if (!isSimpleImport && frame.labelSlotsDict[1].slotStructures.fields.length == 1 && (frame.labelSlotsDict[1].slotStructures.fields[0] as BaseSlot).code === "*") {
                
        // Depending on whether we are microbit or Skulpt, access the appropriate JSON file and retrieve
        // the contents of the specific module:
        
        /* IFTRUE_isMicrobit */
        const allMicrobitItems : AcResultType[] = microbitPythonAPI[module as keyof typeof microbitPythonAPI] as AcResultType[];
        if (allMicrobitItems) {
            soFar[module] = [...allMicrobitItems.filter((x) => !x.acResult.startsWith("_"))];
            // Check if the context (e.g. compass) exactly matches a re-exported module in microbit.
            // If so, copy the contents of microbit.<context> into an item named <context>
            const reExported = allMicrobitItems.find((ac) => ac.acResult === context && ac.type.includes("module"));
            if (reExported && microbitPythonAPI["microbit." + reExported.acResult as keyof typeof microbitPythonAPI]) {
                soFar[reExported.acResult] = [...(microbitPythonAPI["microbit." + reExported.acResult as keyof typeof microbitPythonAPI] as AcResultType[]).filter((x) => !x.acResult.startsWith("_"))];
            }
        }
        /* FITRUE_isMicrobit */

        /* IFTRUE_isPython */
        const allSkulptItems : AcResultType[] = skulptPythonAPI[module as keyof typeof skulptPythonAPI] as AcResultType[];
        if (allSkulptItems) {
            soFar[module] = [...allSkulptItems.filter((x) => !x.acResult.startsWith("_"))];
        }
        else if (module in availableLibraries) {
            soFar[module] = [...availableLibraries[module].filter((x) => !x.acResult.startsWith("_"))];
        }
        /* FITRUE_isPython */
    }
    else {
        // The module name might be an alias: we need to get the right module to retrieve the data.
        const realModule = (importedAliasedModules[module]) ? importedAliasedModules[module] : module;
        if(isSimpleImport && context != module) {
            if (soFar[importedModulesCategory] == undefined || !soFar[importedModulesCategory].some((acRes) => acRes.acResult.localeCompare(realModule) == 0)) {
                // In the case of an import frame, we can add the module in the a/c as such in the imported module modules section (if non-present)
                /* IFTRUE_isPython */
                if (pythonBuiltins[realModule]) {
                    const moduleDoc = (pythonBuiltins[realModule].documentation ?? "");
                    const imports = soFar[importedModulesCategory] ?? [];
                    imports.push({acResult: module, documentation: moduleDoc, type: ["module"], version: 0});
                    soFar[importedModulesCategory] = imports;
                }
                else if (OUR_PUBLIC_LIBRARY_MODULES.includes(realModule) || Object.keys(availableLibraries).includes(realModule)) {
                    const imports = soFar[importedModulesCategory] ?? [];
                    imports.push({acResult: module, documentation: "", type: ["module"], version: 0});
                    soFar[importedModulesCategory] = imports;
                }
                /* FITRUE_isPython */
                /* IFTRUE_isMicrobit */
                if((microbitDescriptions.modules as any as Record<string, AcResultType>)[realModule]){
                    const moduleEntry = (microbitDescriptions.modules as any as Record<string, AcResultType>)[realModule];
                    const moduleDoc = (moduleEntry.documentation ?? "");
                    const imports = soFar[importedModulesCategory] ?? [];
                    imports.push({acResult: module, documentation: moduleDoc, type: ["module"], version: moduleEntry.version});
                    soFar[importedModulesCategory] = imports;
                }
                /* FITRUE_isMicrobit */
            }
        }
        else{
            soFar[module] = [];
        
            let allItems : AcResultType[] = [];

            /* IFTRUE_isMicrobit */
            const allMicrobitItems : AcResultType[] = microbitPythonAPI[realModule as keyof typeof microbitPythonAPI] as AcResultType[];
            if (allMicrobitItems) {
                allItems = [...allMicrobitItems.filter((x) => !x.acResult.startsWith("_"))];
                // Check if the context (e.g. compass) exactly matches a re-exported module in microbit.
                // If so, copy the contents of microbit.<context> into an item named <context>
                const reExported = allMicrobitItems.find((ac) => ac.acResult === context && ac.type.includes("module"));
                if (reExported && microbitPythonAPI["microbit." + reExported.acResult as keyof typeof microbitPythonAPI]) {
                    soFar[reExported.acResult] = [...(microbitPythonAPI["microbit." + reExported.acResult as keyof typeof microbitPythonAPI] as AcResultType[]).filter((x) => !x.acResult.startsWith("_"))];
                }
            }
            /* FITRUE_isMicrobit */

            /* IFTRUE_isPython */
            const allSkulptItems : AcResultType[] =
                (skulptPythonAPI[realModule as keyof typeof skulptPythonAPI] as AcResultType[])
                    ?? availableLibraries[realModule];
            if (allSkulptItems) {
                allItems = [...allSkulptItems.filter((x) => !x.acResult.startsWith("_"))];
            }
            /* FITRUE_isPython */
        
            // Find the relevant item from allItems (if it exists):
            if (isSimpleImport) {
                soFar[module].push(...allItems);
            }
            else {
                for (const f of frame.labelSlotsDict[1].slotStructures.fields) {
                    // We find either:
                    // - Results which match the thing imported, e.g. Turtle when the user has written "from turtle import Turtle"
                    // - Results where the part before the first dot matches, e.g. date.fromtimestamp when the user has written "from datetime import date"
                    soFar[module].push(...allItems.filter((ac) => ac.acResult === (f as BaseSlot).code.trim() || (ac.acResult.includes(".") && ac.acResult.startsWith((f as BaseSlot).code.trim() + "."))));
                }
            }
        }
    }
}

export async function getAvailableModulesForImport() : Promise<AcResultsWithCategory> {
    // To get library imports, we first get the libraries:
    const p = new Parser();
    // We only need to parse the imports container:
    p.parseJustImports();
    // Then we can get the libraries and look for imports:
    const fromLibraries = [];
    for (const library of p.getLibraries()) {
        const paths = await getAvailablePyPyiFromLibrary(library);
        if (paths != null) {
            // I don't understand why we need "as string[]" here given the null check above,
            // but Typescript complains without:
            fromLibraries.push(...getPossibleImports(paths as string[]));
        }
    }

    // eslint-disable-next-line prefer-const
    let isMicrobit = false;
    /* IFTRUE_isMicrobit isMicrobit = true; FITRUE_isMicrobit */
    const apiModules = (isMicrobit) ? (microbitDescriptions.modules as any as Record<string, {type: "module", documentation?: string, version: number}>) : pythonBuiltins;   
    // Only add our own public libraries (at the end of this chain) when we are in the standard Stype version.
    return {[""] : Object.keys(apiModules)
        .filter((k) => apiModules[k]?.type === "module" && !k.startsWith("_"))
        .map((k) => ({acResult: k, documentation: apiModules[k].documentation||"", type: [apiModules[k].type], version: apiModules[k].version}))
        .concat(fromLibraries.map((m) => ({acResult: m, documentation: "", type: ["module"], version: 0}))) /*IFTRUE_isPython .concat(OUR_PUBLIC_LIBRARY_MODULES.map((m) => ({acResult: m, documentation: "", type: ["module"], version: 0}))) FITRUE_isPython */};    
}

const SignatureArgSchema = z.object({
    name: z.string(),
    defaultValue: z.string().nullable(),
    argType: z.string().nullable(),
});

const SignatureVarArgSchema = z.object({
    name: z.string(),
    argType: z.string().nullable(),
});

const SignatureSchema = z.object({
    positionalOnlyArgs: z.array(SignatureArgSchema),
    positionalOrKeywordArgs: z.array(SignatureArgSchema),
    varArgs: SignatureVarArgSchema.nullable(),
    keywordOnlyArgs: z.array(SignatureArgSchema),
    varKwargs: SignatureVarArgSchema.nullable(),
    firstParamIsSelfOrCls: z.boolean(),
});


// Define AcResultType
const AcResultTypeSchema = z.object({
    acResult: z.string(),
    documentation: z.string(),
    type: z.array(z.enum(["function", "module", "variable", "type"])),
    params: z
        .array(
            z.object({
                name: z.string(),
                defaultValue: z.string().optional(),
                hide: z.boolean().optional(),
            })
        )
        .optional(),
    signature: SignatureSchema.optional(),
    version: z.number(),
});

// Define AcResultsWithCategory: a record of category → array of AcResultType
const AcResultsWithCategorySchema = z.record(z.array(AcResultTypeSchema));


export async function getAvailableItemsForImportFromModule(module: string) : Promise<AcResultType[]> {
    const star : AcResultType = {"acResult": "*", "documentation": "All items from module", "version": 0, "type": []};
    /* IFTRUE_isMicrobit */
    const allMicrobitItems: AcResultType[] = microbitPythonAPI[module as keyof typeof microbitPythonAPI] as AcResultType[];
    if (allMicrobitItems) {
        return [...allMicrobitItems, star];
    }
    /* FITRUE_isMicrobit */

    /* IFTRUE_isPython */
    const allSkulptItems: AcResultType[] = skulptPythonAPI[module as keyof typeof skulptPythonAPI] as AcResultType[];
    if (allSkulptItems) {
        return [...allSkulptItems, star];
    }
    // To get library imports, we first get the libraries:
    const p = new Parser();
    // We only need to parse the imports container:
    p.parseJustImports();
    // Then we can get the libraries and look for imports:
    for (const library of p.getLibraries()) {
        const paths = await getAvailablePyPyiFromLibrary(library);
        if (paths != null) {
            if (getPossibleImports(paths).includes(module)) {
                // Check for autocomplete.json:
                const acBuffer = await getTextFileFromLibraries([library], "autocomplete.json");
                if (acBuffer != null) {
                    const ac = AcResultsWithCategorySchema.parse(JSON.parse(acBuffer));
                    if (ac != null && module in ac) {
                        return [...ac[module], star];
                    }
                }
            }
        }
    }
    
    /* FITRUE_isPython */
    return [star];
}

export function getBuiltins() : AcResultType[] {
    /* IFTRUE_isPython */
    // Must return a clone as caller may later modify the list:
    return [...skulptPythonAPI[""] as AcResultType[]];
    /* FITRUE_isPython */
    /* IFTRUE_isMicrobit */
    // Must return a clone as caller may later modify the list:
    return [...microbitPythonAPI[""] as AcResultType[]];
    /* FITRUE_isMicrobit */
}

// Get the placeholder text for the given function parameter index
// If it's the last parameter, glue the rest together with commas
function getParamPromptOld(params: string[], hasDefaultValues: boolean[] | null, targetParamIndex: number, lastParam: boolean) : string {
    if (targetParamIndex >= params.length) {
        return "";
    }
    else if (!lastParam) {
        return params[targetParamIndex];
    }
    else {
        return params.filter((_, i) => hasDefaultValues == null || i >= hasDefaultValues.length || !hasDefaultValues[i]).slice(targetParamIndex).join(", ");
    }
}


// Get the placeholder text for the given function parameter index
// If it's the last parameter, glue the rest together with commas
function getParamPrompt(sig: Signature, targetParamIndex: number, prevKeywordArgs: string[], lastParam: boolean, isFocused: boolean) : string {
    const t = function(arg : {name: string, defaultValue: string | null}) {
        // Deliberately no spaces around equals to compress the display:
        return arg.name + (arg.defaultValue != null ? "=" + arg.defaultValue : "");
    };
    const positionalOnlyArgsMinusSelf = sig.positionalOnlyArgs.slice(sig.firstParamIsSelfOrCls ? 1 : 0);
    if (prevKeywordArgs.length == 0) {
        // Still in the positional args, find the right index:
        let flattenedPositional = [...positionalOnlyArgsMinusSelf, ...sig.positionalOrKeywordArgs];
        if (targetParamIndex < flattenedPositional.length) {
            if (!lastParam) {
                // Don't show default if not last param
                return t({...flattenedPositional[targetParamIndex], defaultValue: null});
            }
            else {
                if (!isFocused) {
                    // If not focused, don't show params that have a default value:
                    flattenedPositional = flattenedPositional.filter((p) => p.defaultValue == null);
                }
                const remaining: {name: string, defaultValue: string | null}[] = flattenedPositional.slice(targetParamIndex);
                if (isFocused) {
                    // If we're focused in the last param,
                    // show the keyword ones as well:
                    // Make sure the = shows up after the keyword-only if they don't have a default:
                    remaining.push(...sig.keywordOnlyArgs.map((k) => ({...k, defaultValue: k.defaultValue ?? ""})));
                    if (sig.varArgs != null) {
                        remaining.push({name: "*" + sig.varArgs.name, defaultValue: null});
                    }
                    if (sig.varKwargs != null) {
                        remaining.push({name: "**" + sig.varKwargs.name, defaultValue: null});
                    }
                }
                return remaining.map(t).join(", ");
            }
        }
    }
    // If only optional keyword args left, don't show them if not focused:
    if (!isFocused && sig.positionalOrKeywordArgs.length <=  targetParamIndex - prevKeywordArgs.length - positionalOnlyArgsMinusSelf.length) {
        return "";
    }
    // Otherwise we must only show args which can be specified by keyword, and only those
    // not already specified (unless focused):
    const remainingKeywordNames = [...sig.positionalOrKeywordArgs.slice(targetParamIndex - prevKeywordArgs.length - positionalOnlyArgsMinusSelf.length), ...(isFocused ? sig.keywordOnlyArgs : [])]
        .filter((k) => !prevKeywordArgs.includes(k.name) && (isFocused || k.defaultValue == null));
    if (remainingKeywordNames.length > 0) {
        // Make the equals show up by filling in defaultValue if blank:
        return remainingKeywordNames.map((c) => ({...c, defaultValue: c.defaultValue ?? ""})).map(t).join(", ");
    }
    if (isFocused) {
        return [...sig.varArgs ? ["*" + sig.varArgs.name] : [], ...sig.varKwargs ? ["**" + sig.varKwargs.name] : []].join(", ");
    }
    return "";
}

export async function tpyDefineLibraries(parser: Parser) : Promise<void> {
    for (const library of parser.getLibraries()) {
        const pyPYIs = await getAvailablePyPyiFromLibrary(library);
        if (pyPYIs == null) {
            continue;
        }
        for (const pyPYI of pyPYIs) {
            const text = await getTextFileFromLibraries([library], pyPYI);
            if (text != null) {
                const pyi = pyPYI.endsWith(".pyi") ? text : extractPYI(text);
                
                try {
                    TPyParser.defineModule(pyPYI.replace(/\.pyi?$/, "").replaceAll("/", "."), pyi, "pyi");
                }
                catch (e) {
                    console.error(e);
                }
            }
        }
    }
}

export function getUserDefinedSignature(userFunc: FrameObject) : Signature {
    const {params, keyValues} = extractFormalParamsFromSlot(userFunc.labelSlotsDict[1].slotStructures);
    const singleStar = params
        .map((value, index) =>
            (value.operands.length == 2
                && value.operators[0] == "*"
                && isFieldBaseSlot(value.operands[0])
                && isFieldBaseSlot(value.operands[1])
                && value.operands[0].code.trim().length == 0)
                ? [value.operands[1].code.trim(), index]
                : null)
        .find((x) : x is [string, number] => x != null);
    const doubleStar = params
        .map((value, index) =>
            (value.operands.length == 2
                && value.operators[0] == "**"
                && isFieldBaseSlot(value.operands[0])
                && isFieldBaseSlot(value.operands[1])
                && value.operands[0].code.trim().length == 0)
                ? [value.operands[1].code.trim(), index]
                : null)
        .find((x) : x is [string, number] => x != null);

    function toParam(p: { operands: FieldSlot[]; operators: string[]; }, i: number) : { name: string; defaultValue: string | null; argType: null; } {
        return ({ name: keyValues[i]?.[0] ?? (p.operands.length == 1 && isFieldBaseSlot(p.operands[0]) ? p.operands[0].code : undefined) ?? ("error" + i), defaultValue: keyValues[i]?.[1] ?? null, argType: null });
    }
    
    const keywordOnlyStart = 1 + (singleStar?.[1] ?? (params.length - 1));
    return {
        positionalOnlyArgs: [], //TODO self if class
        positionalOrKeywordArgs: params.slice(0, singleStar?.[1] ?? doubleStar?.[1] ?? params.length).map(toParam),
        keywordOnlyArgs: params.slice(keywordOnlyStart, doubleStar?.[1] ?? params.length).map((p, i) => toParam(p, i + keywordOnlyStart)),
        varArgs: singleStar !== undefined && singleStar[0].trim().length > 0 ? {name: singleStar[0].trim(), argType: null} : null,
        varKwargs: doubleStar !== undefined && doubleStar[0].trim().length > 0 ? {name: doubleStar[0].trim(), argType: null} : null,
        firstParamIsSelfOrCls: false, // TODO support this once OOP is in place
    };
}

// Gets the parameter name prompt for the given autocomplete details (context+token)
// for the given parameter. Note that for the UI to display spans properly, empty placeholders are returned as \u200b (0-width space)
export async function calculateParamPrompt(frameId: number, {context, token, paramIndex, lastParam, prevKeywordNames} : {context: string, token: string, paramIndex: number, lastParam: boolean, prevKeywordNames: string[]}, isFocused: boolean) : Promise<string> {
    if (!context) {
        // If context is blank, we know that the function must be one of:
        // - A user-defined function
        // - A built-in function
        // - An explicitly imported function with from...import...
        // We check the items in that order.  We can do this without using Skulpt, which will speed things up
        const userFunc = getAllEnabledUserDefinedFunctions().find((f) => (f.labelSlotsDict[0].slotStructures.fields[0] as BaseSlot)?.code === token);
        if (userFunc !== undefined) {
            const sig = getUserDefinedSignature(userFunc);
            return getParamPrompt(sig, paramIndex, prevKeywordNames, lastParam, isFocused);
        }
        const builtinFunc = getBuiltins().find((f) => f.acResult === token);
        if (builtinFunc !== undefined) {
            if (builtinFunc.signature) {
                return getParamPrompt(builtinFunc.signature, paramIndex, prevKeywordNames, lastParam, isFocused);
            }
            else if (builtinFunc.params) {
                return getParamPromptOld(builtinFunc.params.filter((p) => !p.hide).map((p) => p.name), builtinFunc.params.filter((p) => !p.hide).map((p) => p.defaultValue !== undefined), paramIndex, lastParam);
            }
            else {
                return "\u200b";
            }
        }
    }
    else {
        // If the context is non-blank and matches an imported module, we can look it up there.        
        const fromModule = (await getAvailableItemsForImportFromModule(context)).find((ac) => ac.acResult === token);
        if (fromModule?.signature) {
            return getParamPrompt(fromModule.signature, paramIndex, prevKeywordNames, lastParam, isFocused);
        }
        else if (fromModule?.params !== undefined) {
            return getParamPromptOld(fromModule.params.filter((p) => !p.hide).map((p) => p.name), fromModule.params.filter((p) => !p.hide).map((p) => p.defaultValue !== undefined), paramIndex, lastParam);
        }
    }
    
    // We check this even without a context because we need to check items imported like "from turtle import Turtle" where the user may call "Turtle()" without a context:
    // If there is a context, we see if the full item (context.token) is in the AC:
    const importedFunc = Object.values(await getAllExplicitlyImportedItems(context)).flat().find((f) => f.acResult === token || f.acResult === context + "." + token);
    if (importedFunc !== undefined) {
        if (importedFunc.signature) {
            return getParamPrompt(importedFunc.signature, paramIndex, prevKeywordNames, lastParam, isFocused);
        }
        else if (importedFunc.params) {
            return getParamPromptOld(importedFunc.params.filter((p) => !p.hide).map((p) => p.name), importedFunc.params.filter((p) => !p.hide).map((p) => p.defaultValue !== undefined), paramIndex, lastParam);
        }
        else {
            return "\u200b";
        }
    }

    if (context) {
        // See if TigerPython can infer the type of the content before the .
        const parser = new Parser();
        const userCode = parser.getCodeWithoutErrors(frameId, true);
        await tpyDefineLibraries(parser);
        // So we get context code out which is a partial expression and may not be valid at top-level.  Thus we wrap it in:
        // f(<code>.x)
        // To make it a valid statement, then autocomplete after the dot (two characters before the end)
        const totalCode = userCode + "\n" + parser.getStoppedIndentation() + "f(" + transformFieldPlaceholders(context) + "." + "x)";
        const tppCompletions = TPyParser.autoCompleteExt(totalCode, totalCode.length - 2);
        const match = tppCompletions?.filter((c) => c.acResult === token);
        if (match && match.length > 0 && match[0].signature) {
            return getParamPrompt(match[0].signature, paramIndex, prevKeywordNames, lastParam, isFocused);
        }
    }
    
    // If the context includes a dot, like datetime.date, we try moving the bit after
    // the last dot into the token, since otherwise we're going to fail anyway:
    if (context.includes(".")) {
        const lastDotIndex = context.lastIndexOf(".");
        token = context.substring(lastDotIndex + 1) + "." + token;
        context = context.substring(0, lastDotIndex);
        return calculateParamPrompt(frameId, {context, token, paramIndex, lastParam, prevKeywordNames}, isFocused);
    }
    
    // Can't find it!
    return "\u200b";

}
