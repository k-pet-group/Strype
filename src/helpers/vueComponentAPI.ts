import { AppComponentAPI, AutoCompletionComponentAPI, CaretContainerComponentAPI, CloudDriveHandlerComponentAPI, CommandsComponentAPI, EditImageDlgComponentAPI, EditSoundDlgComponentAPI, FrameComponentAPI, FrameHeaderComponentAPI, GoogleDriveFilePickerComponentAPI, LabelSlotComponentAPI, LabelSlotsStructureComponentAPI, MediaPreviewPopupComponentAPI, MenuComponentAPI, OpenDemoDlgComponentAPI, PEAComponentAPI } from "@/types/vue-component-api-types";

/** Application-wide exposed Vue Components methods and accessors to data/computer props ( --> "API")
 * Done here because some of those Components are ALSO used in the store and in helpers scripts,
 * and it is just easier to have one same mechanism across the application than 2 ways 
 * (the other way is using provide/inject, which would be suitable only for Components calls).
 * 
 * Externalising the components as APIs is because Vue 3 doesn't expose $children anymore.
 * 
 * The components MUST set their API content when they are created.
 */
export const vueComponentsAPIHandler = {
    appComponentAPI: null as null | AppComponentAPI,
    commandsComponentAPI: null as null | CommandsComponentAPI,
    menuComponentAPI: null as null | MenuComponentAPI,
    cloudDriveHandlerComponentAPI: null as null | CloudDriveHandlerComponentAPI,            
    caretContainerComponentAPI: null as null | CaretContainerComponentAPI,
    openDemoDlgComponentAPI: null as null | OpenDemoDlgComponentAPI,
    labelSlotsStructureComponentAPI: null as null | LabelSlotsStructureComponentAPI,
    labelSlotComponentAPI: null as null | LabelSlotComponentAPI,
    googleDriveFilePickerComponentAPI: null as null | GoogleDriveFilePickerComponentAPI,
    frameComponentAPI: null as null | FrameComponentAPI,
    frameHeaderComponentAPI: null as null | FrameHeaderComponentAPI,
    autoCompletionComponentAPI: null as null | AutoCompletionComponentAPI,
    // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
    peaComponentAPI: null as null | PEAComponentAPI,
    mediaPreviewPopupComponentAPI:null as null | MediaPreviewPopupComponentAPI,
    editImageDlgComponentAPI: null as null | EditImageDlgComponentAPI,
    editSoundDlgComponentAPI: null as null | EditSoundDlgComponentAPI,
    // #v-endif
};
