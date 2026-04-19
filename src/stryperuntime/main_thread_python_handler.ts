// The code in this file runs on the main thread, and handles starting,
// stopping and restarting the Pyodide worker.
//
// It also managers the graphics Renderer as that is tied up
// with the communication with Pyodide.

import {Renderer} from "@/stryperuntime/renderer";
import {PyodideClient} from "pyodide-worker-runner";
import * as Comlink from "comlink";
import {makeServiceWorkerChannel} from "sync-message";
import {ref} from "vue";

// Can be re-used:
const serviceWorkerChannel = makeServiceWorkerChannel({scope: import.meta.env.BASE_URL});

export const renderer = new Renderer();
export const isPythonWorkerReady = ref(false);
// These two will get recreated when we restart Pyodide:
// They will only be null if a special testing flag is used:
let pythonWorker : Worker | null = makeNewPyodideWorker();
let pythonClient : PyodideClient<any> | null = pythonWorker == null ? null: makePyodideClient(pythonWorker);

function makeNewPyodideWorker() : Worker | null {
    if ((window as any)?.TestingNoPyodide) {
        console.log("Skipping Pyodide as in testing mode");
        return null;
    }
    
    // The channel used to send Sprite updates asynchronously, outside of the main requests:
    // (channels cannot be re-used/re-transferred so we need a new one for each Pyodide worker
    // and thus we have to tell the renderer about the new channel too:
    const updateChannel = new MessageChannel();
    renderer.setMessageChannel(updateChannel.port2);
    // We initialise this out here to make it load earlier:
    const pythonWorker = new Worker(new URL("@/workers/python-execution.ts", import.meta.url), {type: "module"});
    // Must post it the update channel before wrapping in Pyodide:
    pythonWorker.postMessage({updatePort: updateChannel.port1}, [updateChannel.port1]);
    return pythonWorker;
}
function makePyodideClient(pythonWorker: Worker) : PyodideClient {
    isPythonWorkerReady.value = false;
    const pythonClient = new PyodideClient(() => pythonWorker, serviceWorkerChannel);
    pythonClient.call(
        pythonClient.workerProxy.onReady,
        Comlink.proxy(() => {
            isPythonWorkerReady.value = true;
        })
    );
    return pythonClient;
}

// Pyodide does have built-in support for "interrupting" an execution,
// but to do that from another thread it requires SharedArrayBuffer, which needs
// cross-origin isolation which would break things like Google Drive.  So we must
// terminate the worker.  It does mean the stop is instant and "clean" (next
// execution won't carry over any state).
export function terminateAndRestartPyodide() : void {
    // This is apparently instant, so we can immediately assume Pyodide has stopped:
    pythonWorker?.terminate();
    // Then we must make a new Pyodide worker ready for a potential future run:
    isPythonWorkerReady.value = false;
    pythonWorker = makeNewPyodideWorker();
    pythonClient = pythonWorker == null ? null : makePyodideClient(pythonWorker);
}

// Note that the value of this function will change after you call terminateAndRestartPyodide()
export function getPythonClient() : PyodideClient | null {
    return pythonClient;
}
