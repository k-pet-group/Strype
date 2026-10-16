// Connection to GitLab (gitlab.com, or a self-managed instance) with OAuth 2 "authorization code + PKCE".
// Unlike GitHub, GitLab lets us register Strype as a non-confidential ("public") application: no client secret
// is needed, and GitLab allows CORS on its token endpoints, so everything happens in the browser (no backend).
// A GitLab OAuth application only exists on the instance where it is registered: gitlab.com uses Strype's
// application (VITE_GITLAB_COM_CLIENTID), and a self-managed instance needs its own one, registered by its administrator.

import { GitAuthExpiredError, GitContentItem, GitHttpError, GitProviderAPI, readGitErrorDetails, GitRepository } from "@/types/git-provider-types";

export const GITLAB_COM_URL = "https://gitlab.com";
const CHANNEL_NAME = "strype-gl-auth";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
// "write_repository" only covers Git over HTTP, not the REST API: writing files through the API needs "api".
const SCOPES = "api";
const INSTANCES_HISTORY_STORAGE_KEY = "strypeGitLabInstances";
// (where a single self-managed instance was remembered before: read once to fill in the history)
const LEGACY_INSTANCE_CHOICE_STORAGE_KEY = "strypeGitLabInstanceChoice";

export interface GitLabInstance {
    // Base URL of the instance, without trailing slash (it may contain a path, e.g. https://example.org/gitlab)
    url: string;
    // ID of Strype's OAuth application on that instance
    clientId: string;
}

export interface GitLabAuth {
    instance: GitLabInstance;
    accessToken: string;
    // Timestamp (ms). GitLab access tokens expire after 2 hours.
    expiresAt?: number;
    // GitLab refresh tokens do not expire, but can only be used once.
    refreshToken?: string;
}

// The GitLab instances the user connected to (remembered for the next time, to offer them in the "Connect to GitLab" dialog).
export interface GitLabInstancesHistory {
    // The self-managed instances, in the order they were first connected to
    selfManagedInstances: GitLabInstance[];
    // URL of the instance last connected to (GITLAB_COM_URL for gitlab.com)
    lastUsedUrl: string;
}

// Thrown when the user must connect again (token revoked, or refresh failed).
export class GitLabAuthExpiredError extends GitAuthExpiredError {
    constructor() {
        super("The connection to GitLab has expired. Please connect again.");
    }
}

interface TokenResponse {access_token: string, expires_in?: number, refresh_token?: string}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteCount: number): string {
    return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
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

export function getGitLabComInstance(): GitLabInstance {
    return {url: GITLAB_COM_URL, clientId: import.meta.env.VITE_GITLAB_COM_CLIENTID ?? ""};
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

// The URL GitLab sends the user back to: it must be registered, exactly, in the GitLab application settings.
export function getGitLabRedirectUri(): string {
    return new URL(import.meta.env.BASE_URL + "gl-auth/callback.html", window.location.origin).href;
}

// Calls a token endpoint of the instance. The form encoded body keeps it a "simple" CORS request (no preflight).
async function postOAuthForm<T>(instance: GitLabInstance, endpoint: "token" | "revoke", params: Record<string, string>): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`${instance.url}/oauth/${endpoint}`, {
            method: "POST",
            body: new URLSearchParams({client_id: instance.clientId, ...params}),
        });
    }
    catch {
        // A network error, or the instance does not allow cross-origin requests (CORS)
        throw new Error(`Cannot reach the GitLab server ${instance.url}.`);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
    }
    return data as T;
}

function toAuth(instance: GitLabInstance, token: TokenResponse): GitLabAuth {
    return {
        instance,
        accessToken: token.access_token,
        expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
        refreshToken: token.refresh_token,
    };
}

// Resolves with the authorisation code sent by callback.html for this sign-in.
// We cannot rely on popup.closed to detect a cancelled popup (Cross-Origin-Opener-Policy may make it wrongly read true),
// so we time out instead.
function waitForCode(channel: BroadcastChannel, state: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("The connection to GitLab timed out.")), AUTH_TIMEOUT_MS);
        channel.onmessage = (event) => {
            const message = event.data;
            if (message?.type !== "strype-gl-auth-callback" || message.state !== state) {
                return; // Not for us (e.g. another Strype tab's sign-in, or a forged message)
            }
            clearTimeout(timeout);
            if (message.error || !message.code) {
                reject(new Error(message.errorDescription || message.error || "GitLab did not return a code."));
            }
            else {
                resolve(message.code);
            }
        };
    });
}

// Must be called directly from a click handler (or very shortly after): the popup is opened synchronously
// so that popup blockers allow it, and is only pointed at GitLab once the async work is done.
export function connectToGitLab(instance: GitLabInstance): Promise<GitLabAuth> {
    if (!instance.clientId) {
        return Promise.reject(new Error(`Strype has no application ID for ${instance.url}.`));
    }
    const popup = window.open("", "strype-gl-auth", "width=1000,height=750");
    if (!popup) {
        return Promise.reject(new Error("The popup was blocked. Please allow popups for Strype."));
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);

    return (async (): Promise<GitLabAuth> => {
        const redirectUri = getGitLabRedirectUri();
        const state = randomString(16);
        const codeVerifier = randomString(32); // 43 characters once encoded
        const codeChallenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))));

        // Listen before navigating the popup, so we cannot miss the reply.
        const codeReceived = waitForCode(channel, state);
        popup.location.href = `${instance.url}/oauth/authorize?` + new URLSearchParams({
            client_id: instance.clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: SCOPES,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
        });
        const code = await codeReceived;
        return toAuth(instance, await postOAuthForm<TokenResponse>(instance, "token", {
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier,
        }));
    })().catch((error) => {
        popup.close();
        throw error;
    }).finally(() => channel.close());
}

const refreshes = new WeakMap<GitLabAuth, Promise<void>>();

// Returns a valid access token, renewing it first if it is about to expire. "auth" is updated in place
// (with a new refresh token too), so save it again after calling this if you persist it.
export async function getGitLabAccessToken(auth: GitLabAuth): Promise<string> {
    if (auth.expiresAt !== undefined && auth.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        if (!auth.refreshToken) {
            throw new GitLabAuthExpiredError();
        }
        // A refresh token can only be used once, so concurrent calls share the same refresh.
        let refresh = refreshes.get(auth);
        if (!refresh) {
            refresh = postOAuthForm<TokenResponse>(auth.instance, "token", {
                grant_type: "refresh_token",
                refresh_token: auth.refreshToken,
                redirect_uri: getGitLabRedirectUri(),
            })
                .then((token) => {
                    Object.assign(auth, toAuth(auth.instance, token));
                }, () => {
                    throw new GitLabAuthExpiredError();
                })
                .finally(() => refreshes.delete(auth));
            refreshes.set(auth, refresh);
        }
        await refresh;
    }
    return auth.accessToken;
}

// Calls the GitLab REST API (path like "/projects") of the user's instance with their token.
export async function gitLabFetch(auth: GitLabAuth, path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(`${auth.instance.url}/api/v4${path}`, {
        ...init,
        headers: {
            ...(init.headers as Record<string, string> | undefined),
            "Authorization": `Bearer ${await getGitLabAccessToken(auth)}`,
        },
    });
    if (response.status === 401) {
        throw new GitLabAuthExpiredError();
    }
    return response;
}

// Thrown when a GitLab API call fails, with the HTTP status of the response.
export class GitLabHttpError extends GitHttpError {
    constructor(status: number, details?: string) {
        super(status, "GitLab", details);
    }
}

const PER_PAGE = 100;

// Gets all the pages of a list from the API (path like "/projects?simple=true").
// We stop on a partial page rather than relying on the pagination headers, which GitLab omits for large result sets.
async function getAllGitLabPages<T>(auth: GitLabAuth, path: string): Promise<T[]> {
    const items: T[] = [];
    const separator = path.includes("?") ? "&" : "?";
    for (let page = 1; ; page++) {
        const response = await gitLabFetch(auth, `${path}${separator}per_page=${PER_PAGE}&page=${page}`);
        if (!response.ok) {
            throw new GitLabHttpError(response.status);
        }
        const data: T[] = await response.json();
        items.push(...data);
        if (data.length < PER_PAGE) {
            return items;
        }
    }
}

// The API accepts a project's full path in place of its numeric ID, once URL encoded ("group%2Fproject").
function projectApiPath(projectFullPath: string): string {
    return `/projects/${encodeURIComponent(projectFullPath)}`;
}

// Returns the full paths ("group/subgroup/project") of all the projects whose code the user can read (Reporter role or above).
export async function listGitLabProjects(auth: GitLabAuth): Promise<string[]> {
    return (await listGitLabProjectsDetails(auth)).map((project) => project.fullName);
}

// Same as listGitLabProjects(), with some details about each project. Projects scheduled for deletion are left out.
export async function listGitLabProjectsDetails(auth: GitLabAuth): Promise<GitRepository[]> {
    // (we can't use the "simple" representation: it doesn't tell whether a project is scheduled for deletion, nor the user's permissions)
    // (a Guest can't read a private project's code: the Reporter role is the minimum we need)
    const [username, projects] = await Promise.all([getGitLabUsername(auth), getAllGitLabPages<{path_with_namespace: string, default_branch: string | null, archived: boolean, namespace: {kind: string, full_path: string}, permissions?: GitLabPermissions, marked_for_deletion_on?: string | null, marked_for_deletion_at?: string | null}>(auth, "/projects?" + new URLSearchParams({
        membership: "true",
        min_access_level: "20",
        order_by: "path",
        sort: "asc",
    }))]);
    // (depending on the GitLab version, the deletion date is given by either field)
    return projects.filter((project) => !project.marked_for_deletion_on && !project.marked_for_deletion_at).map((project) => ({
        fullName: project.path_with_namespace,
        defaultBranch: project.default_branch ?? "",
        // (an archived project is read-only)
        canPush: !project.archived && hasGitLabPushAccess(project.permissions),
        // A user's own projects are in their personal namespace, named after their username (case insensitive)
        isOwnedByUser: project.namespace.kind === "user" && project.namespace.full_path.toLowerCase() === username.toLowerCase(),
    }));
}

// Returns the username of the user the token is for.
async function getGitLabUsername(auth: GitLabAuth): Promise<string> {
    const response = await gitLabFetch(auth, "/user");
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    return (await response.json()).username;
}

// Returns the names of all the branches of a project ("group/project").
export async function listGitLabBranches(auth: GitLabAuth, projectFullPath: string): Promise<string[]> {
    const branches = await getAllGitLabPages<{name: string}>(auth, `${projectApiPath(projectFullPath)}/repository/branches`);
    return branches.map((branch) => branch.name);
}

// Returns the files and folders directly inside a folder ("" for the root) of a project's branch.
export async function listGitLabFolderContent(auth: GitLabAuth, projectFullPath: string, branch: string, folderPath: string): Promise<GitContentItem[]> {
    const params = new URLSearchParams({ref: branch});
    if (folderPath.length > 0) {
        params.set("path", folderPath);
    }
    let items: {name: string, path: string, type: string}[];
    try {
        items = await getAllGitLabPages(auth, `${projectApiPath(projectFullPath)}/repository/tree?${params}`);
    }
    catch (error) {
        if (error instanceof GitLabHttpError && error.status === 404 && folderPath.length === 0) {
            return []; // An empty repository has no root folder
        }
        throw error;
    }
    // The other type is "commit" (a submodule), which we cannot browse.
    return items.filter((item) => item.type === "blob" || item.type === "tree")
        .map((item) => ({name: item.name, path: item.path, isFolder: item.type === "tree"}));
}

// Returns the (UTF-8) text content of a file in a project's branch.
export async function getGitLabFileContent(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string): Promise<string> {
    // (the file path is a single URL parameter here: its slashes must be encoded too)
    const response = await gitLabFetch(auth, `${projectApiPath(projectFullPath)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(branch)}`);
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    return response.text();
}

// Returns the date (ISO 8601) of the last commit that changed a file in a project's branch,
// as Git doesn't keep a modification date for files.
export async function getGitLabFileLastCommitDate(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string): Promise<string> {
    const response = await gitLabFetch(auth, `${projectApiPath(projectFullPath)}/repository/commits?` + new URLSearchParams({ref_name: branch, path: filePath, per_page: "1"}));
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    const commits: {committed_date: string}[] = await response.json();
    if (commits.length == 0) {
        throw new GitLabHttpError(404);
    }
    return commits[0].committed_date;
}

// Returns whether the user can push to a project ("group/project"), that is whether they have the Developer role or above
// in the project itself or through its group.
export async function canPushToGitLabProject(auth: GitLabAuth, projectFullPath: string): Promise<boolean> {
    const response = await gitLabFetch(auth, projectApiPath(projectFullPath));
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    return hasGitLabPushAccess((await response.json()).permissions);
}

// The user's access to a project, as given with the project's details
interface GitLabPermissions {project_access: {access_level: number} | null, group_access: {access_level: number} | null}

// Whether the user has the Developer role or above, in the project itself or through its group.
function hasGitLabPushAccess(permissions: GitLabPermissions | undefined): boolean {
    return Math.max(permissions?.project_access?.access_level ?? 0, permissions?.group_access?.access_level ?? 0) >= 30;
}

// Commits a file's (UTF-8) text content to a project's branch, creating the file if it doesn't exist yet.
// The commit is done on GitLab, so there is nothing else to push.
export async function commitGitLabFile(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string, content: string, commitMessage: string): Promise<void> {
    // (the file path is a single URL parameter here: its slashes must be encoded too)
    const filePathForApi = `${projectApiPath(projectFullPath)}/repository/files/${encodeURIComponent(filePath)}`;
    // GitLab has distinct requests to create and to update a file, so we first check if the file exists.
    // We look for it in its folder's content rather than asking for the file itself: a new file would then get a
    // "404 Not Found" response, that browsers show as an error in the console even though it is expected.
    const lastSlashIndex = filePath.lastIndexOf("/");
    let folderContent: GitContentItem[];
    try {
        folderContent = await listGitLabFolderContent(auth, projectFullPath, branch, (lastSlashIndex > -1) ? filePath.substring(0, lastSlashIndex) : "");
    }
    catch (error) {
        if (!(error instanceof GitLabHttpError && error.status === 404)) {
            throw error;
        }
        folderContent = []; // The folder doesn't exist (yet): the file is new, the commit creates the folder too
    }
    const isExistingFile = folderContent.some((item) => item.path === filePath && !item.isFolder);
    const response = await gitLabFetch(auth, filePathForApi, {
        method: (isExistingFile) ? "PUT" : "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({branch, content, commit_message: commitMessage}),
    });
    if (!response.ok) {
        // (the provider explains why, for example when the branch is protected)
        throw new GitLabHttpError(response.status, await readGitErrorDetails(response));
    }
}

// Creates a private, empty project in the user's own namespace.
export async function createGitLabProject(auth: GitLabAuth, name: string): Promise<GitRepository> {
    const response = await gitLabFetch(auth, "/projects", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name, visibility: "private"}),
    });
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    // (an empty project may have no default branch yet)
    const project: {path_with_namespace: string, default_branch: string | null} = await response.json();
    return {fullName: project.path_with_namespace, defaultBranch: project.default_branch ?? "", canPush: true, isOwnedByUser: true};
}

// Revokes the token, so Strype can no longer access GitLab with it.
export async function disconnectFromGitLab(auth: GitLabAuth): Promise<void> {
    await postOAuthForm(auth.instance, "revoke", {token: auth.accessToken});
}

// Whether the connection is (still) valid: asking for the authenticated user checks the token.
// (gitLabFetch() renews the token first if it is about to expire, and throws GitLabAuthExpiredError on a 401.)
async function isGitLabConnectionValid(auth: GitLabAuth): Promise<boolean> {
    return (await gitLabFetch(auth, "/user")).ok;
}

// GitLab for the parts of Strype shared by all Git providers. A project is identified by its full path ("group/subgroup/project").
export const gitLabAPI: GitProviderAPI<GitLabAuth> = {
    isConnectionValid: isGitLabConnectionValid,
    listRepositories: listGitLabProjectsDetails,
    listBranches: listGitLabBranches,
    listFolderContent: listGitLabFolderContent,
    getFileContent: getGitLabFileContent,
    getFileLastCommitDate: getGitLabFileLastCommitDate,
    canPushToRepository: canPushToGitLabProject,
    commitFile: commitGitLabFile,
    createRepository: createGitLabProject,
};
