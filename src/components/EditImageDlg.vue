<template>
    <ModalDlg :dlgId="dlgId" :dlgTitle="dlgTitle">
        <span class="EditImageDlg-header">{{$t("media.imageCrop")}}</span>
        <cropper
            ref="cropper"
            class="edit-image-cropper"
            backgroundClass="edit-image-cropper-background"
            foregroundClass="edit-image-cropper-foreground"
            imageClass="edit-image-cropper-image"
            :src="imgToEdit"
            :resizeImage=false
            :moveImage=false
            :default-size="defaultSize"
            minWidth="1"
            minHeight="1"
            @ready="imageLoaded"
            @change="change"
            @mousemove.native="handleMouseMove"            
        ></cropper>
        <div class="d-flex justify-content-center mt" style="margin-top: 10px;">
            <div class="d-flex position-relative" style="font-size: 80%;">
                <div class="d-flex flex-column text-right me-4" style="min-width: 250px; padding-right: 5px;">
                    <div>{{$t(isMacOSPlatform() ? "media.cursorPosMac" : "media.cursorPosWin")}}</div>
                    <div>{{$t(isMacOSPlatform() ? "media.cursorColorMac" : "media.cursorColorWin")}}</div>
                </div>
                <!-- Divider -->
                <div class="position-absolute top-0 bottom-0 start-50 translate-middle-x bg-secondary" style="width: 1px;"></div>
                <div class="d-flex flex-column text-left ms-4" style="min-width: 250px; padding-left: 5px;">
                    <div>{{cursorPos || "-"}}</div>
                    <div>{{cursorColor || "-"}}</div>
                </div>

            </div>
        </div>
        <div class="d-flex justify-content-center align-items-center" style="font-size: 90%; gap: 20px;margin-top: 15px;">
            <b-button class="EditImageDlg-flip-horizontal-button" variant="info" @click="doFlipHorizontal"><i class="fa fa-arrows-h"></i> {{$t("media.imageFlipHorizontal")}}</b-button>
            <b-button class="EditImageDlg-flip-vertical-button" variant="info" @click="doFlipVertical"><i class="fa fa-arrows-v"></i> {{$t("media.imageFlipVertical")}}</b-button>
            <b-button class="EditImageDlg-rotate-button" variant="info" @click="doRotate90"><i class="fa fa-undo fa-flip-horizontal"></i> {{$t("media.imageRotate")}}</b-button>
        </div>
        <span class="EditImageDlg-header">{{$t("media.imageScale")}}</span>
        <div class="EditImageDlg-scale">
            <input v-model="imageScale" type="range" id="EditImageDlg-imageScale" min="1" max="200" />
            <span class="EditImageDlg-scale-label">{{imageScale}}%</span>
        </div>
        <span class="EditImageDlg-header">{{$t("media.imageDetails")}}</span>
        <span class="EditImageDlg-sizeInfo">{{$t("media.imageOriginalSize")}}{{originalImgSize}} {{$t("media.pixels")}}</span>
        <span class="EditImageDlg-sizeInfo">{{$t("media.imageChangedSize")}}{{currentImgSize}} {{$t("media.pixels")}}</span>
    </ModalDlg>
</template>

<script lang="ts">
import Vue from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { Cropper } from "vue-advanced-cropper";
import "vue-advanced-cropper/dist/style.css";
import pica from "pica";
import { useStore } from "@/store/store";
import { mapStores } from "pinia";
import { BvModalEvent } from "bootstrap-vue";
import {debounce} from "lodash";
import {isMacOSPlatform} from "@/helpers/common";

const picaInstance = pica();

export default Vue.extend({
    name: "EditImageDlg",

    components:{
        Cropper,
        ModalDlg,
    },

    props:{
        dlgId: String,
        dlgTitle: String,
        imgToEdit: String, /* Base 64 string */
        showImgPreview:{type: Function}, /* Takes new base64 string as input, null to cancel preview */
    },
    
    data: function() {
        return {
            originalImgSize: "Loading...",
            currentImgSize: "Loading...",
            imageScale: 100,
            cropSize: {left: 0, top: 0, width: 1, height: 1},
            cachedCanvas: undefined as CanvasRenderingContext2D | undefined,
            cursorPos: undefined as string | undefined,
            cursorColor: undefined as string | undefined,
        };
    },

    created() {
        // Register the event listener for the dialog here
        this.$root.$on("bv::modal::hide", this.onHideModalDlg);
        this.updatePreview = debounce(this.updatePreview, 500);
    },

    beforeDestroy(){
        // Remove the event listener for the dialog here, just in case...
        this.$root.$off("bv::modal::hide", this.onHideModalDlg);
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
    },

    methods:{
        isMacOSPlatform,
        onHideModalDlg(event: BvModalEvent, id: string){
            this.showImgPreview(null);
        },
        updatePreview() {
            this.getUpdatedMedia().then((m) => this.showImgPreview(/"([^"]+)"/.exec(m.code)?.[1] ?? "")).catch((err) => {});
        },
        defaultSize({imageSize, visibleArea} : { imageSize: {width: number, height: number}, visibleArea : {width: number, height: number} }) {
            return {
                width: (visibleArea || imageSize).width,
                height: (visibleArea || imageSize).height,
            };
        },
        change(info : {image: any, coordinates: {left: number, top: number, width: number, height: number}}) {
            this.cropSize = info.coordinates; 
            this.updateCurrentSize();
            this.updatePreview();
        },
        imageLoaded() {
            // We have to go fetch the image from the document and ask its size:
            let img = document.getElementsByClassName("edit-image-cropper-image")?.[0] as HTMLImageElement | null;
            if (img) {
                this.originalImgSize = img.naturalWidth + " × " + img.naturalHeight;
                this.cropSize = {left: 0, top: 0, width: img.naturalWidth, height: img.naturalHeight};
                // Set scale so that image is under 1000 pixels:
                if (img.naturalWidth > 1000 || img.naturalHeight > 1000) {
                    this.imageScale = Math.floor(100 * Math.min(1000 / img.naturalWidth, 1000 / img.naturalHeight));
                }
                else {
                    this.imageScale = 100;
                }
                this.updateCurrentSize();
            }
            else {
                // Shouldn't happen, but handle it gracefully in case:
                this.originalImgSize = "Unknown";
                this.currentImgSize = this.originalImgSize;
            }            
        },
        updateCurrentSize() {
            const scale = this.imageScale / 100.0;
            this.currentImgSize = Math.ceil(this.cropSize.width * scale) + " × " + Math.ceil(this.cropSize.height * scale);
            this.updatePreview();
        },
        getUpdatedMedia() : Promise<{code: string, mediaType: string}> {
            const { canvas } = (this.$refs.cropper as Cropper).getResult();
            if (!canvas) {
                return Promise.reject("Loading");
            }
            const scale = this.imageScale / 100.0;
            let width = this.cropSize.width * scale;
            let height = this.cropSize.height * scale;

            const targetCanvas = document.createElement("canvas");
            targetCanvas.width = width;
            targetCanvas.height = height;
            // Skip resize if not needed:
            return (this.imageScale == 100 ? Promise.resolve(canvas.toDataURL()) :
                picaInstance.resize(canvas, targetCanvas, {
                    unsharpAmount: 80,
                    unsharpRadius: 0.6,
                    unsharpThreshold: 2,
                }).then((c) => c.toDataURL("png"))).then((resized) => {
                return Promise.resolve({code: "load_image(\"" + resized + "\")", mediaType: "image/png"});
            });
        },
        handleMouseMove(event: MouseEvent) {
            const cropper = this.$refs.cropper as Cropper;
            const imageElement = cropper?.$el.querySelector("img");

            if (cropper && imageElement && imageElement.complete) {
                const rect = imageElement.getBoundingClientRect();
                const offsetX = event.clientX - rect.left;
                const offsetY = event.clientY - rect.top;

                const scaleX = imageElement.width / imageElement.getBoundingClientRect().width;
                const scaleY = imageElement.height / imageElement.getBoundingClientRect().height;

                const imageX = Math.floor(offsetX * scaleX);
                const imageY = Math.floor(offsetY * scaleY);
                
                if (imageX >= 0 && imageX < imageElement.width && imageY >= 0 && imageY < imageElement.height) {
                    this.cursorPos = `(${imageX}, ${imageY})`;
                    const rgba = this.getPixelColor(imageElement, imageX, imageY);
                    this.cursorColor = `Color(${rgba[0]}, ${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
                }
                else {
                    this.cursorPos = undefined;
                    this.cursorColor = undefined;
                }
            }
        },

        getPixelColor(imgElement : HTMLImageElement, x : number, y : number) : Uint8ClampedArray {
            if (!this.cachedCanvas) {
                // Create canvas
                const canvas = document.createElement("canvas");
                canvas.width = imgElement.naturalWidth;
                canvas.height = imgElement.naturalHeight;
                this.cachedCanvas = canvas.getContext("2d") as CanvasRenderingContext2D;
                // Draw the image at original size
                this.cachedCanvas.drawImage(imgElement, 0, 0);
            }
            return this.cachedCanvas.getImageData(x, y, 1, 1).data;
        },
        
        onKeyDown(event: KeyboardEvent) {
            if (this.$refs.cropper && event.key === "c" && ((isMacOSPlatform() && event.metaKey) || (!isMacOSPlatform() && event.ctrlKey))) {
                if (event.shiftKey) {
                    if (this.cursorColor !== undefined) {
                        navigator.clipboard.writeText(this.cursorColor);
                    }
                }
                else {
                    if (this.cursorPos !== undefined) {
                        // We don't copy the outer brackets:
                        navigator.clipboard.writeText(this.cursorPos.replaceAll(/[()]/g, ""));
                    }
                }
                event.stopPropagation();
                event.stopImmediatePropagation();
                event.preventDefault();
            }
        },

        doFlipHorizontal() {
            (this.$refs.cropper as Cropper).flip(true, false);
        },
        doFlipVertical() {
            (this.$refs.cropper as Cropper).flip(false, true);
        },
        doRotate90() {
            (this.$refs.cropper as Cropper).rotate(90);
        },
    },
    watch: {
        imageScale() {
            this.updateCurrentSize();
        },
        imgToEdit() {
            // When image changes (dialog being re-shown), reset scale:
            this.imageScale = 100;
        },
    },
});
</script>

<style lang="scss">
.edit-image-cropper {
    min-height: 200px;
    max-height: 300px;
}
.edit-image-cropper, .edit-image-cropper-background, .edit-image-cropper-foreground {
    background: white;
}
.edit-image-cropper .vue-simple-handler {
    background: red;
}
.edit-image-cropper .vue-simple-line {
    border-color: red;
}
.edit-image-cropper-image {
    /* Checkerboard background to reveal transparency in image: */
    background: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAIAAADZF8uwAAAACXBIWXMAAC4jAAAuIwF4pT92AAAAJ0lEQVQY02Pcv38/AypwcHBAE2FiIAIMRkWM////RxM6cODAcPEdAIlzCFHU4KMkAAAAAElFTkSuQmCC') repeat;
    /* Don't smooth; we want to show the original pixelated image: */
    image-rendering: pixelated;
}
.EditImageDlg-header {
    display: block;
    text-align: center;
    font-size: 100%;
    padding-top: 15px;
    padding-bottom: 10px;
}
.EditImageDlg-header:first-child {
    padding-top: 0;
}
.EditImageDlg-scale > input {
    width: 85%;
    vertical-align: middle;
}
.EditImageDlg-scale-label {
    font-size: 80%;
    padding-left: 10px;
    vertical-align: middle;
}
.EditImageDlg-sizeInfo {
    font-size: 80%;
    display: block;
    text-align: center;
}
</style>
