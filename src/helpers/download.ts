import { saveAs } from "file-saver";
import { compileBlob } from "./compile";
import { parseCodeAndGetParseElements } from "@/parser/parser";
import { useStore } from "@/store/store";
import { MessageDefinitions } from "@/types/types";
import { getAppSimpleMsgDlgId } from "./editor";
import i18n from "@/i18n";
import { eventBus } from "./appContext";

export function downloadHex(showImagePopup?: boolean): void {
    const parserElements = parseCodeAndGetParseElements(true, "py");
    let succeeded = !parserElements.hasErrors;
    if(succeeded){
        const blob = compileBlob(parserElements.compiler);
        if (blob) {
            saveAs(blob, "main.hex");
        }
        else{
            succeeded = false;
        }
    }

    //We show the image only if the download has succeeded, and we request one to be shown
    if(!succeeded){
        // Notify the user of any detected errors in the code
        useStore().simpleModalDlgMsg = i18n.global.t("appMessage.preCompiledErrorNeedFix") as string;
        eventBus.emit("bv::show::modal", getAppSimpleMsgDlgId());
    }
    else if (showImagePopup){
        useStore().showMessage(MessageDefinitions.DownloadHex, null);
    }
}

export function getPythonContent(): Promise<string> {
    const parserElements = parseCodeAndGetParseElements(false, "py-export");
    if (parserElements.hasErrors) {
        // Notify the user of any detected errors in the code
        useStore().simpleModalDlgMsg = i18n.global.t("appMessage.preCompiledErrorNeedFix") as string;
        eventBus.emit("bv::show::modal", getAppSimpleMsgDlgId());
        return Promise.reject("");
    }
    return Promise.resolve(parserElements.parsedOutput);
}

export function downloadPython(): void {
    getPythonContent()
        .then((pyContent) => {
            const blob = new Blob(
                [pyContent],
                { type: "application/octet-stream" }
            );
            saveAs(
                blob,
                "main.py"
            );
        })
        // Do nothing on error, we already show a message in getPythonContent()
        .catch((_) => {});
}
