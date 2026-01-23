import Compiler from "@/compiler/compiler";
import { getAppSimpleMsgDlgId } from "./editor";
import { vm } from "@/main";
import i18n from "@/i18n";
import { useStore } from "@/store/store"; 

export function compileBlob(compiler: Compiler): Blob | undefined {
    try {
        const blob = compiler.getBlob();
        return blob;
    }
    catch {
        // Notify the user of any detected errors in the code
        useStore().simpleModalDlgMsg = i18n.t("appMessage.preCompiledErrorNeedFix") as string;
        vm.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
    }
}

// The content of this method is based on the microbit python editor (python-main.js)
export function compileFlashAndBuffer(compiler: Compiler, boardId: number): { flash: Uint8Array; buffer: ArrayBufferLike } | undefined {
    try {
        const flashBytes = compiler.getBytesForBoardId(boardId);
        const hexBuffer = compiler.getIntelHexForBoardId(boardId);
        return {flash: flashBytes, buffer: hexBuffer};
    }
    catch (error: any) {
        // Notify the user of a problem
        useStore().simpleModalDlgMsg = error.message;
        vm.$root.$emit("bv::show::modal", getAppSimpleMsgDlgId());
        return undefined;
    }
}
