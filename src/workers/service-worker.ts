/// <reference lib="webworker" />
import { serviceWorkerFetchListener } from "sync-message";

declare let self: ServiceWorkerGlobalScope;

// Required for InjectManifest (see vue.config.js), even though we don't actually use the variable
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const unused = self.__WB_MANIFEST || [];


self.addEventListener("activate", (event) => {
    // Claim clients immediately so pages are controlled without reload
    event.waitUntil(self.clients.claim());
});

const syncMessageFetchListener = serviceWorkerFetchListener();

self.addEventListener("fetch", (e) => {
    if (e instanceof FetchEvent) {
        syncMessageFetchListener(e);
    }
});
