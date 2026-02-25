// This file contains the internal sound/music API for Strype.
// These functions are not directly exposed to users, but are used by sound.py to
// form the actual public API.

// Temporary fix for using Vue 3 before getting Pyodide changes in (__vue__ is no longer exposed in Vue 3):
// we use vuePEAComponentAPIHandler exposed by our Components API to get access to the PEA component's methods.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
var $builtinmodule = function(name)  {
    var mod = {};
    mod.playAudioBuffer = new Sk.builtin.func(function(audioBuffer) {
        vuePEAComponentAPIHandler.playAudioBuffer(audioBuffer);
    });
    mod.playAudioBufferAndWait = new Sk.builtin.func(function(audioBuffer) {
        let susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            if (susp.data["error"]) {
                throw new Sk.builtin.IOError(susp.data["error"].message);
            }
        };
        susp.data = {
            type: "Sk.promise",
            promise: vuePEAComponentAPIHandler.playAudioBuffer(audioBuffer),
        };
        return susp;
    });
    mod.stopAudioBuffer = new Sk.builtin.func(function(audioBuffer) {
        vuePEAComponentAPIHandler.stopAudioBuffer(audioBuffer);
    });
    mod.createAudioBuffer = new Sk.builtin.func(function(seconds, samplesPerSecond) {
        return new AudioBuffer({length: Math.round(seconds * samplesPerSecond), sampleRate: samplesPerSecond});
    });
    mod.loadAndWaitForAudioBuffer = new Sk.builtin.func(function(path) {
        path = Sk.ffi.remapToJs(path);
        const audioContext = vuePEAComponentAPIHandler.getAudioContext();
        let susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            if (susp.data["error"]) {
                throw new Sk.builtin.IOError(susp.data["error"].message);
            }
            return susp.ret;
        };
        let promise;
        if (path.startsWith("data:") || path.startsWith(":")) {
            const decode = (dataURL) => 
                audioContext.decodeAudioData(Uint8Array.from(atob(dataURL.split(",")[1]), (char) => char.charCodeAt(0)).buffer)
                    .then((b) => {
                        if (!b) {
                            susp.data["error"] = Error("Cannot load audio file \"" + path + "\"");
                        }
                        else {
                            susp.ret = b;
                        }
                    });
            
            const match = /^:([^:]+):(.+)$/.exec(path);
            if (match) {
                // If it's some prefix between two colons, it's a library asset:
                const libraryName = match[1];
                const fileName = match[2];
                promise = vuePEAComponentAPIHandler.loadLibraryAsset(libraryName, fileName).then(async (dataURL) => {
                    return await decode(dataURL ?? path);
                }).catch((error) => {
                    // Propagate the error to the outer promise
                    susp.data["error"] = error;
                });
            }
            else {
                promise = decode(path);
            }
        }
        else {
            promise = fetch("./sounds/" + path)
                .then((d) => d.arrayBuffer())
                .then((b) => audioContext.decodeAudioData(b))
                .then((b) => {
                    if (!b) {
                        susp.data["error"] = Error("Cannot load audio file \"" + path + "\"");
                    }
                    else {
                        susp.ret = b;
                    }
                });
        }
        susp.data = {
            type: "Sk.promise",
            promise: promise,
        };
        return susp;
    }); 
    mod.getSamples = new Sk.builtin.func(function(buffer) {
        if (buffer.numberOfChannels > 1) {
            throw new Error("Cannot get samples from stereo sound; convert to mono first");
        }
        else {
            // Simple case of mono sound: just return the data
            return Sk.ffi.remapToPy(buffer.getChannelData(0));
        }
    });
    mod.setSamples = new Sk.builtin.func(function(buffer, floatArray, offset) {
        if (buffer.numberOfChannels > 1) {
            throw new Error("Cannot set samples in stereo sound; convert to mono first");
        }
        else {
            // Simple case of mono sound: 
            const floats = new Float32Array(Sk.ffi.remapToJs(floatArray));
            if (offset < 0 || offset >= buffer.length) {
                throw new Error("Invalid offset when setting samples: " + offset + " (sound length is " + buffer.length + ")");
            }
            if (offset + floats.length > buffer.length) {
                throw new Error("Setting samples would go beyond end of sound, offset: " + offset + " + number of samples: " + floats.length + " > sound length: " + buffer.length);
            }
            buffer.copyToChannel(floats, 0, offset);
        }
    });
    mod.getNumSamples = new Sk.builtin.func(function(buffer) {
        return Sk.ffi.remapToPy(buffer.length);
    });
    mod.getSampleRate = new Sk.builtin.func(function(buffer) {
        return Sk.ffi.remapToPy(buffer.sampleRate);
    });
    mod.downloadWAV = new Sk.builtin.func(function(src, filenameStem) {
        filenameStem = Sk.ffi.remapToJs(filenameStem);
        vuePEAComponentAPIHandler.downloadWAV(src, filenameStem);
    });
    mod.copy = new Sk.builtin.func(function(audioBuffer) {
        const audioContext = vuePEAComponentAPIHandler.getAudioContext();
        const numberOfChannels = audioBuffer.numberOfChannels;
        const copiedBuffer = audioContext.createBuffer(
            numberOfChannels,
            audioBuffer.length,
            audioBuffer.sampleRate
        );

        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sourceData = audioBuffer.getChannelData(channel);
            const targetData = copiedBuffer.getChannelData(channel);
            targetData.set(sourceData);
        }

        return copiedBuffer;
    });
    mod.copyToMono = new Sk.builtin.func(function(audioBuffer) {
        // From https://gist.github.com/chrisguttandin/e49764f9c29376780f2eb1f7d22b54e4
        const downmixContext = new OfflineAudioContext(
            1,
            audioBuffer.length,
            audioBuffer.sampleRate
        );
        const bufferSource = new AudioBufferSourceNode(downmixContext, {
            buffer: audioBuffer,
        });
        bufferSource.start(0);
        bufferSource.connect(downmixContext.destination);

        let susp = new Sk.misceval.Suspension();
        susp.resume = function () {
            if (susp.data["error"]) {
                throw new Sk.builtin.IOError(susp.data["error"].message);
            }
            return susp.ret;
        };
        susp.data = {
            type: "Sk.promise",
            promise: downmixContext.startRendering().then((b) => {
                if (!b) {
                    susp.data["error"] = Error("Cannot convert to mono for unknown reason");
                }
                else  {
                    susp.ret = b;
                }
            }),
        };
        return susp;
    });

    return mod;
};
