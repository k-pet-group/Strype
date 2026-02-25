
/**
 * Components custom APIs (types)
 * 
 * Vue 3 doesn't expose $root and $children anymore so we can't access the components directly via traversing 
 * the Vue components as we did before.
 * Instead, we can retrieve the different Components' methods or datas or computed props via some "API".
 * 
 * These APIs are created per Component and this typing file allows us to have one place to declare the signatures of the methods.
 * 
 * To make reactivity working and code readable, datas are accessed or updated via proper getter/setter functions.
 * 
 * !! When we use the Component API for instances of components (i.e. components that are not uniquely instanced in Strype)
 * !! then use an intermediate property "forInstance" which acts as a hash map with the API methods for one instance.
 * !! This API property is then expected to be an object of keyed methods (key is the component's id) rather than a method direct.
 * 
 * (The APIs are accessible via the store, see in store why.)
 **/

import { BvModalEvent } from "bootstrap-vue";
import { CloudDriveAPIState, CloudDriveComponent, CloudDriveFile, CloudFileSharingStatus, SaveExistingCloudProjectInfos } from "@/types/cloud-drive-types";
import { AppEvent, Position, SaveRequestReason, StrypePEALayoutMode, StrypeSyncTarget } from "@/types/types";
// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
import { LoadedMedia } from "@/types/types";
import { PersistentImageManager } from "@/stryperuntime/image_and_collisions";
// #v-end-if

export type AppComponentAPI = {
  applyShowAppProgress: (event: AppEvent) => void;
  setStateFromPythonFile: (completeSource: string, fileName: string, lastSaveDate: number, requestFSFileLoadedNotification: boolean, fileLocation?: FileSystemFileHandle) => Promise<void>,
  finaliseOpenShareProject: (message?: {key: string, param: string}) => void,
  onExpandedPythonExecAreaSplitPaneResize: (event: any, calledForResize?: boolean) => void,
  onStrypeCommandsSplitPaneResize: (event: any, useSpecificPEALayout?: StrypePEALayoutMode) => void,
};

export type CommandsComponentAPI = {
  onCommandsSplitterResize: (event: any) => void,
  resetPEACommmandsSplitterDefaultState: () => Promise<void>,
  setCommandsSplitterPane2Size: (v: number) => void,
  // #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
  setPEACommandsSplitterPanesMinSize: (onlyResizePEA?: boolean) => void,
  setIsExpandedPEA: (v: boolean) => void,
  setLogicalORHasPEAExpanded: (v: boolean) => void,
  setIsCommandsSplitterChanged: (v: boolean) => void,
  // #v-endif
};

export type MenuComponentAPI = {
  onStrypeMenuHideModalDlg: (event: BvModalEvent, dlgId: string, forcedProjectName?: string, saveReason ?: SaveRequestReason) => void,
  toggleMenuOnOff: (e: Event | null) => void,
  setCurrentErrorNavIndex: (v: number) => void, 
  goToError: (event: MouseEvent | null, toNext: boolean) => void,
  getCurrentDriveLocation: () => string,
  setRequestSaveAs: (v: boolean) => void,
  saveTargetChoice: (target: StrypeSyncTarget) => void,
  getRequestOpenProjectLater: () => boolean,
  setOpenSharedProjectTarget: (v: StrypeSyncTarget) => void,
  setOpenSharedProjectId: (v: string) => void,
  handleSaveMenuClick: (event: MouseEvent | undefined, saveReason?: SaveRequestReason | undefined) => void,
  onFileLoaded: (fileName: string, lastSaveDate: number, fileLocation?: FileSystemFileHandle | undefined) => void,
}

export type CloudDriveHandlerComponentAPI = {
  getDriveName: () => string,
  getSpecificCloudDriveComponent: (cloudTarget: StrypeSyncTarget) => CloudDriveComponent | null,
  getCloudAPIStatusWhenLoadedOrFailed: (cloudTarget: StrypeSyncTarget) => Promise<CloudDriveAPIState> | undefined,
  setGenericSignInCallBack: (cloudTarget: StrypeSyncTarget, callBackFnToSet: () => void) => void,
  updateSignInStatus: (cloudTarget: StrypeSyncTarget, signed: boolean) => void,
  signInFn: () => void,
  shareCloudDriveFile: (cloudTarget: StrypeSyncTarget) => Promise<boolean>,
  getCurrentCloudFileCurrentSharingStatus: (cloudTarget: StrypeSyncTarget) => Promise<CloudFileSharingStatus>,
  backupPreviousCloudFileSharingStatus: (cloudTarget: StrypeSyncTarget, prevCloudFileSharingStatus: CloudFileSharingStatus) => Promise<void>,
  restoreCloudDriveFileSharingStatus: (cloudTarget: StrypeSyncTarget) => Promise<void> | undefined,
  getPublicShareLink: (cloudTarget: StrypeSyncTarget) => Promise<{ respStatus: number, webLink: string }>,
  getPublicSharedProjectContent: (cloudTarget: StrypeSyncTarget, sharedFileID: string) => Promise<void> | undefined,
  searchCloudDriveElements: (cloudTarget: StrypeSyncTarget, fileName: string, fileLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>) => Promise<CloudDriveFile[]>,
  readFileContentForIO: (cloudTarget: StrypeSyncTarget, fileId: string, isBinaryMode: boolean, filePath: string) => Promise<string | Uint8Array | {success: boolean, errorMsg: string}>,
  writeFileContentForIO: (cloudTarget: StrypeSyncTarget, fileContent: string|Uint8Array, fileInfos: {filePath: string, fileName?: string, fileId?: string, folderId?: string}) => Promise<string>,
  getSaveExistingCloudProjectInfos: () => SaveExistingCloudProjectInfos,
  setSaveExistingCloudProjectInfos: (v: SaveExistingCloudProjectInfos) => void,
  setSaveFileName: (v: string) => void,
  saveFile: (cloudTarget: StrypeSyncTarget, saveReason: SaveRequestReason) => void,
  loadFile: (cloudTarget: StrypeSyncTarget) => void,
}

export type CaretContainerComponentAPI = {
  forInstance: {
    [componentInstanceKey: string]: {
      setAreFramesDraggedOver: (v: boolean) => void,
      getAreDropFramesAllowed: () => boolean,
      setAreDropFramesAllowed: (v: boolean) => void,
      setIsDuplicateDnDAction: (v: boolean) => void,
      closeContextMenu: () => void,
      handleClick: (event: MouseEvent, positionForMenu?: Position) => void,
      doPaste: (pasteAt?: "start" | "end" | "caret") => void,
  }
},
}

export type OpenDemoDlgComponentAPI = {
  getSelectedDemo: () => ({ name : string, demoFile: Promise<string | undefined> } | undefined),
  updateAvailableDemos: () => void,
  shown: () => void,
}

export type LabelSlotsStructureComponentAPI = {
  forInstance: {
    [componentInstanceKey: string]: {
      checkSlotRefactoring: (slotUID: string, stateBeforeChanges: any, options?: {skipCursorSetAndStateSave?: boolean, doAfterCursorSet?: VoidFunction, useFlatMediaDataCode?: boolean}) => void,
      updatePrependText: () => void,
      updatePrependTextAndCheckErrors: () => void,
    },
  },
}

export type LabelSlotComponentAPI = {
  forInstance: {
    [componentInstanceKey: string]: {
      handleUpDown: (event: KeyboardEvent) => boolean,
    },
  }
}

export type GoogleDriveFilePickerComponentAPI = {
  startPicking: (isSaveAction: boolean, initialStrypeFolderId?: string) => void,
}

export type FrameComponentAPI = {
  forInstance: {
    [componentInstanceKey: number]: {
      changeToggledCaretPosition: (clickY: number, frameClickedDiv: HTMLDivElement, selectClick?: boolean | undefined) => void,
      handleClick: (event: MouseEvent, positionForMenu?: Position) => void,
    },
  },
}

export type FrameHeaderComponentAPI = {
  forInstance: {
    [componentInstanceKey: number]: {
      setHasErroneousSlot: (v: boolean) => void,
    }
  }
}

export type AutoCompletionComponentAPI = {
  forInstance: {
    [componentInstanceKey: string]: {
      updateACForModuleImport: (token: string) => Promise<void>,
      updateACForImportFrom: (token: string, module: string) => void,
      updateAC: (frameId: number, token : string | null, context: string) => Promise<void>
    },
  },
}

// #v-ifdef MODE == VITE_STANDARD_PYTHON_MODE
export type PEAComponentAPI = {
  togglePEALayout:(layoutMode: StrypePEALayoutMode, userTriggeredAction?: boolean) => void,
  clear: () => void,
  getIsConsoleAreaShowing: () => boolean,
  getIsGraphicsAreaShowing: () => boolean,
  focusClickRunButton: () => void,
  blurRunButton: () => void,
  getIsTurtleListeningKeyEvents: () => boolean,
  getIsRunningStrypeGraphics: () =>  boolean,
  downloadWAV: (src: AudioBuffer, filenameStem: string) => void,
  redrawCanvas: () => void,
  getPersistentImageManager: () => PersistentImageManager,
};

export type MediaPreviewPopupComponentAPI = {
  showPopup: (event : MouseEvent, media: LoadedMedia, replaceMedia: (replacement: {code: string, mediaType: string}) => void) => void,
  startHidePopup: () => void,
}

export type EditImageDlgComponentAPI = {
  getUpdatedMedia: () => Promise<{code: string; mediaType: string;}>,
}

export type EditSoundDlgComponentAPI = {
  getUpdatedMedia: () => Promise<{code: string; mediaType: string;}>,
}
// #v-end-if
