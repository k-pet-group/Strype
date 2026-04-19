// ErrorDetails from Pyodide
export interface PyodideErrorDetails {
    error_type: string,
    error_message: string,
    text: string,
    traceback: {filename: string, lineno: number}[]
}

export async function serviceWorkerReadyAndInControl() : Promise<void> {
    await navigator.serviceWorker.ready;

    // If already controlled, all is fine:
    if (navigator.serviceWorker.controller) {
        return;
    }
    // Wait until the service worker takes control:
    await new Promise((resolve) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
    });
}

