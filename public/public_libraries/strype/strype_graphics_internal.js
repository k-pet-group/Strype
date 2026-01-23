// This file contains the internal graphics API for the Strype graphics world.
// These functions are not directly exposed to users, but are used by graphics.py to
// form the actual public API.

// From https://stackoverflow.com/questions/996505/lru-cache-implementation-in-javascript
class LRU {
    constructor(max = 10) {
        this.max = max;
        this.cache = new Map();
    }

    get(key) {
        let item = this.cache.get(key);
        if (item !== undefined) {
            // refresh key
            this.cache.delete(key);
            this.cache.set(key, item);
        }
        return item;
    }

    set(key, val) {
        // refresh key
        if (this.cache.has(key)) this.cache.delete(key);
        // evict oldest
        else if (this.cache.size === this.max) this.cache.delete(this.first());
        this.cache.set(key, val);
    }

    first() {
        return this.cache.keys().next().value;
    }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
var $builtinmodule = function(name)  {
    var mod = {};
    // There is no standard way in HTML to synchronously load images,
    // but we need to be able to do this in order to use the image's attributes
    // (particularly its width and height) after loading.  So we use Skulpt's
    // suspension mechanism to pause Skulpt execution until the promise which loads
    // the image has executed.  This effectively makes it seem like the user
    // code has loaded the image synchronously.
    // This code is adapted from Skulpt's src/lib/image.js
    mod.loadAndWaitForImage = new Sk.builtin.func(function(filename) {
        filename = Sk.ffi.remapToJs(filename);
        let susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            if (susp.data["error"]) {
                throw new Sk.builtin.IOError(susp.data["error"].message);
            }
            return susp.ret;
        };
        susp.data = {
            type: "Sk.promise",
            promise: new Promise(function (resolve, reject) {
                var newImg = new Image();
                newImg.crossOrigin = "";
                newImg.onerror = function () {
                    reject(Error("Failed to load image (does not exist or server refused permission): " + newImg.src));
                };
                newImg.onload = function () {
                    susp.ret = newImg;
                    resolve();
                };
                // Actually trigger the load:
                // Try to detect if it's a relative path or absolute URL.  We are fairly lenient
                // and permissive, so our rule is: if it starts with http: or https: or // we 
                // treat it as absolute, or something.ext/something then we assume it's a URL.
                // Otherwise we count it as a relative path:
                let match;
                if (/^https?:/.test(filename) || /^\/\//.test(filename)) {
                    // Absolute:
                    newImg.src = filename;
                }
                else if (!/:/.test(filename) && /^[^./]+\.[^/]+\/.+/.test(filename)) {
                    // Absolute partial:
                    newImg.src = "https://" + filename;
                }
                else if (/^data:/.test(filename) && !/^data:image\/svg+xml/.test(filename)) {
                    // Base64 data image:
                    newImg.src = filename;
                }
                else if ((match = /^:([^:]+):(.+)$/.exec(filename))) {
                    // If it's some other prefix between two colons, it's a library asset:
                    const libraryName = match[1];
                    const fileName = match[2];
                    peaComponent.__vue__.loadLibraryAsset(libraryName, fileName).then((dataURL) => {
                        newImg.src = dataURL ?? filename;
                    }).catch((error) => {
                        // Propagate the error to the outer promise
                        reject(error);
                    });
                }
                else {
                    // Relative path:
                    newImg.src = "./graphics_images/" + filename;
                }
            }),
        };
        return susp;
    });
    mod.setBackground = new Sk.builtin.func(function(img) {
        peaComponent.__vue__.getPersistentImageManager().setBackground(img);
    });
    // Note, assoc parameter may be missing (and thus undefined): 
    mod.addImage = new Sk.builtin.func(function(image, assoc) {
        return peaComponent.__vue__.getPersistentImageManager().addPersistentImage(image, assoc);
    });
    mod.updateImage = new Sk.builtin.func(function(id, image) {
        return peaComponent.__vue__.getPersistentImageManager().setPersistentImageImage(id, image);
    });
    mod.imageExists = new Sk.builtin.func(function(image) {
        return Sk.ffi.remapToPy(peaComponent.__vue__.getPersistentImageManager().hasPersistentImage(image));
    });
    mod.getImageSize = new Sk.builtin.func(function (img) {
        return Sk.ffi.remapToPy(peaComponent.__vue__.getPersistentImageManager().getPersistentImageSize(img));
    });
    mod.setImageLocation = new Sk.builtin.func(function(img, x, y) {
        peaComponent.__vue__.getPersistentImageManager().setPersistentImageLocation(img, x, y);
    });
    mod.setImageRotation = new Sk.builtin.func(function(img, r) {
        peaComponent.__vue__.getPersistentImageManager().setPersistentImageRotation(img, r);
    });
    mod.setImageScale = new Sk.builtin.func(function(img, s) {
        peaComponent.__vue__.getPersistentImageManager().setPersistentImageScale(img, s);
    });
    mod.getImageLocation = new Sk.builtin.func(function(img) {
        return Sk.ffi.remapToPy(peaComponent.__vue__.getPersistentImageManager().getPersistentImageLocation(img));
    });
    mod.getImageRotation = new Sk.builtin.func(function(img) {
        return Sk.ffi.remapToPy(peaComponent.__vue__.getPersistentImageManager().getPersistentImageRotation(img));
    });
    mod.getImageScale = new Sk.builtin.func(function(img) {
        return Sk.ffi.remapToPy(peaComponent.__vue__.getPersistentImageManager().getPersistentImageScale(img));
    });
    mod.removeImage = new Sk.builtin.func(function(img) {
        peaComponent.__vue__.getPersistentImageManager().removePersistentImage(img);
    });
    // Removes an image after a timeout.  Can be cancelled with cancelRemoveImageAfter (passing same img)
    mod.removeImageAfter = new Sk.builtin.func(function(img, secs) {
        peaComponent.__vue__.getPersistentImageManager().removePersistentImageAfter(img, secs);
    });
        
    mod.makeImageEditable = new Sk.builtin.func(function(img) {
        return peaComponent.__vue__.getPersistentImageManager().editImage(img);
    });
    
    
    mod.makeCanvasOfSize = new Sk.builtin.func(function(width, height) {
        const c = new OffscreenCanvas(width, height);
        // Note: we do not remapToPy because it makes no sense, we are just passing the reference around:
        return c;
    });
    mod.htmlImageToCanvas = new Sk.builtin.func(function(imageElement) {
        const c = new OffscreenCanvas(imageElement.width, imageElement.height);
        c.getContext("2d").drawImage(imageElement, 0, 0);
        return c;
    });
    mod.getCanvasDimensions = new Sk.builtin.func(function(img) {
        return new Sk.builtin.tuple([Sk.ffi.remapToPy(img.width), Sk.ffi.remapToPy(img.height)]);
    });
    mod.canvas_fillRect = new Sk.builtin.func(function(img, x, y, width, height) {
        const ctx = img.getContext("2d");
        return ctx.fillRect(x, y, width, height);
    });
    mod.canvas_clearRect = new Sk.builtin.func(function(img, x, y, width, height) {
        const ctx = img.getContext("2d");
        return ctx.clearRect(x, y, width, height);
    });
    mod.canvas_setFill = new Sk.builtin.func(function(img, color) {
        const ctx = img.getContext("2d");
        let colorJs = Sk.ffi.remapToJs(color);
        // Note 8 zeroes: this is fully transparent, not black:
        ctx.fillStyle = colorJs == null ? "#00000000" : colorJs;
    });
    mod.canvas_setStroke = new Sk.builtin.func(function(img, color) {
        const ctx = img.getContext("2d");
        let colorJs = Sk.ffi.remapToJs(color);
        // Note 8 zeroes: this is fully transparent, not black:
        ctx.strokeStyle = colorJs == null ? "#00000000" : colorJs;
    });
    mod.canvas_getPixel = new Sk.builtin.func(function(img, x, y) {
        const ctx = img.getContext("2d");
        const p = ctx.getImageData(x, y, 1, 1);
        return new Sk.builtin.tuple([
            new Sk.builtin.int_(p.data[0]),
            new Sk.builtin.int_(p.data[1]),
            new Sk.builtin.int_(p.data[2]),
            new Sk.builtin.int_(p.data[3])]);
    });
    mod.canvas_setPixel = new Sk.builtin.func(function(img, x, y, colorTuple) {
        const ctx = img.getContext("2d");
        const p = Sk.ffi.remapToJs(colorTuple);
        ctx.putImageData(new ImageData(new Uint8ClampedArray([p[0], p[1], p[2], p[3]]), 1, 1), x, y);
    });
    mod.canvas_getAllPixels = new Sk.builtin.func(function(img) {
        const ctx = img.getContext("2d");
        return Sk.ffi.remapToPy(ctx.getImageData(0, 0, img.width, img.height).data);
    });
    mod.canvas_setAllPixelsRGBA = new Sk.builtin.func(function(img, pixels) {
        const ctx = img.getContext("2d");
        ctx.putImageData(new ImageData(new Uint8ClampedArray(Sk.ffi.remapToJs(pixels)), img.width, img.height), 0, 0);
    });
    mod.canvas_drawImagePart = new Sk.builtin.func(function(dest, src, dx, dy, sx, sy, sw, sh, scale) {
        const ctx = dest.getContext("2d");
        ctx.drawImage(src, sx, sy, sw, sh, dx, dy, sw * scale, sh * scale);
    });
    mod.canvas_line = new Sk.builtin.func(function(dest, x, y, ex, ey) {
        const ctx = dest.getContext("2d");
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
    });
    mod.canvas_roundedRect = new Sk.builtin.func(function(img, x, y, width, height, cornerSize) {
        const ctx = img.getContext("2d");
        ctx.beginPath();
        let radii = Sk.ffi.remapToJs(cornerSize);
        if (radii == 0) {
            ctx.rect(x, y, width, height);
        }
        else {
            ctx.roundRect(x, y, width, height, radii);
        }
        ctx.fill();
        ctx.stroke();
    });
    const toRadians = function(deg) {
        return deg * Math.PI / 180;
    };
    mod.canvas_arc = new Sk.builtin.func(function(img, x, y, width, height, angleStart, angleDelta) {
        const ctx = img.getContext("2d");
        ctx.beginPath();
        ctx.ellipse(x, y, width, height, 0, toRadians(angleStart), toRadians(angleStart + angleDelta), false);
        ctx.fill();
        ctx.stroke();
    });
    mod.polygon_xy_pairs = new Sk.builtin.func(function(img, xy_pairs_py) {
        let xys = Sk.ffi.remapToJs(xy_pairs_py);
        const ctx = img.getContext("2d");
        ctx.beginPath();
        // If we move to the last point, we can lineTo the rest and have the right behaviour:
        ctx.moveTo(xys[xys.length - 1][0], xys[xys.length - 1][1]);
        xys.forEach((xy) => {
            ctx.lineTo(xy[0], xy[1]);
        });
        ctx.fill();
        ctx.stroke();
    });
    
    mod.canvas_loadFont = new Sk.builtin.func(function(provider, fontName) {
        provider = Sk.ffi.remapToJs(provider);
        if (provider.toLowerCase() != "google") {
            throw new Error("Provider " + provider + " not supported.  Currently only 'google' is supported.");
        }
        const susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            return susp.ret;
        };
        susp.data = {
            type: "Sk.promise",
            promise: new Promise(function (resolve, reject) {
                WebFont.load({
                    google: {
                        families: [Sk.ffi.remapToJs(fontName)],
                    },
                    active: function() {
                        susp.ret = Sk.ffi.remapToPy(true);
                        resolve();
                    },
                    inactive: function() {
                        susp.ret = Sk.ffi.remapToPy(false);
                        reject(Error("Font failed to load."));
                    },
                });
            }),
        };
        return susp;
    });
    
    const sayFont="\"Klee One\", sans-serif";
    // Load font:
    const myFont = new FontFace(
        "Klee One",
        "url(fonts/klee-one-v12-latin-regular.woff2)"
    );

    myFont.load().then((font) => {
        document.fonts.add(font);
    });
    // Since this is quite expensive, we cache it in case users repeatedly redraw the same text:
    // The map can only really use string keys, so we assemble the key into a string of the format:
    // $fontSize:$maxWidth:$maxHeight:$text
    const textMeasureCache = new LRU(1000);
    
    const lineHeightMultiplier = 1.2;
    
    // Returns an item of the following type (but we're in Javascript so can't actually type it):
    // interface {
    //    lines: string[],
    //    fontSize: number,
    //    width: number,
    //    height: number,
    // }
    const calculateTextToFit = function(ctx, text, fontSize, maxWidth, maxHeight, font) {
        let lines = [];
        const paragraphs = text.split("\n");  // Split the text by '\n' to respect forced line breaks.
        let textHeight = 0;
        let longestWidth = 0;

        // Minimum font size of 8 pixels:
        for (;fontSize >= 8; fontSize -= 1) {
            ctx.font = `${fontSize}px ${font}`;
            
            paragraphs.forEach((paragraph) => {
                let currentLine = "";
                // The brackets make it retain the whitespace parts in the array as a "word".  This way,
                // if the user asks for us to write "But....       I don't know." then we'll actually render
                // the long space.
                const words = paragraph.split(/(\s+)/);

                if (maxWidth > 0) {
                    for (let i = 0; i < words.length; i++) {
                        const currentLinePlusNextWord = currentLine + words[i];
                        const metrics = ctx.measureText(currentLinePlusNextWord);
                        const testWidth = metrics.width;

                        // If it's too long, start a new line:
                        if (testWidth > maxWidth && currentLine.length > 0) {
                            lines.push(currentLine);
                            // If it's a single space at the start of a line, discard it:
                            currentLine = words[i] === " " ? "" : words[i];
                        }
                        else {
                            // currentLinePlusNextWord includes the previous part, so just overwrite currentLine with it:
                            currentLine = currentLinePlusNextWord;
                        }
                        longestWidth = Math.max(longestWidth, testWidth);
                    }
                    lines.push(currentLine.trim()); // Push the last line of the paragraph
                }
                else {
                    lines.push(paragraph); // No wrapping if maxWidth is <= 0
                    longestWidth = Math.max(longestWidth, ctx.measureText(paragraph).width);
                }
            });

            let lineHeight = fontSize * lineHeightMultiplier;
            textHeight = lines.length * lineHeight;
            
            if (maxHeight <= 0 || textHeight <= maxHeight) {
                break;
            }
            // Otherwise we go round again, reducing the font size...
        }
        return {lines: lines, fontSize: fontSize, width: longestWidth, height: textHeight};
    };
    
    // Draws the given text on canvas dest at top-left of x, y with given fontSize in pixels.
    // If the text would be larger than maxWidth (and maxWidth is > 0) then it will be wrapped at white space in the text.
    // If the text would then be larger than maxHeight (and maxHeight is > 0), its font size will be reduced until it
    // fits inside maxWidth and maxHeight.  Note that it is invalid to supply maxHeight > 0 with maxWidth = 0.
    // Returns a Python dict with fields "width" and "height" with the actual width and height
    mod.canvas_drawText = new Sk.builtin.func(function(dest, text, x, y, fontSize, maxWidth = 0, maxHeight = 0, fontName = null) {
        // Must remap the string to Javascript:
        text = Sk.ffi.remapToJs(text);
        fontName = Sk.ffi.remapToJs(fontName);
        if (fontName != null) {
            fontName = fontName + ", sans-serif";
        }
        else {
            fontName = sayFont;
        }
        fontSize = Sk.ffi.remapToJs(fontSize);
        maxWidth = Sk.ffi.remapToJs(maxWidth);
        maxHeight = Sk.ffi.remapToJs(maxHeight);
        const ctx = dest.getContext("2d");
        const key = `${fontSize}:${maxWidth}:${maxHeight}:${text}:${fontName}`;
        let details = textMeasureCache.get(key);
        if (!details) {
            details = calculateTextToFit(ctx, text, fontSize, maxWidth, maxHeight, fontName);
            textMeasureCache.set(key, details);
        }
        ctx.font = `${details.fontSize}px ${fontName}`;
        
        // Render each line of text on the canvas at (x, y)
        for (let i = 0; i < details.lines.length; i++) {
            // Since we are passing the baseline, we always add an extra 1 * fontSize to get from the top-left
            // down to the baseline, then add i * lineHeightMultiplier from there:
            let actualY = y + details.fontSize * (1 + i * lineHeightMultiplier);
            ctx.strokeText(details.lines[i], x, actualY);
            ctx.fillText(details.lines[i], x, actualY); 
        }
        return Sk.ffi.remapToPy({width: details.width, height: details.height});
    });
    
    // Skulpt can't access our common.ts code so we have to copy this here:
    const getDateTimeFormatted = function(dt) {
        // Returned "YYYY-MM-DD_HH-mm-ss" format string representation of a date
        const rawMonthOneIndexedVal = dt.getMonth() + 1;
        const rawDayVal = dt.getDate();
        const rawHoursVal = dt.getHours();
        const rawMinsVal = dt.getMinutes();
        const rawSecsVal = dt.getSeconds();
        return `${dt.getFullYear()}-${((rawMonthOneIndexedVal) < 10) ? "0" + rawMonthOneIndexedVal : rawMonthOneIndexedVal }-${(rawDayVal < 10) ? "0" + rawDayVal : rawDayVal}_${(rawHoursVal < 10) ? "0" + rawHoursVal : rawHoursVal}-${(rawMinsVal < 10) ? "0" + rawMinsVal : rawMinsVal}-${(rawSecsVal < 10) ? "0" + rawSecsVal : rawSecsVal}`;
    }
    
    mod.canvas_downloadPNG = new Sk.builtin.func(function(src, filenameStem) {
        filenameStem = Sk.ffi.remapToJs(filenameStem);
        // convertToBlob gives a promise, so we use Skulpt's suspensions to block until it has completed:
        let susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            if (susp.data["error"]) {
                throw new Sk.builtin.IOError(susp.data["error"].message);
            }
            return susp.ret;
        };
        susp.data = {
            type: "Sk.promise",
            promise: new Promise(function (resolve, reject) {
                src.convertToBlob().then((blob) => {
                    if(blob){
                        saveAs(blob, `${filenameStem}_${getDateTimeFormatted(new Date(Date.now()))}.png`);
                        resolve();
                    }
                    else {
                        reject("Unknown error saving image");
                    }
                });
            }),
        };
        return susp;
    });
    
    return mod;
};
