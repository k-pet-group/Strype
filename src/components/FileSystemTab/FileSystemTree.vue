<template>
    <ul class="file-system-tree-node">
        <li>
            <span v-if="node.isDir" class="file-system-tree-dir">
                <span class="file-system-tree-chevron" @click="expanded = !expanded">{{ expanded ? "▾" : "▸" }}</span>
                <span
                    class="file-system-tree-label"
                    :class="{ 'file-system-tree-label-cwd': isCwd, 'flash-background': justCopied }"
                    :title="labelTitle"
                    @click="copyPath"
                    @animationend="justCopied = false"
                ><span class="file-system-tree-invisible" aria-hidden="true">{{ invisiblePrefix }}</span>{{ ownLabelText }}</span>
                <span class="file-system-tree-spacer"></span>
                <button
                    v-if="allowUpload"
                    class="file-system-tree-upload-btn"
                    :title="$t('fileSystemTab.upload')"
                    @click="clickUploadInput"
                >
                    {{ $t("fileSystemTab.upload") }}
                </button>
                <input
                    v-if="allowUpload"
                    ref="uploadInput"
                    type="file"
                    class="file-system-tree-upload-input"
                    style="display:none"
                    @change="onFileSelected"
                />
                <button
                    v-if="allowDelete"
                    class="file-system-tree-delete-btn"
                    :title="$t('fileSystemTab.deleteDir')"
                    @click="guardedEmit('delete', node)"
                >
                    <i class="fa fa-trash"></i>
                </button>
                <button
                    class="file-system-tree-download-btn"
                    :title="$t('fileSystemTab.downloadZip')"
                    @click="guardedEmit('downloadDir', node)"
                >
                    <i class="fa fa-download"></i>
                </button>
            </span>
            <span v-else class="file-system-tree-file">
                <!-- Same width as a directory's chevron (below), so every row's label -- file or
                     directory, at any nesting depth -- starts at the same fixed column, however
                     deep it is; the invisible-prefix text is what conveys the nesting instead: -->
                <span class="file-system-tree-chevron-spacer"></span>
                <span
                    class="file-system-tree-label"
                    :class="{ 'flash-background': justCopied }"
                    :title="labelTitle"
                    @click="copyPath"
                    @animationend="justCopied = false"
                ><span class="file-system-tree-invisible" aria-hidden="true">{{ invisiblePrefix }}</span>{{ node.name }}</span>
                <span class="file-system-tree-spacer"></span>
                <button
                    v-if="allowDelete"
                    class="file-system-tree-delete-btn"
                    :title="$t('fileSystemTab.delete')"
                    @click="guardedEmit('delete', node)"
                >
                    <i class="fa fa-trash"></i>
                </button>
                <button
                    v-if="allowPin"
                    class="file-system-tree-pin-btn"
                    :class="{ 'file-system-tree-pin-btn-pinned': node.isPinned }"
                    :disabled="pinDisabled"
                    :title="pinTitle"
                    @click="guardedEmit('pin', node)"
                >
                    <i class="fa fa-thumbtack"></i>
                </button>
                <button class="file-system-tree-view-btn" :title="viewOpensNewTab ? $t('fileSystemTab.openInNewTab') : $t('fileSystemTab.view')" @click="guardedEmit('view', node)">
                    <i :class="viewOpensNewTab ? 'fa fa-folder-open' : 'fa fa-eye'"></i>
                </button>
                <button class="file-system-tree-download-btn" :title="$t('fileSystemTab.download')" @click="guardedEmit('download', node)">
                    <i class="fa fa-download"></i>
                </button>
            </span>
            <ul v-if="node.isDir && expanded" class="file-system-tree-children">
                <li v-if="(node.children ?? []).length === 0" class="file-system-tree-empty">
                    {{ $t("fileSystemTab.emptyFolder") }}
                </li>
                <FileSystemTree
                    v-for="child in node.children"
                    :key="child.path"
                    :node="child"
                    :allow-upload="allowUpload"
                    :allow-delete="allowDelete"
                    :allow-pin="allowPin"
                    :executing="executing"
                    :invisible-prefix="childInvisiblePrefix"
                    :opens-in-new-tab="opensInNewTab"
                    @download="(n) => $emit('download', n)"
                    @downloadDir="(n) => $emit('downloadDir', n)"
                    @upload="(n, file) => $emit('upload', n, file)"
                    @delete="(n) => $emit('delete', n)"
                    @pin="(n) => $emit('pin', n)"
                    @view="(n) => $emit('view', n)"
                />
            </ul>
        </li>
    </ul>
</template>

<script lang="ts">
import { defineComponent, PropType } from "vue";
import { FsTreeNode } from "@/stryperuntime/file_system_tree_types";
import { CustomEventTypes } from "@/helpers/editor";

// Kept in sync with the identical MAX_PINNABLE_FILE_SIZE in fileSystemTabIO.ts (which actually
// enforces it) -- duplicated rather than imported so this purely-presentational component doesn't
// need to pull in that file's much heavier dependency graph (worker/Comlink/cloud types) just for
// one constant.
const MAX_PINNABLE_FILE_SIZE = 1024 * 1024;

export default defineComponent({
    name: "FileSystemTree",

    props: {
        node: { type: Object as PropType<FsTreeNode>, required: true },
        // FileSystemPane passes true for the top-level asset roots, /local and /cloud so they
        // open immediately; nested directories always start collapsed.
        startExpanded: { type: Boolean, default: false },
        // Whether directories in this subtree get an upload button -- true under /local and /cloud,
        // false under the read-only asset roots (/data, /books, etc).
        allowUpload: { type: Boolean, default: false },
        // Whether items in this subtree get a delete button -- true only under /local (see
        // FileSystemPane.vue): unlike upload, this isn't offered under /cloud too, since deleting a
        // cloud file needs real API calls this doesn't (yet) make, not just a local cache edit.
        allowDelete: { type: Boolean, default: false },
        // Whether *files* (not directories -- see the template, only the file branch uses this) in
        // this subtree get a pin button -- true only under /local (see FileSystemPane.vue): pinning
        // saves the file into the .spy project file itself (see load-save.ts's
        // savePinnedLocalFiles()), which only makes sense for /local's otherwise-ephemeral cache,
        // not the read-only asset roots or (not yet supported) /cloud.
        allowPin: { type: Boolean, default: false },
        // Whether Python is currently executing: every action button in this subtree stays
        // enabled and clickable regardless (see guardedEmit()/clickUploadInput() below), but while
        // this is true, clicking one does nothing except flash the run/stop button red -- /local's
        // main-thread cache (and, for uploads only, /cloud's cache in cloudFileIO.ts) are only meant
        // to be touched between runs, not while a run might also be reading/writing the same files.
        executing: { type: Boolean, default: false },
        // Whether this node is the directory that will be the current working directory when the
        // code is next run. Only ever true for the root node passed in by FileSystemPane.vue --
        // it's deliberately not forwarded to the recursive FileSystemTree below, since the cwd is
        // always a /local or /cloud root, never a subdirectory.
        isCwd: { type: Boolean, default: false },
        // Overrides the displayed label for this node only (e.g. "/data/" instead of the bare
        // node name "data") -- like isCwd, deliberately not forwarded to the recursive
        // FileSystemTree below, so it only ever affects the root node passed in by FileSystemPane.
        labelOverride: { type: String, default: null },
        // An invisible (visibility:hidden, revealed on hover -- see the CSS below) copy of this
        // text is rendered before the node's own label, in the same font, so the *visible* label
        // lines up with wherever the text of the row above it ended -- e.g. under "/books/", every
        // child's name starts exactly where "/books/" itself ends, rather than at a fixed small
        // indent. Accumulates as it recurses (see the recursive FileSystemTree below, which passes
        // this node's own invisiblePrefix + ownLabelText down as its children's prefix), and also
        // doubles as a hover hint showing the item's full path.
        invisiblePrefix: { type: String, default: "" },
        // Tells whether "viewing" a file of this subtree opens it in a new Strype tab rather than in
        // the viewer dialog (see FileSystemPane.vue's openCloudProjectFileInNewTab()): its view button
        // then shows an open folder, with a matching title, instead of the eye. Forwarded as it recurses.
        opensInNewTab: { type: Function as PropType<(node: FsTreeNode) => boolean>, default: null },
    },

    emits: ["download", "downloadDir", "upload", "delete", "pin", "view"],

    data() {
        return {
            expanded: this.startExpanded,
            // Flash the label briefly after a click copies its path -- see copyPath()/the
            // "flash-background"/"flash-bg-anim" keyframes (defined globally in
            // PythonExecutionArea.vue, alongside the console's own copy-to-clipboard button).
            justCopied: false,
        };
    },

    computed: {
        viewOpensNewTab(): boolean {
            return !this.node.isDir && this.opensInNewTab != null && this.opensInNewTab(this.node);
        },

        // What's actually shown as this node's own label (directories only -- see the template):
        // labelOverride for the root nodes FileSystemPane.vue passes it for (e.g. "/books/", which
        // already has its own trailing slash baked in), otherwise the plain node name with a
        // trailing slash added (e.g. "backgrounds/") so it reads as a path segment and so
        // childInvisiblePrefix below can append it without the two run together (e.g.
        // "backgroundsspace" for a "space.png" under "backgrounds" without the slash).
        ownLabelText(): string {
            if (this.labelOverride != null) {
                return this.labelOverride;
            }
            return this.node.isDir ? this.node.name + "/" : this.node.name;
        },

        // The invisible-alignment prefix to pass down to this node's own children (see
        // invisiblePrefix's own comment) -- this node's own inherited prefix plus its own label,
        // which (per ownLabelText above) always ends in "/". Accumulates at every nesting level,
        // so e.g. a file two levels under "/images/" (in "backgrounds") gets the invisible prefix
        // "/images/backgrounds/" and a visible label starting exactly where that ends:
        childInvisiblePrefix(): string {
            return this.invisiblePrefix + this.ownLabelText;
        },

        labelTitle(): string {
            const copyHint = this.$t("fileSystemTab.copyPath") as string;
            return this.isCwd ? `${this.$t("fileSystemTab.cwd")} -- ${copyHint}` : copyHint;
        },

        // What copyPath() below actually puts on the clipboard: with the leading "/local/" or
        // "/cloud/" stripped off for anything under either of those roots, since one of them is
        // always the working directory the code runs from (see cwdRoot, FileSystemPane.vue) -- a
        // plain relative path (e.g. "photo.png", not "/local/photo.png") is what you'd actually
        // write in open(...) etc. Left as the full path for everything else (the read-only asset
        // roots): those are never the working directory, so only their absolute path ever resolves.
        pathToCopy(): string {
            const path = this.node.path;
            for (const cwdRoot of ["/local", "/cloud"]) {
                if (path === cwdRoot) {
                    return ".";
                }
                if (path.startsWith(cwdRoot + "/")) {
                    return path.slice(cwdRoot.length + 1);
                }
            }
            return path;
        },

        // Whether this node's pin button should be disabled -- true if it's not already pinned
        // and is at or above MAX_PINNABLE_FILE_SIZE (see fileSystemTabIO.ts's togglePinLocal,
        // which enforces the same limit): already-pinned files can always be unpinned regardless
        // of size.
        pinDisabled(): boolean {
            return !this.node.isPinned && (this.node.size ?? 0) >= MAX_PINNABLE_FILE_SIZE;
        },

        pinTitle(): string {
            if (this.node.isPinned) {
                return this.$t("fileSystemTab.unpin") as string;
            }
            if (this.pinDisabled) {
                return this.$t("fileSystemTab.pinTooLarge") as string;
            }
            return this.$t("fileSystemTab.pin") as string;
        },
    },

    methods: {
        copyPath(): void {
            navigator.clipboard.writeText(this.pathToCopy);
            this.justCopied = true;
        },

        // Shared guard for every action below: while Python is executing, the triggering button
        // stays clickable (not disabled/greyed) but does nothing except flash the run/stop button
        // red, reusing the same "highlightPythonRunningState" mechanism Menu.vue uses for shortcuts
        // blocked while running -- see PythonExecutionArea.vue's doHighlightPythonRunningState()/
        // #runButton.highlighted CSS. Otherwise runs the given action normally.
        guardedAction(action: () => void): void {
            if (this.executing) {
                document.dispatchEvent(new Event(CustomEventTypes.highlightPythonRunningState));
                return;
            }
            action();
        },

        guardedEmit(event: "download" | "downloadDir" | "delete" | "pin" | "view", node: FsTreeNode): void {
            this.guardedAction(() => this.$emit(event, node));
        },

        clickUploadInput(): void {
            this.guardedAction(() => (this.$refs.uploadInput as HTMLInputElement).click());
        },

        onFileSelected(event: Event): void {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = "";
            if (!file) {
                return;
            }
            this.expanded = true;
            this.$emit("upload", this.node, file);
        },
    },
});
</script>

<style lang="scss">
// No left indent at any nesting depth -- deliberately: the folding triangle stays in a single
// fixed-left column at every depth (matching the section heading above the whole tree) instead of
// stepping in further with each level, and the invisible-prefix text (see invisiblePrefix) is what
// conveys nesting instead, via each row's *label* starting further right the deeper it is. Browsers
// give a bare <ul> its own default padding otherwise, so this has to be reset explicitly:
.file-system-tree-node,
.file-system-tree-children {
    list-style: none;
    margin: 0;
    padding-left: 0;
}

.file-system-tree-dir,
.file-system-tree-file {
    display: flex;
    align-items: center;
}

.file-system-tree-label {
    cursor: pointer;
    user-select: none;
    border-radius: 3px;
    padding: 0 2px;
}

.file-system-tree-label-cwd {
    font-weight: bold;
}

.file-system-tree-invisible {
    visibility: hidden;
}

.file-system-tree-label:hover .file-system-tree-invisible {
    visibility: visible;
    opacity: 0.5;
}

.file-system-tree-chevron {
    display: inline-block;
    width: 1em;
    cursor: pointer;
    user-select: none;
}

.file-system-tree-chevron-spacer {
    display: inline-block;
    width: 1em;
}

.file-system-tree-spacer {
    flex: 1;
}

// Deliberately two separate classes, not one shared class on both buttons: tests (and any other
// code) locating ".file-system-tree-download-btn" within a row must find exactly the download
// button, never also the delete button next to it.
.file-system-tree-download-btn,
.file-system-tree-delete-btn,
.file-system-tree-pin-btn,
.file-system-tree-view-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 2px 6px;
    color: inherit;
    opacity: 0.5;
    font-size: 0.9em;
    margin-left: 0.5em;
    flex-shrink: 0;
    // Hidden (not display:none, so it doesn't shift the row's layout) until the row is hovered --
    // see the rules just below -- unless it's a pinned file's pin button (see
    // .file-system-tree-pin-btn-pinned), which stays visible so pinned status is always apparent.
    visibility: hidden;
}

.file-system-tree-download-btn:hover,
.file-system-tree-view-btn:hover {
    opacity: 0.8;
}

// A slight red tint on hover, distinguishing it from the (non-destructive) download button next
// to it:
.file-system-tree-delete-btn:hover {
    color: #c33;
}

.file-system-tree-pin-btn:hover {
    opacity: 0.8;
}

.file-system-tree-pin-btn:disabled {
    cursor: not-allowed;
}

// Once a file is pinned, its pin button stays visible (not just on row-hover) and tinted, so
// pinned status is visible at a glance without needing to hover every row:
.file-system-tree-pin-btn-pinned {
    visibility: visible !important;
    opacity: 0.8;
    color: #d9a520;
}

.file-system-tree-dir:hover > .file-system-tree-download-btn,
.file-system-tree-file:hover > .file-system-tree-download-btn,
.file-system-tree-dir:hover > .file-system-tree-delete-btn,
.file-system-tree-file:hover > .file-system-tree-delete-btn,
.file-system-tree-dir:hover > .file-system-tree-pin-btn,
.file-system-tree-file:hover > .file-system-tree-pin-btn,
.file-system-tree-file:hover > .file-system-tree-view-btn {
    visibility: visible;
}

.file-system-tree-upload-btn {
    // No margin-left here: the flex spacer before it (in a tree row) already provides the
    // separation, and FileSystemPane.vue's standalone "Local files" upload row (not preceded by a
    // label/spacer at all) needs this to be flush left, matching the "(empty)" message above it.
    flex-shrink: 0;
    // Flat (no border/shading) lozenge, light background with dark text:
    border: none;
    border-radius: 999px;
    background-color: #e8e8e8;
    color: #222;
    padding: 0.1em 0.9em;
    cursor: pointer;

    &:hover:not(:disabled) {
        background-color: #fff;
    }

    &:disabled {
        opacity: 0.5;
        cursor: default;
    }
}

.file-system-tree-empty {
    opacity: 0.6;
    font-style: italic;
}
</style>
