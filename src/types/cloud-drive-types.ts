/**
 * These types are used with Cloud Drive related things.
 */

import { StrypeSyncTarget } from "./types";

// Small helper function to check if a target is a cloud based target
export const isSyncTargetCloudDrive = (target: StrypeSyncTarget): boolean => {
    return [StrypeSyncTarget.gd, StrypeSyncTarget.od].includes(target);
};

export interface SaveExistingCloudProjectInfos {
    existingFileId: string,
    existingFileName: string
    isCopyFileRequested: boolean,
    resumeProcessCallback: VoidFunction,
}

// State of the API loading for a Cloud Drive.
// Since all Cloud Drive would have an API to handle identification 
// we can have one generic state description for all of them.
export enum CloudDriveAPIState {
    UNLOADED, // default state : the API hasn't been loaded yet
    LOADED, // when the API has been loaded
    FAILED, // when the API failed to load
}

// Status of a Cloud Drive project when we want to share it:
// we want to restore the sharing status to its initial state if we change it through Strype
// but cancel the action (otherwise we could just make the file shared without the user thinking of it)
export enum CloudFileSharingStatus {
    PUBLIC_SHARED, // the file was publicly shared on the Drive
    INTERNAL_SHARED, // the file was internally shared on the Drive (i.e. within the Drive permissions)
    UNKNOWN, // default case (when we haven't checked anything yet)
}

/* Types used in FileIO */
// We maintain a list of files for operability between Skulpt and the Cloud Drives
// so we can easily work with file ID in the Drives.
// This is a per-project object, therefore the file paths in this object are unique.
export interface CloudDriveFile {
    name: string, // The file name (not including path)
    id: string, // The file ID on the Drive
    content: string | Uint8Array, // The file content when opened
}

export interface CloudFileWithMetaData extends CloudDriveFile {
    filePath: string, // The file path as specified in the user code, and "visually" represented in the Drive
    locationId: string, // The file location's Drive folder ID
    readOnly: boolean, // Readonly status of the file in the Drive
}

// A simple Drive folder typing for the Strype project's location folder tree structure
export interface CloudFolder {
    id: string,
    name: string,
    children: CloudFolder[],
}

// Specifics for Google Drive
export interface GDFile extends CloudDriveFile {
    // Capabilities used to evaluate readonly status
    capabilities: { canEdit: boolean, canModifyContent: boolean }, contentRestrictions?: { readOnly?: boolean }
}

// end specifics for Google Drive
/* end types for FileIO */

/* Picker related stuff: mainly unused but designed to be as generic as possible for Cloud Drive APIs that don't offer a picker. */
export enum CloudDriveItemPickerMode {
    // The mode is either set to show files and folders (default) or folders only
    FILES,
    FOLDERS,
}

export enum CloudDriveItemPickerFolderPathResolutionMode {
    // The folder path resolution mode indicates whether the picker should resolves paths using item IDs (default) or item names.
    // This is notably required for looking up a location in the picker.
    BY_ID,
    BY_NAME,
}

export interface CloudDriveItemPickerItem {
    id: string,
    name: string,
    isFolder: boolean, // We need this: an item without children can totally be a folder if that folder is empty
    parentId?: string // expected to be undefined or empty for root elements
    hasVisitedFolder?: boolean // this is for the internal behaviour of the Picker, to know if we need to fetch the folder content (see CloudDriveItemPicker.vue)
}

export interface CTreeItemPickerItem extends CloudDriveItemPickerItem{
    children: CTreeItemPickerItem[],
}
/* end picker related stuff */

/* The template typing of a Cloud Drive component */
// Ensures some of the specific props, data and methods of the component are included in CloudDriveComponent.
// I don't know how to work it out so we get errrors for missing parts within each specific drive's component,
// I've been trying without success and the only way I found to be working and still manageable is to *not* have
// checking working within the component but when the component is used in the caller (in CloudDriveHandler).
// It's not ideal but at least it still allow detecting missing parts during development and allow TS working everywhere.
export interface CloudDriveComponent {
    // Props
    onFileToLoadPicked: (cloudTarget: StrypeSyncTarget, fileId: string, fileName?: string) => Promise<void>,
    onFolderToSaveFilePicked: (cloudTarget: StrypeSyncTarget) => void,
    onFolderToSavePickCancelled: () => void,
    onUnsupportedByStrypeFilePicked: VoidFunction,

    // Data
    isFileLocked: boolean;
    previousCloudFileSharingStatus: CloudFileSharingStatus;

    // Computed Properties    
    driveName: string;
    driveAPIName: string;
    modifiedDataSearchOptionName: string;
    fileMoreFieldsForIO: string,
    fileBasicFieldsForIO: string,

    // Methods
    signIn: (signInCalBack: (cloudTarget: StrypeSyncTarget) => void) => void,
    resetOAuthToken: () => void,
    isOAuthTokenNotSet: () => boolean,
    testCloudConnection: (onSuccessCallBack: VoidFunction, onFailureCallBack: VoidFunction) => void,
    getFolderNameFromId: (folderId: string) => Promise<{name: string, path?: string}>,
    checkDriveStrypeOrOtherFolder: (createIfNone: boolean, checkStrypeFolder: boolean, checkFolderDoneCallBack: (strypeFolderId: string | null) => Promise<void>, failedConnectionCallBack?: () => Promise<void>) => Promise<void>,
    checkIsCloudFileReadonly: (id: string, onGettingReadonlyStatus: (isReadonly: boolean) => void) => void,
    pickFolderForSave: VoidFunction,
    lookForAvailableProjectFileName: (fileLocation: string | undefined, fileName: string, onFileAlreadyExists: (existingFileId: string) => void, onSuccess: VoidFunction, onFailure: VoidFunction) => void,
    openFilePicker: (startingFromFolderId: string | undefined) => Promise<void>,
    loadPickedFileId: (id: string, otherParams: { fileName?: string }, onGettingFileMetadataSucces: (fileNameFromDrive: string, fileModifiedDateTime: string) => void,
        onGettingFileContentSuccess: (fileContent: string) => void, onGettingFileContentFailure: (errorRespStatus: number) => void) => void,
    checkIsFileLocked: (existingFileId: string, onSuccess: VoidFunction, onFailure: VoidFunction) => void,
    doSaveFile: (saveFileId: string | undefined, projetLocation: string, fullFileName: string, fileContent: string, isExplictSave: boolean, onSuccess: (savedFileId: string) => void, onFailure: (errRespStatus: number) => void) => void,
    getCloudAPIStatusWhenLoadedOrFailed: () => Promise<CloudDriveAPIState>,
    getPublicSharedProjectContent: (sharedFileId: string) => Promise<{ isSuccess: boolean, encodedURIFileContent: string, errorMsg: string }>,
    getCurrentCloudFileCurrentSharingStatus: (saveFileId: string) => Promise<CloudFileSharingStatus>,
    shareCloudDriveFile: (saveFileId: string) => Promise<boolean>,
    restoreCloudDriveFileSharingStatus: (saveFileId: string) => Promise<void>,
    getPublicShareLink: (saveFileId: string) => Promise<{ respStatus: number, webLink: string }>,
    searchCloudDriveElements: (elementName: string, elementLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>) => Promise<CloudDriveFile[]>,
    //FileIO
    checkIsCloudDriveFileReadonly: (file: CloudDriveFile) => boolean,
    readFileContentForIO: (fileId: string, isBinaryMode: boolean, filePath: string) => Promise<string | Uint8Array | { success: boolean, errorMsg: string }>,
    writeFileContentForIO: (fileContent: string | Uint8Array, fileInfos: { filePath: string, fileName?: string, fileId?: string, folderId?: string }) => Promise<string>,
}

/** Specific to OneDrive - the Graph types are imported from https://github.com/microsoftgraph/msgraph-typescript-typings*/
export enum OneDriveTokenPurpose {
    INIT_AUTH,
    PICKER_BASE_URL,
    PICKER_OPEN,
    PICKER_ACTIVITY,
    GRAPH_GET_FILE_DETAILS,
    GRAPH_CHECK_FOLDER,
    GRAPH_CREATE_FOLDER,
    GRAPH_SEARCH,
    GRAPH_SAVE_FILE,
    GRAPH_CHECK_SHARING,
    GRAPH_SHARE_FILE,
}

export interface IAuthenticateCommand {
    resource: string;
    command: "authenticate";
    type: "SharePoint" | "OneDrive";
}
type OneDriveExtFilter = "folder" | "site" | "documentLibrary" | "list" | "onenote" | "file" | "media" | "photo" | "video" | "audio" | "document" | "listItem" | "playlist" | "syntexTemplate" | "syntexSnippet" | "syntexField" | `.${string}`;
import { DriveItem } from "@microsoft/microsoft-graph-types";
export type OneDrivePickConfigurationOptions = {
    sdk: "8.0";
    /**
     * Establishes the messaging parameters used to setup the post message communications between
     * picker and host application
     */
    messaging: {
        /**
         * A unique id assigned by the host app to this File Picker instance.
         * This should ideally be a new GUID generated by the host.
         */
        channelId: string;
        /**
         * The host app's authority, used as the target origin for post-messaging.
         */
        origin: string;
        /**
         * Whether or not the host app window will need to identify itself.
         */
        identifyParent?: boolean;
        /**
         * Whether or not the client app must wait for a 'configure' command to be sent by the host before rendering.
         */
        waitForConfiguration?: boolean;
        /**
         * Override timeout for acknowledgement messages.
         */
        acknowledgeTimeout?: number;
        /**
         * Override timeout for the initialization handshake.
         */
        initializeTimeout?: number;
        /**
         * Override timeout for command responses.
         */
        resultTimeout?: number;
    };
    /**
     * Configuration for the entry location to which the File Picker will navigate on load.
     * The File Picker app will prioritize path-based navigation if provided, falling back to other address forms
     * on error (in case of Site redirection or content rename) or if path information is not provided.
     */
    entry: {
        sharePoint?: {
            /**
             * Specify an exact SharePoint content location by path segments.
             */
            byPath?: {
                /**
                 * Full URL to the root of a Web, or server-relative URL.
                 * @example
                 *  'https://contoso-my.sharepoint.com/personal/user_contoso_com'
                 * @example
                 *  '/path/to/web'
                 * @example
                 *  'subweb'
                 */
                web?: string;
                /**
                 * Full URL or path segement to identity a List.
                 * If not preceded with a `/` or a URL scheme, this is assumed to be a list in the specified web.
                 * @example
                 *  'Shared Documents'
                 * @example
                 *  '/path/to/web/Shared Documents'
                 * @example
                 *  'https://contoso.sharepoint.com/path/to/web/Shared Documents'
                 */
                list?: string;
                /**
                 * Path segment to a folder within a list, or a server-relative URL to a folder.
                 * @example
                 *  'General'
                 * @example
                 *  'foo/bar'
                 * @example
                 *  '/path/to/web/Shared Documents/General'
                 */
                folder?: string;
                /**
                 * Auto fallback to root folder if the specified entry sub folder doesn't exist.
                 */
                fallbackToRoot?: boolean;
            };
        };
        /**
         * Indicates that File Picker should start in the Site Pivot
         * This pivot is only supported in OneDrive for Business
         */
        site?: Record<string, never>;
        /**
         * Indicates that File Picker should start in the OAL (My Organization) Pivot
         * This pivot is only supported in OneDrive for Business
         */
        myOrganization?: Record<string, never>;
        /**
         * Indicates that the File Picker should start in the user's OneDrive.
         */
        oneDrive?: {
            /**
             * Specifies that File Picker should start in the user's Files tab.
             */
            files?: {
                /**
                 * Path segment for sub-folder within the user's OneDrive for Business.
                 * @example
                 *  'Pictures'
                 * @example
                 *  '/personal/user_contoso_com/Documents/Attachments'
                 */
                folder?: string;
                /**
                 * Auto fallback to root folder if the specified entry sub folder doesn't exist.
                 */
                fallbackToRoot?: boolean;
            };
            /**
             * Indicates that File Picker should start in the user's recent files.
             */
            recent?: Record<string, never>;
            /**
             * Indicates that File Picker should start in the files shared with the user.
             */
            sharedWithMe?: Record<string, never>;
            /**
             * Indicates that File Picker should start in the user's photos.
             * This pivot is only available in OneDrive for Consumer
             */
            photos?: Record<string, never>;
        };
        sortBy?: {
            /**
             * Name of the field *in SharePoint* on which to sort.
             */
            fieldName: string;
            /**
             * Whether or not to sort in ascending order. Default is `true`.
             */
            isAscending?: boolean;
        };
        filterBy?: {
            /**
             * Name of the field *in SharePoint* on which to filter on.
             */
            fieldName: string;
            /**
             * Filter value
             */
            value: string;
        };
    };
    /**
     * Specifies how to enable a Search behavior.
     */
    search?: {
        enabled: boolean;
    };
    /**
     * Configuration for handling authentication requests from the embedded app.
     * Presence of this object (even if empty) indicates that the host will handle authentication.
     * Omitting this will make the embedded content attempt to rely on cookies.
     */
    authentication?: {
        /**
         * @default true
         */
        enabled?: boolean;
        /**
         * Indicates support for individual token types.
         */
        tokens?: {
            /**
             * @defaultValue true
             */
            graph?: boolean;
            /**
             * @defaultValue true
             */
            sharePoint?: boolean;
            /**
             * @defaultValue false
             */
            substrate?: boolean;
        };
        /**
         * Indicates that the host app can handle 'claims' challenges.
         */
        claimsChallenge?: {
            /**
             * @default false
             */
            enabled?: boolean;
        };
    };
    /**
     * Configures what types of items are allowed to be picked within the experience.
     * Note that the default configuration accounts for the expected authentication capabilities of the host app.
     * Depending on what else is enabled by the host, the host may be expected to provide tokens for more services and scopes.
     */
    typesAndSources?: {
        /**
         * Specifies the general category of items picked. Switches between 'file' vs. 'folder' picker mode,
         * or a general-purpose picker.
         * @default 'all'
         */
        mode?: "files" | "folders" | "all";
        /**
         * `filters` options: file extension, i.e. .xlsx, .docx, .ppt, etc.
         * `filters` options: 'photo', 'folder', 'video', 'documentLibrary'
         */
        filters?: OneDriveExtFilter[];
        /**
         * Specifies a filter for *where* the item may come from.
         */
        locations?: {
            /**
             * Items may only come from the user's OneDrive.
             */
            oneDrive?: Record<string, never>;
            /**
             * Items may only come from a specific location within SharePoint.
             */
            sharePoint?: {
                byPath?: {
                    web?: string;
                    list?: string;
                    folder?: string;
                };
            };
        };
        /**
         * Specifies filtering based on user access level.
         */
        access?: {
            /**
             * Filter for requires user access level for picked items. Default is `'read'`.
             */
            mode?: "read" | "read-write";
        };
        /**
         * Specifies which pivots the user may access while browsing files and lists.
         * Note that if a pivot is disabled here but still targeted in `entry`, it will still be visible in the nav.
         */
        pivots?: {
            /**
             * Show "My files".
             */
            oneDrive?: boolean;
            /**
             * Show "Recent".
             */
            recent?: boolean;
            /**
             * Show "Shared"
             */
            shared?: boolean;
            /**
             * Show "Quick access".
             */
            sharedLibraries?: boolean;
            /**
             * Show "My organization".
             * This pivot is only supported in OneDrive for Business
             */
            myOrganization?: boolean;
            /**
             * Show the site pivot
             * This pivot is only supported in OneDrive for Business
             */
            site?: boolean;
        };
    };
    /**
     * Configuration for what item types may be selected within the picker and returned to the host.
     */
    selection?: {
        /**
         * Controls how selection works within the list.
         * @default 'single' for the Picker.
         */
        mode?: "single" | "multiple" | "pick";
        /**
         * Whether or not to allow the user to maintain a selection across folders and pivots.
         */
        enablePersistence?: boolean;
        /**
         * Whether or not the host expects to be notified whenever selection changes.
         */
        enableNotifications?: boolean;
        /**
         * The maximum number of items which may be selected.
         */
        maximumCount?: number;
        /**
         * A set of items to pre-select.
         */
        sourceItems?: DriveItem[];
    };
    /**
     * Configures how commands behave within the experience.
     */
    commands?: {
        /**
         * Specifies the behavior for file-picking.
         */
        pick?: {
            /**
             * A special action to perform when picking the file, before handing the result
             * back to the host app.
             */
            action?: "select" | "share" | "download" | "move";
            /**
             * A custom label to apply to the button which picks files.
             * This must be localized by the host app if supplied.
             */
            label?: string;
            /**
             * Configures the 'move' action for picking files.
             */
            move?: {
                sourceItems?: DriveItem[];
            };
            /**
             * Configures the 'copy' action for picking files.
             */
            copy?: {
                sourceItems?: DriveItem[];
            };
            /**
             * Configures the 'select' action for picking files.
             */
            select?: {
                /**
                 * Specify if we want download urls to be returned when items are selected.
                 */
                urls?: {
                    download?: boolean;
                };
            };
        };
        /**
         * Specifies the behavior for closing the experience.
         */
        close?: {
            /**
             * A custom label to apply to the 'cancel' button.
             * This must be localized by the host app if supplied.
             */
            label?: string;
        };
        /**
         * Behavior for a "Browse this device" command to pick local files.
         */
        browseThisDevice?: {
            enabled?: boolean;
            label?: string;
            mode?: "upload" | "pick";
        };
        /**
         * Behavior for a "From a link" command to pick from a link.
         */
        fromALink?: {
            enabled?: boolean;
            mode?: "nav" | "pivot";
        };
        /**
         * Behavior for a "Switch account" command.
         */
        switchAccount?: {
            mode?: "host" | "none";
        };
        /**
         * Behavior for a "Manage accounts" command.
         */
        manageAccounts?: {
            mode?: "host" | "none";
            label?: string;
        };
        /**
         * Behavior for "Upload"
         */
        upload?: {
            enabled?: boolean;
        };
        /**
         * Behavior for "Create folder"
         */
        createFolder?: {
            enabled?: boolean;
        };
        /**
         * Behavior for "Filter by" in the column headers.
         */
        filterByColumn?: {
            mode?: "panel" | "menu";
        };
        /**
         * How to handle actions defined by custom formatters.
         */
        customFormatter?: {
            actions?: {
                key: string;
                mode?: "host" | "none";
            }[];
        };
        /**
         * How to handle specified values for `key` in custom commands
         * in the tray, nav, or command bar.
         */
        custom?: {
            actions?: {
                key: string;
                /**
                 * Filters defining what types of items the action operates on.
                 * If specified, the action will only be available for items which match the given filters.
                 */
                filters?: OneDriveExtFilter[];
                /**
                 * How the action is invoked.
                 * 'host': Invokes a `custom` command message against the host app.
                 * 'none': Disables the action.
                 */
                mode?: "host" | "none";
                /**
                 * Selection criteria to which the item applies.
                 */
                selection?: "single" | "multiple" | "current" | "none";
            }[];
        };
    };
    /**
     * Specifies accessibility cues such as auto-focus behaviors.
     */
    accessibility?: {
        /**
         * Whether or not to 'trap focus' within the component. If this is enabled, tab-stops will loop from the last element back to the left navigation automatically.
         * This is useful if the components's frame is hosted as the only content of a modal overlay and focus should not jump to the outside content.
         *
         * @default false
         */
        enableFocusTrap?: boolean;
        /**
         * Whether or not the component should immediately grab focus once the content has loaded.
         *
         * @default true
         */
        trapFocusOnLoad?: boolean;
        /**
         * Whether or not to force the currently-focused element within the component to be highlighted.
         * By default, the focused element is highlighted if the user navigates elements with the keyboard but not when the user interacts via the mouse.
         * However, if a host application launches the component due to keyboard input it should set this flag to `true` to ensure continuity of behavior.
         *
         * @default false
         */
        showFocusOnLoad?: boolean;
    };
    tray?: {
        /**
         * Configures the commands normally used to pick files or close the picker.
         */
        commands?: {
            /**
             * A key to differentiate the command from others.
             */
            key: string;
            /**
             * A custom string for the command.
             * Must be localized by the host.
             */
            label?: string;
            /**
             * The action to perform when the button is clicked.
             */
            action: "pick" | "close" | "custom";
            /**
             * If `'pick'` is specified, which pick behavior to use.
             */
            pick?: {
                action: "select" | "share" | "download" | "move";
            };
            /**
             * Whether the button should show as the primary button.
             */
            primary?: boolean;
            /**
             * Whether the button should remain visible at all times even if unavailable.
             */
            permanent?: boolean;
        }[];
        /**
         * Whether or not the picker tray might be provided by the host instead.
         * @defaultValue 'default'
         */
        mode?: "host" | "default";
        /**
         * Configures a component to render in the picker tray to the left of the commands.
         * @default 'selection-summary'
         */
        prompt?:
        | "keep-sharing"
        | "selection-summary"
        | "selection-editor"
        | "save-as"
        | "none";
        /**
         * Configures use of the 'save-as' prompt.
         */
        saveAs?: {
            /**
             * Default file name to show in 'save-as' prompt.
             */
            fileName?: string;
        };
        /**
         * Settings for handling conflicts with existing file names.
         */
        conflicts?: {
            /**
             * How to handle when a file name matches an existing file.
             * `'warn'` - Show a prompt to ask the user to confirm the choice.
             * `'block'` - Block the choice as an error.
             * `'accept'` - Accept the choice automatically.
             * `'none'` - Do not try to match with existing items.
             */
            mode?: "warn" | "block" | "accept" | "none";
        };
        /**
         * Configures use of the 'keep-sharing' prompt.
         */
        keepSharing?: {
            active?: boolean;
        };
    };
    leftNav?: {
        /**
         * Whether or not a Left Nav should be rendered by the embedded content.
         */
        enabled?: boolean;
        /**
         * Mode of presentation of the nav.
         * If the nav is enabled but this is set to `host`, the embedded app
         * will show a button to ask the host app to show a nav.
         */
        mode?: "host" | "default";
        /**
         * Indicates whether the left nav will be initially modal.
         */
        initialModality?: "modal" | "hidden";

        /**
         * Type of left nav
         */
        preset?: "oneDrive" | "current-site";

        /**
         * Custom commands to insert at the end of the left nav. Will appear before the default set.
         */
        commands?: {
            /**
             * Name to use when notifying the host that the command is being invoked.
             */
            key: string;
            /**
             * Localized string to use for the button text.
             */
            label: string;
            /**
             * Type of action which will be performed when the command is clicked.
             * 'custom': Configured via `commands.custom`.
             */
            action: "custom" | "pick" | "close" | "browse-this-device";
            /**
             * Name of a Fluent icon to use for the command button.
             */
            icon?: string;
        }[];
    };
    /**
     * The theme to use for the file-picker. Will change the coloring.
     * Note: custom theme objects are expected in addition to the strings below
     * @default 'default': Light theme
     */
    theme?: "default" | "dark" | "lists";
    list?: {
        /**
         * A custom override for the initial list layout.
         */
        layout?: {
            /**
             * Sets the preferred starting layout for the initial content.
             */
            type?: "details" | "compact-details" | "tiles";
        };
        /**
         * Configures scrolling behavior within the Picker.
         */
        scrolling?: {
            enableStickyHeaders?: boolean;
        };
    };
    /**
     * Provides a header title for the Picker.
     */
    title?: string;
    /**
     * Specifies customizations for specific pivots
     */
    pivots?: {
        /**
         * Customize the site pivot
         */
        site?: {
            byPath?: {
                /**
                 * Chose the site url to use for this pivot
                 * Required to show the site pivot, if undefined
                 * the site pivot will not be shown
                 */
                web?: string;
            };
        };
    };
};