// Here is an explanation of the overall architecture involving Pyodide, our Strype libraries and so on:
//
// Pyodide runs in a web worker, which is like a separate thread.  This file, python-execution.ts is the web worker code.
// The functions are exposed near the bottom using Comlink.expose.  The main function is executePython.  The only
// communication methods between web workers and the main thread are message channels.  Comlink is a Google-originating
// library that allows it to look like you are calling a web worker method from the main thread in a fairly normal way,
// and Comlink routes the parameters via the message channels.  It also lets you pass callbacks so that the webworker
// can call back into the main thread and again this is done underneath via message channels.
//
// There are two key things to know about data and web workers in Javascript:
//
// 1. Any objects (things like OffscreenCanvas) can only live on one thread, so you can't share data directly.  This is
//    both good (removes any possibility of simultaneous modification) and bad (you have to think carefully about where
//    data lives and how to share any changes).
//
// 2. The communication between the threads using Comlink (especially in conjunction with other libraries we'll come to)
//    can only use "plain" data: numbers, booleans, strings, and combinations thereof (arrays, or objects containing
//    only plain data).
//
// The other things to know are around sync/async, Pyodide and communication:
//
// - All underlying messages are sent asynchronously (i.e. without waiting for reply).  This means that all function
//   calls from Comlink have a Promise<..> return value, and if you want to wait for a return you'd need to "await"
//   or use .then().
//
// - When Pyodide calls a Javascript function (e.g. for reading stdin, or getting an Actor's position or asking which
//   keys are pressed), it is done in a normal (NOT async) call.  So you have a problem that you can't talk to the main
//   thread via messages/Comlink to get a message because you can't await the Promise-d answer.  It also means that
//   Pyodide code cannot do anything that needs async functions (e.g. certain image drawing operations).
//
// - As a work-around you can use a service worker (a different thing than a web worker, intended to be long lived).
//   So we have a service worker, which is just there to route messages around.  So you should never need to modify it.
//   This is all wrapped up into packages sync-message (which relay messages via the service worker) and comsync (which
//   combines sync-message with Comlink).
//
// - This synchronous messaging via the service worker is *expensive* in terms of time.  Firefox seems a bit slower than
//   Chrome, and on Firefox it can take 1-2 milliseconds per call.  If you are trying to run at say 30 frames per second,
//   you only have around 33 milliseconds per animation frame, so even 10 such calls can take up most of your time.
//
// So, we have two main constraints when designing our architecture: we need to message between the web worker and main
// thread using only plain data, and we need to try to minimise the amount of synchronous calls.  We need:
//  - the Pyodide thread to run the Python code (which will make Actors, move them around etc), and
//  - the main thread to draw the canvas (it's possible Pyodide could using an OffscreenCanvas, but if the main thread
//    does it then it can be done at any time regardless of what Pyodide is doing, and takes CPU cycles off the Pyodide
//    thread, which will be the busier thread while running Python flat out), and to listen for key events and mouse
//    clicks.  Plus, the main thread has to be responsible for any async code that Pyodide thread is not allowed to run.
//
// The solution is in the file worker_bridge_type.ts which has a protocol (with explanatory comment) for communicating
// between the threads.  There are "Sync" messages which need a reply, but where possible we use "Async messages" that
// can be fired off without needing a reply, as this is faster.
//
// There are several concepts that are split up:
//  - Actors are Python-only objects in Pyodide.  No Javascript function ever directly interacts with an Actor.
//  - Sprites are things with a position, rotation, image etc.  They are effectively the Javascript version of an Actor
//    but the mapping is not one-to-one.  Notably: the background is a Sprite but has no Actor, and say() bubbles on
//    actors are Sprites but also have no Actor.  Sprites are referred to from Python via an integer handle that maps
//    to an array/Map held in Javascript.  So only integers are passed between Python and Javascript to refer to sprites,
//    never the actual Sprite (or Actor) objects.
//  - Each Sprite's image can either be an ImageBitmap or OffscreenCanvas.  We generally prefer ImageBitmap if the image
//    is not modified because it uses less resources.  But if the user edits the image (via Image class in Strype) then
//    it needs to become OffscreenCanvas.  So we must allow for either possibility at most points.
//
// In terms of splitting up the data and so on:
// - The web worker is primarily responsible for tracking Actor state (via Actors in Python) and sprite state (via
//   SpriteManager in Javascript).  It mirrors the SpriteManager state to the main thread via a dedicated async message
//   channel.
// - All the actual images and canvases are held on the main thread for fast communication-free rendering there.  All
//   manipulations of the image requested by Python code must be sent to the main thread.  Manipulations are usually
//   "Async" (see above) so fast, but queries (mainly: what colour is this pixel) are "Sync" meaning they need a reply
//   and are slow.

// NOTE: DO NOT EXPORT ANYTHING FROM THIS FILE!  Shared helper functions must go elsewhere.  Otherwise
// we accidentally end up loading Pyodide in the main thread, too.  (Speaking from experience.)

// Tell Typescript we are on a web worker, so we can access web worker bits but not the DOM:
/// <reference lib="webworker" />
import type {PyodideInterface} from "pyodide";
import {loadPyodide} from "pyodide";
import {loadPyodideAndPackage, OutputPart, pyodideExpose, PyodideExtras, PyodideFatalErrorReloader} from "pyodide-worker-runner";
import * as Comlink from "comlink";
import {strype_bridge} from "@/stryperuntime/pyodide_bridge";
import {ResponseFor, SyncOrAsyncStrypePyodideWorkerRequest, SyncStrypePyodideHandlerFunction, SyncStrypePyodideWorkerRequest, SyncStrypePyodideWorkerResponse} from "@/stryperuntime/worker_bridge_type";
import {SpriteManager} from "@/stryperuntime/image_and_collisions";
import {asyncBridge, PyodideWorkerGlobalScope, syncBridge} from "@/workers/python_execution_type";
import {getFSForEmscripten} from "@/stryperuntime/pyodide-emscripten-cloud-fs";
import { assetsFilePrefixes, createLazyFetchAssetsFS } from "@/stryperuntime/pyodide-emscripten-assets-fs";
import {isServiceWorkerChannelResponsive, PyodideErrorDetails} from "@/workers/shared_helpers";
import {makeServiceWorkerChannel} from "sync-message";
import {createLazyFetchFS} from "@/stryperuntime/pyodide-emscript-fetch-fs";

// We only specify updatePort here as we don't want other files using it directly:
declare const self: PyodideWorkerGlobalScope & { updatePort: MessagePort };

// While restoreLocalFs() (below) is filling "/local" from the main-thread cache, its writes must not be
// echoed back to the main thread as if the program had made them:
let localFsSyncSuppressed = false;

function isLocalPath(path: string): boolean {
    return path.startsWith("/local/");
}

// Every file (not directory) at or under path, as absolute paths; empty if path doesn't exist:
function listFilesUnder(FS: PyodideInterface["FS"], path: string): string[] {
    try {
        if (!FS.isDir(FS.stat(path).mode)) {
            return [path];
        }
        return FS.readdir(path)
            .filter((entry: string) => entry !== "." && entry !== "..")
            .flatMap((entry: string) => listFilesUnder(FS, `${path}/${entry}`));
    }
    catch {
        return [];
    }
}

// The main thread can't ask this worker for its "/local" contents while a program is stuck in a loop that
// never waits (no sleep/print/input): the request would never be answered, so anything the program wrote
// would be lost when Stop is clicked. But a worker can always post a message, so instead we tell the main
// thread each file's full state as it changes -- on open-for-writing (which creates/truncates), on every
// write that reaches the file system (that's what flush() does), on close, and on delete, rename and
// truncate. The main thread applies these to localFsCache.ts straight away.
function installLocalFsSync(pyodide: PyodideInterface): void {
    // Emscripten's FS methods are called through the FS object by its own syscall layer, so replacing
    // them here also catches Python's file I/O. The typings don't allow assigning them, hence the cast:
    const FS = pyodide.FS as any;
    // Reading a file back for sending uses FS.open/FS.close itself, which must not trigger more sending:
    let sending = false;

    const post = (path: string, data: Uint8Array | null) => {
        (self as unknown as DedicatedWorkerGlobalScope).postMessage({localFsChange: {path, data}}, data == null ? [] : [data.buffer]);
    };
    const sendFile = (path: string | null) => {
        if (sending || localFsSyncSuppressed || path == null || !isLocalPath(path)) {
            return;
        }
        sending = true;
        try {
            if (!FS.isDir(FS.stat(path).mode)) {
                post(path, FS.readFile(path, {encoding: "binary"}));
            }
        }
        catch {
            // The file has gone or can't be read: nothing to send
        }
        finally {
            sending = false;
        }
    };
    const sendDeleted = (path: string | null) => {
        if (!localFsSyncSuppressed && path != null && isLocalPath(path)) {
            post(path, null);
        }
    };
    // FS methods can be given relative paths (the working directory is "/local" when running), so
    // work out the absolute one -- before an operation that would remove what it points to:
    const absolutePath = (path: string): string | null => {
        try {
            return FS.getPath(FS.lookupPath(path, {follow: false}).node);
        }
        catch {
            return null;
        }
    };
    const isWritable = (stream: {flags: number}) => (stream.flags & 3) !== 0; // O_RDONLY is 0

    const origOpen = FS.open;
    FS.open = function(...args: unknown[]) {
        const stream = origOpen.apply(FS, args);
        if (isWritable(stream)) {
            sendFile(stream.path);
        }
        return stream;
    };
    const origWrite = FS.write;
    FS.write = function(stream: {path: string}, ...args: unknown[]) {
        const result = origWrite.call(FS, stream, ...args);
        sendFile(stream.path);
        return result;
    };
    const origClose = FS.close;
    FS.close = function(stream: {path: string, flags: number}) {
        const {path, writable} = {path: stream.path, writable: isWritable(stream)};
        const result = origClose.call(FS, stream);
        if (writable) {
            sendFile(path);
        }
        return result;
    };
    const origTruncate = FS.truncate;
    FS.truncate = function(path: string, ...args: unknown[]) {
        const abs = absolutePath(path);
        const result = origTruncate.call(FS, path, ...args);
        sendFile(abs);
        return result;
    };
    const origFtruncate = FS.ftruncate;
    FS.ftruncate = function(fd: number, ...args: unknown[]) {
        const result = origFtruncate.call(FS, fd, ...args);
        sendFile(FS.getStream(fd)?.path ?? null);
        return result;
    };
    const origUnlink = FS.unlink;
    FS.unlink = function(path: string) {
        const abs = absolutePath(path);
        const result = origUnlink.call(FS, path);
        sendDeleted(abs);
        return result;
    };
    const origRename = FS.rename;
    FS.rename = function(oldPath: string, newPath: string) {
        // A directory rename moves every file in it, so list them before and after:
        const oldAbs = absolutePath(oldPath);
        const oldFiles = oldAbs == null ? [] : listFilesUnder(pyodide.FS, oldAbs);
        const result = origRename.call(FS, oldPath, newPath);
        oldFiles.forEach(sendDeleted);
        const newAbs = absolutePath(newPath);
        if (newAbs != null) {
            listFilesUnder(pyodide.FS, newAbs).forEach(sendFile);
        }
        return result;
    };
}

// The worker's console output doesn't reach the page console (and so isn't forwarded into e2e test
// logs), so progress/diagnostic lines are relayed to the main thread, which logs them -- see the
// "debugLog" handling in createPyodideSlot() in main_thread_python_handler.ts. Used to track down
// the Run button occasionally staying on "Initialising..." in CI:
const workerStartedAt = Date.now();
function debugToMain(message: string) : void {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({debugLog: `+${Date.now() - workerStartedAt}ms ${message}`});
}

async function loadOnly() : Promise<PyodideInterface> {
    debugToMain("loadOnly: starting to load Pyodide");
    // The version segment here is deliberate, not incidental: it's what lets the deployed server
    // mark this whole directory as cacheable forever (see scripts/download-pyodide-libs.cjs, which
    // downloads into the matching public/pyodide/<version>/ folder, and the server config
    // documented in APACHE_CONFIG.md). A stable, unversioned path would mean either never caching
    // this multi-megabyte payload, or risking a browser never picking up a future Pyodide upgrade
    // because the URL never changed:
    const pyodide = await loadPyodideAndPackage({url: `${import.meta.env.BASE_URL}pysrc.zip`, format: "zip"}, () => loadPyodide({indexURL: `${import.meta.env.BASE_URL}pyodide/${__PYODIDE_VERSION__}/`}));
    debugToMain("loadOnly: Pyodide and pysrc.zip loaded");
    
    // Register our strype.graphics etc modules with Pyodide by pointing it to the Javascript:
    pyodide.registerJsModule("strype_bridge", strype_bridge);
    
    // Register our file system for cloud access.  We create it here to save time and to make
    // sure we only create it (and the dir /cloud) once, but since the user can save to a new location between
    // Pyodide initialising and Pyodide running, we always create the /cloud file system, but we dynamically decide
    // whether to mount and "cd /cloud" before running, and we give a runtime error if the user tries to access the file system
    // while not saved to the cloud.
    pyodide.FS.filesystems.CLOUDFS = getFSForEmscripten(pyodide);
    
    pyodide.FS.filesystems.ASSETSFS = createLazyFetchAssetsFS(pyodide);

    pyodide.FS.mkdir("/strype_libraries");

    installLocalFsSync(pyodide);
    
    debugToMain("loadOnly: finished setting up Pyodide");
    return pyodide;
}
const reloader = new PyodideFatalErrorReloader(loadOnly);

// Mounts one asset root (any of assetsFilePrefixes -- "/data", "/books", "/images", etc) on demand.
// Used by readFsFile below so that downloading an asset file works even before the user has ever
// pressed Run (which is the only other place these get mounted -- see executePython's own loop
// further down). Uses the same guarded mkdir/mount pattern as that loop so the two don't conflict
// if a real run subsequently starts on this same worker.
function ensureAssetRootMounted(pyodide: PyodideInterface, root: string): void {
    const dir = root.slice(1);
    if (!assetsFilePrefixes.includes(dir)) {
        return;
    }
    try {
        pyodide.FS.mkdir(root);
    }
    catch {
        // Ignore errors because they will come from the dir already existing
    }
    try {
        pyodide.FS.mount(pyodide.FS.filesystems.ASSETSFS, {root: dir}, root);
    }
    catch {
        // Ignore errors because they will come from it already being mounted
    }
}

// Exposed to the main thread for downloading a single file shown in the File system tab (the tree
// listing itself is built without the worker at all -- see fileSystemTabIO.ts's listFsRootTree()
// and assets_file_index.ts's buildAssetTree() for why). This has to be pyodideExpose'd (and so
// called via client.call() rather than directly): reading an actual asset file's bytes goes through
// LazyFetchFS's open() -- see pyodide-emscript-fetch-fs.ts -- which fetches the file via
// self.syncStrypePyodideWorkerBridge, the same synchronous main-thread round trip executePython
// sets up as "bridgeSync" below. That global is otherwise only ever set while a real Python run is
// in progress, so without setting it up here too, downloading an asset file before ever pressing
// Run would throw "self.syncStrypePyodideWorkerBridge is not a function". /local files need no such
// thing (they're plain MEMFS, no lazy fetch), but there's no harm setting the bridge up
// unconditionally here.
const readFsFile = pyodideExpose(async (
    extras: PyodideExtras,
    path: string,
    makeRawRequest: Comlink.Remote<(req: SyncOrAsyncStrypePyodideWorkerRequest) => void>
): Promise<Uint8Array> => {
    return await reloader.withPyodide(async (pyodide: PyodideInterface) => {
        const bridgeSync: SyncStrypePyodideHandlerFunction = <R extends SyncStrypePyodideWorkerRequest> (req : R) : ResponseFor<R> => {
            makeRawRequest({kind: "sync", request: req});
            const reply = extras.readMessage() as (SyncStrypePyodideWorkerResponse | {request: string, error: string});
            if (reply.request != req.request) {
                throw new Error(`Internal error: Pyodide worker received ${reply.request} but had asked for ${req.request}`);
            }
            else if ("error" in reply) {
                throw (req.request.startsWith("file_") ? new pyodide.FS.ErrnoError(63, "Cloud file error:" + reply.error) : new Error("Internal error:" + reply.error));
            }
            else {
                return reply as ResponseFor<R>;
            }
        };
        self.syncStrypePyodideWorkerBridge = bridgeSync;
        self.asyncStrypePyodideWorkerBridge = (r) => makeRawRequest({kind: "async", request: r});
        ensureAssetRootMounted(pyodide, "/" + path.split("/")[1]);
        return pyodide.FS.readFile(path, {encoding: "binary"});
    });
});

function collectFlatFiles(pyodide: PyodideInterface, path: string, out: Record<string, Uint8Array>): void {
    const stat = pyodide.FS.stat(path);
    if (!pyodide.FS.isDir(stat.mode)) {
        out[path] = pyodide.FS.readFile(path, {encoding: "binary"});
        return;
    }
    for (const entry of pyodide.FS.readdir(path)) {
        if (entry === "." || entry === "..") {
            continue;
        }
        collectFlatFiles(pyodide, path === "/" ? `/${entry}` : `${path}/${entry}`, out);
    }
}

// Exposed to the main thread (see main_thread_python_handler.ts's terminateAndRestartPyodide()):
// takes a full snapshot of "/local" as a flat {path: bytes} map, right before this worker is
// discarded, so the main-thread cache (localFsCache.ts) can carry its contents over to the next
// run's worker (see restoreLocalFs below). Plain MEMFS, no lazy fetch involved, so -- unlike
// readFsFile -- this needs no pyodideExpose/sync bridge.
async function snapshotLocalFs(): Promise<Record<string, Uint8Array> | null> {
    return await reloader.withPyodide(async (pyodide: PyodideInterface) => {
        const out: Record<string, Uint8Array> = {};
        try {
            collectFlatFiles(pyodide, "/local", out);
        }
        catch {
            // "/local" doesn't exist -- this run was in /cloud mode, so there's nothing to snapshot
            // (null rather than {}, so the caller doesn't mistake it for "everything was deleted"):
            return null;
        }
        return out;
    });
}

// Exposed to the main thread: writes a flat {path: bytes} map (as previously captured by
// snapshotLocalFs) into this worker's fresh "/local", restoring the main-thread cache's contents
// at the start of a new run.
async function restoreLocalFs(entries: Record<string, Uint8Array>): Promise<void> {
    return await reloader.withPyodide(async (pyodide: PyodideInterface) => {
        localFsSyncSuppressed = true;
        try {
            try {
                pyodide.FS.mkdir("/local");
            }
            catch {
                // Ignore errors because they will come from the dir already existing
            }
            // Make "/local" exactly match the entries: remove anything left over from an earlier restore
            // that has since been deleted from the main-thread cache. Only the paths matter here, so
            // list them (listFilesUnder, also used by installLocalFsSync's rename handling above) rather
            // than reading every file's bytes just to throw them away (collectFlatFiles, used below where
            // the bytes are actually needed, is overkill for this):
            for (const path of listFilesUnder(pyodide.FS, "/local")) {
                if (!(path in entries)) {
                    pyodide.FS.unlink(path);
                }
            }
            for (const [path, data] of Object.entries(entries)) {
                const dir = path.slice(0, path.lastIndexOf("/"));
                if (dir && dir !== "/local") {
                    pyodide.FS.mkdirTree(dir);
                }
                pyodide.FS.writeFile(path, data);
            }
        }
        finally {
            localFsSyncSuppressed = false;
        }
    });
}

async function urlToDirName(url: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(url);

    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    const hashHex = hashArray
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

    return `userlib_${hashHex}`;
}

// These caches should outlive a Pyodide run, to avoid re-fetching library content:
// Maps a URL to a cache:
const libraryCaches : Map<string, Map<string, Uint8ClampedArray>> = new Map();

// Logged once per worker instance (temporarily -- see isServiceWorkerChannelResponsive() in
// shared_helpers.ts), right before the very first blocking sync-message read this worker ever
// makes. We've seen a repeatable failure where a *second* Run (using a fresh/promoted Pyodide
// worker created by terminateAndRestartPyodide() -- see main_thread_python_handler.ts) has every
// one of its reads fall straight through to a real 404 (i.e. NOT intercepted by the service
// worker) despite the main thread's own /version check reporting the channel fully healthy
// moments earlier -- while the *first* Run on the page's original worker was fine throughout.
// The working theory is that a newly created/promoted dedicated Worker isn't always fully
// registered as a controlled client of the service worker by the time it issues its first
// *synchronous* (blocking) XHR, specifically in Safari/WebKit -- so logging this worker's own
// view of navigator.serviceWorker.controller at that exact moment should confirm or rule that
// out directly:
let loggedFirstSyncReadDiagnostics = false;
function logFirstSyncReadDiagnosticsOnce() {
    if (loggedFirstSyncReadDiagnostics) {
        return;
    }
    loggedFirstSyncReadDiagnostics = true;
    const sw = ("serviceWorker" in navigator) ? navigator.serviceWorker : undefined;
    console.info(`[Worker first sync read ${new Date().toISOString()}] navigator.serviceWorker present=${sw != null} controller=${sw?.controller != null} controllerScriptURL=${sw?.controller?.scriptURL ?? "n/a"}`);
}

const executePython = pyodideExpose(async (
    extras: PyodideExtras,
    pythonCode: string,
    micropipLibraries: string[],
    userLibrariesFileIndexes: { [url: string]: Record<string, string>},
    startInSlashCloud: boolean,
    // Important all requests (sync and async) go through one function to avoid them racing each other:
    makeRawRequest: Comlink.Remote<(req: SyncOrAsyncStrypePyodideWorkerRequest) => void>
) : Promise<PyodideErrorDetails | null> => {
    // There is a potential issue with async requests that if we have a tight loop
    // (e.g. while True: print("a")) then we can issue requests faster than the main
    // thread can service them.  If we send an unlimited number of async requests without ever
    // waiting for them to complete, they can all queue up, and even if the user clicks Stop,
    // these requests can keep being serviced for a long time (tens of seconds!) after Stop is clicked.
    // This is only an issue with consecutive async requests; any sync request where we have to wait
    // will effectively also synchronise with the main thread because the sync request will only
    // be answered after the previous async requests have all been processed.
    //
    // To avoid problems with many consecutive async requests, we count them, and every 50 requests
    // we do a dummy sync request just to make sure we haven't gotten too far ahead of the main thread.
    // Note that sprite/graphics updates (see self.spriteManager below) are sent on an entirely separate
    // MessagePort (self.updatePort) rather than via makeRawRequest, for speed, but a tight loop of those
    // (e.g. "while True: actor.move(5)") can queue up just as unboundedly as a tight print loop can.  So
    // we share this same counter and catch-up logic with sprite updates, to bound how many messages of
    // *either* kind can be outstanding at once:
    let numConsecutiveAsyncRequests = 0;
    // Does the actual sync dummy round-trip that guarantees all previously-sent async requests
    // (e.g. console_print for stdout/stderr) have been fully processed by the main thread, per the
    // ordering guarantee described above.
    const syncCatchUpWithMainThread = () => {
        logFirstSyncReadDiagnosticsOnce();
        makeRawRequest({kind: "sync", request: {request: "dummy"}});
        const reply = extras.readMessage() as (SyncStrypePyodideWorkerResponse | {request: string, error: string});
        if (reply.request != "dummy") {
            throw new Error(`Internal error: Pyodide worker received ${reply.request} but had asked for dummy`);
        }
        numConsecutiveAsyncRequests = 0;
    };
    const catchUpWithMainThreadIfNeeded = () => {
        numConsecutiveAsyncRequests += 1;
        if (numConsecutiveAsyncRequests >= 50) {
            // To avoid racing too far ahead of the main thread, we do a quick catch-up:
            syncCatchUpWithMainThread();
        }
    };
    const makeRequest = (req: SyncOrAsyncStrypePyodideWorkerRequest) => {
        if (req.kind === "sync") {
            numConsecutiveAsyncRequests = 0;
        }
        else {
            catchUpWithMainThreadIfNeeded();
        }
        // All requests are ultimately sent on:
        makeRawRequest(req);
    };
    
    return reloader == null ? null : await reloader.withPyodide(async (pyodide : PyodideInterface) => {
        // Load any in-built packages they've used (e.g. numpy, pandas):
        const loaded = await pyodide.loadPackagesFromImports(pythonCode, {messageCallback: console.log, errorCallback: console.error});
        
        // Useful for debugging, and the user may also want to see:
        console.info("Loaded packages: " + loaded.map((p) => p.name).join(", "));

        for (let url in userLibrariesFileIndexes) {
            const libDir = "/strype_libraries/" + await urlToDirName(url);
            pyodide.FS.mkdirTree(libDir);
            
            
            let cache = libraryCaches.get(url);
            if (!cache) {
                cache = new Map();
                libraryCaches.set(url, cache);
            }
            
            const fs = createLazyFetchFS(pyodide, userLibrariesFileIndexes[url], url, cache);
            pyodide.FS.mount(fs, {}, libDir);
            
            // Add the Pyodide FS path to the search dir for packages:
            pyodide.runPython(`
import sys
sys.path.append("${libDir}")
`);
        }
        
        const usingMatplotlib = loaded.some((pd) => pd.name == "matplotlib");
        if (usingMatplotlib) {
            // Matplotlib takes ages (7 seconds on my fast Windows+Firefox machine!) so let's print a message:
            makeRequest({kind: "async", request: {request:"console_print", text: "Loading Matplotlib (this may take some time)\n", containsInputPrompt: false}});
        }
        
        
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
    def reset(self):
        super().reset()
        # The dict we need to add the names to:
        target = self.console.locals
        # Effectively does: from strype.builtins import *
        import importlib
        strype_builtins = importlib.import_module("strype.builtins")
        for name in getattr(strype_builtins, "__all__", dir(strype_builtins)):
            if not name.startswith("_"):
                target[name] = getattr(strype_builtins, name)
runner = StrypePyodideRunner()

# Work around from Pyodide repo, then used in WebTigerPython, then adapted by us for the 800x600 part:
if ${usingMatplotlib ? "True" : "False"}:
    try:
        import matplotlib
        matplotlib.use("Agg", force=True)  # placeholder, overridden below
    
        import sys
        import types
        import base64
        from io import BytesIO
    
        from matplotlib.backend_bases import FigureManagerBase, _Backend
        from matplotlib.backends.backend_agg import FigureCanvasAgg
    
        class FigureRendererPyodide:        
            def render_current_figure(self, fig):
                w_in, h_in = fig.get_size_inches()
                dpi = min(800 / w_in, 600 / h_in)
    
                buf = BytesIO()
                fig.savefig(buf, format="png", dpi=dpi) #, bbox_inches="tight")
                buf.seek(0)
                img = "data:image/png;base64," + base64.b64encode(buf.read()).decode("utf-8")
    
                fig.strype_display_width, fig.strype_display_height = runner.callback("matplotlib_img", data=img)

        _figure_renderer_pyodide = FigureRendererPyodide()
    
        class FigureCanvasPyodide(FigureCanvasAgg):
            """Canvas class — rendering is inherited from Agg."""
            def draw(self):
                # Actually rasterize the figure (this is what FigureCanvasAgg.draw normally does)
                super().draw()
                # Now push it out, same as show() does
                _figure_renderer_pyodide.render_current_figure(self.figure)
                
                # Re-draw at fig.dpi (notional space) so cached renderer/bboxes match
                # the coordinate space the click events will be delivered in.
                super().draw()
                self._draw_pending = False
        
            def draw_idle(self):
                # draw_idle is what most interactive matplotlib code calls
                # (widgets, event handlers, animations) instead of draw()
                # directly.  Schedule a draw:
                self._draw_pending = True
            
            def flush_events(self):
                # Flush the pending draw, by drawing:
                if getattr(self, "_draw_pending", False):
                    self.draw()        
    
        class FigureManagerPyodide(FigureManagerBase):
            """Manager class — this is where plt.show() ends up."""
    
            def show(self):
                self.canvas.draw()
                   
        # Tell the canvas which manager class to use. This has to be set
        # after both classes are defined, since FigureCanvasPyodide is
        # declared before FigureManagerPyodide exists.
        FigureCanvasPyodide.manager_class = FigureManagerPyodide
    
        sys.modules["pyodide_mpl_backend"] = types.ModuleType("pyodide_mpl_backend")
    
        @_Backend.export
        class _BackendPyodide(_Backend):
            __module__ = "pyodide_mpl_backend"
            FigureCanvas = FigureCanvasPyodide
            FigureManager = FigureManagerPyodide

            @classmethod
            def mainloop(cls):                
                # Now run a main loop:
                x, y = -1, -1
                import strype.graphics as g
                from matplotlib.backend_bases import MouseEvent, KeyEvent
                from matplotlib._pylab_helpers import Gcf
                while True:
                    # Should only be one manager, but we loop for simplicity:
                    for manager in Gcf.get_all_fig_managers():
                        canvas = manager.canvas
                        fig = canvas.figure
                        notional_w, notional_h = canvas.get_width_height()
                        render_w = getattr(fig, "strype_display_width", notional_w)
                        render_h = getattr(fig, "strype_display_height", notional_h)
                        # Viewport is 800x600, image (render_w x render_h) is centered inside it.
                        # Gap on each side, in viewport pixels:
                        offset_x = (800 - render_w) / 2
                        offset_y = (600 - render_h) / 2
                        scale_x = notional_w / render_w
                        scale_y = notional_h / render_h
                       
                        x2, y2, _, _, _ = g.get_mouse()
                        if x != x2 or y != y2:
                            x, y = x2, y2
                            image_x, image_y = (x + 400 - offset_x) * scale_x, (y + 300 - offset_y) * scale_y
                            if 0 <= image_x < notional_w and 0 <= image_y < notional_h:
                                canvas.callbacks.process("motion_notify_event", MouseEvent("motion_notify_event", canvas, image_x, image_y))
                        # Strype's API doesn't give us press and release, but it does give clicks so we turn that into press with immediate release:
                        c = g.get_mouse_click()
                        if c is not None:
                            xc, yc, button, clicks = c
                            # Picking is done automatically when handling these events:
                            image_x, image_y = (xc + 400 - offset_x) * scale_x, (yc + 300 - offset_y) * scale_y
                            if 0 <= image_x < notional_w and 0 <= image_y < notional_h:
                                canvas.callbacks.process("button_press_event", MouseEvent("button_press_event", canvas, image_x, image_y, button=button + 1, dblclick=clicks==2))
                                canvas.callbacks.process("button_release_event", MouseEvent("button_release_event", canvas, image_x, image_y, button=button + 1))
                        # Must flush_events() to process any draw_idle()
                        canvas.flush_events()
                        # Use pace() to prevent running too quickly:
                        g.pace()

    
        matplotlib.use("module://pyodide_mpl_backend")
    
        import matplotlib.pyplot as plt  # import *after* matplotlib.use()
    
    except ModuleNotFoundError:
        pass
    except Exception as e:
        print(e)

# Now return the runner object:
runner`);
        
        if (micropipLibraries.length > 0) {
            await pyodide.loadPackage("micropip");
            const micropip = pyodide.pyimport("micropip");
            for (let micropipLibrary of micropipLibraries) {
                await micropip.install(micropipLibrary);
            }
        }
        
        const bridgeSync: SyncStrypePyodideHandlerFunction = <R extends SyncStrypePyodideWorkerRequest> (req : R) : ResponseFor<R> => {
            logFirstSyncReadDiagnosticsOnce();
            makeRequest({kind: "sync", request: req});
            const reply = extras.readMessage() as (SyncStrypePyodideWorkerResponse | {request: string, error: string});
            if (reply.request != req.request) {
                throw new Error(`Internal error: Pyodide worker received ${reply.request} but had asked for ${req.request}`);
            }
            else if ("error" in reply) {
                // We propagate to the user so they get some feedback:
                throw (req.request.startsWith("file_") ? new pyodide.FS.ErrnoError(63, "Cloud file error:" + reply.error) : new Error("Internal error:" + reply.error));
            }
            else {
                // I think Typescript should be able to infer reply is ResponseFor<R> because of the if check, but apparently not:
                return reply as ResponseFor<R>;
            }
        };

        // Set the global fields used by Javascript code (and by the pyodide cloud file mounting, just below): 
        self.syncStrypePyodideWorkerBridge = bridgeSync;
        self.asyncStrypePyodideWorkerBridge = (r) => makeRequest({kind: "async", request: r});
        self.spriteManager = new SpriteManager((u) => {
            catchUpWithMainThreadIfNeeded();
            self.updatePort.postMessage(u);
        });
        self.pyodide = pyodide;
        

        // If we are offering the cloud file system, we start there by default:
        if (startInSlashCloud) {
            // Try unmounting in case we're running a second time:
            try {
                pyodide.FS.unmount("/cloud");
            }
            catch {
                // Ignore any errors
            }
            // Do mkdir in a separate catch because it will expectedly fail if the directory exists:
            try {
                pyodide.FS.mkdir("/cloud");
            }
            catch {
                // Ignore errors because they will come from the dir already existing
            }
            try {
                // We have done the mkdir("/cloud") in the one time Pyodide initialisation, earlier.
                pyodide.FS.mount(pyodide.FS.filesystems.CLOUDFS, {}, "/cloud");
                pyodide.FS.chdir("/cloud");
            }
            catch (e) {
                console.error("Problem mounting cloud file system: ", e);
            }
        }
        else {
            // Do mkdir in a separate catch because it will expectedly fail if the directory exists:
            try {
                pyodide.FS.mkdir("/local");
            }
            catch {
                // Ignore errors because they will come from the dir already existing
            }
            try {
                pyodide.FS.chdir("/local");
            }
            catch (e) {
                // This one shouldn't fail, but don't let it stop execution:
                console.error(e);
            }
                
        }
        
        // We mount the "books" assets at /books, "images" at /images, etc. Guarded the same way as
        // /cloud and /local above (rather than the unguarded mkdir+mount this used to be): downloading
        // a file from the File system tab (see readFsFile/ensureAssetRootMounted above) can mount an
        // asset root on this same worker instance before any run ever starts, so by the time a run
        // gets here that root may already exist and be mounted.
        for (const dir of assetsFilePrefixes) {
            try {
                pyodide.FS.mkdir("/" + dir);
            }
            catch {
                // Ignore errors because they will come from the dir already existing
            }
            try {
                pyodide.FS.mount(pyodide.FS.filesystems.ASSETSFS, {root: dir}, "/" + dir);
            }
            catch {
                // Ignore errors because they will come from it already being mounted
            }
        }
        
        let error : PyodideErrorDetails | null = null;
        let matPlotLibSpriteId : number | null = null;
        const callback = function (type: string, data: any) {
            if (data.toJs) {
                data = data.toJs({dict_converter: Object.fromEntries});
            }

            if (type === "input") {
                return syncBridge({request: "console_input"}) + "\n";
            }
            else if (type === "sleep") {
                extras.syncSleep(data.seconds * 1000);
            }
            else if (type === "output") {
                const outputText = data.parts as OutputPart[];
                // We print out "stdout", "stderr" and "input_prompt", but not "input" because that has already been added to the console
                // when the user entered it there in the HTML input element.
                const stdoutParts = outputText.filter((t) => t.type == "stdout" || t.type == "stderr" || t.type == "input_prompt");
                if (stdoutParts.length > 0) {
                    asyncBridge({request: "console_print", text: stdoutParts.map((t) => t.text).join(""), containsInputPrompt: outputText.some((t) => t.type == "input_prompt")});
                }
                const errorParts = outputText.filter((t) => t.type == "traceback" || t.type == "syntax_error");
                if (errorParts.length == 1) {
                    // As per the Python above at the start of executePython that serialises the traceback:
                    error = errorParts[0] as unknown as PyodideErrorDetails;
                }
                else if (errorParts.length > 1) {
                    // I don't think this should happen, but log it in case:
                    console.error("Unexpected multiple error parts from one call: " + JSON.stringify(errorParts));
                }
            }
            else if (type === "matplotlib_img") {
                // This comes from the override above.  The image is in a base64 string in the data field.
                
                // Remove previous:
                if (matPlotLibSpriteId != null) {
                    self.spriteManager.removeSprite(matPlotLibSpriteId, null);
                }
                
                // First, load it:
                const image = syncBridge({request: "loadImage", url: data.data as string});
                // Note that the image should already fit 800x600 as best it can due to our code in show(), above.
                // So no need to scale.
                
                // Then add it as a sprite (default 0, 0 position is fine):
                matPlotLibSpriteId = self.spriteManager.addSprite(image, false);
                return [image.width, image.height];
            }
            else {
                // We don't currently handle any other callbacks
            }
        };
        runner.set_callback(callback);
        await runner.run_async(pythonCode, {});
        // The counter-based catch-up above only fires every 50 async requests, so a run that ends
        // with a handful of prints immediately followed by an error (too few to trip that threshold)
        // can otherwise have its error reported to the main thread before all of that trailing output
        // has actually been processed there -- see the "documented newlines" flakiness this fixed.
        // Do one final unconditional catch-up so the error is only returned once the main thread has
        // caught up with everything printed during the run.
        syncCatchUpWithMainThread();
        return error;
    });
});

const onReady = pyodideExpose(async (extras: PyodideExtras, callOnceReady:  Comlink.Remote<() => void>)=> {
    if (reloader != null) {
        await reloader.withPyodide(async () => callOnceReady());
    }
});

Comlink.expose({
    executePython,
    onReady,
    readFsFile,
    snapshotLocalFs,
    restoreLocalFs,
});

// We receive one message early on with the updatePort which we must store in a global:
self.addEventListener("message", (e : any) => {
    if (e.data.updatePort) {
        self.updatePort = e.data.updatePort;
    }
});

// Reports whether this worker's own sync-message requests are actually being intercepted by the
// service worker, both immediately on startup and again on any controllerchange. We've confirmed
// (see logFirstSyncReadDiagnosticsOnce() above, and the PyodideSlot.controlled comment in
// main_thread_python_handler.ts) a real case where this worker -- specifically the spare
// pre-warmed at page load -- ends up with no controller at all despite the page itself being
// controlled, silently breaking every sync-message request it makes (they fall through to a real
// 404 instead of being intercepted). The main thread uses this to detect that and trigger a
// reclaim before treating this worker as usable.
//
// This deliberately checks via a real round-trip fetch (isServiceWorkerChannelResponsive) rather
// than inspecting navigator.serviceWorker.controller directly: that introspection API isn't
// exposed to Workers at all in Chromium (crbug.com/40364838), and even where it is (Firefox 133+),
// we've observed it can stay null indefinitely from inside a worker despite the service worker
// already correctly intercepting that same worker's fetches -- either way, trusting it here would
// leave isPythonWorkerReady permanently false and Run permanently disabled. A functional probe is
// the only signal that's actually reliable across engines:
const workerServiceWorkerChannel = makeServiceWorkerChannel({scope: import.meta.env.BASE_URL});
let lastReportedControlled : boolean | null = null;
async function checkAndReportControllerStatus() : Promise<boolean> {
    const controlled = await isServiceWorkerChannelResponsive(workerServiceWorkerChannel.baseUrl);
    if (controlled !== lastReportedControlled) {
        debugToMain(`service worker channel check: responsive=${controlled}`);
        lastReportedControlled = controlled;
    }
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({controllerStatus: controlled});
    return controlled;
}
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => void checkAndReportControllerStatus());
}
// The very first check can easily race the service worker's own install/activate/claim sequence,
// especially for the worker created synchronously at page load -- so retry with a short backoff
// for a while rather than only trying once and relying solely on a controllerchange event that,
// per above, isn't a reliable signal to wait on in every engine:
(async () => {
    const deadline = Date.now() + 20000;
    let attempts = 0;
    while (!(await checkAndReportControllerStatus()) && Date.now() < deadline) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (lastReportedControlled !== true) {
        // Nothing retries after this (apart from a controllerchange event), so Run stays disabled:
        debugToMain(`gave up probing for a service worker controller after ${attempts} attempts / 20s`);
    }
})();
