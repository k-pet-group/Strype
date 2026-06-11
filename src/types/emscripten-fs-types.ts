// This file is an AI-generated Typescript types for Emscripten's filesystem types (which have no publicly available type)
// Emscripten underpins Pyodide, so these are the file system hooks we have to provide for Pyodide.

import {CloudFileId, CloudFileInfo} from "@/stryperuntime/worker_bridge_type";

export interface FSNode {
    id: number;
    name: string;
    mode: number;
    parent: FSNode | null;
    mount: any;
    node_ops: FSNodeOpsFile | FSNodeOpsDir;
    stream_ops: FSStreamOpsFile | FSStreamOpsDir;
    size?: number;
    contents?: Uint8Array;
    // These are not part of Emscripten's type but we add them and use them:
    strypeCloudFileId: CloudFileId;
    strypeCloudCachedChildren?: CloudFileInfo[];
    assetsChildren : Record<string, FSNode>;
    assetsContent : Uint8ClampedArray;
    rootDir: string | undefined;
}

export interface FSStream {
    node: FSNode;           // the file/directory node
    position: number;       // current file pointer (seek position)
    flags: number;          // O_RDONLY | O_WRONLY | O_RDWR etc.
    mode: number;           // permission bits
    seekable: boolean;
    isTTY?: boolean;        // for device streams
    error?: number;         // errno if stream fails
    
    // optional custom data can go here
    [key: string]: any;
}

export interface FSAttr {
    dev: number;       // Device ID
    ino: number;       // Inode number
    mode: number;      // File mode (file type + permissions)
    nlink: number;     // Number of hard links
    uid: number;       // User ID
    gid: number;       // Group ID
    rdev: number;      // Device ID (if special file)
    size: number;      // File size in bytes
    atime: Date;       // Last access time
    mtime: Date;       // Last modification time
    ctime: Date;       // Last status change time
    blksize: number;   // Block size
    blocks: number;    // Number of 512B blocks allocated
}

export interface FSNodeOpsFile {
    getattr(node: FSNode): FSAttr;
    setattr?(node: FSNode, attr: Partial<{
        mode: number
        uid: number
        gid: number
        size: number
        atime: Date
        mtime: Date
        ctime: Date
    }>) : void;
    truncate?(node : FSNode, len : number) : void;
}
export interface FSNodeOpsDir {
    getattr(node: FSNode): FSAttr;
    lookup(parent: FSNode, name: string): FSNode;
    mknod?(parent: FSNode, name: string, mode: number, dev: number): FSNode;
    // We don't provide this but Emscripten would support it:
    // unlink(parent: FSNode, name: string): void;
    readdir(node: FSNode): string[];
}

export interface FSStreamOpsFile {
    open(stream: FSStream): void;
    read(
        stream: FSStream,
        buffer: Uint8Array | Int8Array,
        offset: number,
        length: number,
        position: number
    ): number;
    write?(
        stream: FSStream,
        buffer: Uint8Array | Int8Array,
        offset: number,
        length: number,
        position: number
    ): number;
    close(stream: FSStream): void;
    llseek(stream: FSStream, offset: number, whence: number): number;
}

export interface FSStreamOpsDir {
    llseek(stream: FSStream, offset: number, whence: number): number;
}

export interface EmscriptenFileSystemPlugin {
    mount(mount: any): FSNode;
    createNode?(
        parent: FSNode | null,
        name: string,
        mode: number,
        dev: number
    ): FSNode;
    node_ops: FSNodeOpsDir;
    stream_ops: FSStreamOpsDir;
}
