// This file contains the internal sound/music API for Strype.
// These functions are not directly exposed to users, but are used by sound.py to
// form the actual public API.

import {encodeUint8ToString, RemoteSound} from "@/stryperuntime/worker_bridge_type";
import { asyncBridge, syncBridge } from "@/workers/python_execution_type";

export function startAudioBuffer(sound : RemoteSound) : void {
    asyncBridge({request: "startSound", sound});
}
export function playAudioBufferAndWait(sound: RemoteSound) : void {
    syncBridge(({request: "playSoundAndWait", sound}));
}
export function stopAudioBuffer(sound : RemoteSound) : void {
    asyncBridge({request: "stopSound", sound});
}
export function createAudioBuffer(seconds : number, sampleRate : number) : RemoteSound {
    // Note that creating zero length sounds is undefined behaviour, so must have at least one sample:
    return syncBridge(({request: "createEmptyMonoSound", numSamples: Math.max(1, Math.round(seconds * sampleRate)), sampleRate}));
}
export function createAudioBufferFromSamples(samples: number[], sampleRate: number) : RemoteSound {
    // Note that creating zero length sounds is undefined behaviour, so must have at least one sample:
    if (samples.length == 0) {
        samples = [0];
    }
    // Serialising an array of floats to/from string is slow, so we go via bytes and direct string encoding:
    const f32 = new Float32Array(samples);
    const bytes = new Uint8Array(f32.buffer);
    return syncBridge(({request: "createMonoSound", encodedSamples: encodeUint8ToString(bytes), sampleRate}));
}

export function loadAndWaitForAudioBuffer(path : string) : RemoteSound {
    return syncBridge({request: "loadSound", url: path});
}
export function getSamples(sound : RemoteSound) : number[] {
    if (sound.numberOfChannels > 1) {
        throw new Error("Cannot get samples from stereo sound; convert to mono first");
    }
    else {
        return syncBridge({request: "getMonoSoundSampleValues", sound});
    }
}
export function setSamples(sound: RemoteSound, samples : number[]) : void {
    if (sound.numberOfChannels > 1) {
        throw new Error("Cannot set samples in stereo sound; convert to mono first");
    }
    else {
        // Simple case of mono sound:
        // Serialising an array of floats to/from string is slow, so we go via bytes and direct string encoding:
        const f32 = new Float32Array(samples);
        const bytes = new Uint8Array(f32.buffer);
        asyncBridge({request: "setMonoSoundSampleValues", sound, encodedSamples: encodeUint8ToString(bytes)});
        // We locally cache the length of the sound so that will need updating:
        sound.numSamples = samples.length;
    }
}
export function getNumSamples(sound : RemoteSound) : number {
    return sound.numSamples;
}
export function getSampleRate(sound : RemoteSound) : number {
    return sound.sampleRate;
}
export function downloadWAV(sound : RemoteSound, filenameStem : string) : void {
    asyncBridge({request: "downloadWAV", sound, filenameStem});
}
export function copy(sound : RemoteSound) : RemoteSound {
    return syncBridge({request: "cloneSound", sound, toMono: false});
}
export function copyToMono(sound: RemoteSound) : RemoteSound {
    return syncBridge({request: "cloneSound", sound, toMono: true});
}
