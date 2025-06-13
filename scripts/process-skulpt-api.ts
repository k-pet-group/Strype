// This script is used as a preprocessing step.  It is NOT run live by Strype,
// but instead run manually via the preprocess:update-skulpt-api NPM task.
// It runs Skulpt to ask for the contents of each of Skulpt's modules
// then processes them into a JSON file with all the API details for Strype's
// autocomplete.  It thus only needs to be re-run if the Skulpt API
// has changed.  The resulting file is checked in to Git since it won't change
// often.  (This script just outputs on console, which goes to stdout; the path
// of the resulting  file is set in package.json where the NPM task is defined.)
//
// Note that Skulpt can only run in a browser because it looks for e.g. the window
// object.  So in order to run it we must use a fake browser environment.
// This is done from the package.json command, which uses browser-run to run
// the Typescript (after it has been compiled to Javascript and bundled into a
// single file).

import "../public/js/skulpt.min";
import "../public/js/skulpt-stdlib";
import { pythonBuiltins } from "../src/autocompletion/pythonBuiltins";
import {
    configureSkulptForAutoComplete,
    getPythonCodeForNamesInContext, getPythonCodeForClassMethods,
    getPythonCodeForTypeAndDocumentation, OUR_PUBLIC_LIBRARY_MODULES,
} from "../src/autocompletion/ac-skulpt";
import {AcResultsWithCategory, AcResultType} from "../src/types/ac-types";
import {getAvailablePyPyiFromLibrary, getTextFileFromLibraries} from "../src/helpers/libraryManager";
import {extractPYI, parsePyi} from "../src/helpers/python-pyi";

declare const Sk: any;
declare const window: any;

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
    modulesPromise = Promise.resolve(Object.keys(pythonBuiltins).filter((k) => pythonBuiltins[k].type === "module").concat(OUR_PUBLIC_LIBRARY_MODULES).map((m) => ({name: m})));
}

// The challenge with Skulpt is that everything is in a Promise, but we have to be careful that we pull out
// the global acs variable before running the next Skulpt.  We can't await the Promise because the "browser-run"
// environment we are in does not support top-level await.  So instead, we just make an absolutely huge
// promise chain that adds each item to the list until there is nothing left to process, then we output them
// all and tell the browser to exit:


// Get the class methods for a particular Python class, then pass the list of names to the "andThen" function.
// If there is an error, andThen will not be called.
function getClassMethods(userCode: string, moduleName: string | null, className: string, andThen: (methodNames : string[]) => void) {
    const codeToRun = getPythonCodeForClassMethods(userCode, moduleName, className);
    Sk.misceval.asyncToPromise(function() {
        return Sk.importMainWithBody("<stdin>", false, codeToRun, true);
    }, {}).then(() => {
        const names = Sk.ffi.remapToJs(Sk.globals["acs"]) as string[];
        andThen(names);
    },
    (err: any) => {
        console.log("Error running static autocomplete code: " + err + "Code was:\n" + codeToRun);
    });
}

function getDetailsForListOfItems(module: string | null, items: AcResultType[], next: number, atEnd: () => void) {
    if (next >= items.length) {
        atEnd();
        return;
    }
    const userCode = module ? "import " + module + "\n" : "";
    const codeToRun = getPythonCodeForTypeAndDocumentation(userCode, (module ? module + "." : "") + items[next].acResult);
    Sk.misceval.asyncToPromise(function() {
        return Sk.importMainWithBody("<stdin>", false, codeToRun, true);
    }, {}).then(() => {
        items[next].type = Sk.ffi.remapToJs(Sk.globals["itemTypes"]) as AcResultType["type"];
        items[next].documentation = (Sk.ffi.remapToJs(Sk.globals["itemDocumentation"]) as string).replace(/\r\n/g, "\n");
        // Sanity check the returns.  type can be the empty list and documentation can be the empty string,
        // so we can't do e.g. !items[next].type, we must explicitly compare to null and undefined:
        if (items[next].type === null || items[next].type === undefined || items[next].documentation === null || items[next].documentation === undefined) {
            console.log("Undefined type or documentation for " + module + "." + items[next].acResult);
        }
        // If the item is a type, get any class methods:
        if (items[next].type.includes("type")) {
            getClassMethods(userCode, module, items[next].acResult, (more) => {
                items.push(...more.map((n) => {
                    return {acResult: n, documentation: "", type: ["function"], version: 0} as AcResultType;
                }));
                getDetailsForListOfItems(module, items, next + 1, atEnd);
            });
        }
        else {
            getDetailsForListOfItems(module, items, next + 1, atEnd);
        }
    },
    (err: any) => {
        console.log("Error running autocomplete code: " + err + "Code was:\n" + codeToRun);
    });
}

function addParamsFromPYI(items: AcResultType[], pyiContent: string) {
    const params = parsePyi(pyiContent);
    for (const item of items) {
        if (!item.params) {
            if (item.acResult in params) {
                item.params = params[item.acResult].map((p) => ({name: p}));
            }
            else if ((item.acResult + ".__init__") in params) {
                item.params = params[item.acResult + ".__init__"].map((p) => ({name: p}));
                // Hide the self param:
                item.params[0].hide = true;
            }
        }
    }
}

function getModuleMembersOneByOne(modules: Module[], next : number, soFar : AcResultsWithCategory, atEnd: () => void) {
    if (next >= modules.length) {
        // Done everything, so execute last bit instead:
        atEnd();
        return;
    }
    
    // Ask Skulpt about the module's contents:
    const codeToRun = getPythonCodeForNamesInContext("import " + modules[next].name + "\n", modules[next].name);
    Sk.misceval.asyncToPromise(function() {
        return Sk.importMainWithBody("<stdin>", false, codeToRun, true);
    }, {}).then(() => {
        const items : AcResultType[] = (Sk.ffi.remapToJs(Sk.globals["acs"]) as string[]).map((s) => ({acResult: s, documentation: "", type: [], version: 0}));
        getDetailsForListOfItems(modules[next].name, items, 0, () => {
            if (modules[next].pyiContent) {
                addParamsFromPYI(items, modules[next].pyiContent);
            }
            soFar[modules[next].name] = items;
            getModuleMembersOneByOne(modules, next + 1, soFar, atEnd);
        });
    },
    (err: any) => {
        console.log("Error running autocomplete code: " + err + "Code was:\n" + codeToRun);
    });
}

const allContent : AcResultsWithCategory = library ? {} : {"": Object.keys(Sk.builtins).map((n) => n.endsWith("_$rw$") ? n.replace("_$rw$", ""): n).filter((func) => !func.includes("$")).map((s) => ({acResult: s, documentation: "", type: [], version: 0}))};
configureSkulptForAutoComplete(library ? [library] : []);
// Add Skulpt's builtin functions to the default module:
const fetchForModules = () => {
    modulesPromise.then((modules) => getModuleMembersOneByOne(modules, 0, allContent, () => {
        // Outputting the results to console actually goes to stdout, which the surrounding
        // task redirects to the API file:
        console.log(JSON.stringify(allContent, null, 4));
        // This tells browser-run to exit, without it the browser stays open and the process never terminates.
        // However, if we do it immediately it seems the console is not flushed to stdout, so we put it on a timer:
        setTimeout(() => window.close(), 2000);
    }));
};
if (library) {
    fetchForModules();
}
else {
    getDetailsForListOfItems(null, allContent[""], 0, fetchForModules);
}
