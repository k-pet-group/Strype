import type { PyodideInterface } from "pyodide";
import { FromWorkerMessage, ToWorkerMessage } from "@/types/python-execution-worker-protocol";

const post : (m : FromWorkerMessage) => void = (m) => self.postMessage(m);

declare const globalThis: any;
async function init() : Promise<PyodideInterface> {
    await import(
        /* webpackIgnore: true */
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        "./pyodide-0.29.0/pyodide.js"
    );
    const pyodide = await globalThis.loadPyodide({ indexURL: "./pyodide-0.29.0/" }) as PyodideInterface;

    // Initialise:
    pyodide.setStdout({batched: (str) => {
        post({fromWorker: "PrintStdout", outputText: str});
    }});

    console.log("Pyodide loaded");
    
    // Signal main thread that worker is ready:
    post({ fromWorker: "WorkerReady"});
    return pyodide;
}

const pyodideLoad = init();

self.onmessage = async (event: MessageEvent) => {
    const pyodide = await pyodideLoad;
    
    const msg : ToWorkerMessage = ToWorkerMessage.parse(event.data);
    
    // TEMP:
    console.log("Worker received", msg);
    
    switch (msg.toWorker) {
    case "ExecutePython":
        await pyodide.runPythonAsync(msg.pythonCode);
        post({fromWorker: "ExecutionFinished", status: 0});
        break;
    }
};
