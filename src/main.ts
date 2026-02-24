import { createApp } from "vue";
import App from "@/App.vue";
import  {createPinia } from "pinia";
import i18n from "@/i18n";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import scssVars  from "@/assets/style/_export.module.scss";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "./helpers/sharedIdCssWithTests";
import {getAppLangSelectId, getEditorID, getEditorMenuUID, getFrameBodyUID, getFrameContainerUID, getFrameHeaderUID, getFrameLabelSlotsStructureUID, getFrameUID, getImportFileInputId, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getNewProjectLinkId, getSaveProjectLinkId, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId, getShareProjectLinkId} from "./helpers/editor";
// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
import {getPEATabContentContainerDivId} from "./helpers/editor";
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
    // #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
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


// Mount the app
app.mount("#app");
