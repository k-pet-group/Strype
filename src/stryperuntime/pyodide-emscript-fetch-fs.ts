import {PyodideAPI} from "pyodide";
import {EmscriptenFileSystemPlugin, FSNode, FSNodeOpsDir, FSNodeOpsFile, FSStream, FSStreamOpsDir, FSStreamOpsFile} from "@/types/emscripten-fs-types";
import {syncBridge} from "@/workers/python_execution_type";
import {decodeStringToUint8} from "@/stryperuntime/worker_bridge_type";
import {getFullFilePath} from "@/stryperuntime/pyodide-emscripten-cloud-fs";

// fileIndex maps file path within FS to fetch URL
export function createLazyFetchFS(pyodide : PyodideAPI, fileIndex: Record<string, string>, libraryURL: string | undefined, cache : Map<string, Uint8ClampedArray>) : EmscriptenFileSystemPlugin {
    const FS = pyodide.FS;
    const ERRNO_CODES = pyodide.ERRNO_CODES;

    function normalize(path : string) : string {
        return path.replace(/^\/+/, "");
    }

    const unifiedNodeOps : FSNodeOpsDir & FSNodeOpsFile = {
        getattr(node : FSNode) {
            return {
                dev: 1,
                ino: node.id,
                mode: node.mode,
                nlink: node.assetsContent !== undefined ? 1 : 2,
                uid: 0,
                gid: 0,
                rdev: 0,
                size: node.assetsContent?.length ?? 4096,
                atime: new Date(),
                mtime: new Date(),
                ctime: new Date(),
                blksize: 4096,
                blocks: 1,
            };
        },

        lookup(parent : FSNode, name :string) {
            const child = parent.assetsChildren[name];
            if (!child) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
            }
            return child;
        },

        readdir(node : FSNode) {
            return [".", "..", ...Object.keys(node.assetsChildren)];
        },
    };
    const unifiedStreamOps : FSStreamOpsDir & FSStreamOpsFile = {
        open(stream : FSStream) : void {
            if ((stream.node.mode & 0o040000) != 0) {
                // Don't need to do anything for directories:
                return;
            }

            const root : string | undefined = stream.node.rootDir;
            
            const path = (libraryURL === undefined ? ("/src/assetsFilesystem/" + (root ? (root + "/") : "")) : "") + normalize(getFullFilePath(stream.node));
            
            if (!cache.has(path)) {
                const url = fileIndex[path];
                if (!url) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
                }
                if (!url || typeof url !== "string") {
                    // Shouldn't happen, except once it did after we got the types wrong due to Vite version troubles, so let's check:
                    console.error("Non string URL for path \"" + path + "\" is URL: " + JSON.stringify(url));
                }
                
                let buf;
                if (libraryURL === undefined) {
                    buf = decodeStringToUint8(syncBridge({request: "assetFile_fetch", url}));
                }
                else {
                    buf = decodeStringToUint8(syncBridge({request: "libraryFile_fetch", libraryURL, filename: url}));
                }
                
                cache.set(path, buf);
            }

            // We know it must be in the cache now:
            stream.node.assetsContent = cache.get(path) as Uint8ClampedArray;
        },

        close(stream: FSStream) : void {
            // Nothing to do, we don't keep any state about the stream
            // and we want to keep the file cached.
        },

        read(stream : FSStream, buffer : Uint8Array | Int8Array, offset : number, length : number, position: number) {
            const assetsContent = stream.node.assetsContent;
            if (!assetsContent) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO);
            }

            const slice = assetsContent.subarray(position, position + length);
            buffer.set(slice, offset);
            return slice.length;
        },

        llseek(stream, offset, whence) {
            let position = offset;
            if (whence === 1) {
                position += stream.position;
            }
            if (whence === 2) {
                position += stream.node.assetsContent?.length ?? Object.keys(stream.node.assetsChildren).length;
            }
            return position;
        },
    };
    const LazyFetchFS : EmscriptenFileSystemPlugin = {
        mount(mount) {
            const root : FSNode = FS.createNode(null, "/", 16384 | 511, 0);
            root.node_ops = this.node_ops;
            root.stream_ops = this.stream_ops;
            root.rootDir = mount.opts.root;

            buildTree(root, mount.opts.root);

            return root;
        },

        node_ops: unifiedNodeOps,

        stream_ops: unifiedStreamOps,
    };

    function buildTree(root : FSNode, subDirToMakeRoot: string | undefined) : void {
        for (const fullPath in fileIndex) {
            const parts = normalize(libraryURL === undefined ? fullPath.replace(/^\/src\/assetsFilesystem\//, "") : fullPath).split("/");
            // If we are doing a subdir then ignore those which don't match, and remove first part:
            if (subDirToMakeRoot) {
                if (parts[0] !== subDirToMakeRoot) {
                    continue;
                }
                parts.splice(0, 1);
            }
            
            let node = root;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                const isFile = i === parts.length - 1;

                node.assetsChildren ||= {};

                if (!node.assetsChildren[part]) {
                    const mode = isFile ? 32768 | 444 : 16384 | 555;
                    const child = FS.createNode(node, part, mode, 0);
                    child.node_ops = LazyFetchFS.node_ops;
                    child.stream_ops = LazyFetchFS.stream_ops;
                    child.assetsChildren = isFile ? null : {};
                    child.rootDir = subDirToMakeRoot;

                    node.assetsChildren[part] = child;
                }

                node = node.assetsChildren[part];
            }
        }
    }

    return LazyFetchFS;
}
