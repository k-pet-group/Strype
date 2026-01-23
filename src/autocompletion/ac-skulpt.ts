// This file is used by the command-line script process-skulpt-api.ts so it is important
// that it does not import other parts of the code (e.g. i18n) that can't work outside webpack

// Note: important to use .. not @ here, because of the above
import {getTextFileFromLibraries} from "../helpers/libraryManager";

declare const Sk: any;

export const OUR_PUBLIC_LIBRARY_FILES : string[] = [
    /* #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE  */
    "strype/__init__.py",
    "strype/strype_graphics_internal.js", "strype/graphics.py",
    "strype/strype_sound_internal.js", "strype/sound.py",
    "strype/strype_graphics_input_internal.js",
    /* #v-endif  */
];
export const OUR_PUBLIC_LIBRARY_MODULES = OUR_PUBLIC_LIBRARY_FILES.map((f) => f.substring(0, f.lastIndexOf(".")).replace("/", ".")).filter((f) => !f.includes("internal") && !f.includes("__init__"));

// The function used for "input" from Skulpt, to be registered against the Skulpt object
// (this is the default behaviour that can be overwritten if needed)
export function skulptReadPythonLib(libraryAddresses: string[]) : ((x : string) => string) {
    return (x) => {
        // Prefer built-ins, then our libraries, then third-party
        // (partly for speed; don't want to try fetching if we don't have to):
        if (Sk.builtinFiles === undefined || Sk.builtinFiles["files"][x] === undefined) {
            if (OUR_PUBLIC_LIBRARY_FILES.find((f) => ("./" + f) === x)) {
                return Sk.misceval.promiseToSuspension(
                    fetch("./public_libraries/" + x)
                        .then((r) => r.text())
                );
            }
            if (!x.endsWith(".py")) {
                // We only fetch third-party Python files, not JS, for security reasons:
                return undefined;
            }
            return Sk.misceval.promiseToSuspension(
                getTextFileFromLibraries(libraryAddresses, x)
            );
        }
        return Sk.builtinFiles["files"][x];
    };
}

// The ID of a DIV that is used for "backend" operations with Skulpt, like a/c or retrieving
// documentation. Strype includes such DIV in the UI (NOT the Turtle output visible for users),
// but any mechanism using Skulpt for "backend" jobs that do not use Strype will need to create a
// DIV element with *this* ID.
export const BACKEND_SKULPT_DIV_ID = "backEndSkulptDiv";

// Takes user code from the editor and prepares it for AC
// We don't currently do anything as print() and input() are turned off in Skulpt itself
// but I've retained this function in case we need to reintroduce some processing in future.
function processUserCodeForAC(userCode: string) {
    return userCode;
}

/*
 * Prepare code to be run by Skulpt in order to find out completions for autocomplete.
 * Calls dir() on the given context then puts the results as a list of string into the "acs" variable.
 * 
 * @param userCode -> The user code to run in Skulpt before asking for completions
 * @param contextAC -> Anything before the dot in the text before the current cursor position, to call dir() on.
 */
export function getPythonCodeForNamesInContext(userCode: string, contextAC: string): string {

    userCode = processUserCodeForAC(userCode);

    // To avoid problems with strings in the contextAC (i.e. in function calls), we use an "escaped" value JSON-compliant
    // (note that the rendered string is wrapped by double quotes)
    const jsonStringifiedContext = JSON.stringify(contextAC);

    const inspectionCode = `
acs = []
try:
    acs = dir(${contextAC})
except Exception as e:
    print("Could not find names for " + ${jsonStringifiedContext})
`;

    return (userCode + inspectionCode);
}

// Get Python code to get the list of class methods of moduleName.className into a list of strings named "acs"
// Each item in acs will be className.method (but no module name), e.g. for int it would be "int.from_bytes"
export function getPythonCodeForClassMethods(userCode: string, moduleName: string | null, className: string) : string {
    userCode = processUserCodeForAC(userCode);
    
    const fullyQualifiedClassName = moduleName ? (moduleName + "." + className) : className;

    const inspectionCode = `
# Get all attributes of the class
attributes = dir(${fullyQualifiedClassName})

# Filter the static methods
acs = []
for attr_name in attributes:
    if not attr_name.startswith("_"):
        try:
            attr = getattr(${fullyQualifiedClassName}, attr_name)
            # Check it is a class method:
            if callable(attr) and getattr(attr, "__self__") is ${fullyQualifiedClassName}:
                acs.append("${className}." + attr_name)
        except:
            pass
`;
    return userCode + inspectionCode;
}

/**
 * Generates some Python code to access the type and documentation of the itemToQuery.
 * @param userCode User code to run before querying the item
 * @param itemToQuery The item to query, unquoted
 * Leaves the list of types in itemTypes and the documentation in itemDocumentation
 */
export function getPythonCodeForTypeAndDocumentation(userCode: string, itemToQuery: string) : string {
    userCode = processUserCodeForAC(userCode);
    const inspectionCode = `
from types import ModuleType

itemTypes = []
try:
    if callable(${itemToQuery}):
        itemTypes.append("function")
    if isinstance(${itemToQuery}, type):
        itemTypes.append("type")    
    if isinstance(${itemToQuery}, ModuleType):
        itemTypes.append("module")
except:
    pass
itemDocumentation = ""
try:
    itemDocumentation = ${itemToQuery}.__doc__ or itemDocumentation
except:
    pass
# For some items, e.g. types.BuiltinMethodType, __doc__ is not a string.  If this happens, set it back to empty string:
if not isinstance(itemDocumentation, str):
    itemDocumentation = ""
`;
    return userCode + inspectionCode;
}

export function configureSkulptForAutoComplete(libraryAddresses: string[] = []) : void {
    const dummyInput = (prompt: string) => new Promise(function(resolve,reject){
        resolve("");
    });
    Sk.configure({read:skulptReadPythonLib(libraryAddresses), output:(t:string) => {}, inputfun: dummyInput, inputfunTakesPrompt: true, yieldLimit:100,  killableWhile: true, killableFor: true});
    // We also need to set some Turtle environment for Skulpt -- note that the output DIV is NOT the one visible by users,
    // because this environment is only used for our backend processes of the code for autocompletion.
    Sk.TurtleGraphics = {};
    // Create a DIV in the BODY element if the "backend" Turtle output DIV doesn't exist.
    if(document.getElementById(BACKEND_SKULPT_DIV_ID) == undefined){
        const turtleDiv = document.createElement("div");
        turtleDiv.id = BACKEND_SKULPT_DIV_ID;
        document.getElementsByTagName("body")[0].appendChild(turtleDiv);
    }       
    Sk.TurtleGraphics.target = BACKEND_SKULPT_DIV_ID; 
}
