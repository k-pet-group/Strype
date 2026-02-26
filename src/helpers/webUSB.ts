import * as DAPjs from "dapjs";
import { compileFlashAndBuffer } from "./compile";
import {FormattedMessage, FormattedMessageArgKeyValuePlaceholders, MessageDefinitions, WebUSBListener} from "@/types/types";
import * as PartialFlashingJS from "./partial-flashing";
import { useStore } from "@/store/store"; 
import Compiler from "@/compiler/compiler";
import { parseCodeAndGetParseElements } from "@/parser/parser";
import { CustomEventTypes, getAppSimpleMsgDlgId } from "./editor";
import i18n from "@/i18n";
import { cloneDeep } from "lodash";
import { eventBus } from "./appContext";

export function flash(callerData: Record<string, any>) : void {
    let proceed = true;
            
    //before we actually try to check webUSB, we make sure the code doesn't have any other errors (tigerpython)
    const parserElements = parseCodeAndGetParseElements(true, "py");
    if (parserElements.hasErrors) {
        proceed = false;
        // Notify the user of any detected errors in the code
        useStore().simpleModalDlgMsg = i18n.global.t("appMessage.preCompiledErrorNeedFix") as string;
        eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
    }
               
    if(proceed){
        if (navigator.usb) {
            const webUSBListener: WebUSBListener = {
                onUploadProgressHandler: (percent) => {
                    callerData.showProgress = true;
                    callerData.progressPercent = percent;
                },

                onUploadSuccessHandler: () => {
                    useStore().showMessage(MessageDefinitions.UploadSuccessMicrobit, 7000);

                    callerData.showProgress = false;
                },
                onUploadFailureHandler: (error) => {
                    callerData.showProgress = false;

                    const message = cloneDeep(MessageDefinitions.UploadFailureMicrobit);
                    const msgObj: FormattedMessage = (message.message as FormattedMessage);
                    msgObj.args[FormattedMessageArgKeyValuePlaceholders.error.key] = msgObj.args.errorMsg.replace(FormattedMessageArgKeyValuePlaceholders.error.placeholderName, error);

                    useStore().showMessage(message, 7000);

                    callerData.showProgress = false;
                },
            };
            flashData(webUSBListener, parserElements.compiler);
        }
        else {
            // Notify the user of WebUSB is not available
            useStore().simpleModalDlgMsg = i18n.global.t("appMessage.noWebUSB") as string;
            eventBus.emit(CustomEventTypes.showStrypeModal, getAppSimpleMsgDlgId());
        }
    }
}

async function getUSBAccess() {
    const device = await navigator.usb.requestDevice({
        filters: [{ vendorId: 0x0d28, productId: 0x0204 }],
    });
    return device;
}

export async function connectUSB() : Promise<DAPjs.DAPLink> {
    const device = await getUSBAccess();

    const transport = new DAPjs.WebUSB(device);
    const daplink = new DAPjs.DAPLink(transport);

    return daplink;
}

export async function flashData(listener: WebUSBListener, compiler: Compiler) : Promise<void> {
    let progressValue = 0;

    const updateProgress = function(progress: number) {
        const currProgressValue = Math.ceil(progress * 100);
        //only trigger actions when a change is notified
        if(currProgressValue !== progressValue){
            listener.onUploadProgressHandler(currProgressValue);
            progressValue = currProgressValue;
        }
    };

    // The core part of the flashing process is here, this is based on the microbit python editor
    // (python-main.js)
    return PartialFlashingJS.PartialFlashing.connectDapAsync()
        .then(function() {
            const dapWrapper = useStore().DAPWrapper;
            // Warning: the boardID from DAPWrapper is a string, and in hex format, so we need to convert it 
            const boardId = parseInt(dapWrapper.boardId, 16);
            // as metioned on microbit's python-main.js: Collect data to flash, partial flashing can use just the flash bytes,
            // but full flashing needs the entire Intel Hex to include the UICR data
            const flashAndBufferArray: {flash: Uint8Array; buffer: ArrayBufferLike} | undefined = compileFlashAndBuffer(compiler, boardId);
            if(flashAndBufferArray){
                const flashBytes = flashAndBufferArray.flash;
                const hexBuffer = flashAndBufferArray.buffer;
                return PartialFlashingJS.PartialFlashing.flashAsync(dapWrapper, flashBytes, hexBuffer, updateProgress);
            }        
        }).then(()=>listener.onUploadSuccessHandler(), (error) => listener.onUploadFailureHandler(error.message));
}
