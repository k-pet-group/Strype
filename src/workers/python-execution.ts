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
import {PyodideErrorDetails} from "@/workers/shared_helpers";
import {createLazyFetchFS} from "@/stryperuntime/pyodide-emscript-fetch-fs";

// We only specify updatePort here as we don't want other files using it directly:
declare const self: PyodideWorkerGlobalScope & { updatePort: MessagePort };

async function loadOnly() : Promise<PyodideInterface> {
    const pyodide = await loadPyodideAndPackage({url: `${import.meta.env.BASE_URL}pysrc.zip`, format: "zip"}, () => loadPyodide({indexURL: `${import.meta.env.BASE_URL}pyodide/`}));
    
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
    
    return pyodide;
}
const reloader = new PyodideFatalErrorReloader(loadOnly);

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
    const catchUpWithMainThreadIfNeeded = () => {
        numConsecutiveAsyncRequests += 1;
        if (numConsecutiveAsyncRequests >= 50) {
            // To avoid racing too far ahead of the main thread, we do a quick catch-up:
            makeRawRequest({kind: "sync", request: {request: "dummy"}});
            const reply = extras.readMessage() as (SyncStrypePyodideWorkerResponse | {request: string, error: string});
            if (reply.request != "dummy") {
                throw new Error(`Internal error: Pyodide worker received ${reply.request} but had asked for dummy`);
            }
            numConsecutiveAsyncRequests = 0;
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
            makeRequest({kind: "async", request: {request:"console_print", text: "Loading Matplotlib (this may take some time)", containsInputPrompt: false}});
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
        
        // We mount the "books" assets at /books, "images" at /images, etc:
        for (const dir of assetsFilePrefixes) {
            pyodide.FS.mkdir("/" + dir);
            pyodide.FS.mount(pyodide.FS.filesystems.ASSETSFS, {root: dir}, "/" + dir);
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
});

// We receive one message early on with the updatePort which we must store in a global:
self.addEventListener("message", (e : any) => {
    if (e.data.updatePort) {
        self.updatePort = e.data.updatePort;
    }
});
