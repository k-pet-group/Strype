<template>
    <!-- @wheel.stop: like the console/graphics areas, stop Commands.vue's handleAppScroll from forwarding
         wheel scrolling over this pane to the main editor (it listens on an ancestor of the whole PEA) -->
    <div class="file-system-pane" @wheel.stop>
        <div v-if="loading" class="file-system-pane-loading">{{ $t("fileSystemTab.loading") }}</div>
        <template v-else>
            <!-- Deliberately no FileSystemTree for "local" itself (unlike cloudRoot/assetRoots below):
                 its children are listed flat, straight under this heading, rather than behind a
                 redundant bold "local" row that just repeats what the heading above it already says. -->
            <div class="file-system-pane-root" v-if="localRoot">
                <h4
                    :class="{ 'file-system-tree-label-cwd': cwdRoot === '/local' }"
                    :title="cwdRoot === '/local' ? $t('fileSystemTab.cwd') : undefined"
                >{{ $t("fileSystemTab.local") }}</h4>
                <div v-if="(localRoot.children ?? []).length === 0" class="file-system-tree-empty file-system-pane-flat-item">
                    {{ $t("fileSystemTab.emptyFolder") }}
                </div>
                <FileSystemTree
                    v-for="child in localRoot.children"
                    :key="child.path"
                    :node="child"
                    allow-upload
                    allow-delete
                    allow-pin
                    :executing="isPythonExecuting"
                    @download="(n) => onDownload(n, '/local')"
                    @downloadDir="(n) => onDownloadDir(n, '/local')"
                    @upload="(n, file) => onUpload(n, file, '/local')"
                    @delete="onDeleteLocal"
                    @pin="onPinLocal"
                    @view="(n) => onView(n, '/local')"
                />
                <div class="file-system-pane-flat-item">
                    <button
                        class="file-system-tree-upload-btn"
                        :title="$t('fileSystemTab.upload')"
                        @click="clickLocalUploadInput"
                    >
                        {{ $t("fileSystemTab.upload") }}
                    </button>
                    <input ref="localUploadInput" type="file" class="file-system-tree-upload-input" style="display:none" @change="onLocalFileSelected" />
                </div>
            </div>
            <div class="file-system-pane-root" v-if="cloudRoot">
                <!-- The files of a Git provider can only be read (see isCloudMountReadOnly()) -->
                <h4>{{ isCloudReadOnly ? $t("fileSystemTab.gitReadOnly") : $t("fileSystemTab.cloud") }}</h4>
                <FileSystemTree
                    :node="cloudRoot"
                    label-override="/cloud/"
                    start-expanded
                    :allow-upload="!isCloudReadOnly"
                    :executing="isPythonExecuting"
                    :is-cwd="cwdRoot === '/cloud'"
                    @download="(n) => onDownload(n, '/cloud')"
                    @downloadDir="(n) => onDownloadDir(n, '/cloud')"
                    @upload="(n, file) => onUpload(n, file, '/cloud')"
                    @view="(n) => onView(n, '/cloud')"
                />
            </div>
            <div class="file-system-pane-root" v-if="assetRoots.length">
                <h4>{{ $t("fileSystemTab.builtIn") }}</h4>
                <FileSystemTree
                    v-for="entry in assetRoots"
                    :key="entry.root"
                    :node="entry.tree"
                    :label-override="entry.root + '/'"
                    :executing="isPythonExecuting"
                    @download="(n) => onDownload(n, entry.root)"
                    @downloadDir="(n) => onDownloadDir(n, entry.root)"
                    @view="(n) => onView(n, entry.root)"
                />
            </div>
        </template>
        <OverwriteConfirmDialog
            :dlgId="overwriteConfirmDlgId"
            :fileName="pendingOverwrite?.file.name ?? ''"
            @overwrite="onConfirmOverwrite"
            @cancelled="pendingOverwrite = null"
        />
        <ArchiveImportDialog
            :dlgId="archiveImportDlgId"
            :fileName="pendingUpload?.file.name ?? ''"
            @keep-zip="onKeepAsZip"
            @unzip="onUnzipContents"
            @cancelled="pendingUpload = null"
        />
        <FileViewerDlg
            :dlgId="fileViewerDlgId"
            :fileName="viewingFile?.node.name ?? ''"
            :kind="viewingFile?.kind ?? 'loading'"
            :objectUrl="viewingFile?.objectUrl"
            :audioBuffer="viewingFile?.audioBuffer"
            :waveformDataUrl="viewingFile?.waveformDataUrl"
            :text="viewingFile?.text"
            :tooLarge="viewingFile?.tooLarge ?? false"
            @closed="onViewClosed"
            @download="onDownloadViewing"
        />
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { mapStores } from "pinia";
import { useStore } from "@/store/store";
import { PythonExecRunningState } from "@/types/types";
import FileSystemTree from "@/components/FileSystemTab/FileSystemTree.vue";
import ArchiveImportDialog from "@/components/FileSystemTab/ArchiveImportDialog.vue";
import OverwriteConfirmDialog from "@/components/FileSystemTab/OverwriteConfirmDialog.vue";
import FileViewerDlg from "@/components/FileSystemTab/FileViewerDlg.vue";
import {
    assetsRoots,
    deleteFromLocal,
    dirHasEntryNamed,
    downloadFsDirectoryAsZip,
    downloadFsFile,
    FsRoot,
    isCloudMounted,
    isCloudMountReadOnly,
    listFsRootTree,
    readFsFileBytes,
    togglePinLocal,
    uploadEntriesToCloud,
    uploadEntriesToLocal,
} from "@/helpers/fileSystemTabIO";
import { ArchiveEntry, isZipFile, unzipEntries } from "@/helpers/archive";
import { FsTreeNode } from "@/stryperuntime/file_system_tree_types";
import { runChangeCount } from "@/helpers/localFsCache";
import { eventBus } from "@/helpers/appContext";
import { CustomEventTypes } from "@/helpers/editor";
import { decodeAsTextIfValid, MAX_PREVIEWABLE_FILE_SIZE, mimeTypeForExtension, previewKindForExtension } from "@/helpers/filePreview";
import { drawSoundOnCanvas } from "@/helpers/media";
import { saveAs } from "file-saver";

// Waveform image size for the "view file" sound preview -- wider than MediaPreviewPopup.vue's own
// 200x50 (a small hover popup) since this renders in a full-width modal dialog instead.
const SOUND_WAVEFORM_WIDTH = 600;
const SOUND_WAVEFORM_HEIGHT = 120;

interface PendingUpload {
    dirNode: FsTreeNode,
    file: File,
    root: "/local" | "/cloud",
}

interface ViewingFile {
    node: FsTreeNode,
    root: FsRoot,
    kind: "loading" | "image" | "sound" | "text" | "unsupported",
    // Only set when kind is "image" (an object URL, needing an explicit revoke -- see
    // revokeViewingObjectUrl()).
    objectUrl?: string,
    // Only set when kind is "sound" -- see drawSoundOnCanvas()/FileViewerDlg.vue's playback.
    audioBuffer?: AudioBuffer,
    waveformDataUrl?: string,
    text?: string,
    tooLarge?: boolean,
    bytes?: Uint8Array,
}

export default defineComponent({
    name: "FileSystemPane",

    components: {
        FileSystemTree,
        ArchiveImportDialog,
        OverwriteConfirmDialog,
        FileViewerDlg,
    },

    data() {
        return {
            loading: true,
            assetRoots: [] as { root: FsRoot, tree: FsTreeNode }[],
            localRoot: null as FsTreeNode | null,
            cloudRoot: null as FsTreeNode | null,
            // Set while the "keep as zip / unzip contents" dialog is open for a .zip upload --
            // see onUpload()/ArchiveImportDialog.vue.
            pendingUpload: null as PendingUpload | null,
            // Set while the overwrite-confirmation dialog is open, for an upload whose name
            // clashes with an existing entry in the target directory -- see
            // proceedWithUpload()/OverwriteConfirmDialog.vue.
            pendingOverwrite: null as PendingUpload | null,
            // Set while the "view file" dialog is open (or loading) -- see onView()/FileViewerDlg.vue.
            viewingFile: null as ViewingFile | null,
            // Pending re-list of /local caused by the running program's file changes -- see the watcher
            refreshLocalTimer: null as number | null,
        };
    },

    computed: {
        ...mapStores(useStore),

        isPythonExecuting(): boolean {
            return this.appStore.pythonExecRunningState != PythonExecRunningState.NotRunning;
        },

        localRunChangeCount(): number {
            return runChangeCount.value;
        },

        archiveImportDlgId(): string {
            return "fileSystemArchiveImportDlg";
        },

        overwriteConfirmDlgId(): string {
            return "fileSystemOverwriteConfirmDlg";
        },

        fileViewerDlgId(): string {
            return "fileSystemFileViewerDlg";
        },

        // The root that will be the current working directory when the code is next run --
        // matches the mounting logic in python-execution.ts's executePython() (startInSlashCloud).
        cwdRoot(): "/local" | "/cloud" {
            return isCloudMounted() ? "/cloud" : "/local";
        },

        isCloudReadOnly(): boolean {
            return isCloudMountReadOnly();
        },
    },

    mounted() {
        this.refresh();
    },

    beforeUnmount() {
        if (this.refreshLocalTimer != null) {
            window.clearTimeout(this.refreshLocalTimer);
        }
    },

    watch: {
        // The running program's file changes reach the /local cache as they happen, and its final files
        // when it ends (see localFsCache.ts), so re-list then, in case this pane is showing while the
        // program runs. A program can change files very rapidly, so at most one re-list per 100ms:
        localRunChangeCount() {
            if (this.refreshLocalTimer == null) {
                this.refreshLocalTimer = window.setTimeout(() => {
                    this.refreshLocalTimer = null;
                    void this.refreshLocal();
                }, 100);
            }
        },
    },

    methods: {
        async refresh(): Promise<void> {
            this.loading = true;
            const roots = assetsRoots();
            const [assetTrees, localRoot, cloudRoot] = await Promise.all([
                Promise.all(roots.map((root) => listFsRootTree(root))),
                listFsRootTree("/local"),
                isCloudMounted() ? listFsRootTree("/cloud") : Promise.resolve(null),
            ]);
            this.assetRoots = roots
                .map((root, i) => ({root, tree: assetTrees[i]}))
                .filter((entry): entry is { root: FsRoot, tree: FsTreeNode } => entry.tree != null);
            this.localRoot = localRoot;
            this.cloudRoot = cloudRoot;
            this.loading = false;
        },

        async refreshLocal(): Promise<void> {
            this.localRoot = await listFsRootTree("/local");
        },

        async refreshCloud(): Promise<void> {
            this.cloudRoot = isCloudMounted() ? await listFsRootTree("/cloud") : null;
        },

        onDownload(node: FsTreeNode, root: FsRoot): void {
            void downloadFsFile(node, root);
        },

        onDownloadDir(node: FsTreeNode, root: FsRoot): void {
            void downloadFsDirectoryAsZip(node, root);
        },

        onDeleteLocal(node: FsTreeNode): void {
            deleteFromLocal(node);
            void this.refreshLocal();
        },

        onPinLocal(node: FsTreeNode): void {
            togglePinLocal(node);
            void this.refreshLocal();
        },

        // Opens FileViewerDlg.vue and fetches+classifies the file's content for it (see
        // filePreview.ts). Skips the fetch entirely for a file already known (from its listed
        // size) to be over MAX_PREVIEWABLE_FILE_SIZE -- previewing is a convenience, not worth
        // downloading a huge file just to then refuse to render it.
        async onView(node: FsTreeNode, root: FsRoot): Promise<void> {
            this.revokeViewingObjectUrl();
            this.viewingFile = {node, root, kind: "loading"};
            eventBus.emit(CustomEventTypes.showStrypeModal, this.fileViewerDlgId);

            if ((node.size ?? 0) > MAX_PREVIEWABLE_FILE_SIZE) {
                this.viewingFile = {node, root, kind: "unsupported", tooLarge: true};
                return;
            }
            const bytes = await readFsFileBytes(node, root);
            // The user may have opened a different file's preview while this one was still
            // fetching -- discard a stale result rather than overwriting the newer one:
            if (this.viewingFile?.node !== node) {
                return;
            }
            if (bytes == null) {
                this.viewingFile = {node, root, kind: "unsupported"};
                return;
            }

            const extKind = previewKindForExtension(node.name);
            if (extKind === "image") {
                const objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], {type: mimeTypeForExtension(node.name)}));
                this.viewingFile = {node, root, kind: "image", objectUrl, bytes};
                return;
            }
            if (extKind === "sound") {
                try {
                    // Decoding (unlike playback) needs no user gesture and doesn't touch real
                    // output, so an OfflineAudioContext is fine here -- matches LabelSlot.vue's
                    // identical decode for the code-editor's own sound-literal preview:
                    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
                    const audioBuffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(arrayBuffer);
                    if (this.viewingFile?.node !== node) {
                        return;
                    }
                    const waveformDataUrl = drawSoundOnCanvas(audioBuffer, SOUND_WAVEFORM_WIDTH, SOUND_WAVEFORM_HEIGHT, 1.0, 0.75);
                    this.viewingFile = {node, root, kind: "sound", audioBuffer, waveformDataUrl, bytes};
                }
                catch {
                    // Not actually valid audio despite the extension (e.g. corrupted upload):
                    this.viewingFile = {node, root, kind: "unsupported", bytes};
                }
                return;
            }
            const text = decodeAsTextIfValid(bytes);
            this.viewingFile = text !== undefined
                ? {node, root, kind: "text", text, bytes}
                : {node, root, kind: "unsupported", bytes};
        },

        revokeViewingObjectUrl(): void {
            if (this.viewingFile?.objectUrl) {
                URL.revokeObjectURL(this.viewingFile.objectUrl);
            }
        },

        onViewClosed(): void {
            this.revokeViewingObjectUrl();
            this.viewingFile = null;
        },

        onDownloadViewing(): void {
            if (this.viewingFile == null) {
                return;
            }
            if (this.viewingFile.bytes) {
                saveAs(new Blob([this.viewingFile.bytes as BlobPart], {type: "application/octet-stream"}), this.viewingFile.node.name);
            }
            else {
                // Only reachable if the size cap skipped fetching bytes entirely (see onView()):
                void downloadFsFile(this.viewingFile.node, this.viewingFile.root);
            }
        },

        // "/local" doesn't render its own root row (see the template) -- there's no FileSystemTree
        // instance there to own an upload button/input, so this pane owns one directly instead,
        // uploading to localRoot itself (the same target the old root row's own upload button had).
        clickLocalUploadInput(): void {
            if (this.isPythonExecuting) {
                // Uploading while the program runs could race with it reading/writing the same
                // "/local" cache -- rather than disabling the button (see FileSystemTree.vue's
                // identical reasoning for its own upload/delete/etc buttons), just flash the
                // run/stop button red as a hint, reusing the same mechanism Menu.vue uses for
                // shortcuts blocked while running.
                document.dispatchEvent(new Event(CustomEventTypes.highlightPythonRunningState));
                return;
            }
            (this.$refs.localUploadInput as HTMLInputElement).click();
        },

        onLocalFileSelected(event: Event): void {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (!file || this.localRoot == null) {
                return;
            }
            this.onUpload(this.localRoot, file, "/local");
        },

        onUpload(dirNode: FsTreeNode, file: File, root: "/local" | "/cloud"): void {
            if (dirHasEntryNamed(dirNode, file.name)) {
                // Ask for confirmation before silently overwriting an existing entry -- see
                // onConfirmOverwrite() below, triggered from OverwriteConfirmDialog.vue.
                this.pendingOverwrite = {dirNode, file, root};
                eventBus.emit(CustomEventTypes.showStrypeModal, this.overwriteConfirmDlgId);
                return;
            }
            this.proceedWithUpload(dirNode, file, root);
        },

        onConfirmOverwrite(): void {
            const pending = this.pendingOverwrite;
            this.pendingOverwrite = null;
            if (pending) {
                this.proceedWithUpload(pending.dirNode, pending.file, pending.root);
            }
        },

        proceedWithUpload(dirNode: FsTreeNode, file: File, root: "/local" | "/cloud"): void {
            if (isZipFile(file)) {
                // Ask the user whether to keep the archive as-is or unzip its contents -- see
                // onKeepAsZip()/onUnzipContents() below, triggered from ArchiveImportDialog.vue.
                this.pendingUpload = {dirNode, file, root};
                eventBus.emit(CustomEventTypes.showStrypeModal, this.archiveImportDlgId);
                return;
            }
            void this.uploadPlainFile(dirNode, file, root);
        },

        // Shared by uploadPlainFile() (a single-entry array) and onUnzipContents() (an archive's
        // whole entry list) -- both just need "write these entries under dirNode, then refresh
        // whichever root they went into" and otherwise differ only in where the entries came from.
        async uploadEntries(dirNode: FsTreeNode, entries: ArchiveEntry[], root: "/local" | "/cloud"): Promise<void> {
            if (root === "/local") {
                await uploadEntriesToLocal(dirNode, entries);
                await this.refreshLocal();
            }
            else {
                await uploadEntriesToCloud(dirNode, entries);
                await this.refreshCloud();
            }
        },

        async uploadPlainFile(dirNode: FsTreeNode, file: File, root: "/local" | "/cloud"): Promise<void> {
            const data = new Uint8Array(await file.arrayBuffer());
            await this.uploadEntries(dirNode, [{path: file.name, data}], root);
        },

        async onKeepAsZip(): Promise<void> {
            const pending = this.pendingUpload;
            this.pendingUpload = null;
            if (pending) {
                await this.uploadPlainFile(pending.dirNode, pending.file, pending.root);
            }
        },

        async onUnzipContents(): Promise<void> {
            const pending = this.pendingUpload;
            this.pendingUpload = null;
            if (!pending) {
                return;
            }
            const entries = await unzipEntries(pending.file);
            await this.uploadEntries(pending.dirNode, entries, pending.root);
        },
    },
});
</script>

<style lang="scss">
.file-system-pane {
    height: 100%;
    overflow: auto;
    padding: 0.5em;
    // Matches .pea-console's colours (PythonExecutionArea.vue) so the Files tab looks consistent
    // with the Console tab right next to it:
    background-color: #333;
    color: white;
}

// Mac Safari: always show scrollbar (when content is large enough to require one), and make it
// light -- same treatment as .pea-console's own scrollbar (PythonExecutionArea.vue):
.file-system-pane::-webkit-scrollbar {
    width: 8px;
}

.file-system-pane::-webkit-scrollbar-track {
    background: #333;
}

.file-system-pane::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 5px;
}

.file-system-pane-root {
    margin-bottom: 1em;

    h4 {
        margin: 0 0 0.25em 0;
    }
}

// The bits of the "Local files" section that aren't FileSystemTree instances themselves (the
// empty-folder message, the upload row) -- see the template's comment on why "/local" has no root
// row of its own to hang those off of instead. Matches the 1em gutter every file/directory row
// reserves for a folding triangle (see .file-system-tree-chevron/-spacer, FileSystemTree.vue) --
// neither of these has one of its own, any more than a file row does, so they align with those
// rows' *labels* rather than sitting flush with where a triangle would be:
.file-system-pane-flat-item {
    padding-left: 1em;
    margin-top: 0.25em;
}
</style>
