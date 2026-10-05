// This file contains the internal graphics API for the Strype graphics world.
// These functions are not directly exposed to users, but are used by graphics.py to
// form the actual public API.
import { decodeStringToUint8, encodeUint8ToString, isRemoteImage, RemoteCanvas, RemoteImage } from "./worker_bridge_type";
import { asyncBridge, PyodideWorkerGlobalScope, syncBridge } from "@/workers/python_execution_type";
import { PyProxy } from "pyodide/ffi";
import { DebouncedFunc, throttle } from "lodash";
import { LRU } from "@/helpers/lruCache";
import { sayFont } from "@/helpers/textDrawing";


// Saves the pixels for the last three images that have been read from.  This speeds up get_pixel/set_pixel loops
// over an Image quite a bit (although still slow if in a tight loop as even Javascript calls carry overhead).
// We evict from this cache if we use any Canvas methods as it changes pixels outside of our purview.
// Note that although the type is DebouncedFunc, we use throttle not debounce (see cachePixelsOf below)
// We don't need a dirty flag because each markDirty call queues up update(), and we don't need a separate dirty flag.
type CachedPixels = { width: number; height: number; pixelsRGBA: Uint8ClampedArray, update: DebouncedFunc<() => void> };
const pixelsCache = new LRU<number, CachedPixels>(3, (key, value) => value.update.flush());

// Called if we are about to draw on an image using a canvas, e.g. drawing a line, a circle, filling, clearing.  This
// will mean our pixel cache is completely invalid in ways we usually can't predict (we don't want to try to also
// draw the circle in the RGBA array for the image; we just refetch again from main thread later if needed).
function aboutToDrawOnImage(img : RemoteCanvas) : void {
    // Evict automatically flushes the pixels if we have a dirty cache, then removes from cache:
    pixelsCache.evict(img.handle.handle);
}

// Caches the full pixels of an image from the main thread into our cache here on the web worker thread.
function cachePixelsOf(img: RemoteCanvas) : CachedPixels {
    const existing = pixelsCache.get(img.handle.handle);
    if (existing !== undefined) {
        return existing;
    }
    // Note we want throttle not debounce for update
    // (see https://css-tricks.com/debouncing-throttling-explained-examples/ )
    // With debounce, if the user loops round forever updating pixels more frequently than the threshold,
    // we will never send the updated pixels and they'll never show on screen.  Whereas with throttle, they
    // will be shown on screen but we limit how often we send updates.
    const pixelsRGBA = decodeStringToUint8(syncBridge({request: "canvas_getAllPixelsRGBA", img}));
    const data = {
        width: img.width,
        height: img.height,
        pixelsRGBA,
        // These set calls are quite expensive so we do them max 10 times a second:
        update: throttle(() => {
            asyncBridge({request: "canvas_drawPixels", img, x: 0, y: 0, width: img.width, height: img.height, pixelRGBA: encodeUint8ToString(pixelsRGBA)});
        }, 1000/10),
    };
    pixelsCache.set(img.handle.handle, data);
    return data;
}

// Mark the cache as dirty (i.e. we have changed it at our end, and we need to send to main thread). 
function markDirty(canvas: RemoteCanvas, img: CachedPixels) {
    // All we need to do here is queue up an invocation of the update() function:
    img.update();
}

declare const globalThis: PyodideWorkerGlobalScope;

// There is no standard way in HTML to synchronously load images,
// but we need to be able to do this in order to use the image's attributes
// (particularly its width and height) after loading.  So we use have to
// use a Sync request to the main thread to do it async on our behalf:
export function loadAndWaitForImage(filename: string) : RemoteImage {
    // Try to detect if it's a relative path or absolute URL.  We are fairly lenient
    // and permissive, so our rule is: if it starts with http: or https: or // we 
    // treat it as absolute, or something.ext/something then we assume it's a URL.
    // Otherwise we count it as a relative path:
    let match;
    if (/^https?:/.test(filename) || /^\/\//.test(filename)) {
        // Absolute:
        return syncBridge({request: "loadImage", url: filename});
    }
    else if (!/:/.test(filename) && /^[^./]+\.[^/]+\/.+/.test(filename)) {
        // Absolute partial (spotted by dot before slash):
        return syncBridge({request: "loadImage", url: "https://" + filename});
    }
    else if (/^data:/.test(filename) && !/^data:image\/svg+xml/.test(filename)) {
        // Base64 data image:
        return syncBridge({request: "loadImage", url: filename});
    }
    else if ((match = /^:([^:]+):(.+)$/.exec(filename))) {
        // If it's some other prefix between two colons, it's a library asset:
        const libraryShortName = match[1];
        const fileName = match[2];
        const viaLibrary = syncBridge({request: "loadLibraryAsset", libraryShortName, fileName}) ?? filename;
        return syncBridge({request: "loadImage", url: viaLibrary});
    }
    // Filename handling should have been done by caller, so we should never reach here:
    throw new Error(`Unable to load image: ${filename}`);
}
export function setBackground(img : RemoteImage) : void {
    globalThis.spriteManager.setBackground(img);
} 
export function addSprite(image: RemoteImage, collidable: boolean, x = 0, y = 0) : number {
    return globalThis.spriteManager.addSprite(image, collidable, x, y);
}
export function updateImage(id: number, image: RemoteImage) : void {
    globalThis.spriteManager.setSpriteImage(id, image);
}
export function imageExists(image : number) : boolean {
    return globalThis.spriteManager.hasSprite(image);
}
export function getImageSize (img : number)  : {width: number, height: number} | undefined {
    return globalThis.spriteManager.getSpriteSize(img);
}
export function setImageLocation(img : number, x : number, y : number) : void {
    globalThis.spriteManager.setSpriteLocation(img, x, y);
}
export function setImageRotation(img : number, r : number) : void {
    globalThis.spriteManager.setSpriteRotation(img, r);
}
export function setImageScale(img : number, s : number) : void {
    globalThis.spriteManager.setSpriteScale(img, s);
}
export function getImageLocation(img : number): { x: number; y: number } | undefined {
    return globalThis.spriteManager.getSpriteLocation(img);
}
export function getImageRotation(img : number): number | undefined {
    return globalThis.spriteManager.getSpriteRotation(img);
}
export function getImageScale(img : number) : number | undefined {
    return globalThis.spriteManager.getSpriteScale(img);
}
export function removeImage(img: number) : void {
    globalThis.spriteManager.removeSprite(img, null);
}
// Removes an image after a timeout.
export function removeImageAfter(img : number, secs : number) : void {
    globalThis.spriteManager.removeSprite(img, Date.now() + secs * 1000);
}

export function makeImageEditableForSprite(spriteId : number) : RemoteCanvas | null {
    return globalThis.spriteManager.editImage(spriteId, (r : RemoteImage | RemoteCanvas) : RemoteCanvas => {
        const canvas = syncBridge({request: "ensureCanvas", img: r});
        // This will also send the change through to the main thread via the usual state-mirroring channel:
        globalThis.spriteManager.setSpriteImage(spriteId, canvas);
        return canvas;
    });
}


export function makeCanvasOfSize(width : number, height : number) : RemoteCanvas {
    return syncBridge({request: "makeOffscreenCanvas", width, height});
}
export function htmlImageToCanvas(imageElement : RemoteImage) : RemoteCanvas {
    const c = makeCanvasOfSize(imageElement.width, imageElement.height);
    canvas_drawImagePart(c, imageElement, 0, 0, 0, 0, imageElement.width, imageElement.height, 1.0);
    return c;
}
export function getCanvasDimensions(img : RemoteCanvas) : number[] {
    return [img.width, img.height];
}
export function canvas_fillWhole(img: RemoteCanvas) : void {
    aboutToDrawOnImage(img);
    asyncBridge({request:"canvas_fillWhole", img});
}
export function canvas_clearRect(img: RemoteCanvas, x : number, y : number, width : number, height : number) : void {
    aboutToDrawOnImage(img);
    asyncBridge({request:"canvas_clearRect", img, x, y, width, height});
}
export function canvas_setFill(img : RemoteCanvas, color : string | null) : void {
    // Note 8 zeroes: this is fully transparent, not black:
    asyncBridge({request:"canvas_setFill", img, fill: color ?? "#00000000"});
}
export function canvas_setStroke(img : RemoteCanvas, color : string | null) : void {
    asyncBridge({request:"canvas_setStroke", img, stroke: color ?? "#00000000"});
}
// The color is returned/passed as a single packed number (red << 24 | green << 16 | blue << 8 | alpha), because each
// separate value or array element crossing between Python and JS is a relatively expensive call, and these are
// called in tight loops.  We use multiplication/>>> rather than << for red to avoid going negative as a signed 32-bit int.
export function canvas_getPixel(img : RemoteCanvas, x : number, y : number) : number {
    // We cache as it's rare that a call to this is isolated; usually it's in a loop:
    const cache = cachePixelsOf(img);
    const baseIndex = (y * img.width + x) * 4; // RGBA are 4 values per pixel
    const p = cache.pixelsRGBA;
    return p[baseIndex] * 16777216 + (p[baseIndex + 1] << 16) + (p[baseIndex + 2] << 8) + p[baseIndex + 3];
}
export function canvas_setPixel(img : RemoteCanvas, x : number, y : number, packedRGBA : number) : void {
    // We cache as it's rare that a call to this is isolated; usually it's in a loop:
    const cache = cachePixelsOf(img);
    const baseIndex = (y * img.width + x) * 4; // RGBA are 4 values per pixel
    const p = cache.pixelsRGBA;
    p[baseIndex] = packedRGBA >>> 24;
    p[baseIndex+1] = (packedRGBA >>> 16) & 255;
    p[baseIndex+2] = (packedRGBA >>> 8) & 255;
    p[baseIndex+3] = packedRGBA & 255;
    markDirty(img, cache);
}
export function canvas_getAllPixels(img : RemoteCanvas) : Uint8ClampedArray {
    return cachePixelsOf(img).pixelsRGBA;
}
export function canvas_setAllPixelsRGBA(img: RemoteCanvas, pixels : number[]) : void {
    const cache = cachePixelsOf(img);
    cache.pixelsRGBA.set(pixels);
    markDirty(img, cache);
}
export function canvas_drawImagePart(dest: RemoteCanvas, src : RemoteImage | RemoteCanvas, dx : number, dy : number, sx : number, sy : number, sw : number, sh : number, scale : number) : void {
    if (!isRemoteImage(src)) {
        // Force flush any pending pixel writes without evicting:
        const cached = pixelsCache.get(src.handle.handle);
        if (cached) {
            cached.update.flush();
        }
    }
    aboutToDrawOnImage(dest);
    asyncBridge({request: "canvas_drawImagePart", dest, src, sx, sy, sw, sh, dx, dy, scale});
}
export function canvas_line(img: RemoteCanvas, x : number, y : number, x2 : number, y2 : number) : void {
    aboutToDrawOnImage(img);
    asyncBridge({request: "canvas_drawLine", img, x, y, x2, y2});
}
export function canvas_roundedRect(img : RemoteCanvas, x : number, y : number, width : number, height : number, cornerSize : number) : void {
    aboutToDrawOnImage(img);
    asyncBridge({request: "canvas_drawRoundedRect", img, x, y, width, height, cornerSize});
}
function toRadians(deg : number) : number {
    return deg * Math.PI / 180;
}
export function canvas_arc(img : RemoteCanvas, x : number, y : number, width : number, height : number, angleStartDeg : number, angleDeltaDeg : number) : void {
    aboutToDrawOnImage(img);
    asyncBridge({request: "canvas_drawArc", img, x, y, width, height, angleStartRad: toRadians(angleStartDeg), angleDeltaRad: toRadians(angleDeltaDeg)});
}
export function polygon_xy_pairs(img : RemoteCanvas, xyPairs : PyProxy) : void {
    aboutToDrawOnImage(img);
    // Usually we don't need to call toJs manually, but with this nested array it comes as a PyProxy so we need to convert:
    const xyPairsPlain = xyPairs.toJs() as number[][];
    asyncBridge({request: "canvas_drawPolygon", img, xyPairs: xyPairsPlain});
}

export function canvas_loadFont(provider : string, fontName : string) : boolean {
    return syncBridge({request: "loadFont", provider, fontName});
}

// Draws the given text on canvas dest at top-left of x, y with given fontSize in pixels.
// If the text would be larger than maxWidth (and maxWidth is > 0) then it will be wrapped at white space in the text.
// If the text would then be larger than maxHeight (and maxHeight is > 0), its font size will be reduced until it
// fits inside maxWidth and maxHeight.  Note that it is invalid to supply maxHeight > 0 with maxWidth = 0.
// Returns a Python two-item array with the actual width and height
export function canvas_drawText(img : RemoteCanvas, text : string, x : number, y : number, fontSize : number, maxWidth : number, maxHeight : number, fontName : string | null) : number[] {
    aboutToDrawOnImage(img);
    if (fontName != null) {
        fontName = fontName + ", sans-serif";
    }
    else {
        fontName = sayFont;
    }
    const widthHeight = syncBridge({request: "canvas_drawText", img, text, x, y, fontSize, maxWidth, maxHeight, fontName});
    return [widthHeight.width, widthHeight.height];
}

export function canvas_downloadPNG(src : RemoteCanvas, filenameStem : string) : void {
    // Force flush any pending pixel writes without evicting:
    const cached = pixelsCache.get(src.handle.handle);
    if (cached) {
        cached.update.flush();
    }
    asyncBridge({request: "canvas_downloadPNG", img: src, filenameStem});
}

export function cloneImage(img: RemoteCanvas, scale: number, rotate: number, flip: "horizontal" | "vertical" | "none") : RemoteCanvas {
    // Force flush any pending pixel writes without evicting:
    const cached = pixelsCache.get(img.handle.handle);
    if (cached) {
        cached.update.flush();
    }
    return syncBridge({request: "canvas_makeCopy", img, scale, rotate, flip});
}
