// This script is used as a preprocessing step.  It is NOT run live by Strype,
// but instead run manually via the preprocess:update-python-api NPM task.
// It runs Pyodide to ask for the contents of each of Pyodide's modules
// then processes them into a JSON file with all the API details for Strype's
// autocomplete.  It thus only needs to be re-run if the Pyodide API
// has changed.  The resulting file is checked in to Git since it won't change
// often.  (This script just outputs on console, which goes to stdout; the path
// of the resulting file is set in package.json where the NPM task is defined.)
import {OUR_PUBLIC_LIBRARY_MODULES, pythonBuiltins} from "../src/autocompletion/pythonBuiltins";
import {AcResultsWithCategory, AcResultType} from "../src/types/ac-types";
import {getAvailablePyPyiFromLibrary, getTextFileFromLibraries} from "../src/helpers/libraryManager";
import {extractPYI, parsePyiForPreprocess} from "../src/helpers/python-pyi";
import {loadPyodide, PyodideConfig, PyodideInterface} from "pyodide";
import pRetry from "p-retry";
import path from "path";
import fs from "node:fs/promises";
import pythonInspectionCode from "pysrc/fetch-ac-info-from-python.py";

/*
 * Prepare code to be run by Pyodide in order to find out completions for autocomplete.
 * Calls dir() on the given context then puts the results as a list of string into the "acs" variable.
 * 
 * @param userCode -> The user code to run in Pyodide before asking for completions
 * @param contextAC -> Anything before the dot in the text before the current cursor position, to call dir() on.
 */
function getPythonCodeForNamesInContext(userCode: string, contextAC: string): string {
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
function getPythonCodeForClassMethods(userCode: string, moduleName: string | null, className: string) : string {
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
 * The Python returns a string which has the JSON for AcResultType
 */
function getPythonCodeForTypeAndDocumentation(userCode: string, module: string | null, itemToQuery: string) : string {
    return userCode + pythonInspectionCode + "\nac_for(" + (module != null && module != "" ? "\"" + module + "\"" : "None") + ", \"" + itemToQuery + "\")\n";
}

// Stub for Strype Javascript parts:
const strype_bridge = {
    strype_graphics_input_internal: {},
    strype_graphics_internal: {},
    strype_sound_internal: {},
    strype_turtle_internal: {},
};

async function loadPyodideAndPackage(
    packagePath: string,
    pyodideLoader: (config: PyodideConfig) => Promise<PyodideInterface>
) : Promise<PyodideInterface> {
    const extractDir = "/tmp/";

    let pyodide: PyodideInterface;
    let packageBuffer: ArrayBuffer;
    [pyodide, packageBuffer] = await Promise.all([
        pRetry(() => pyodideLoader({
            indexURL: "node_modules/pyodide/",
        }), {retries: 3}),
        pRetry(() => fs.readFile(packagePath).then((b) => b.buffer), {retries: 3}),
    ]);

    pyodide.unpackArchive(packageBuffer, "zip", {extractDir});

    const sys = pyodide.pyimport("sys");
    sys.path.append(extractDir);

    // Pyodide does not include the "test" package by default, so since we want to
    // investigate it for autocomplete, we must load the package.  However, Pyodide
    // has an annoying behaviour that it logs "Loading"/"Loaded" messages on loadPackage,
    // see https://github.com/pyodide/pyodide/blob/ddf33cb6bec70fe295af3ef38769bba1dbb77459/src/js/load-package.ts#L294
    // The easiest way to suppress this is by blanking messageCallback during this load call:
    await pyodide.loadPackage("test", {messageCallback: () => {}});
    pyodide.registerJsModule("strype_bridge", strype_bridge);

    return pyodide;
}

const loadStrypePyodide = () => loadPyodideAndPackage(path.resolve("../public/pysrc.zip"), loadPyodide);
const pyodide = await loadStrypePyodide();

interface Module {
    name: string;
    pyiContent?: string;
}
let library: string | undefined;
let modulesPromise : Promise<Module[]>;
declare const library_arg: string | undefined;
if (library_arg) {
    library = library_arg;
    modulesPromise = getAvailablePyPyiFromLibrary(library).then(async (files) => {
        const modules = files
            .map((file) => file.replace(/\.pyi?$/, "").replaceAll("/", "."));
        const r = [];
        for (const mod of modules) {
            let pyiContent : string;
            // Check for a .pyi file:
            const pyFilename = mod.replace(".", "/") + ".py";
            const pyiFilename = mod.replace(".", "/") + ".pyi";
            if (files.includes(pyiFilename)) {
                pyiContent = await getTextFileFromLibraries([library], pyiFilename);
            }
            else if (files.includes(pyFilename)) {
                pyiContent = extractPYI(await getTextFileFromLibraries([library], pyFilename));
            }
            r.push({name: mod, pyiContent: pyiContent});
        }
        return r;
    });
}
else {
    library = undefined;
    modulesPromise = Promise.resolve([{name: ""}].concat(...Object.keys(pythonBuiltins).filter((k) => pythonBuiltins[k].type === "module").concat(OUR_PUBLIC_LIBRARY_MODULES).map((m) => ({name: m}))));
}

// The challenge with Skulpt used to be that everything is in a Promise, and that
// in browser-run, we couldn't await the Promise because it did not support top-level await.
// So instead, we made an absolutely huge promise chain that adds each item to the list until
// there is nothing left to process, then we output them all at the end.
// We've now switched to Node so we could rewrite it all into actual awaits, but it works
// so seemed a bit unnecessary.


// Get the class methods for a particular Python class, then pass the list of names to the "andThen" function.
// If there is an error, andThen will not be called.
async function getClassMethods(userCode: string, moduleName: string | null, className: string, andThen: (methodNames : string[]) => Promise<void>) : Promise<void> {
    const codeToRun = getPythonCodeForClassMethods(userCode, moduleName, className);
    const names: string[] = await pyodide.runPythonAsync(codeToRun + "\nacs") as string[];
    await andThen(names);
}

async function getDetailsForListOfItems(module: string | null, items: AcResultType[], next: number, atEnd: () => Promise<void>) {
    if (next >= items.length) {
        await atEnd();
        return;
    }
    const userCode = module ? "import " + module + "\n" : "";
    const codeToRun = getPythonCodeForTypeAndDocumentation(userCode, module, items[next].acResult);
    let json = await pyodide.runPythonAsync(codeToRun) as string;
    items[next] = JSON.parse(json) as AcResultType;
    items[next].documentation = items[next].documentation.replace(/\r\n/g, "\n").trim();
    // Sanity check the returns.  type can be the empty list and documentation can be the empty string,
    // so we can't do e.g. !items[next].type, we must explicitly compare to null and undefined:
    if (items[next].type === null || items[next].type === undefined || items[next].documentation === null || items[next].documentation === undefined) {
        console.warn("Undefined type or documentation for " + module + "." + items[next].acResult);
    }
    // If the item is a type, get any class methods:
    if (items[next].type.includes("type")) {
        await getClassMethods(userCode, module, items[next].acResult, async (more) => {
            items.push(...more.map((n) => {
                return {acResult: n, documentation: "", type: ["function"], version: 0} as AcResultType;
            }));
            await getDetailsForListOfItems(module, items, next + 1, atEnd);
        });
    }
    else {
        await getDetailsForListOfItems(module, items, next + 1, atEnd);
    }
}

function addParamsFromPYI(items: AcResultType[], pyiContent: string) {
    const params = parsePyiForPreprocess(pyiContent);
    for (const item of items) {
        if (!item.signature) {
            if (item.acResult in params) {
                item.signature = params[item.acResult];
            }
            else if ((item.acResult + ".__init__") in params) {
                item.signature = params[item.acResult + ".__init__"];
            }
        }
    }
}

async function getModuleMembersOneByOne(modules: Module[], next : number, soFar : AcResultsWithCategory, atEnd: () => void) {
    if (next >= modules.length) {
        // Done everything, so execute last bit instead:
        atEnd();
        return;
    }
    
    // Ask Pyodide about the module's contents:
    const modName = modules[next].name != "" ? modules[next].name : "builtins";
    const codeToRun = getPythonCodeForNamesInContext("import " + modName + "\n", modName);
    const acs = await pyodide.runPythonAsync(codeToRun + "\nacs") as string[];
    const items : AcResultType[] = acs.map((s) => ({acResult: s, documentation: "", type: [], version: 0}));
    await getDetailsForListOfItems(modules[next].name, items, 0, async () => {
        if (modules[next].pyiContent) {
            addParamsFromPYI(items, modules[next].pyiContent);
        }
        soFar[modules[next].name] = items;
        await getModuleMembersOneByOne(modules, next + 1, soFar, atEnd);
    });
}

function sortOutput(data: AcResultsWithCategory): AcResultsWithCategory {
    // Create a new object with sorted top-level keys
    const sortedData: AcResultsWithCategory = {};

    Object.keys(data)
        .sort() // sort top-level keys alphabetically
        .forEach((key) => {
            // Sort each inner array by acResult
            sortedData[key] = [...data[key]].sort((a, b) => a.acResult < b.acResult ? -1 : a.acResult > b.acResult ? 1 : 0);
        });

    return sortedData;
}


const builtinModules = Object.keys(pythonBuiltins);
const allContent : AcResultsWithCategory = library ? {} : {"": builtinModules.map((n) => n.endsWith("_$rw$") ? n.replace("_$rw$", ""): n).filter((func) => !func.includes("$")).map((s) => ({acResult: s, documentation: "", type: [], version: 0}))};
// Add Pyodide's builtin functions to the default module:
const fetchForModules = async () => {
    modulesPromise.then((modules) => getModuleMembersOneByOne(modules, 0, allContent, () => {
        // Outputting the results to console actually goes to stdout, which the surrounding
        // task redirects to the API file:
        console.log(JSON.stringify(sortOutput(allContent), null, 4));
        // Now should exit
    }));
};
if (library) {
    await fetchForModules();
}
else {
    await getDetailsForListOfItems(null, allContent[""], 0, fetchForModules);
}
