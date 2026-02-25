<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle">
        <span class="EditSoundDlg-header">{{$t("media.soundCrop")}}</span>
        <cropper
            ref="cropper"
            class="edit-sound-cropper"
            backgroundClass="edit-sound-cropper-background"
            foregroundClass="edit-sound-cropper-foreground"
            imageClass="edit-sound-cropper-image"
            :src="imgPreview"
            :resizeImage=false
            :moveImage=false
            :default-size="defaultSize"
            minWidth="1"
            minHeight="100"
            @change="change"
            @mousemove.native="handleMouseMove"
        ></cropper>
        <div class="EditSoundDlg-button-wrapper">
            <b-button class="EditSoundDlg-play-button" :variant="playStopVariant" @click="doPlayStopPreview">{{playStopLabel}}</b-button>
        </div>
        <div class="d-flex justify-content-center mt" style="margin-top: 10px;">
            <div class="d-flex position-relative" style="font-size: 80%;">
                <div class="d-flex flex-column text-right me-4" style="min-width: 250px; padding-right: 5px;">
                    <div>{{$t(isMacOSPlatform() ? "media.cursorTimeMac" : "media.cursorTimeWin")}}</div>
                    <div>{{$t(isMacOSPlatform() ? "media.cursorHeightMac" : "media.cursorHeightWin")}}</div>
                </div>
                <!-- Divider -->
                <div class="position-absolute top-0 bottom-0 start-50 translate-middle-x bg-secondary" style="width: 1px;"></div>
                <div class="d-flex flex-column text-left ms-4" style="min-width: 250px; padding-left: 5px;">
                    <div>{{cursorTime || "-"}}</div>
                    <div>{{cursorHeight || "-"}}</div>
                </div>

            </div>
        </div>
        <span class="EditSoundDlg-header">{{$t("media.volumeScale")}}</span>
        <div class="EditSoundDlg-scale">
            <input v-model="volumeScaleLogPercent" type="range" id="EditSoundDlg-imageScale" min="-70" max="70" />
            <span class="EditSoundDlg-scale-label">{{ Math.round(100.0 * (10 ** (volumeScaleLogPercent / 100.0))) }}%</span>
        </div>
        <span class="EditSoundDlg-header">{{$t("media.soundDetails")}}</span>
        <span class="EditSoundDlg-sizeInfo">{{$t("media.soundChangedLength")}} {{currentSoundLength}} {{$t("media.soundSeconds")}}</span>
        <span class="EditSoundDlg-sizeInfo">{{$t("media.soundAverageVolume")}} {{Math.round(volumeRMS * 10 * 100)}}%</span>
        <div class="EditSoundDlg-button-wrapper">
            <b-button class="EditSoundDlg-normalise-button" variant="info" @click="doNormaliseVolume">{{$t("media.soundNormaliseVolume")}}</b-button>
        </div>
    </ModalDlg>
</template>

<script lang="ts">
import Vue, { defineComponent } from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { Cropper } from "vue-advanced-cropper";
import "vue-advanced-cropper/dist/style.css";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { BvModalEvent } from "bootstrap-vue";
import {drawSoundOnCanvas, getRMS, audioBufferToDataURL} from "@/helpers/media";
import {TranslateResult} from "vue-i18n";
import {isMacOSPlatform} from "@/helpers/common";
import { eventBus } from "@/helpers/appContext";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";

const previewImageWidth = 300;
const previewImageHeight = 100;

export default defineComponent({
    name: "EditSoundDlg",

    components:{
        Cropper,
        ModalDlg,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        soundToEdit: {type: AudioBuffer, required: true},
    },
    
    data: function() {
        return {
            imgPreview: "",
            currentSoundLength: "Loading...",
            // We want to allow 0.2 to 5.0 multiplier
            // The actual value on the slider goes from -70 to +70
            // If you put this through 10^(v/100), this turns into roughly 0.2 to 5
            volumeScaleLogPercent: 0,
            volumeRMS: 0,
            crop: {firstSampleIncl: 0, lastSampleExcl: 0, leftPixel: 0, widthPixels: 0},
            stopPreview: null as (() => void) | null,
            cursorTime: undefined as string | undefined,
            cursorHeight: undefined as string | undefined,
        };
    },

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.editSoundDlgComponentAPI = {
            getUpdatedMedia: this.getUpdatedMedia,
        };

        // Register the event listener for the dialog here
        eventBus.on("bv::modal::hide", this.onHideModalDlg as any);
    },

    beforeDestroy(){
        // Remove the event listener for the dialog here, just in case...
        eventBus.off("bv::modal::hide", this.onHideModalDlg as any);
    },

    mounted() {
        window.addEventListener("keydown", this.onKeyDown);
    },

    destroyed() {
        window.removeEventListener("keydown", this.onKeyDown);
    },

    computed:{
        ...mapStores(useStore),

        dlgMsg(): string{
            return this.appStore.simpleModalDlgMsg;
        },
        playStopLabel(): TranslateResult {
            return this.stopPreview == null ? this.$t("media.soundPlay") : this.$t("media.soundStop");
        },
        playStopVariant() : string {
            return this.stopPreview == null ? "success" : "danger";
        },
    },

    methods:{
        isMacOSPlatform,
        onHideModalDlg(event: BvModalEvent, id: string){
            if (this.stopPreview != null) {
                this.stopPreview();
            }
        },
        defaultSize({imageSize, visibleArea} : { imageSize: {width: number, height: number}, visibleArea : {width: number, height: number} }) {
            return {
                width: (visibleArea || imageSize).width,
                height: (visibleArea || imageSize).height,
            };
        },
        change(info : {image: any, coordinates: {left: number, top: number, width: number, height: number}}) {
            this.crop = {
                firstSampleIncl: Math.round(info.coordinates.left / previewImageWidth * this.soundToEdit?.length),
                lastSampleExcl: Math.round((info.coordinates.left + info.coordinates.width) / previewImageWidth * this.soundToEdit?.length),
                leftPixel: info.coordinates.left,
                widthPixels: info.coordinates.width,
            };
            // Changing the crop changes the average volume:
            let volumeFactor = 10 ** (this.volumeScaleLogPercent / 100.0);
            this.volumeRMS = getRMS(this.soundToEdit, volumeFactor, this.crop.firstSampleIncl, this.crop.lastSampleExcl);
            this.currentSoundLength = ((this.crop.lastSampleExcl - this.crop.firstSampleIncl - 1) / this.soundToEdit?.sampleRate).toFixed(3);
        },
        doNormaliseVolume() {
            let rms = getRMS(this.soundToEdit, 1.0, this.crop.firstSampleIncl, this.crop.lastSampleExcl);
            this.volumeScaleLogPercent = Math.max(-70, Math.min(70, Math.round(Math.log10(rms == 0.0 ? 1 : 0.1 / rms) * 100))); 
        },
        doPlayStopPreview() {
            if (this.stopPreview != null) {
                this.stopPreview();
                return;
            }
            
            // Add a play marker:
            const playbackLine = document.createElement("div");
            playbackLine.className = "EditSoundDlg-img-red-line";
            playbackLine.setAttribute("style", "opacity: 0%; left: 0%;");
            
            document.getElementsByClassName("vue-preview__wrapper")?.[0].append(playbackLine);
            
            // We are handling a user-triggered click event, which allows us to play sound:
            const ctx = new AudioContext();
            const src = ctx.createBufferSource();
            src.buffer = this.soundToEdit;
            var gainNode = ctx.createGain();
            const volumeFactor = 10 ** (this.volumeScaleLogPercent / 100.0);
            gainNode.gain.value = volumeFactor;
            gainNode.connect(ctx.destination);

            src.connect(gainNode);
            const startTime = ctx.currentTime;
            let updater = null as number | null;
            this.stopPreview = () => {
                src.stop();
                if (updater != null) {
                    window.clearInterval(updater);
                    updater = null;
                }
                playbackLine.remove();
                this.stopPreview = null;
            };
            src.onended = this.stopPreview;
            let sampleDuration = this.crop.lastSampleExcl - this.crop.firstSampleIncl;
            src.start(0, this.crop.firstSampleIncl / this.soundToEdit?.sampleRate, sampleDuration / this.soundToEdit?.sampleRate);
            
            // Show a red marker animating across as it plays.
            // There isn't a way to get regular callbacks while playing
            // so we must time it ourselves.  We don't bother if the sound is under 300ms:
            updater = window.setInterval(() => {
                const percentage = (ctx.currentTime - startTime) / (sampleDuration / this.soundToEdit.sampleRate) * 100;
                if (percentage >= 100) {
                    this.stopPreview?.();
                }
                else {
                    playbackLine.style.left = percentage + "%";
                    playbackLine.style.opacity = "100%";
                }
            }, 100);
        },
        getUpdatedMedia() : Promise<{code: string, mediaType: string}> {
            const copiedAudioBuffer = new AudioBuffer({
                length: this.crop.lastSampleExcl - this.crop.firstSampleIncl,
                numberOfChannels: this.soundToEdit.numberOfChannels,
                sampleRate: this.soundToEdit.sampleRate,
            });

            const volumeFactor = 10 ** (this.volumeScaleLogPercent / 100.0);
            for (let channel = 0; channel < this.soundToEdit.numberOfChannels; channel++) {
                const channelData = this.soundToEdit.getChannelData(channel);
                const copiedChannelData = copiedAudioBuffer.getChannelData(channel);

                for (let sample = this.crop.firstSampleIncl; sample < this.crop.lastSampleExcl; sample++) {
                    copiedChannelData[sample - this.crop.firstSampleIncl] = channelData[sample] * volumeFactor;
                }
            }
            
            return audioBufferToDataURL(copiedAudioBuffer).then((dataURL) => {
                return {
                    code: "load_sound(\"" + dataURL + "\")", 
                    mediaType: "audio/wav",
                };
            });
        },
        handleMouseMove(event: MouseEvent) {
            const cropper = this.$refs.cropper as InstanceType<typeof Cropper>;
            const imageElement = cropper?.$el.querySelector("img");

            if (cropper && imageElement && imageElement.complete) {
                const rect = imageElement.getBoundingClientRect();
                const offsetX = event.clientX - rect.left;
                const offsetY = event.clientY - rect.top;

                const scaleX = imageElement.width / imageElement.getBoundingClientRect().width;
                const scaleY = imageElement.height / imageElement.getBoundingClientRect().height;

                const imageX = offsetX * scaleX;
                const imageY = offsetY * scaleY;

                if (imageX >= 0 && imageX < imageElement.width && imageY >= 0 && imageY < imageElement.height) {
                    const t = (imageX / previewImageWidth) * this.soundToEdit?.duration;
                    this.cursorTime = t != undefined ? t.toPrecision(3) : undefined;
                    this.cursorHeight = ((imageY / previewImageHeight) * -2 + 1).toFixed(2);
                }
                else {
                    this.cursorTime = undefined;
                    this.cursorHeight = undefined;
                }
            }
        },

        onKeyDown(event: KeyboardEvent) {
            if (this.$refs.cropper && event.key === "c" && ((isMacOSPlatform() && event.metaKey) || (!isMacOSPlatform() && event.ctrlKey))) {
                if (event.shiftKey) {
                    if (this.cursorHeight !== undefined) {
                        navigator.clipboard.writeText(this.cursorHeight);
                    }
                }
                else {
                    if (this.cursorTime !== undefined) {
                        // We don't copy the outer brackets:
                        navigator.clipboard.writeText(this.cursorTime);
                    }
                }
                event.stopPropagation();
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        },
    },
    watch: {
        volumeScaleLogPercent() {
            // Redraw sound with new volume:
            let volumeFactor = 10 ** (this.volumeScaleLogPercent / 100.0);
            this.imgPreview = drawSoundOnCanvas(this.soundToEdit, previewImageWidth, previewImageHeight, volumeFactor);
            this.volumeRMS = getRMS(this.soundToEdit, volumeFactor, this.crop.firstSampleIncl, this.crop.lastSampleExcl);
            // But retain same crop (have to do this after cropper has updated the image):
            Vue.nextTick(() => {
                (this.$refs.cropper as InstanceType<typeof Cropper>).setCoordinates({
                    left: this.crop.leftPixel,
                    width: this.crop.widthPixels,
                    top: 0,
                    height: previewImageHeight,
                });
            });
        },
        soundToEdit() {
            // When image changes (dialog being re-shown), redraw image:
            if (this.soundToEdit != null) {
                let volumeFactor = 10 ** (this.volumeScaleLogPercent / 100.0);
                this.imgPreview = drawSoundOnCanvas(this.soundToEdit, previewImageWidth, previewImageHeight, volumeFactor);
                this.volumeRMS = getRMS(this.soundToEdit, volumeFactor);
                // Reset volume scale:
                this.volumeScaleLogPercent = 0;
                this.crop = {firstSampleIncl: 0, lastSampleExcl: this.soundToEdit.length, leftPixel: 0, widthPixels: previewImageWidth};
                this.currentSoundLength = this.soundToEdit.duration.toFixed(3); 
            }
        },
    },
});
</script>

<style lang="scss">
.edit-sound-cropper {
    min-height: 200px;
}
.edit-sound-cropper, .edit-sound-cropper-background, .edit-sound-cropper-foreground {
    background: white;
}
.edit-sound-cropper .vue-simple-handler {
    background: red;
}
.edit-sound-cropper .vue-simple-line {
    border-color: red;
    border-width: 1px;
}
// Slightly hacky way to turn off top/bottom resize handlers and cursor:
.edit-sound-cropper .vue-handler-wrapper--north,
.edit-sound-cropper .vue-handler-wrapper--west-north,
.edit-sound-cropper .vue-handler-wrapper--east-north,
.edit-sound-cropper .vue-handler-wrapper--south,
.edit-sound-cropper .vue-handler-wrapper--west-south,
.edit-sound-cropper .vue-handler-wrapper--east-south {
    visibility: hidden;
}
.edit-sound-cropper .vue-handler-wrapper--west,
.edit-sound-cropper .vue-handler-wrapper--east {
    height: 70px;
}
.edit-sound-cropper .vue-handler-wrapper--west .vue-simple-handler--west,
.edit-sound-cropper .vue-handler-wrapper--east .vue-simple-handler--east{
    height: 50px;
}
.edit-sound-cropper .vue-line-wrapper--north, .edit-sound-cropper .vue-line-wrapper--south {
    cursor: move;
}
.edit-sound-cropper-image {
    /* Checkerboard background to reveal transparency in image: */
    background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAJ0lEQVQY02Pcv38/AypwcHBAE2FiIAIMRkWM////RxM6cODAcPEdAIlzCFHU4KMkAAAAAElFTkSuQmCC') repeat;
    /* Don't smooth; we want to show the original pixelated image: */
    image-rendering: pixelated;
}
.EditSoundDlg-header {
    display: block;
    text-align: center;
    font-size: 100%;
    padding-top: 15px;
    padding-bottom: 10px;
}
.EditSoundDlg-header:first-child {
    padding-top: 0;
    padding-bottom: 0;
}
.EditSoundDlg-scale > input {
    width: 85%;
    vertical-align: middle;
}
.EditSoundDlg-scale-label {
    font-size: 80%;
    padding-left: 10px;
    vertical-align: middle;
}
.EditSoundDlg-sizeInfo {
    font-size: 80%;
    display: block;
    text-align: center;
}
.EditSoundDlg-button-wrapper {
    text-align: center;
    margin: 5px;
}
.EditSoundDlg-img-red-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: red;
    pointer-events: none; /* Prevents interaction issues */
}
</style>
