import {firmwareV1, firmwareV2} from "./firmware";
import { MicropythonFsHex, microbitBoardId } from "@microbit/microbit-fs";
import { readFileAsync } from "@/helpers/common";

export default class Compiler {
    micropythonFs: MicropythonFsHex;
    constructor() {
        this.micropythonFs = new MicropythonFsHex([{ hex: firmwareV1, boardId: microbitBoardId.V1 }, 
            { hex: firmwareV2, boardId: microbitBoardId.V2 }]);
        this.micropythonFs.setStorageSize(20 * 1024);
    }
    public compile(inputPython: string) : void {
        this.micropythonFs.write(
            "main.py",
            inputPython
        );
    }
    public getUniversalHex(): string {
        //retrieve the universal HEX file to be compatible by both v1 and v2 (https://tech.microbit.org/software/hex-format/)
        return this.micropythonFs.getUniversalHex();
    }
    public getBlob(): Blob {
        const code = this.getUniversalHex();

        return new Blob(
            [code],
            { "type": "application/octet-stream" }
        );
    }
    public async getBuffer(): Promise<BufferSource> {
        const code = this.getBlob();

        const buffer = await readFileAsync(code);

        return buffer;
    }

    /**
   * The two methods below are wrappers based on the code used on the microbit python editor
   * There is something a bit unclear about the board ID to use as the V1 or V2 values from 
   * microBoardId enum do not always work, but the +1 values, as they use, work..
   */
    public getBytesForBoardId(boardId: number): Uint8Array {
        if (boardId == microbitBoardId.V1 || boardId == microbitBoardId.V1+1) {
            return this.micropythonFs.getIntelHexBytes(0x9900);
        } 
        else {//microbitBoardId.V2 || microbitBoardId.V2+1
            return this.micropythonFs.getIntelHexBytes(0x9903);
        }
    }
  
    public getIntelHexForBoardId(boardId: number): ArrayBufferLike{
        let hexStr: string;
        if (boardId == microbitBoardId.V1 || boardId == 0x9901) {
            hexStr = this.micropythonFs.getIntelHex(0x9900);
        } 
        else {//microbitBoardId.V2 || microbitBoardId.V2+1
            hexStr = this.micropythonFs.getIntelHex(0x9903);
        }
        // iHex is ASCII so we can do a 1-to-1 conversion from chars to bytes
        const hexBuffer = new Uint8Array(hexStr.length);
        for (let i = 0, strLen = hexStr.length; i < strLen; i++) {
            hexBuffer[i] = hexStr.charCodeAt(i);
        }
        return hexBuffer.buffer;
    }
}
