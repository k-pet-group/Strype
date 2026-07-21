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

// Starts a requestAnimationFrame loop drawing the live waveform from analyser onto canvas.
// Styling (black background, green stroke) mirrors media.ts's drawSoundOnCanvas for visual
// consistency with the existing sound-editing UI. Returns a function that stops the loop.
export function startLiveWaveform(analyser: AnalyserNode, canvas: HTMLCanvasElement): () => void {
    const ctx = canvas.getContext("2d");
    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);
    let rafId: number;

    const draw = () => {
        rafId = requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);

        if (!ctx) {
            return;
        }
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "green";
        ctx.beginPath();
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        for (let i = 0; i < bufferLength; i++) {
            // dataArray values are 0-255, centred on 128:
            const v = dataArray[i] / 128.0;
            const y = (v * canvas.height) / 2;
            if (i === 0) {
                ctx.moveTo(x, y);
            }
            else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        ctx.stroke();
    };
    draw();

    return () => cancelAnimationFrame(rafId);
}

// Decodes a recorded audio Blob (from MediaRecorder) into an AudioBuffer, so it can be fed into
// the existing EditSoundDlg.vue editing flow exactly like any other sound literal.
export function decodeRecordedAudioBlob(blob: Blob, audioContext: AudioContext): Promise<AudioBuffer> {
    return blob.arrayBuffer().then((buf) => audioContext.decodeAudioData(buf));
}
