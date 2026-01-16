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

export interface ErrorDetails {
    error_type: string,
    error_message: string,
    text: string,
    traceback: {filename: string, lineno: number}[]
}

const executePython = pyodideExpose(async (
    extras: PyodideExtras,
    pythonCode: string,
    printStdout: Comlink.Remote<(output: string) => void>,
    requestInput: Comlink.Remote<(prompt: string) => void>
) : Promise<ErrorDetails | null> => {
    return await reloader.withPyodide(async (pyodide : PyodideInterface) => {
        const runner = pyodide.runPython(`from python_runner import PyodideRunner
import traceback
from itertools import dropwhile
class StrypePyodideRunner(PyodideRunner):
    def serialize_traceback(self, exc):
        # exc is BaseException and we should return a dict.
        tbe = traceback.TracebackException.from_exception(exc)
        # Get rid of python_runner frames (like skip_traceback_internals does),
        # and translate to dict for easy transformation into Javascript object:
        filtered = [dict(filename=frame.filename, lineno=frame.lineno) for frame in list(dropwhile(lambda f: f.filename != self.filename, tbe.stack))]
        return dict(error_type=type(exc).__name__, error_message=str(exc), traceback=filtered, text=type(exc).__name__ + ": " + str(exc))
StrypePyodideRunner()`);
        let error : ErrorDetails | null = null;
        const callback = makeRunnerCallback(extras, {
            output: (outputText: OutputPart[]) => {
                const stdoutParts = outputText.filter((t) => t.type == "stdout");
                if (stdoutParts.length > 0) {
                    printStdout(stdoutParts.map((t) => t.text).join(""));
                }
                const errorParts = outputText.filter((t) => t.type == "traceback");
                if (errorParts.length == 1) {
                    // As per the Python above:
                    const details = errorParts[0] as unknown as ErrorDetails;
                    error = details;
                }
                else if (errorParts.length > 1) {
                    // I don't think this should happen, but log it in case:
                    console.error("Unexpected multiple error parts from one call: " + JSON.stringify(errorParts));
                }
            },
            // We fire off the input request and it asynchronously gives back the input by writing a message,
            // NOT by directly returning it:
            input: requestInput,
            other: (type: string, data: any) => {
                // This is for sleep events that we are not necessarily interested in
            },
        });
        runner.set_callback(callback);
        await runner.run_async(pythonCode, {});
        return error;
    });
});

const onReady = pyodideExpose(async (extras: PyodideExtras, callOnceReady:  Comlink.Remote<() => void>)=> {
    await reloader.withPyodide(async () => callOnceReady());
});

Comlink.expose({
    executePython,
    onReady,
});
