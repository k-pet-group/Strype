<template>
    <ModalDlg
        :dlgId="dlgId"
        :dlg-title="$t('book.dialogTitle')"
        showCloseBtn
        css-class="open-book-dlg"
        :okCustomTitle="$t('buttonLabel.choose')"
        :ok-disabled="!(selectedChapterIndex >= 0 && selectedChapterIndex < chapters.length && selectedChapterProjectIndex >= 0 && selectedChapterProjectIndex < projectsInCurrentChapter.length)" >
        <div>
            <h1>Creative Python Programming with Strype</h1>
            <p>
                Strype has an accompanying <a href="https://strype.org/book/" target="_blank">textbook with a free preview version</a>.  From here you can open the projects described in the book.
            </p>
        </div>
        <div class="d-flex" style="height: 400px;border-top: #aaa solid 1px; padding-top: 1rem;">
            <!-- Left Pane: List Group -->
            <BListGroup class="flex-column overflow-auto" style="width: 30% !important;">
                <BListGroupItem
                    v-for="(item, index) in chapters"
                    :key="index"
                    :active="selectedChapterIndex === index && chapters.length > 1"
                    button
                    class="open-book-dlg-book-group-item"
                >
                    {{ item.name }}
                </BListGroupItem>
            </BListGroup>

            <!-- Right Pane: Dynamic Grid -->
            <div class="flex-grow-1 p-3 overflow-auto">
                <div class="d-flex flex-column">
                    <button
                        v-for="(item, i) in projectsInCurrentChapter"
                        :key="i"
                        :class="{'d-flex': true, 'open-book-dlg-book-item': true, 'open-book-dlg-selected-book-item': selectedChapterProjectIndex === i}"
                        type="button"
                        @click="selectedChapterProjectIndex = i"
                        @dblclick="onDblClick"
                        @keydown.space.self="selectedChapterProjectIndex = i"
                    >
                        <!-- 1x1 transparent image if image is missing: -->
                        <img :src="item.imgURL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='" alt="Preview" class="open-book-dlg-preview flex-shrink-0"/>
                        <div class="d-flex flex-column flex-fill">
                            <span class="open-book-dlg-name">{{item.name}}</span>
                            <span class="open-book-dlg-description" v-html="item.description" />
                        </div>
                    </button>
                </div>
                <div class="d-flex flex-column" v-if="assetsInCurrentChapter.length > 0">
                    <div
                        v-for="(item, i) in assetsInCurrentChapter"
                        :key="i"
                        :class="{'d-flex': true, 'open-book-dlg-book-item': true}"
                        @dblclick="item.assetFileBase64 ? copyItem(item.mimeType, item.assetFileBase64) : null"
                    >
                        <!-- 1x1 transparent image if image is missing: -->
                        <img :src="item.imgURL || 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='" alt="Preview" class="open-book-dlg-asset-preview flex-shrink-0"/>
                        <span class="open-book-dlg-name">{{item.name}}</span>
                        <span v-if="item.assetFileBase64" class="ms-auto" style="cursor: pointer" @click="copyItem(item.mimeType, item.assetFileBase64)"><i class="far fa-copy"></i></span>
                    </div>
                </div>
            </div>
        </div>
    </ModalDlg>
</template>

<script setup lang="ts">
import {nextTick, onMounted, ref} from "vue";
import ModalDlg from "@/components/ModalDlg.vue";
import { BListGroup, BListGroupItem } from "bootstrap-vue-next";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";
import {Demo, DemoAsset, getBuiltinDemos} from "@/helpers/demos";
import {drawSoundOnCanvas} from "@/helpers/media";

interface Chapter {
    name: string;
    content: Promise<{demos: Demo[], assets: DemoAsset[]}>;
}

const chapters: Chapter[] = [
    {name: "Chapter 1", content: getBuiltinDemos("book_projects/chapter01")},
    {name: "Chapter 2", content: getBuiltinDemos("book_projects/chapter02")},
    {name: "Chapter 3", content: getBuiltinDemos("book_projects/chapter03")},
    {name: "Chapter 4", content: getBuiltinDemos("book_projects/chapter04")},
    {name: "Chapter 5", content: getBuiltinDemos("book_projects/chapter05")},
    {name: "Chapter 6", content: getBuiltinDemos("book_projects/chapter06")},
    {name: "Chapter 7", content: getBuiltinDemos("book_projects/chapter07")},
    {name: "Chapter 8", content: getBuiltinDemos("book_projects/chapter08")},
    {name: "Chapter 10", content: getBuiltinDemos("book_projects/chapter10")},
];

const props = defineProps<{
    dlgId: string;
}>();

const selectedChapterIndex = ref(0);
const selectedChapterProjectIndex = ref(0);
const projectsInCurrentChapter = ref<{ name: string, description: string | undefined, imgURL: string | undefined, projectFile: () => Promise<string | undefined> }[]>([]);
const assetsInCurrentChapter = ref<{ name: string, imgURL: string | undefined, mimeType: string, assetFileBase64: string | undefined }[]>([]);

onMounted(() => {
    // It seems that Vue Bootstrap Next do not exposes @click on BListGroupItem therefore we cannot register anything on our items' click event, it will be ignored.
    // Instead, once this component is mounted we manually register the click events here.
    nextTick(() => document.querySelectorAll(".open-book-dlg-book-group-item").forEach((el, index) => {
        el.addEventListener("click", () => changeBookDialogCategory(index));
    }));
});

function copyItem(mimeType: string, assetFileBase64: string) {
    if (mimeType.startsWith("audio")) {
        // Most browsers don't allow copying audio types, so in that case we fallback
        // to the corresponding Strype code:
        navigator.clipboard.writeText(`load_sound("data:${mimeType};base64,${assetFileBase64}")`)
            .catch((err) => {
                console.error("Clipboard write failed:", err);
            });
        return;
    }
    // Convert base64 to binary data:
    const binary = atob(assetFileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType });
    const mediaAndTextItem = new ClipboardItem({ [mimeType]: blob });
    navigator.clipboard.write([mediaAndTextItem])
        .catch((err) => {
            console.error("Clipboard write failed:", err);
        });

    // Cancel the dialog (stops confusing the user about what to do next and also
    // acts as a kind of confirmation that something has happened)
    eventBus.emit(CustomEventTypes.hideStrypeModal, { trigger: "cancel", componentId: props.dlgId });
}

async function changeBookDialogCategory(index: number) {
    selectedChapterIndex.value = index;
    projectsInCurrentChapter.value = [];
    assetsInCurrentChapter.value = [];
    const foundProjects = [];
    const foundAssets = [];
    // Note async: will run each in background
    const content = await chapters[index].content;
    if (selectedChapterIndex.value !== index) {
        // The user has since picked a different chapter; a later call to this function
        // will have already updated (or will soon update) the panes, so discard this
        // now-stale response instead of overwriting what's currently selected.
        return;
    }
    for (const proj of content.demos) {
        let img: Promise<string | undefined>;
        if ("dataURL" in proj.image) {
            img = proj.image.dataURL;
        }
        else if ("imgURL" in proj.image) {
            img = Promise.resolve(proj.image.imgURL);
        }
        else {
            img = Promise.resolve<string | undefined>(undefined);
        }
        const details = {
            name: proj.name,
            description: proj.description,
            imgURL: undefined as (string | undefined),
            projectFile: proj.demoFile,
        };
        foundProjects.push(details);
        // The image is set later once it's streamed:
        img.then((url) => {
            details.imgURL = url;
        });
    }
    for (const [index, asset] of content.assets.entries()) {
        const details = {
            name: asset.name,
            mimeType: asset.mimeType,
            imgURL: undefined as (string | undefined),
            assetFileBase64: undefined as (string | undefined),
        };
        foundAssets.push(details);

        asset.base64().then(async (base64) => {
            // Must replace the object via the array to trigger reactivity:
            const item = assetsInCurrentChapter.value[index];
            if (!item || item.name != details.name) {
                return;
            }
            if (asset.mimeType.startsWith("image/")) {
                item.imgURL = "data:" + asset.mimeType + ";base64," + base64;
            }
            else if (asset.mimeType.startsWith("audio/")) {
                let audioBuffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer);
                item.imgURL = drawSoundOnCanvas(audioBuffer, 200, 50, 1.0, 0.75);
            }
            item.assetFileBase64 = base64;
        });
    }
    projectsInCurrentChapter.value = foundProjects;
    assetsInCurrentChapter.value = foundAssets;
}

function shown() {
    changeBookDialogCategory(0);
}

function getSelectedProject(): ({ name: string, chapter: string, projectFile: Promise<string | undefined> } | undefined) {
    if (selectedChapterProjectIndex.value >= 0 && selectedChapterProjectIndex.value < projectsInCurrentChapter.value.length) {
        const d = projectsInCurrentChapter.value[selectedChapterProjectIndex.value];
        return { name: d.name, projectFile: d.projectFile(), chapter: chapters[selectedChapterIndex.value].name };
    }
    return undefined;
}

function onDblClick() {
    // Triggers the modal's OK event to load the selected example. The click event is fired before the double-click event:
    // selectedBookItemIndex is already set to the right value.
    // We first close the dialog, than simulate a "close with action" in the Menu (since we can't close with "OK" status.)
    eventBus.emit(CustomEventTypes.hideStrypeModal, { trigger: "ok", componentId: props.dlgId });
}

defineExpose({getSelectedProject, shown});
</script>
<style>
.open-book-dlg > .modal-dialog {
    width: auto; /* important to let content control size */
    min-width: min(800px, 80vw);
}

.open-book-dlg-book-item {
    padding: 10px 20px 10px 20px;
    background-color: white;
    border: 0px;
    text-align: left;
}

.open-book-dlg-book-item:hover {
    background-color: #f8f9fa;
}

.open-book-dlg-selected-book-item, .open-book-dlg-selected-book-item:hover {
    background-color: #007bff;
}

img.open-book-dlg-preview {
    width: 120px;
    height: 100px;
    object-fit: contain;
    display: block;
    margin-right: 30px;
}

img.open-book-dlg-asset-preview {
    width: 30px;
    height: 30px;
    object-fit: contain;
    display: block;
    margin-right: 30px;
}

span.open-book-dlg-name {
    font-weight: bold;
    font-size: 125%;
}

.open-book-dlg-selected-book-item span.open-book-dlg-name {
    color: white;
}

span.open-book-dlg-description {
    color: #777;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2; /* 2 lines of text at most */
    -webkit-box-orient: vertical;
}

.open-book-dlg-selected-book-item span.open-book-dlg-description {
    color: #eee;
}

.open-book-dlg-selected-book-item span.open-book-dlg-description a {
    color: white;
}

.open-book-dlg-book-group-item {
    --bs-list-group-item-padding-x:1.25rem;
    --bs-list-group-item-padding-y:0.75rem;
}

.open-book-dlg-add-library-panel input {
    margin-top: 10px;
    margin-bottom: 10px;
}
</style>
