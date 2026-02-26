<template>
    <div
        v-if="isVisible"
        class="MediaPreviewPopup"
        :style="popupStyle"
        @mouseenter="cancelHidePopup"
        @mouseleave="startHidePopup"
    >
        <div class="MediaPreviewPopup-header">
            <span class="MediaPreviewPopup-header-text" v-html="mediaInfo"></span>
        </div>
        <div class="MediaPreviewPopup-controls">
            <BButton size="sm" variant="outline-success" class="MediaPreviewPopup-header-preview-button" @click="doPreview">{{$t("media.preview")}}</BButton>
            <BButton size="sm" variant="outline-success" class="MediaPreviewPopup-header-download-button" @click="doDownload"><i class="fa fa-download"></i></BButton>
            <BButton size="sm" variant="outline-danger" class="MediaPreviewPopup-header-edit-button" @click="doEdit">{{$t("media.edit")}}</BButton>
        </div>
        <div class="MediaPreviewPopup-img-container-wrapper">
            <div class="MediaPreviewPopup-img-container">
                <img :src="imgDataURL" alt="Media preview" @load="imgLoaded">
                <!-- Style elements are dynamically set from code, don't move them to a class: -->
                <div ref="playbackLine" class="MediaPreviewPopup-img-red-line" style="opacity: 0%; left: 0%;"></div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import {EditImageInDialogFunction, EditSoundInDialogFunction, LoadedMedia} from "@/types/types";
import {PersistentImageManager} from "@/stryperuntime/image_and_collisions";
import {getDateTimeFormatted} from "@/helpers/common";
import {saveAs} from "file-saver";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { BButton } from "bootstrap-vue-next";

// These bits of text are not translated because they are class names:
const HTMLImageClass = "<a href='https://strype.org/doc/library/#strype.graphics.Image' target='_blank'>Image</a>";
const HTMLSoundClass = "<a href='https://strype.org/doc/library/#strype.sound.Sound' target='_blank'>Sound</a>";

export default defineComponent({
    name: "MediaPreviewPopup",

    created() {
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        vueComponentsAPIHandler.mediaPreviewPopupComponentAPI = {
            showPopup: this.showPopup,
            startHidePopup: this.startHidePopup,
        };    
    },

    components: {
        BButton,
    },

    data() {
        return {
            isVisible: false,
            popupStyle: { top: "0px", left: "0px" },
            hideTimeout: undefined as number | undefined,
            imgDataURL: "",
            mediaInfo: "",
            mediaType: "",
            audioBuffer: undefined as AudioBuffer | undefined,
            stopPreviewOnHide : () => {},
            replaceAfterEdit : (() => {}) as ((replacement: {code: string, mediaType: string}) => void),
        };
    },

    inject: ["editImageInDialog", "editSoundInDialog"],
    
    methods: {
        showPopup(event : MouseEvent, media: LoadedMedia, replaceMedia: (replacement: {code: string, mediaType: string}) => void) {
            this.replaceAfterEdit = replaceMedia;
            this.cancelHidePopup();
            this.isVisible = true;
            this.popupStyle = {
                top: `${event.clientY + 5}px`,
                left: `${event.clientX + 5}px`,
            };

            this.mediaType = media.mediaType;
            this.audioBuffer = media.audioBuffer;
            if (media.audioBuffer) {
                // This is not translated because it's a class name:
                this.mediaInfo = `${HTMLSoundClass}<br>${media.audioBuffer.duration.toFixed(2)} ${this.$t("media.soundSeconds")}`;
                this.imgDataURL = media.imageDataURL;
            }
            else {
                if (this.imgDataURL != media.imageDataURL) {
                    this.imgDataURL = media.imageDataURL;
                    this.mediaInfo = HTMLImageClass;
                }
            }
        },
        imgLoaded(event: Event) {
            const previewImgElement = event.target as HTMLImageElement;
            if (this.mediaType.startsWith("image/")) {
                this.mediaInfo = `${HTMLImageClass}<br>${previewImgElement?.naturalWidth} × ${previewImgElement?.naturalHeight} ${this.$t("media.pixels")}`;
            }
        },
        startHidePopup() {
            this.hideTimeout = window.setTimeout(() => {
                this.isVisible = false;
                this.stopPreviewOnHide();
            }, 300);
        },
        cancelHidePopup() {
            window.clearTimeout(this.hideTimeout);
        },
        doPreviewImage(imgDataURL: string) {
            document.getElementById("strypeGraphicsPEATab")?.click();
            this.$nextTick(() => {
                const imgManager: PersistentImageManager | undefined = vueComponentsAPIHandler.peaComponentAPI?.getPersistentImageManager();
                imgManager?.clear();
                // null is passed to clear the preview when the edit dialog is closed:
                if (imgDataURL == null) {
                    vueComponentsAPIHandler.peaComponentAPI?.redrawCanvas();
                    return;
                }
                const checkered = new OffscreenCanvas(800, 600);
                const ctx = checkered.getContext("2d") as OffscreenCanvasRenderingContext2D;
                const squareSize = 15;
                for (let y = 0; y < 600; y += squareSize) {
                    for (let x = 0; x < 800; x += squareSize) {
                        ctx.fillStyle = (x / squareSize + y / squareSize) % 2 === 0 ? "#ccc" : "#fff";
                        ctx.fillRect(x, y, squareSize, squareSize);
                    }
                }
                imgManager?.setBackground(checkered);
                const preview = new Image();
                preview.onload = () => {
                    imgManager?.addPersistentImage(preview);
                    vueComponentsAPIHandler.peaComponentAPI?.redrawCanvas();
                };
                preview.src = imgDataURL;
                vueComponentsAPIHandler.peaComponentAPI?.redrawCanvas();
            });
            this.stopPreviewOnHide = () => {
                vueComponentsAPIHandler.peaComponentAPI?.getPersistentImageManager().clear();
                vueComponentsAPIHandler.peaComponentAPI?.redrawCanvas();
            };
        },
        doPreview() {
            // Stop any existing preview first:
            this.stopPreviewOnHide();

            const audioBuffer = this.audioBuffer;
            if (audioBuffer) {
                // We are handling a user-triggered click event, which allows us to play sound:
                const ctx = new AudioContext();
                const src = ctx.createBufferSource();
                src.buffer = audioBuffer;
                src.connect(ctx.destination);
                const startTime = ctx.currentTime;
                src.start();
                // There isn't a way to get regular callbacks while playing
                // so we must time it ourselves.  We don't bother if the sound is under 300ms:
                let updater = null as number | null;
                if (audioBuffer.length / audioBuffer.sampleRate >= 0.3) {
                    updater = window.setInterval(() => {
                        const percentage = (ctx.currentTime - startTime) / (audioBuffer.length / audioBuffer.sampleRate) * 100;
                        if (percentage >= 100) {
                            this.stopPreviewOnHide();
                        }
                        else {
                            const playbackLine = this.$refs.playbackLine as HTMLDivElement;
                            if (playbackLine) {
                                playbackLine.style.left = percentage + "%";
                                playbackLine.style.opacity = "100%";
                            }
                        }
                    }, 100);
                }
                this.stopPreviewOnHide = () => {
                    src.stop();
                    if (updater != null) {
                        window.clearInterval(updater);
                    }
                    const playbackLine = this.$refs.playbackLine as HTMLDivElement;
                    if (playbackLine) {
                        playbackLine.style.opacity = "0%";
                    }
                };
            }
            else {
                // For images, show a preview on the world:
                this.doPreviewImage(this.imgDataURL);
            }
        },
        doEdit() {
            if (this.audioBuffer) {
                this.doEditSoundInDialog(this.audioBuffer, (replacement : {code: string, mediaType: string}) => {
                    this.replaceAfterEdit(replacement);
                });
            }
            else {
                this.doEditImageInDialog(this.imgDataURL, this.doPreviewImage, (replacement : {code: string, mediaType: string}) => {
                    this.replaceAfterEdit(replacement);
                });
            }
        },
        doDownload() {
            if (this.audioBuffer !== undefined) {
                vueComponentsAPIHandler.peaComponentAPI?.downloadWAV(this.audioBuffer, "strype-sound");
            }
            else if (this.imgDataURL) {
                saveAs(this.imgDataURL, `strype-image_${getDateTimeFormatted(new Date(Date.now()))}.png`);
            }
        },
    },
    
    computed: {
        doEditImageInDialog() : EditImageInDialogFunction {
            return (this as any).editImageInDialog as EditImageInDialogFunction;
        },
        doEditSoundInDialog() : EditSoundInDialogFunction {
            return (this as any).editSoundInDialog as EditSoundInDialogFunction;
        },
    },
});
</script>

<style>
.MediaPreviewPopup {
    position: absolute;
    background: white;
    color: black;
    padding: 5px;
    border: 1px solid #444;
    border-radius: 5px;
    transition: opacity 0.2s;
    filter: drop-shadow(2px 2px #444444cc);
}
.MediaPreviewPopup img {
    max-width: 200px;
    max-height: 200px;
    object-fit: contain;
}
.MediaPreviewPopup-img-container {
    /* Checkerboard background to reveal transparency in image: */
    background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAJ0lEQVQY02Pcv38/AypwcHBAE2FiIAIMRkWM////RxM6cODAcPEdAIlzCFHU4KMkAAAAAElFTkSuQmCC') repeat;
    position: relative;
    /* Important to make div size match img size: */
    display: inline-block;
}
.MediaPreviewPopup-img-container-wrapper {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
}
.MediaPreviewPopup-img-red-line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: red;
    pointer-events: none; /* Prevents interaction issues */
}
.MediaPreviewPopup-header {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
}
.MediaPreviewPopup-header-text {
    flex-grow: 1; /* Allow center item to grow and take available space */
    justify-content: center;
    align-items: center;
    text-align: center;
    color: black;
}
.MediaPreviewPopup-controls {
    display: flex;
    justify-content: space-between;
    margin-bottom: 5px;
}
</style>
