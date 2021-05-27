import { saveAs } from "file-saver";
import { compileBlob } from "./compile";
import Parser from "@/parser/parser";

export function downloadHex(): boolean {
    const blob = compileBlob();

    if (blob) {
        saveAs(
            blob,
            "main.hex"
        );
        return true;
    }
    return false;
}

export function downloadPython() {
    const parser = new Parser();
    const out = parser.parse();

    const errors = parser.getErrorsFormatted(out);
    if (errors) {
        alert(`Error:${errors}`);
        return;
    }

    const blob = new Blob(
        [out],
        { type: "application/octet-stream" }
    );
    saveAs(
        blob,
        "main.py"
    );
}
