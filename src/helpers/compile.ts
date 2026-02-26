import Compiler from "@/compiler/compiler";
import { CustomEventTypes, getAppSimpleMsgDlgId } from "./editor";
import i18n from "@/i18n";
import { useStore } from "@/store/store"; 
import { eventBus } from "./appContext";

export function compileBlob(compiler: Compiler): Blob | undefined {
    try {
        const blob = compiler.getBlob();
        return blob;
    }
    catch {
        // Notify the user of any detected errors in the code
        useStore().simpleModalDlgMsg = i18n.global.t("appMessage.preCompiledErrorNeedFix") as string;
        eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
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
        eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
        return undefined;
    }
}
