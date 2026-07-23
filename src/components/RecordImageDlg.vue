<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle" hideDlgBtns>
        <div v-if="errorMessage" class="RecordImageDlg-error">{{ errorMessage }}</div>
        <div class="RecordImageDlg-video-wrapper">
            <video ref="video" class="RecordImageDlg-video" autoplay muted playsinline></video>
            <div v-if="countdownValue !== null" class="RecordImageDlg-countdown">{{ countdownValue }}</div>
        </div>
        <div class="d-flex justify-content-center align-items-center RecordImageDlg-button-wrapper">
            <BButton class="RecordImageDlg-cancel-button" @click="doCancel">{{$t("buttonLabel.cancel")}}</BButton>
            <BButton class="RecordImageDlg-record-button EditSoundImageDlg-info-btn" :disabled="!canRecord" @click="doRecord"><i class="fa fa-camera"></i> {{$t("media.record")}}</BButton>
            <BButton class="RecordImageDlg-record-countdown-button EditSoundImageDlg-info-btn" :disabled="!canRecord" @click="doRecordCountdown"><i class="fa fa-camera"></i> {{$t("media.recordCountdown")}}</BButton>
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
import { captureVideoFrameToDataURL, stopMediaStreamTracks } from "@/helpers/mediaCapture";

export default defineComponent({
    name: "RecordImageDlg",

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
            countdownValue: null as number | null,
            countdownTimer: null as number | null,
            capturedDataURL: null as string | null,
        };
    },

    created() {
        vueComponentsAPIHandler.recordImageDlgComponentAPI = {
            getCapturedImageDataURL: () => this.capturedDataURL,
        };

        eventBus.on(CustomEventTypes.strypeModalShown, this.onShownModalDlg);
        eventBus.on(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);
    },

    beforeUnmount() {
        eventBus.off(CustomEventTypes.strypeModalShown, this.onShownModalDlg);
        eventBus.off(CustomEventTypes.strypeModalHidden, this.onHideModalDlg);
        this.stopCamera();
    },

    computed: {
        canRecord(): boolean {
            return this.stream != null && this.errorMessage == null && this.countdownValue == null;
        },
    },

    methods: {
        onShownModalDlg(event: BvTriggerableEvent) {
            if (event.componentId != this.dlgId) {
                return;
            }
            // Fresh state every time the dialog is (re-)shown, e.g. via "Re-record":
            this.errorMessage = null;
            this.capturedDataURL = null;
            navigator.mediaDevices.getUserMedia({video: true}).then((stream) => {
                this.stream = stream;
                const video = this.$refs.video as HTMLVideoElement | undefined;
                if (video) {
                    video.srcObject = stream;
                }
            }).catch((err) => {
                if (err?.name === "NotAllowedError") {
                    this.errorMessage = this.$t("media.cameraPermissionDenied") as string;
                }
                else {
                    this.errorMessage = this.$t("media.noCameraFound") as string;
                }
            });
        },

        onHideModalDlg(event: BvTriggerableEvent) {
            if (event.componentId != this.dlgId) {
                return;
            }
            this.clearCountdown();
            this.stopCamera();
        },

        stopCamera() {
            stopMediaStreamTracks(this.stream);
            this.stream = null;
            const video = this.$refs.video as HTMLVideoElement | undefined;
            if (video) {
                video.srcObject = null;
            }
        },

        clearCountdown() {
            if (this.countdownTimer != null) {
                window.clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
            this.countdownValue = null;
        },

        doCapture() {
            const video = this.$refs.video as HTMLVideoElement | undefined;
            if (!video) {
                return;
            }
            this.capturedDataURL = captureVideoFrameToDataURL(video);
            // Release the camera as soon as we have the frame, rather than waiting for the
            // (animated) modal-hide transition to finish:
            this.stopCamera();
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "captured", componentId: this.dlgId});
        },

        doRecord() {
            if (!this.canRecord) {
                return;
            }
            this.doCapture();
        },

        doRecordCountdown() {
            if (!this.canRecord) {
                return;
            }
            this.countdownValue = 3;
            this.countdownTimer = window.setInterval(() => {
                if (this.countdownValue == null) {
                    return;
                }
                if (this.countdownValue <= 1) {
                    this.clearCountdown();
                    this.doCapture();
                }
                else {
                    this.countdownValue -= 1;
                }
            }, 1000);
        },

        doCancel() {
            eventBus.emit(CustomEventTypes.hideStrypeModal, {trigger: "cancel", componentId: this.dlgId});
        },
    },
});
</script>

<style lang="scss">
.RecordImageDlg-video-wrapper {
    position: relative;
    display: flex;
    justify-content: center;
}
.RecordImageDlg-video {
    max-width: 100%;
    max-height: 50vh;
    background: black;
}
.RecordImageDlg-countdown {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 4rem;
    color: white;
    text-shadow: 0 0 8px black;
}
.RecordImageDlg-error {
    color: var(--bs-danger);
    margin-bottom: 10px;
}
.RecordImageDlg-button-wrapper {
    gap: 20px;
    margin-top: 15px;
}
</style>
