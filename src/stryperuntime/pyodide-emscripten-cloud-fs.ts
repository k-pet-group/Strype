// This file provides an interface to Emscripten's file system that forwards all the messages to our main
// thread via our communication protocols in worker_bridge_type.  The actual implementation of handling
// these methods is in main_thread_python_handler.ts

import {EmscriptenFileSystemPlugin, FSAttr, FSNode, FSNodeOpsDir, FSNodeOpsFile, FSStream, FSStreamOpsDir, FSStreamOpsFile} from "@/types/emscripten-fs-types";
import {syncBridge} from "@/workers/python_execution_type";
import {PyodideAPI} from "pyodide";
import {decodeStringToUint8, encodeUint8ToString} from "@/stryperuntime/worker_bridge_type";

// Gets full file path by stitching together all parent paths:
export function getFullFilePath(node: FSNode) : string {
    let s = node.name;
    // The root of the file system has its parent as itself, so stop there:
    if (node.parent && node.parent != node) {
        s = getFullFilePath(node.parent) + "/" + s;
    }
    return s;
}

// Pyodide/Emscripten doesn't expose these constants so we must replicate them here:
const S_IFDIR = 0o040000; // This means directory
const S_IFREG = 0o100000; // This means regular file (i.e. not dir)
//const SEEK_SET = 0; // Currently unused
const SEEK_CUR = 1;
const SEEK_END = 2;
const EINVAL = 22;
const ENOENT = 44;
function isDir(mode: number) {
    return (mode & S_IFDIR) != 0;
}

function llseek(stream : FSStream, offset : number, whence : number) {
    var position = offset;
    if (whence === SEEK_CUR) {
        position += stream.position;
    }
    else if (whence === SEEK_END) {
        if (!isDir(stream.node.mode)) {
            position += (stream.node as any)?.usedBytes ?? 0;
        }
    }
    if (position < 0) {
        throw new Error("Errno: " + EINVAL + " Invalid seek position");
    }
    return position;
}

function getattr(node: FSNode) : FSAttr {
    const size = isDir(node.mode) ? 4096 : (node.size ?? 0);
    return {
        dev: 0,
        ino: node.id,
        mode: node.mode,
        nlink: 1,
        uid: 0,
        gid: 0,
        rdev: 0,
        size: size,
        atime: new Date(0),
        mtime: new Date(0),
        ctime: new Date(0),
        blksize: 4096,
        blocks: Math.ceil(size / 4096),
    };
}

function setattr(node: FSNode, attr: Partial<{
    mode: number
    uid: number
    gid: number
    size: number
    atime: Date
    mtime: Date
    ctime: Date
}>): void {
    // The only thing we actually support changing is size, which basically
    // truncates the file:
    if (attr.size !== undefined) {
        node.size = syncBridge({request: "file_truncate", id: node.strypeCloudFileId, size: attr.size, filePath: getFullFilePath(node)});
    }
}

// Note that this function is run during Pyodide initialisation and should not actually contact the cloud, yet,
// nor make any syncBridge/asyncBridge calls directly.  All of that should only happen when the file system is
// actually accessed during the user's Python execution.
export function getFSForEmscripten(pyodide: PyodideAPI) : EmscriptenFileSystemPlugin {
    const FILE_STREAM_OPS : FSStreamOpsFile = {
        open(stream: FSStream) {
            // As I understand it, this is the main open call.  What I found confusing is that it takes a FSStream and
            // returns void, where I had expected that it would take a path and a mode, and return an FSStream.  But
            // Pyodide (via Emscripten) has already made the FSStream, given it an id, copied the requested mode from
            // the user's Python open() call.
            syncBridge({request: "file_open", flags: stream.flags, id: stream.node.strypeCloudFileId});
        },
        read(stream: FSStream, buffer: Uint8Array | Int8Array, offset: number, length: number, position: number): number {
            const content = decodeStringToUint8(syncBridge({request: "file_read", id: stream.node.strypeCloudFileId, from: position, length, filePath: getFullFilePath(stream.node)}));
            buffer.set(content, offset);
            return content.length;
        },
        write(stream: FSStream, buffer: Uint8Array | Int8Array, offset: number, length: number, position: number): number {
            if ((stream.flags & stream.isAppend) != 0 && stream.node.size) {
                // Very strangely, stream.isAppend returns the flag value rather than a boolean.
                // When the file opened in append mode, the position 0 is against the end of file.
                position = stream.node.size;
            }
            // It seems Pyodide/Emscripten can give an Int8Array so we must convert to make the bytes in 0-255 range before encoding to string:
            const u8 = new Uint8Array(buffer.buffer, offset, length);
            syncBridge({request: "file_write", id: stream.node.strypeCloudFileId, from: position, encodedContent: encodeUint8ToString(u8), filePath: getFullFilePath(stream.node)});
            return length;
        },
        close(stream: FSStream) {
            syncBridge({request: "file_close", id: stream.node.strypeCloudFileId});
        },
        llseek,
    };
    const DIR_STREAM_OPS : FSStreamOpsDir = { llseek };
    const FILE_NODE_OPS : FSNodeOpsFile = {
        getattr,
        setattr,
        truncate(node : FSNode, len : number) {
            syncBridge({request: "file_truncate", id: node.strypeCloudFileId, size: len, filePath: getFullFilePath(node)});
        },
    };
    const DIR_NODE_OPS : FSNodeOpsDir = {
        lookup(parent: FSNode, name: string): FSNode {
            // Check if it's cached and prefer that:
            const cachedInfo = parent.strypeCloudCachedChildren?.find((f) => f.name === name);
            const r = cachedInfo ?? syncBridge({request: "file_lookup", parent: parent.strypeCloudFileId, name});
            if (!r) {
                throw new pyodide.FS.ErrnoError(ENOENT);
            }
            const node = pyodide.FS.createNode(parent, name, (r.isDir ? S_IFDIR : S_IFREG) | 0o777, 0);
            node.strypeCloudFileId = r.fileId;
            if (r.isDir) {
                node.node_ops = DIR_NODE_OPS;
                node.stream_ops = DIR_STREAM_OPS;
            }
            else {
                node.node_ops = FILE_NODE_OPS;
                node.stream_ops = FILE_STREAM_OPS;
                node.size = r.fileSize;
            }
            return node;
        },
        readdir(node: FSNode): string[] {
            const files = syncBridge({request: "file_listDir", parent: node.strypeCloudFileId});
            // Cache the info:
            node.strypeCloudCachedChildren = files;
            return files.map((f) => f.name);
        },
        getattr,
        mknod(parent: FSNode, name: string, mode: number, dev: number): FSNode {
            const dir = isDir(mode);
            const fileId = syncBridge({request: "file_createNode", parent: parent.strypeCloudFileId, name, isDir: dir, filePath: getFullFilePath(parent) + "/" + name});
            const node = pyodide.FS.createNode(parent, name, mode, dev);
            node.strypeCloudFileId = fileId;
            if (isDir(mode)) {
                node.node_ops = DIR_NODE_OPS;
                node.stream_ops = DIR_STREAM_OPS;
            }
            else {
                node.node_ops = FILE_NODE_OPS;
                node.stream_ops = FILE_STREAM_OPS;
            }
            // Cache in parent:
            parent.strypeCloudCachedChildren ??= [];
            parent.strypeCloudCachedChildren.push({fileId, name, isDir: isDir(mode), fileSize: 0});
            return node;
        },
    };
    
    
    return {
        mount(mount) {
            // Although we are mounted at /cloud, within our own file system it is "/"
            // so we must give that as the root node:
            const root : FSNode = pyodide.FS.createNode(null, "/", S_IFDIR | 0o777, 0);
            root.mount = mount;
            // I know this looks weird but apparently to denote the root node of a file system,
            // Emscripten uses the fact that the root's parent is itself:
            root.parent = root;
            root.strypeCloudFileId = syncBridge({request: "file_getRoot"});
            root.node_ops = DIR_NODE_OPS;
            root.stream_ops = DIR_STREAM_OPS;
            return root;
        },
        createNode(parent: FSNode | null, name: string, mode: number, dev: number): FSNode {
            const node = pyodide.FS.createNode(parent, name, mode, dev);
            // Note that this doesn't actually make a file, it just makes an FSNode
            // object that reflects an existing file.
            // Making a file/directory is done by mknod in the node ops.
            const dir = isDir(mode);
            node.node_ops = dir ? DIR_NODE_OPS : FILE_NODE_OPS;
            node.stream_ops = dir ? DIR_STREAM_OPS : FILE_STREAM_OPS;
            return node;
        },
        node_ops: DIR_NODE_OPS,
        stream_ops: DIR_STREAM_OPS,
    };
}
