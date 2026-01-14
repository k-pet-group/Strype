import type { PyodideInterface } from "pyodide";
import { loadPyodideAndPackage, makeRunnerCallback, OutputPart, pyodideExpose, PyodideExtras, PyodideFatalErrorReloader } from "pyodide-worker-runner";
import * as Comlink from "comlink";

declare const globalThis: any;
async function loadOnly() : Promise<PyodideInterface> {
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

const executePython = pyodideExpose(async (
    extras: PyodideExtras,
    pythonCode: string,
    printStdout: Comlink.Remote<(output: string) => void>,
    requestInput: Comlink.Remote<(prompt: string) => void>
) : Promise<string | null> => {
    return await reloader.withPyodide(async (pyodide : PyodideInterface) => {
        const runner = pyodide.runPython("from python_runner import PyodideRunner\nPyodideRunner()");
        const callback = makeRunnerCallback(extras, {
            output: (outputText: OutputPart[]) => {
                const stdoutParts = outputText.filter((t) => t.type == "stdout");
                if (stdoutParts.length > 0) {
                    printStdout(stdoutParts.map((t) => t.text).join(""));
                }
            },
            // We fire off the input request and it asynchronously gives back the input by writing a message,
            // NOT by directly returning it:
            input: requestInput,
            other: (type: string, data: any) => {
                //console.log("Received other [" + type + "] from Python: " + JSON.stringify(data));
            },
        });
        runner.set_callback(callback);
        await runner.run_async(pythonCode, {});
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
