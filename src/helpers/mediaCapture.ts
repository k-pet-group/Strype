// Helpers for LIVE capture from the webcam/microphone (RecordImageDlg.vue / RecordSoundDlg.vue).
// This is distinct from media.ts, which converts data we already have (pasted files, an edited
// AudioBuffer) rather than doing live device I/O.

// Stops every track on a MediaStream. Safe to call with null/already-stopped streams.
export function stopMediaStreamTracks(stream: MediaStream | null): void {
    stream?.getTracks().forEach((track) => track.stop());
}

// Snapshots the current frame of a playing <video> element to a PNG data URL.
export function captureVideoFrameToDataURL(video: HTMLVideoElement): string {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
}

// A single instantaneous peak-amplitude sample, timestamped with performance.now().
export interface WaveformPeak {
    time: number;
    peak: number;
}

// Reads the current peak amplitude (0-1) from an AnalyserNode's time-domain data. scratchBuffer is
// reused across calls (sized analyser.fftSize by the caller) to avoid an allocation per frame.
export function readAnalyserPeak(analyser: AnalyserNode, scratchBuffer: Uint8Array<ArrayBuffer>): number {
    analyser.getByteTimeDomainData(scratchBuffer);
    let peak = 0;
    for (let i = 0; i < scratchBuffer.length; i++) {
        // Values are 0-255, centred on 128:
        peak = Math.max(peak, Math.abs(scratchBuffer[i] / 128 - 1));
    }
    return peak;
}

// Draws the peaks falling within [windowStartMs, windowEndMs] as a scrolling bar chart, scaled to
// fill the canvas -- one vertical stroke per peak, positioned by its timestamp. Styling (black
// background, green stroke) mirrors media.ts's drawSoundOnCanvas so the live view and the static
// edit-dialog preview look the same. If markerTimeMs falls inside the window, a vertical red
// marker line is drawn there to mark where recording started.
export function drawScrollingWaveform(canvas: HTMLCanvasElement, peaks: WaveformPeak[], windowStartMs: number, windowEndMs: number, markerTimeMs?: number): void {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return;
    }
    const width = canvas.width;
    const height = canvas.height;
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);

    const windowDuration = windowEndMs - windowStartMs;
    if (windowDuration <= 0) {
        return;
    }
    ctx.strokeStyle = "green";
    for (const p of peaks) {
        if (p.time < windowStartMs || p.time > windowEndMs) {
            continue;
        }
        const x = (width * (p.time - windowStartMs)) / windowDuration;
        const barHalfHeight = (Math.min(1, p.peak) * height) / 2;
        ctx.beginPath();
        ctx.moveTo(x, height / 2 - barHalfHeight);
        ctx.lineTo(x, height / 2 + barHalfHeight);
        ctx.stroke();
    }

    if (markerTimeMs !== undefined && markerTimeMs >= windowStartMs && markerTimeMs <= windowEndMs) {
        const markerX = (width * (markerTimeMs - windowStartMs)) / windowDuration;
        ctx.strokeStyle = "red";
        ctx.beginPath();
        ctx.moveTo(markerX, 0);
        ctx.lineTo(markerX, height);
        ctx.stroke();
    }
}

// Decodes a recorded audio Blob (from MediaRecorder) into an AudioBuffer, so it can be fed into
// the existing EditSoundDlg.vue editing flow exactly like any other sound literal.
export function decodeRecordedAudioBlob(blob: Blob, audioContext: AudioContext): Promise<AudioBuffer> {
    return blob.arrayBuffer().then((buf) => audioContext.decodeAudioData(buf));
}
