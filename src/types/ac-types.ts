// Types for the autocomplete.  These are in a separate file because they are imported
// by the process-skulpt-api.ts script, which cannot import the full types.ts file.

interface SignatureArg {
    name: string;
    defaultValue: string | null;
    argType: string | null;
}

interface SignatureVarArg {
    name: string;
    argType: string | null;
}

interface Signature {
    positionalOnlyArgs: SignatureArg[];      // before /
    positionalOrKeywordArgs: SignatureArg[]; // after / before *
    varArgs: SignatureVarArg | null;         // *args
    keywordOnlyArgs: SignatureArg[];         // after *
    varKwargs: SignatureVarArg | null;       // **kwargs
    firstParamIsSelfOrCls: boolean;
}

export interface AcResultType {
    // The text of the result, like "len" or "upper" or "time:
    acResult: string;
    // The documentation of the result, or empty string if unavailable
    documentation: string;
    // In Python, one name might have many "types", e.g. str is a type and function,
    // so we use a list of types.
    // Empty list means unknown.  
    type: ("function" | "module" | "variable" | "type")[];
    // Only there if a function, and even then it may be missing if we can't look up the info:
    // hide means we should hide this parameter (e.g. self, type) from all completion
    params?: {name: string, defaultValue?: string, hide?: boolean}[];
    signature?: Signature;
    // The version.  Only used on microbit to distinguish v1 and v2:
    version: number;
}

export interface IndexedAcResult extends AcResultType {
    index: number;
}

// A category can be "Python" for built-in items, it can be a module
// name (like "time" or "microbit") for things imported from a module,
// or it can be "My Variables" or "My Functions" (or the translation thereof)

export interface IndexedAcResultWithCategory {
    [category: string]: IndexedAcResult[];
}
export interface AcResultsWithCategory {
    [category: string]: AcResultType[];
}

// #v-ifdef MODE == VITE_MICROBIT_MODE
export interface AcMicrobitResultType extends AcResultType {
    mbVarType?: string;
}
// #v-endif
