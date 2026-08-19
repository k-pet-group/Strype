import * as Vue from "vue";
import { createApp, nextTick } from "vue";
import App from "@/App.vue";
import  {createPinia } from "pinia";
import i18n from "@/i18n";
import "bootstrap/dist/css/bootstrap.css";
import "bootstrap-vue-next/dist/bootstrap-vue-next.css";
import scssVars  from "@/assets/style/_export.module.scss";
import { WINDOW_STRYPE_HTMLIDS_PROPNAME, WINDOW_STRYPE_NEXTTICK_PROPNAME, WINDOW_STRYPE_SCSSVARS_PROPNAME } from "./helpers/sharedIdCssWithTests";
import {getAppLangSelectId, getEditorID, getEditorMenuUID, getFrameBodyUID, getFrameContainerUID, getFrameHeaderUID, getFrameLabelSlotsStructureUID, getFrameUID, getImportFileInputId, getLabelSlotUID, getLoadFromFSStrypeButtonId, getLoadProjectLinkId, getNewProjectLinkId, getSaveProjectLinkId, getSaveStrypeProjectToFSButtonId, getStrypeSaveProjectNameInputId, getShareProjectLinkId} from "./helpers/editor";
import "@imengyu/vue3-context-menu/lib/vue3-context-menu.css";
import ContextMenu from "@imengyu/vue3-context-menu";
import { initialiseAnalytics } from "./helpers/initialiseAnalytics";
import { startVersionCheck } from "./helpers/versionCheck";
import { openIndexedDBConnection, tidyUpDatabaseState } from "@/store/store-db-storage";
import { getEditorTabId } from "@/store/store";
import { showIndexDBError } from "@/helpers/storeMethods";
import { startEagerLoad as startEagerTreeSitterLoad } from "@/helpers/treeSitterPython";

// Loaded eagerly (not on first paste/load use) so parsing is ready immediately -- see
// src/helpers/treeSitterPython.ts. Kicked off here (as early as possible), but only actually
// awaited just before app.mount() below, so it doesn't block anything else in this file from
// starting concurrently in the meantime.
const treeSitterReady = startEagerTreeSitterLoad();
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
import {getPEATabContentContainerDivId} from "./helpers/editor";
// #v-endif

// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
// We have to register the service worker ourselves so that it works in dev.
// (If we used the Vite PWA auto-register it would only work in production.)
const loadServiceWorker = async () => {
    if ("serviceWorker" in navigator) {
        const swUrl = import.meta.env.BASE_URL + "compiled-service-worker.js";
        try {
            const registration = await navigator.serviceWorker.register(swUrl, {
                type: "module",
                scope: import.meta.env.BASE_URL,
            });
            console.log("SW registered:", registration);

            // Logged (temporarily -- see isServiceWorkerChannelResponsive() in shared_helpers.ts)
            // to chase a report of Run mysteriously failing mid-session, in a foregrounded tab,
            // right after a healthy /version check -- the working theory is a new SW version
            // getting installed/activated (e.g. because the dev server rebuilt
            // compiled-service-worker.js) and briefly leaving the page's fetches unintercepted
            // during the handover. A new SW's own console.log calls land in a separate
            // Worker/Service-Worker inspector target rather than the page's console, so log the
            // handover from here instead, where it will show up in the normal page console:
            const logSwState = (label: string, worker: ServiceWorker | null) => {
                console.info(`[SW registration ${new Date().toISOString()}] ${label}: state=${worker?.state ?? "none"} scriptURL=${worker?.scriptURL ?? "n/a"}`);
            };
            logSwState("initial installing", registration.installing);
            logSwState("initial waiting", registration.waiting);
            logSwState("initial active", registration.active);
            registration.addEventListener("updatefound", () => {
                const newWorker = registration.installing;
                console.info(`[SW registration ${new Date().toISOString()}] updatefound -- a new service worker version is being installed`);
                newWorker?.addEventListener("statechange", () => {
                    logSwState("installing worker statechange", newWorker);
                });
            });
        }
        catch (err) {
            console.error(`SW registration failed for ${swUrl} because:`, err);
        }
    }
    else {
        console.error("No service worker support");
    }
};
// Just in case the page has loaded by the time we reach this code:
if (document.readyState === "complete") {
    void loadServiceWorker();
}
else {
    window.addEventListener("load", loadServiceWorker);
}

// #v-endif


// Set the SCSS variables for the tests here
(window as any)[WINDOW_STRYPE_SCSSVARS_PROPNAME] = scssVars;
// Expose Vue's nextTick for the tests here, so they can wait for reactive updates to settle
// instead of a fixed timeout:
(window as any)[WINDOW_STRYPE_NEXTTICK_PROPNAME] = nextTick;
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

// WATCH_ARRAY's auto-deep-and-warn wrapper runs on every Options API watcher over an array
// value even when `deep: true` is already set explicitly, as ours already was -- we've audited
// our one usage and it already matches real (non-compat) Vue 3 behaviour, so disable just this
// check to stop that specific console noise.
//
// Deliberately NOT also disabling ATTR_ENUMERATED_COERCION here: unlike WATCH_ARRAY, disabling
// it changes real runtime behaviour (removes Vue 2's silent auto-coercion of contenteditable/
// draggable/spellcheck) for every v-bind site project-wide, not just the ones we've audited and
// converted to explicit "true"/"false" strings. CI caught this: with the flag disabled, Vue logs
// a genuine console.error ("...will likely lead to runtime errors") for every unfixed site (e.g.
// Frame.vue's draggable="true", AutoCompletion.vue's spellcheck="false"), and
// cypress-fail-on-console-error fails the test on any console.error. Leave the check enabled --
// it's still noisy in the console, but that's the safe trade-off, not a full app-wide audit.
//
// (configureCompat() is only present at runtime, via the "vue" -> "@vue/compat" alias in
// vite.config.mjs -- @vue/compat ships no reachable type declarations under this project's
// moduleResolution, hence the local cast rather than a typed import.)
(Vue as unknown as { configureCompat: (config: Record<string, boolean>) => void }).configureCompat({
    WATCH_ARRAY: false,
});

// New way of creating the App in Vue 3: using createApp()
const app = createApp(App);

// Localisation package
app.use(i18n);

// Store package (Pinia is the default store management library for Vue 3)
app.use(createPinia());
initialiseAnalytics();
startVersionCheck();
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

// Important to do this tidy up before checking the state:
await openIndexedDBConnection()
    .then((initialDBConnection) => tidyUpDatabaseState(getEditorTabId(), initialDBConnection, showIndexDBError)
        .finally(() => initialDBConnection.close()))
    .catch(showIndexDBError);


// Must finish before the app becomes interactive (and hence before any paste/load could be
// triggered) -- see the comment on startEagerLoad() in treeSitterPython.ts for why this await is
// needed and not just decorative:
await treeSitterReady;

// Mount the app
app.mount("#app");
