import type { PyodideInterface } from "pyodide";
let pyodidePromise : Promise<PyodideInterface> | null = null;

declare const globalThis : any;
export function getPyodide() : Promise<PyodideInterface> {
    if (!pyodidePromise) {
        pyodidePromise = (async () => {
            const pyodide : PyodideInterface = await globalThis.loadPyodide({
                indexURL: "./js/pyodide-0.29.0/",
            });

            return pyodide;
        })();
    }

    return pyodidePromise;
}
