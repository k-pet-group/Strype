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
    if (sessionStorage.getItem("TestingNoPyodide")) {
        console.info("Skipping Pyodide as in testing mode");
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
export async function terminateAndRestartPyodide() : Promise<void> {
    // The worker can be blocked waiting synchronously for a message from the main thread -- e.g.
    // our own internal "dummy" catch-up request (see python-execution.ts) used to stop async
    // requests/sprite updates queueing up in a tight loop, or a genuine input()/image query.
    // Without SharedArrayBuffer, that wait is implemented (in the sync-message library) as a
    // *synchronous* XMLHttpRequest inside the worker.  Some browsers -- WebKit/Safari in
    // particular -- do not reliably abort an in-progress synchronous XHR just because
    // worker.terminate() was called: the worker can keep running (and e.g. keep printing or
    // moving sprites) until that blocking call naturally returns.
    //
    // Critically, if we make that blocking call return by answering it with a normal, successful
    // reply (as we used to for the dummy case), the worker doesn't die -- it just resumes running
    // from where it was blocked, races on to its *next* blocking wait, and so on indefinitely,
    // since nothing is telling it to actually stop. comsync's own interrupt() avoids this: it
    // answers a currently-blocked wait with an {interrupted: true} marker, which comsync's worker-side
    // wrapper turns into a genuine InterruptError thrown *inside* the worker at that exact blocking
    // point, regardless of what kind of request it was waiting on -- so the worker actually stops
    // instead of continuing. We cap how long we wait for that (it should be near-instant) so a
    // slow/stuck write can never stop us from terminating below:
    if (pythonClient?.state === "awaitingMessage" || pythonClient?.state === "sleeping") {
        try {
            await Promise.race([
                pythonClient.interrupt(),
                new Promise((resolve) => setTimeout(resolve, 500)),
            ]);
        }
        catch (e) {
            // Best-effort only; we terminate the worker regardless just below:
            console.error("Error interrupting Pyodide worker before terminating it: ", e);
        }
    }
    // This is apparently instant on most browsers, so we can immediately assume Pyodide has
    // stopped; the interrupt above is what makes that assumption hold on WebKit too:
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
