/**
 * The parts of a Git provider's CloudDriveComponent (see GitHubComponent and GitLabComponent) that don't depend on the provider:
 * they use the provider through its GitProviderAPI. What remains in each provider's component is mainly the signing in.
 */
import type GitFilePickerDlg from "@/components/GitFilePickerDlg.vue";
import i18n from "@/i18n";
import { eventBus } from "@/helpers/appContext";
import { strypeFileExtension } from "@/helpers/common";
import { CustomEventTypes, getAppSimpleMsgDlgId } from "@/helpers/editor";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { useStore } from "@/store/store";
import { CloudDriveAPIState, CloudDriveComponent, CloudDriveFile, CloudFileSharingStatus } from "@/types/cloud-drive-types";
import { getGitFileLocation, getGitLocationLabel, compareGitRepositories, findStrypeRepository, GitAuthExpiredError, GitFileIdStruct, GitFilePickerQueries, GitHttpError, GitLocationStruct, GitProviderAPI, GitProviderComponent, GitRepository, GitSaveChoice, parseGitFileId, parseGitLocationId, strypeRepositoryName, toGitFileId, toGitLocationId } from "@/types/git-provider-types";
import { StrypeSyncTarget } from "@/types/types";
import { Ref, ref, shallowRef } from "vue";

// The commit message proposed when saving, for example "File change (2026-10-12 14:30)" (the date is in the user's time zone).
export function getDefaultGitCommitMessage(): string {
    const now = new Date(), pad = (value: number) => value.toString().padStart(2, "0");
    const dateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    return i18n.global.t("appMessage.gitDefaultCommitMessage", {datetime: dateTime});
}

// The props of a Git provider's component, given by CloudDriveHandler (as for any Cloud Drive)
export interface GitProviderComponentProps {
    onFileToLoadPicked: (cloudTarget: StrypeSyncTarget, fileId: string, fileName?: string) => void,
    onFolderToSaveFilePicked: (cloudTarget: StrypeSyncTarget, commitMessage?: string) => void,
    onFolderToSavePickCancelled: VoidFunction,
    onUnsupportedByStrypeFilePicked: VoidFunction,
}

// What useGitProvider() gives to the provider's component
export interface GitProvider<Auth> {
    // For the component's GitFilePickerDlg
    filePickerQueries: GitFilePickerQueries,
    onFilePicked: (file: GitFileIdStruct) => void,
    onSaveChosen: (choice: GitSaveChoice) => void,
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

    // The repositories the user can access, in the order they are shown (see compareGitRepositories())
    async function listRepositories(auth: Auth): Promise<GitRepository[]> {
        return (await api.listRepositories(auth)).sort(compareGitRepositories);
    }

    // For the file picker dialog (GitFilePickerDlg)
    const filePickerQueries: GitFilePickerQueries = {
        listRepositories: () => listRepositories(getAuth()),
        listBranches: (repoId) => api.listBranches(getAuth(), repoId),
        listFolderContent: (repoId, branch, folderPath) => api.listFolderContent(getAuth(), repoId, branch, folderPath),
    };

    function onFilePicked(file: GitFileIdStruct) {
        props.onFileToLoadPicked(target, toGitFileId(file), file.fileName);
    }

    function setProjectLocation(location: GitLocationStruct) {
        // The equivalent of a Drive's folder location is a folder of a repository's branch (see getFolderNameFromId())
        appStore.strypeProjectLocation = toGitLocationId(location);
        appStore.strypeProjectLocationAlias = getGitLocationLabel(location);
        appStore.strypeProjectLocationPath = getGitLocationLabel(location);
    }

    async function onSaveChosen(choice: GitSaveChoice) {
        // The chosen folder becomes the project's location, which the save continues with (with the commit message).
        // If the user saves into the "Strype" repository and it doesn't exist yet, we create it first.
        let location = choice.location;
        if(choice.createStrypeRepository){
            if(oauthToken.value == null){
                props.onFolderToSavePickCancelled();
                return;
            }
            vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: true, message: i18n.global.t("appMessage.gitCreatingRepository", {name: strypeRepositoryName})});
            try{
                const createdRepository = await api.createRepository(oauthToken.value, strypeRepositoryName);
                // (a new repository is empty: its first commit creates the default branch, or the one chosen in the dialog if the provider doesn't tell)
                location = {...location, repoId: createdRepository.fullName, branchId: createdRepository.defaultBranch || location.branchId};
            }
            catch(error){
                appStore.simpleModalDlgMsg = i18n.global.t("errorMessage.gitRepositoryCreationFailed", {name: strypeRepositoryName, providername: driveName, error: (error as Error).message});
                eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
                props.onFolderToSavePickCancelled();
                return;
            }
            finally{
                vueComponentsAPIHandler.appComponentAPI?.applyShowAppProgress({requestAttention: false});
            }
        }
        setProjectLocation(location);
        props.onFolderToSaveFilePicked(target, choice.commitMessage);
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

    // For a Git provider, the equivalent of a Drive's folder location is a folder of a repository's branch: its ID is a Git location ID.
    function getFolderNameFromId(folderId: string): Promise<{name: string, path?: string}> {
        const gitLocation = parseGitLocationId(folderId);
        const label = (gitLocation) ? getGitLocationLabel(gitLocation) : folderId;
        return Promise.resolve({name: label, path: label});
    }

    async function checkDriveStrypeOrOtherFolder(createIfNone: boolean, checkStrypeFolder: boolean, checkFolderDoneCallBack: (strypeFolderId: string | null) => Promise<void>, failedConnectionCallBack?: () => Promise<void>): Promise<void> {
        // Check if a "Strype" repository (when checkStrypeFolder is true) or the state's location's repository (otherwise) is accessible to the user.
        // Returns a location ID (the root of the "Strype" repository's default branch, or the state's location), or null if it couldn't be found.
        // (createIfNone is ignored: when saving, the user chooses the location in the picker, where the "Strype" repository is created if needed, see onSaveChosen())
        if(oauthToken.value == null){
            return failedConnectionCallBack?.();
        }
        let accessibleRepositories: GitRepository[];
        try{
            accessibleRepositories = await listRepositories(oauthToken.value);
        }
        catch(error){
            if(error instanceof GitAuthExpiredError && failedConnectionCallBack){
                return failedConnectionCallBack();
            }
            return checkFolderDoneCallBack(null);
        }
        if(checkStrypeFolder){
            // (if several owners/groups have a "Strype" repository, we take the user's own one, see findStrypeRepository())
            // (an empty GitLab project has no default branch yet: we can't use it as a default location)
            const strypeRepository = findStrypeRepository(accessibleRepositories, (repository) => repository.defaultBranch.length > 0);
            return checkFolderDoneCallBack((strypeRepository) ? toGitLocationId({repoId: strypeRepository.fullName, branchId: strypeRepository.defaultBranch, folderPath: ""}) : null);
        }
        const stateLocation = (typeof appStore.strypeProjectLocation == "string") ? parseGitLocationId(appStore.strypeProjectLocation) : null;
        const isStateLocationAccessible = stateLocation != null && accessibleRepositories.some((repository) => repository.fullName == stateLocation.repoId);
        return checkFolderDoneCallBack((isStateLocationAccessible) ? toGitLocationId(stateLocation) : null);
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

    function pickSaveLocation(fullFileName: string) {
        // The user chooses where to save (by default, the location of the project loaded or saved last, or else the root of the "Strype" repository)
        // and gives the commit message.
        // Then onSaveChosen() is called, or props.onFolderToSavePickCancelled() if cancelled (see the picker's events in the provider's component).
        filePicker.value?.openForSave(fullFileName);
    }

    function pickFolderForSave() {
        // (CloudDriveHandler uses pickSaveLocation() for Git providers, so this isn't called; we keep the project's name as file name anyway)
        pickSaveLocation(appStore.projectName + "." + strypeFileExtension);
    }

    function lookForAvailableProjectFileName(fileLocation: string | undefined, fileName: string, onFileAlreadyExists: (existingFileId: string) => void, onSuccess: VoidFunction, onFailure: VoidFunction) {
        // Unlike with a Drive, we don't ask the user whether to overwrite a file of the same name in the folder we save into:
        // committing a new version of a file is what is expected with Git (and the previous versions are kept in the history).
        // The commit updates the file if it exists, or else creates it (see doSaveFile()).
        onSuccess();
    }

    function openFilePicker(startingFromFolderId: string | undefined): Promise<void> {
        // The "folder" is a Git location (see getFolderNameFromId()): the picker starts from its repository, branch and folder if given, or else from the ones used last.
        return filePicker.value?.open(parseGitLocationId(startingFromFolderId ?? "") ?? undefined) ?? Promise.resolve();
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
            const location = getGitFileLocation(gitFileId);
            setProjectLocation(location);
            // Keep the location (repository, branch and folder) selected in the picker for the next time it's opened
            filePicker.value?.rememberSelection(location);
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
        // There is no lock mechanism with Git
        isFileLocked.value = false;
        onSuccess();
    }

    async function doSaveFile(saveFileId: string | undefined, projetLocation: string, fullFileName: string, fileContent: string, isExplictSave: boolean, onSuccess: (savedFileId: string) => void, onFailure: (errRespStatus: number, errorDetails?: string) => void, commitMessage?: string) {
        // Saving is committing the file (on the provider, so it is pushed at the same time). The file is the one we already save into if any,
        // or else the file of that name in the project's location (created if it doesn't exist yet, updated otherwise).
        let gitFileId = parseGitFileId(saveFileId ?? "");
        if(gitFileId == null){
            const gitLocation = parseGitLocationId(projetLocation);
            if(gitLocation == null){
                // (we use 404 for a location that isn't a Git location, as we can't find such a folder anyway)
                onFailure(404);
                return;
            }
            const path = (gitLocation.folderPath.length > 0) ? `${gitLocation.folderPath}/${fullFileName}` : fullFileName;
            gitFileId = {repoId: gitLocation.repoId, branchId: gitLocation.branchId, path, fileName: fullFileName};
        }
        if(oauthToken.value == null){
            onFailure(401);
            return;
        }
        try{
            // (CloudDriveHandler always asks the user for a commit message, the file name is only a fallback)
            await api.commitFile(oauthToken.value, gitFileId.repoId, gitFileId.branchId, gitFileId.path, fileContent, commitMessage ?? fullFileName);
            // Keep the location (repository, branch and folder) selected in the picker for the next time it's opened
            filePicker.value?.rememberSelection(getGitFileLocation(gitFileId));
            onSuccess(toGitFileId(gitFileId));
        }
        catch(error){
            onFailure((error instanceof GitHttpError) ? error.status : ((error instanceof GitAuthExpiredError) ? 401 : 0), (error instanceof GitHttpError) ? error.details : undefined);
        }
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

    async function searchCloudDriveElements(elementName: string | undefined, elementLocationId: string, searchAllSPYFiles: boolean, searchOptions: Record<string, string>): Promise<CloudDriveFile[]> {
        // Git providers have no search: we list the folder (a Git location, see getFolderNameFromId()) and keep the matching items,
        // the files getting Git file IDs and the folders Git location IDs (so they can be searched in turn).
        // (searchOptions are about sorting and fields to get from a Drive's search, there is nothing equivalent here)
        const location = parseGitLocationId(elementLocationId);
        if(location == null){
            return [];
        }
        const items = await api.listFolderContent(getAuth(), location.repoId, location.branchId, location.folderPath, true);
        return items
            .filter((item) => (elementName == undefined || item.name == elementName)
                && (!searchAllSPYFiles || (!item.isFolder && item.name.endsWith("." + strypeFileExtension))))
            .map((item) => ({
                name: item.name,
                id: (item.isFolder)
                    ? toGitLocationId({...location, folderPath: item.path})
                    : toGitFileId({repoId: location.repoId, branchId: location.branchId, path: item.path, fileName: item.name}),
                isDir: item.isFolder,
                // (if the size couldn't be got, reading the file still gets all its content)
                fileSize: item.size ?? 0,
            }));
    }

    // FileIO
    // The files of a Git provider are read-only for the user code: writing would mean a commit for every
    // file written (the Python file system mounted for them is read-only, see executePython()).
    function checkIsCloudDriveFileReadonly(file: CloudDriveFile): boolean {
        return true;
    }

    async function readFileContentForIO(fileId: string, filePath: string): Promise<Uint8Array> {
        const gitFileId = parseGitFileId(fileId);
        if(gitFileId == null){
            throw new Error(i18n.global.t("errorMessage.fileIO.fileLocationNotFound", {filename: filePath}));
        }
        return api.getFileBytes(getAuth(), gitFileId.repoId, gitFileId.branchId, gitFileId.path);
    }

    function writeFileContentForIO(fileContent: string | Uint8Array, fileInfos: { filePath: string, fileName: string, folderId: string } | { filePath: string, fileId: string }): Promise<string> {
        return Promise.reject(i18n.global.t("errorMessage.fileIO.gitFilesReadOnly", {providername: driveName}));
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
            pickSaveLocation,
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

    return {filePickerQueries, onFilePicked, onSaveChosen, completeSignIn, toExposed};
}
