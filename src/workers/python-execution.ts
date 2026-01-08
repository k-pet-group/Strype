import type { PyodideInterface } from "pyodide";
import { loadPyodideAndPackage, makeRunnerCallback, OutputPart, pyodideExpose, PyodideExtras, PyodideFatalErrorReloader } from "pyodide-worker-runner";
import * as Comlink from "comlink";

declare const globalThis: any;
async function loadOnly() : Promise<PyodideInterface> {
    console.log("Loading pyodide");
    const ourPyodideLoader = async () => {
        await import(
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            /* webpackIgnore: true */ "./pyodide-0.29.0/pyodide.js"
        );
        return await globalThis.loadPyodide({indexURL: "./pyodide-0.29.0/"}) as PyodideInterface;
    };

    const pyodide = await loadPyodideAndPackage({url: "../public_libraries/python_runner.zip", format: "zip"}, ourPyodideLoader);
    console.log("Loaded pyodide and package");
    
    return pyodide;
}
const reloader = new PyodideFatalErrorReloader(loadOnly);

const executePython = pyodideExpose(async (extras: PyodideExtras, pythonCode: string, printStdout:  Comlink.Remote<(output: string) => void>) : Promise<string | null> => {
    console.log("About to execute Python: " + pythonCode);
    return await reloader.withPyodide(async (pyodide : PyodideInterface) => {
        console.log("Found Pyodide");
        const runner = pyodide.runPython("from python_runner import PyodideRunner\nPyodideRunner()");
        const callback = makeRunnerCallback(extras, {
            output: (outputText: OutputPart[]) => {
                console.log("Received output from Python", outputText);
                const stdoutParts = outputText.filter((t) => t.type == "stdout");
                if (stdoutParts.length > 0) {
                    printStdout(stdoutParts.map((t) => t.text).join(""));
                }
            },
        });
        runner.set_callback(callback);
        console.log("Awaiting async Python runner");
        await runner.run_async(pythonCode, {});
        console.log("Python runner complete");
        return null;
    });
});

const onReady = pyodideExpose(async (extras: PyodideExtras, callOnceReady:  Comlink.Remote<() => void>)=> {
    await reloader.withPyodide(async () => callOnceReady());
});

Comlink.expose({
    executePython,
    onReady,
});
