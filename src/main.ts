import { createApp } from "vue";
import App from "@/App.vue";
import  {createPinia } from "pinia";
import i18n from "@/i18n";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import scssVars  from "@/assets/style/_export.module.scss";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "./helpers/sharedIdCssWithTests";
import {getAppLangSelectId, getEditorID, getEditorMenuUID, getFrameBodyUID, getFrameContainerUID, getFrameHeaderUID, getFrameLabelSlotsStructureUID, getFrameUID, getImportFileInputId, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getNewProjectLinkId, getSaveProjectLinkId, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId, getShareProjectLinkId} from "./helpers/editor";
import "@imengyu/vue3-context-menu/lib/vue3-context-menu.css";
import ContextMenu from "@imengyu/vue3-context-menu";
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
/* IFTRUE_isPython */
import {getPEATabContentContainerDivId} from "./helpers/editor";
// #v-endif

// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
// We have to register the service worker ourselves so that it works in dev.
// (If we used the Vite PWA auto-register it would only work in production.)
if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        const swUrl = import.meta.env.BASE_URL + "compiled-service-worker.js";
        try {
            const registration = await navigator.serviceWorker.register(swUrl, {type: "module", scope: import.meta.env.BASE_URL});
            console.log("SW registered:", registration);
        }
        catch (err) {
            console.error(`SW registration failed for ${swUrl} because:`, err);
        }
    });
}
else {
    console.error("No service worker support");
}
// #v-endif


// Set the SCSS variables for the tests here
(window as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME] = scssVars;
// Set the HTML Elements shared IDs for the test here
(window as any)[WINDOW_STRYPE_HTMLIDS_PROPNAME] = {
    getEditorID: getEditorID,
    getEditorMenuUID: getEditorMenuUID,
    getFrameContainerUID: getFrameContainerUID,
    getFrameUID: getFrameUID,
    getFrameHeaderUID: getFrameHeaderUID, 
    getFrameBodyUID: getFrameBodyUID,
    getFrameLabelSlotsStructureUID: getFrameLabelSlotsStructureUID,
    getNewProjectLinkId: getNewProjectLinkId,
    getLoadProjectLinkId: getLoadProjectLinkId,
    getLoadFromFSStrypeButtonId: getLoadFromFSStrypeButtonId,
    getSaveProjectLinkId: getSaveProjectLinkId,
    getShareProjectLinkId: getShareProjectLinkId,
    getImportFileInputId: getImportFileInputId,
    getAppLangSelectId: getAppLangSelectId,
    getFrameLabelSlotId: getLabelSlotUID,
    getStrypeSaveProjectNameInputId: getStrypeSaveProjectNameInputId,
    getSaveStrypeProjectToFSButtonId: getSaveStrypeProjectToFSButtonId,
    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
    getPEATabContentContainerDivId: getPEATabContentContainerDivId,
    // #v-endif
};

// New way of creating the App in Vue 3: using createApp()
const app = createApp(App);

// Localisation package
app.use(i18n);

// Store package (Pinia is the default store management library for Vue 3)
app.use(createPinia());

// Create a directive "blur" to replace the package v-blur, only compatible with Vue 2
const applyBlur = (el: HTMLElement, isBlurred: Boolean) => {
    el.style.filter = (isBlurred) ? "blur(1.5px)" : "none";
    el.style.opacity = (isBlurred) ? "0.5" : "1";
    el.style.transition = (isBlurred) ? "all .2s linear" : "none";
};

app.directive("blur", {
    mounted(el: any, binding: any) {
        applyBlur(el, binding.value);
    },
    updated(el: any, binding: any) {
        applyBlur(el, binding.value);
    },
});

// Context menu package
app.use(ContextMenu);

// Mount the app
app.mount("#app");
