/**
 * The parts of a Git provider's CloudDriveComponent (see GitHubComponent and GitLabComponent) that don't depend on the provider:
 * they use the provider through its GitProviderAPI. What remains in each provider's component is mainly the signing in.
 */
import type GitFilePickerDlg from "@/components/GitFilePickerDlg.vue";
import i18n from "@/i18n";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes, getAppSimpleMsgDlgId } from "@/helpers/editor";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { useStore } from "@/store/store";
import { CloudDriveAPIState, CloudDriveComponent, CloudDriveFile, CloudFileSharingStatus } from "@/types/cloud-drive-types";
import { GitAuthExpiredError, GitFileIdStruct, GitFilePickerQueries, GitHttpError, GitProviderAPI, GitProviderComponent, GitRepository, parseGitFileId, toGitFileId } from "@/types/git-provider-types";
import { StrypeSyncTarget } from "@/types/types";
import { Ref, ref, shallowRef } from "vue";

// The props of a Git provider's component, given by CloudDriveHandler (as for any Cloud Drive)
export interface GitProviderComponentProps {
    onFileToLoadPicked: (cloudTarget: StrypeSyncTarget, fileId: string, fileName?: string) => void,
    onFolderToSaveFilePicked: (cloudTarget: StrypeSyncTarget) => void,
    onFolderToSavePickCancelled: VoidFunction,
    onUnsupportedByStrypeFilePicked: VoidFunction,
}

// What useGitProvider() gives to the provider's component
export interface GitProvider<Auth> {
    // For the component's GitFilePickerDlg
    filePickerQueries: GitFilePickerQueries,
    onFilePicked: (file: GitFileIdStruct) => void,
    // To call by the provider's signIn() with its connection attempt, which resolves with null if the user
    // is connected but Strype still can't access anything (e.g. the GitHub app isn't installed).
    completeSignIn: (connection: Promise<Auth | null>, callback: (cloudTarget: StrypeSyncTarget) => void) => void,
    // Returns what the component must give to defineExpose(), with its own signIn().
    toExposed: (signIn: (callback: (cloudTarget: StrypeSyncTarget) => void) => void) => CloudDriveComponent & GitProviderComponent,
}

export function useGitProvider<Auth>(options: {
    target: StrypeSyncTarget,
    driveName: string,
    driveAPIName: string,
    api: GitProviderAPI<Auth>,
    props: GitProviderComponentProps,
    filePicker: Ref<InstanceType<typeof GitFilePickerDlg> | null>,
}): GitProvider<Auth> {
    const {target, driveName, driveAPIName, api, props, filePicker} = options;
    const appStore = useStore();

    // (shallow: the provider's API updates the connection data in place when it renews the token)
    const oauthToken = shallowRef<Auth | null>(null);
    const isFileLocked = ref(false);
    const previousCloudFileSharingStatus = ref(CloudFileSharingStatus.UNKNOWN);

    const modifiedDataSearchOptionName = ""; //TODO
    const fileMoreFieldsForIO = ""; //TODO
    const fileBasicFieldsForIO = ""; //TODO

    function getAuth(): Auth {
        if(oauthToken.value == null){
            throw new GitAuthExpiredError(i18n.global.t("errorMessage.gitNotConnected", {providername: driveName}));
        }
        return oauthToken.value;
    }

    // For the file picker dialog (GitFilePickerDlg)
    const filePickerQueries: GitFilePickerQueries = {
        listRepositories: () => api.listRepositories(getAuth()),
        listBranches: (repoId) => api.listBranches(getAuth(), repoId),
        listFolderContent: (repoId, branch, folderPath) => api.listFolderContent(getAuth(), repoId, branch, folderPath),
    };

    function onFilePicked(file: GitFileIdStruct) {
        props.onFileToLoadPicked(target, toGitFileId(file), file.fileName);
    }

    function completeSignIn(connection: Promise<Auth | null>, callback: (cloudTarget: StrypeSyncTarget) => void) {
        connection.then((auth) => {
            if(auth == null){
                vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.updateSignInStatus(target, false);
                return;
            }
            oauthToken.value = auth;
            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.updateSignInStatus(target, true);
            callback(target);
        }, (error) => {
            vueComponentsAPIHandler.cloudDriveHandlerComponentAPI?.updateSignInStatus(target, false);
            appStore.simpleModalDlgMsg = i18n.global.t("errorMessage.gitConnectionFailed", {providername: driveName, error: (error as Error).message});
            eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
        });
    }

    function isOAuthTokenNotSet(){
        return oauthToken.value == null;
    }

    function testCloudConnection(onSuccessCallback: () => void, onFailureCallBack: () => void){
        if(oauthToken.value == null){
            onFailureCallBack();
            return;
        }
        api.isConnectionValid(oauthToken.value)
            .then((isValid) => (isValid) ? onSuccessCallback() : onFailureCallBack(), () => onFailureCallBack());
    }

    function getCloudAPIStatusWhenLoadedOrFailed(): Promise<CloudDriveAPIState>{
        // There is no API loading for Git providers, we can return "Loaded" right away.
        return Promise.resolve(CloudDriveAPIState.LOADED);
    }

    function resetOAuthToken() {
        oauthToken.value = null;
    }

    // For a Git provider, the equivalent of a Drive's folder location is a repository: its ID is its full name (see GitRepository).
    function getFolderNameFromId(folderId: string): Promise<{name: string, path?: string}> {
        return Promise.resolve({name: folderId, path: folderId});
    }

    async function checkDriveStrypeOrOtherFolder(createIfNone: boolean, checkStrypeFolder: boolean, checkFolderDoneCallBack: (strypeFolderId: string | null) => Promise<void>, failedConnectionCallBack?: () => Promise<void>): Promise<void> {
        // Check if a "Strype" repository (when checkStrypeFolder is true) or the state's repository (otherwise) is accessible to the user.
        // Returns the repository's full name, or null if it couldn't be found.
        if(oauthToken.value == null){
            return failedConnectionCallBack?.();
        }
        let accessibleRepositories: GitRepository[];
        try{
            accessibleRepositories = await api.listRepositories(oauthToken.value);
        }
        catch(error){
            if(error instanceof GitAuthExpiredError && failedConnectionCallBack){
                return failedConnectionCallBack();
            }
            return checkFolderDoneCallBack(null);
        }
        // (repository names are case insensitive; if several owners/groups have a "Strype" repository, we take the first one)
        const foundRepository = accessibleRepositories.find((repository) => (checkStrypeFolder)
            ? repository.fullName.split("/").pop()?.toLowerCase() == "strype"
            : repository.fullName == appStore.strypeProjectLocation);
        //TODO (for saving): create the Strype repository if it doesn't exist and createIfNone is set
        return checkFolderDoneCallBack(foundRepository?.fullName ?? null);
    }

    function checkIsCloudFileReadonly(id: string, onGettingReadonlyStatus: (isReadonly: boolean) => void) {
        // A file is read-only if the user can't push to its repository
        const gitFileId = parseGitFileId(id);
        if(oauthToken.value == null || gitFileId == null){
            return;
        }
        api.canPushToRepository(oauthToken.value, gitFileId.repoId)
            .then((canPush) => onGettingReadonlyStatus(!canPush), () => {
                // We can't tell, saving will fail later if the file is indeed read-only
            });
    }

    function pickFolderForSave() {
        //TODO
    }

    function lookForAvailableProjectFileName(fileLocation: string | undefined, fileName: string, onFileAlreadyExists: (existingFileId: string) => void, onSuccess: VoidFunction, onFailure: VoidFunction) {
        //TODO
    }

    function openFilePicker(startingFromFolderId: string | undefined): Promise<void> {
        // The "folder" is a repository (see getFolderNameFromId()): the picker starts from it if given, or else from the repository used last.
        return filePicker.value?.open(startingFromFolderId) ?? Promise.resolve();
    }

    async function loadPickedFileId(id: string, otherParams: { fileName?: string }, onGettingFileMetadataSucces: (fileNameFromDrive: string, fileModifiedDateTime: string) => void, onGettingFileContentSuccess: (fileContent: string) => void, onGettingFileContentFailure: (errorRespStatus: number) => void, onFinally: VoidFunction) {
        const gitFileId = parseGitFileId(id);
        if(oauthToken.value == null || gitFileId == null){
            // (we use 404 for an ID that isn't a Git file ID, as we can't find such a file anyway)
            onGettingFileContentFailure((oauthToken.value == null) ? 401 : 404);
            onFinally();
            return;
        }
        const {repoId, branchId, path, fileName} = gitFileId;
        try{
            // Git doesn't keep a modification date for files, we use the date of the last commit that changed the file.
            // Both queries are independent, so we run them together.
            const [lastCommitDate, fileContent] = await Promise.all([
                api.getFileLastCommitDate(oauthToken.value, repoId, branchId, path),
                api.getFileContent(oauthToken.value, repoId, branchId, path),
            ]);
            // The equivalent of a Drive's folder location is a repository (see getFolderNameFromId())
            appStore.strypeProjectLocation = repoId;
            appStore.strypeProjectLocationAlias = repoId;
            appStore.strypeProjectLocationPath = repoId;
            // Keep the branch and repository selected in the picker for the next time it's opened
            filePicker.value?.rememberSelection(repoId, branchId);
            onGettingFileMetadataSucces(fileName, lastCommitDate);
            onGettingFileContentSuccess(fileContent);
        }
        catch(error){
            onGettingFileContentFailure((error instanceof GitHttpError) ? error.status : ((error instanceof GitAuthExpiredError) ? 401 : 0));
        }
        finally{
            onFinally();
        }
    }

    function checkIsFileLocked(existingFileId: string, onSuccess: VoidFunction, onFailure: VoidFunction) {
        //TODO
    }

    function doSaveFile(saveFileId: string | undefined, projetLocation: string, fullFileName: string, fileContent: string, isExplictSave: boolean, onSuccess: (savedFileId: string) => void, onFailure: (errRespStatus: number) => void) {
        //TODO
    }

    function getPublicSharedProjectContent(sharedFileId: string): Promise<{ isSuccess: boolean, projectName: string, decodedURIFileContent: string, errorMsg: string }> {
        //TODO
        return Promise.reject("Not implemented yet");
    }

    function getCurrentCloudFileCurrentSharingStatus(saveFileId: string): Promise<CloudFileSharingStatus> {
        //TODO
        return Promise.resolve(CloudFileSharingStatus.UNKNOWN);
    }

    function shareCloudDriveFile(saveFileId: string): Promise<boolean> {
        //TODO
        return Promise.resolve(false);
    }

    function restoreCloudDriveFileSharingStatus(saveFileId: string): Promise<void> {
        //TODO
        return Promise.resolve();
    }

    function getPublicShareLink(saveFileId: string): Promise<{ respStatus: number, webLink: string }> {
        //TODO
        return Promise.reject("Not implemented yet");
    }

    function searchCloudDriveElements(elementName: string | undefined, elementLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]> {
        //TODO
        return Promise.resolve([]);
    }

    // FileIO
    function checkIsCloudDriveFileReadonly(file: CloudDriveFile): boolean {
        //TODO
        return false;
    }

    function readFileContentForIO(fileId: string, filePath: string): Promise<Uint8Array> {
        //TODO
        return Promise.reject("Not implemented yet");
    }

    function writeFileContentForIO(fileContent: string | Uint8Array, fileInfos: { filePath: string, fileName: string, folderId: string } | { filePath: string, fileId: string }): Promise<string> {
        //TODO
        return Promise.reject("Not implemented yet");
    }

    // A <script setup> component is "closed": CloudDriveHandler can only access (via its template ref)
    // what is explicitly exposed, so everything from CloudDriveComponent must be listed: the return type makes TS check that.
    // (Note: the accessors must stay accessors, so this object must not be spread.)
    function toExposed(signIn: (callback: (cloudTarget: StrypeSyncTarget) => void) => void): CloudDriveComponent & GitProviderComponent {
        return {
            // Props
            onFileToLoadPicked: props.onFileToLoadPicked,
            onFolderToSaveFilePicked: props.onFolderToSaveFilePicked,
            onFolderToSavePickCancelled: props.onFolderToSavePickCancelled,
            onUnsupportedByStrypeFilePicked: props.onUnsupportedByStrypeFilePicked,
            // Methods from CloudDriverHandler
            signIn,
            isOAuthTokenNotSet,
            testCloudConnection,
            getCloudAPIStatusWhenLoadedOrFailed,
            checkDriveStrypeOrOtherFolder,
            checkIsCloudDriveFileReadonly,
            checkIsCloudFileReadonly,
            checkIsFileLocked,
            doSaveFile,
            driveAPIName,
            driveName,
            fileBasicFieldsForIO,
            fileMoreFieldsForIO,
            getCurrentCloudFileCurrentSharingStatus,
            getFolderNameFromId,
            getPublicSharedProjectContent,
            getPublicShareLink,
            get isFileLocked() {
                return isFileLocked.value;
            },
            set isFileLocked(value: boolean) {
                isFileLocked.value = value;
            },
            loadPickedFileId,
            lookForAvailableProjectFileName,
            modifiedDataSearchOptionName,
            openFilePicker,
            pickFolderForSave,
            get previousCloudFileSharingStatus() {
                return previousCloudFileSharingStatus.value;
            },
            set previousCloudFileSharingStatus(value: CloudFileSharingStatus) {
                previousCloudFileSharingStatus.value = value;
            },
            readFileContentForIO,
            resetOAuthToken,
            restoreCloudDriveFileSharingStatus,
            searchCloudDriveElements,
            shareCloudDriveFile,
            writeFileContentForIO,
        };
    }

    return {filePickerQueries, onFilePicked, completeSignIn, toExposed};
}
