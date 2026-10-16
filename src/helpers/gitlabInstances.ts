// The GitLab instances (gitlab.com, or self-managed ones) the user can connect to, and those they connected to before,
// remembered in the browser. This is kept apart from gitlabAuth.ts, which relies on the build's environment (import.meta.env),
// so that it can be loaded without the rest of the app (e.g. in unit tests).

export const GITLAB_COM_URL = "https://gitlab.com";
const INSTANCES_HISTORY_STORAGE_KEY = "strypeGitLabInstances";
// (where a single self-managed instance was remembered before: read once to fill in the history)
const LEGACY_INSTANCE_CHOICE_STORAGE_KEY = "strypeGitLabInstanceChoice";

export interface GitLabInstance {
    // Base URL of the instance, without trailing slash (it may contain a path, e.g. https://example.org/gitlab)
    url: string;
    // ID of Strype's OAuth application on that instance
    clientId: string;
}

// The GitLab instances the user connected to (remembered for the next time, to offer them in the "Connect to GitLab" dialog).
export interface GitLabInstancesHistory {
    // The self-managed instances, in the order they were first connected to
    selfManagedInstances: GitLabInstance[];
    // URL of the instance last connected to (GITLAB_COM_URL for gitlab.com)
    lastUsedUrl: string;
}

// Returns the normalised base URL of a GitLab instance typed by the user ("gitlab.example.org/" -> "https://gitlab.example.org"),
// or undefined if it is not a valid address. Plain HTTP is only allowed for a local server (tokens would travel in clear otherwise).
export function normaliseGitLabInstanceUrl(input: string): string | undefined {
    let text = input.trim();
    if (text.length == 0) {
        return undefined;
    }
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
        text = "https://" + text;
    }
    let url: URL;
    try {
        url = new URL(text);
    }
    catch {
        return undefined;
    }
    const isLocalHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol != "https:" && !(url.protocol == "http:" && isLocalHost)) || url.username || url.password) {
        return undefined;
    }
    return (url.origin + url.pathname).replace(/\/+$/, "");
}

// Returns the self-managed instance typed by the user, or undefined if its details are incomplete or invalid.
export function getSelfManagedGitLabInstance(url: string, clientId: string): GitLabInstance | undefined {
    const normalisedUrl = normaliseGitLabInstanceUrl(url);
    const trimmedClientId = clientId.trim();
    return (normalisedUrl && trimmedClientId.length > 0) ? {url: normalisedUrl, clientId: trimmedClientId} : undefined;
}

function isGitLabInstance(value: unknown): value is GitLabInstance {
    return typeof (value as GitLabInstance)?.url === "string" && typeof (value as GitLabInstance)?.clientId === "string";
}

export function loadGitLabInstancesHistory(): GitLabInstancesHistory {
    const history: GitLabInstancesHistory = {selfManagedInstances: [], lastUsedUrl: GITLAB_COM_URL};
    try {
        const saved = JSON.parse(localStorage.getItem(INSTANCES_HISTORY_STORAGE_KEY) ?? "null");
        if (saved) {
            history.selfManagedInstances = Array.isArray(saved.selfManagedInstances) ? saved.selfManagedInstances.filter(isGitLabInstance) : [];
            if (typeof saved.lastUsedUrl === "string" && history.selfManagedInstances.some((instance) => instance.url === saved.lastUsedUrl)) {
                history.lastUsedUrl = saved.lastUsedUrl;
            }
        }
        else {
            // Nothing saved yet: keep the self-managed instance remembered by the previous versions of Strype, if any
            const legacy = JSON.parse(localStorage.getItem(LEGACY_INSTANCE_CHOICE_STORAGE_KEY) ?? "{}");
            const legacyInstance = getSelfManagedGitLabInstance(legacy.selfManagedUrl ?? "", legacy.selfManagedClientId ?? "");
            if (legacyInstance) {
                history.selfManagedInstances.push(legacyInstance);
                if (legacy.useGitLabCom === false) {
                    history.lastUsedUrl = legacyInstance.url;
                }
            }
        }
    }
    catch {
        // Storage unavailable or corrupted: use the defaults
    }
    return history;
}

function saveGitLabInstancesHistory(history: GitLabInstancesHistory): void {
    try {
        localStorage.setItem(INSTANCES_HISTORY_STORAGE_KEY, JSON.stringify(history));
        localStorage.removeItem(LEGACY_INSTANCE_CHOICE_STORAGE_KEY);
    }
    catch {
        // Storage unavailable: the instances just won't be remembered
    }
}

// Remembers that the user connected to this instance (updating its application ID if it was already known).
export function rememberGitLabInstance(instance: GitLabInstance): void {
    const history = loadGitLabInstancesHistory();
    if (instance.url !== GITLAB_COM_URL) {
        const known = history.selfManagedInstances.find((knownInstance) => knownInstance.url === instance.url);
        if (known) {
            known.clientId = instance.clientId;
        }
        else {
            history.selfManagedInstances.push({url: instance.url, clientId: instance.clientId});
        }
    }
    history.lastUsedUrl = instance.url;
    saveGitLabInstancesHistory(history);
}

// Removes a self-managed instance from the ones offered to the user.
export function forgetGitLabInstance(url: string): void {
    const history = loadGitLabInstancesHistory();
    history.selfManagedInstances = history.selfManagedInstances.filter((instance) => instance.url !== url);
    if (history.lastUsedUrl === url) {
        history.lastUsedUrl = GITLAB_COM_URL;
    }
    saveGitLabInstancesHistory(history);
}
