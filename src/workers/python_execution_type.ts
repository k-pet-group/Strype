import type { AsyncStrypePyodideHandlerFunction, ResponseFor, SyncStrypePyodideHandlerFunction, SyncStrypePyodideWorkerRequest } from "@/stryperuntime/worker_bridge_type";
import {SpriteManager} from "@/stryperuntime/image_and_collisions";
import type {PyodideAPI} from "pyodide";

// This file contains type definitions that apply to the Pyodide web worker (or rather, its globals)
// which can then be imported by code which runs on the web worker thread. 

// The type of the Pyodide worker.  Make sure all these fields are set in executePython before calling Pyodide.
export interface PyodideWorkerGlobalScope extends WorkerGlobalScope {
    syncStrypePyodideWorkerBridge: SyncStrypePyodideHandlerFunction;
    asyncStrypePyodideWorkerBridge: AsyncStrypePyodideHandlerFunction;
    spriteManager : SpriteManager;
    // Called by the sync_graphics() Python function: switches to batched sprite updates (if not already)
    // and sends everything since the last call to the main thread, to be drawn:
    syncGraphics: () => void;
    pyodide: PyodideAPI;
}

// A function which takes a request from SyncStrypePyodideWorkerRequest and synchronously returns
// its matching return from SyncStrypePyodideWorkerRequest as keyed by the requeste field 
export function syncBridge<R extends SyncStrypePyodideWorkerRequest>(
    req: R
): ResponseFor<R>["response"] {
    return (globalThis as unknown as PyodideWorkerGlobalScope).syncStrypePyodideWorkerBridge(req).response as ResponseFor<R>["response"];
}

// A function which takes a request from AsyncStrypePyodideWorkerRequest and has no return.
export const asyncBridge : AsyncStrypePyodideHandlerFunction = (req) => {
    return (globalThis as unknown as PyodideWorkerGlobalScope).asyncStrypePyodideWorkerBridge(req);
};
