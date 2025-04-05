import Vue from "vue";
import App from "@/App.vue";
import {createPinia, PiniaVuePlugin} from "pinia";
import i18n from "@/i18n";
import { BootstrapVue } from "bootstrap-vue";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue/dist/bootstrap-vue.css";
import vBlur from "v-blur";
import { StrypePlatform } from "./types/types";
import scssVars  from "@/assets/style/_export.module.scss";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "./helpers/sharedIdCssWithTests";
import { getAppLangSelectId, getEditorID, getEditorMenuUID, getFrameBodyUID, getFrameContainerUID, getFrameHeaderUID, getFrameLabelSlotsStructureUID, getFrameUID, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId } from "./helpers/editor";

Vue.config.productionTip = false;

// Version of the application to check code's import compatibility in the editor
// note: that is not an offical software version of Strype, just a way to help us dealing with compatibility issues.
// it MUST be kept as an integer matching value
export const AppVersion = "5";
let appPlatform = StrypePlatform.standard;
/* IFTRUE_isMicrobit */
appPlatform = StrypePlatform.microbit;
/* FITRUE_isMicrobit */
export const AppPlatform = appPlatform;

let localeBuildDate = "";
export function getLocaleBuildDate(): string {
    // This method returns the build date, set in vue.config.js.
    // To avoid calling the formatter every time, we keep a local
    // variable with the formatted date value for the web session.
    if(localeBuildDate.length > 0) {
        return localeBuildDate;
    }
    else{
        try{
            const buildDateTicks = new Date(parseInt(process.env.VUE_APP_BUILD_DATE_TICKS as string));
            localeBuildDate = new Date(buildDateTicks).toLocaleDateString(navigator.language);
            return localeBuildDate;
        }
        catch{
            // Just in case something was wrong in our config file!
            return "N/A";
        }
    }
}

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
    getLoadProjectLinkId: getLoadProjectLinkId,
    getLoadFromFSStrypeButtonId: getLoadFromFSStrypeButtonId,
    getAppLangSelectId: getAppLangSelectId,
    getFrameLabelSlotId: getLabelSlotUID,
    getStrypeSaveProjectNameInputId: getStrypeSaveProjectNameInputId,
    getSaveStrypeProjectToFSButtonId: getSaveStrypeProjectToFSButtonId,
};

// Install BootstrapVue
Vue.use(BootstrapVue);

// Use v-blur
Vue.use(vBlur);

// Use a Pinia store (instead of Vuex store, because it handles type inferrence better)
Vue.use(PiniaVuePlugin);
const pinia = createPinia();
Vue.config.productionTip = false;

export const vm = new Vue({
    pinia,
    i18n,
    render: (h) => h(App),
});
vm.$mount("#app");
