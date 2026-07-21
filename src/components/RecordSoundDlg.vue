<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle" hideDlgBtns>
        <div v-if="errorMessage" class="RecordSoundDlg-error">{{ errorMessage }}</div>
        <canvas ref="waveformCanvas" class="RecordSoundDlg-waveform" width="600" height="150"></canvas>
        <div class="d-flex justify-content-center align-items-center RecordSoundDlg-button-wrapper">
            <BButton class="RecordSoundDlg-cancel-button" @click="doCancel">{{$t("buttonLabel.cancel")}}</BButton>
            <BButton class="RecordSoundDlg-record-button EditSoundImageDlg-info-btn" :disabled="!canRecord" @click="doRecord"><i class="fa fa-microphone"></i> {{$t("media.record")}}</BButton>
            <BButton class="RecordSoundDlg-stop-button EditSoundImageDlg-info-btn" :disabled="!isRecording" @click="doStop"><i class="fa fa-stop"></i> {{$t("media.stop")}}</BButton>
        </div>
    </ModalDlg>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { BButton, BvTriggerableEvent } from "bootstrap-vue-next";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";
import { decodeRecordedAudioBlob, startLiveWaveform, stopMediaStreamTracks } from "@/helpers/mediaCapture";
import { createOrGetAudioContext } from "@/helpers/audioContext";

export default defineComponent({
    name: "RecordSoundDlg",

    components: {
        ModalDlg,
        BButton,
    },

    props: {
        dlgId: String,
        dlgTitle: String,
    },

    data: function () {
        return {
            stream: null as MediaStream | null,
            errorMessage: null as string | null,
            isRecording: false,
            mediaRecorder: null as MediaRecorder | null,
            recordedChunks: [] as Blob[],
            stopWaveform: null as (() => void) | null,
            capturedAudioBuffer: null as AudioBuffer | null,
        };
    },

    created() {
        vueComponentsAPIHandler.recordSoundDlgComponentAPI = {
            getCapturedAudioBuffer: () => this.capturedAudioBuffer,
        };

        eventBus.on(CustomEventTypes.strypeModalShown, this.onShownModalDlg);
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);
    },

    beforeUnmount() {
        eventBus.off(CustomEventTypes.strypeModalShown, this.onShownModalDlg);
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);
        this.cleanUp();
    },

    computed: {
        canRecord(): boolean {
            return this.stream != null && this.errorMessage == null && !this.isRecording;
        },
    },

    methods: {
        onShownModalDlg(event: BvTriggerableEvent) {
            if (event.componentId != this.dlgId) {
                return;
            }
            // Fresh state every time the dialog is (re-)shown, e.g. via "Re-record":
            this.errorMessage = null;
            this.capturedAudioBuffer = null;
            navigator.mediaDevices.getUserMedia({audio: true}).then((stream) => {
                this.stream = stream;
                // Live waveform monitoring starts as soon as we have the stream, independent of
                // whether the user has pressed Record yet -- deliberately NOT connected to
                // audioContext.destination, to avoid feedback:
                const audioContext = createOrGetAudioContext();
                const source = audioContext.createMediaStreamSource(stream);
                const analyser = audioContext.createAnalyser();
                source.connect(analyser);
                const canvas = this.$refs.waveformCanvas as HTMLCanvasElement | undefined;
                if (canvas) {
                    this.stopWaveform = startLiveWaveform(analyser, canvas);
                }
            }).catch((err) => {
                if (err?.name === "NotAllowedError") {
                    this.errorMessage = this.$t("media.micPermissionDenied") as string;
                }
                else {
                    this.errorMessage = this.$t("media.noMicFound") as string;
                }
            });
        },

        onHideModalDlg(event: BvTriggerableEvent) {
            if (event.componentId != this.dlgId) {
                return;
            }
            this.cleanUp();
        },

        cleanUp() {
            // If a recording is in progress when the dialog closes some other way (Cancel, Esc,
            // backdrop), we must NOT let its completion be treated as a capture -- so we stop
            // listening for it here rather than awaiting its result:
            if (this.mediaRecorder && this.mediaRecorder.state != "inactive") {
                this.mediaRecorder.ondataavailable = null;
                this.mediaRecorder.onstop = null;
                this.mediaRecorder.stop();
            }
            this.mediaRecorder = null;
            this.isRecording = false;
            this.stopWaveform?.();
            this.stopWaveform = null;
            stopMediaStreamTracks(this.stream);
            this.stream = null;
        },

        doRecord() {
            if (!this.canRecord || !this.stream) {
                return;
            }
            // AudioContext creation/resumption for playback purposes must happen inside a user
            // gesture handler -- the analyser above is created eagerly in onShownModalDlg only
            // for live monitoring, but decoding for playback happens later via the shared context,
            // so we make sure it's resumed here where we know we have a fresh user gesture:
            createOrGetAudioContext();

            this.recordedChunks = [];
            const mediaRecorder = new MediaRecorder(this.stream);
            mediaRecorder.ondataavailable = (event: BlobEvent) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            this.mediaRecorder = mediaRecorder;
            mediaRecorder.start();
            this.isRecording = true;
        },

        doStop() {
            const mediaRecorder = this.mediaRecorder;
            if (!mediaRecorder || mediaRecorder.state == "inactive") {
                return;
            }
            // Only a Stop-button-triggered stop is ever treated as a capture; the dialog's other
            // close paths null out onstop in cleanUp() before calling stop(), so a discarded
            // in-progress recording can never end up here:
            mediaRecorder.onstop = () => {
                const blob = new Blob(this.recordedChunks, {type: mediaRecorder.mimeType});
                decodeRecordedAudioBlob(blob, createOrGetAudioContext()).then((audioBuffer) => {
                    this.capturedAudioBuffer = audioBuffer;
                    // Release the microphone as soon as we have the recording, rather than waiting
                    // for the (animated) modal-hide transition to finish:
                    this.cleanUp();
                    eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "captured", componentId: this.dlgId});
                });
            };
            mediaRecorder.stop();
            this.isRecording = false;
        },

        doCancel() {
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "cancel", componentId: this.dlgId});
        },
    },
});
</script>

<style lang="scss">
.RecordSoundDlg-waveform {
    display: block;
    margin: 0 auto;
    max-width: 100%;
    background: black;
}
.RecordSoundDlg-error {
    color: var(--bs-danger);
    margin-bottom: 10px;
}
.RecordSoundDlg-button-wrapper {
    gap: 20px;
    margin-top: 15px;
}
</style>
