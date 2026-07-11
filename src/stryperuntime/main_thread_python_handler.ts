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
// Set by PythonExecutionArea.vue to the "request" field of whichever sync request is currently
// outstanding (i.e. the worker is blocked waiting for a response to it), or null if none.  This
// lets terminateAndRestartPyodide() recognise specifically our own internal "dummy" catch-up
// requests (see python-execution.ts) and answer them immediately when stopping, without
// misinterpreting some other genuinely-pending request (e.g. input()) the same way.
export const outstandingSyncRequestKind = ref<string | null>(null);
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
    // The worker can be blocked waiting synchronously for a message from the main thread -- most
    // commonly our own internal "dummy" catch-up request (see python-execution.ts) used to stop
    // async requests/sprite updates queueing up in a tight loop.  Without SharedArrayBuffer, that
    // wait is implemented (in the sync-message library) as a *synchronous* XMLHttpRequest inside
    // the worker.  Some browsers -- WebKit/Safari in particular -- do not reliably abort an
    // in-progress synchronous XHR just because worker.terminate() was called: the worker can keep
    // running (and e.g. keep printing or moving sprites) until that blocking call naturally
    // returns, which can take several seconds.
    //
    // If we can tell for certain that's what is happening (specifically our own dummy catch-up,
    // as opposed to some other genuinely-pending request such as input() -- which we leave alone,
    // since answering it with the wrong response would surface as a spurious runtime error), we
    // answer it ourselves immediately, exactly as the normal machinery in PythonExecutionArea.vue
    // would eventually answer it anyway, so the worker's blocking read returns straight away
    // instead of us having to hope terminate() interrupts it.  We cap how long we wait for that
    // (it should be near-instant) so a slow/stuck write can never stop us from terminating below:
    if (pythonClient?.state === "awaitingMessage" && outstandingSyncRequestKind.value === "dummy") {
        try {
            await Promise.race([
                pythonClient.writeMessage({request: "dummy", response: true}),
                new Promise((resolve) => setTimeout(resolve, 500)),
            ]);
        }
        catch (e) {
            // Best-effort only; we terminate the worker regardless just below:
            console.error("Error answering pending dummy request before terminating Pyodide worker: ", e);
        }
    }
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
