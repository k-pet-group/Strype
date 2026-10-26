// Connection to GitLab (gitlab.com, or a self-managed instance) with OAuth 2 "authorization code + PKCE".
// Unlike GitHub, GitLab lets us register Strype as a non-confidential ("public") application: no client secret
// is needed, and GitLab allows CORS on its token endpoints, so everything happens in the browser (no backend).
// A GitLab OAuth application only exists on the instance where it is registered: gitlab.com uses Strype's
// application (VITE_GITLAB_COM_CLIENTID), and a self-managed instance needs its own one, registered by its administrator.

import { GitAuthExpiredError, GitContentItem, GitHttpError, GitProviderAPI, readGitErrorDetails, GitRepository } from "@/types/git-provider-types";
import { GITLAB_COM_URL, GitLabInstance } from "@/helpers/gitlabInstances";
import { base64Url, randomBase64UrlString } from "@/helpers/common";

const CHANNEL_NAME = "strype-gl-auth";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
// "write_repository" only covers Git over HTTP, not the REST API: writing files through the API needs "api".
const SCOPES = "api";

export interface GitLabAuth {
    instance: GitLabInstance;
    accessToken: string;
    // Timestamp (ms). GitLab access tokens expire after 2 hours.
    expiresAt?: number;
    // GitLab refresh tokens do not expire, but can only be used once.
    refreshToken?: string;
}

// Thrown when the user must connect again (token revoked, or refresh failed).
export class GitLabAuthExpiredError extends GitAuthExpiredError {
    constructor() {
        super("The connection to GitLab has expired. Please connect again.");
    }
}

interface TokenResponse {access_token: string, expires_in?: number, refresh_token?: string}

export function getGitLabComInstance(): GitLabInstance {
    return {url: GITLAB_COM_URL, clientId: import.meta.env.VITE_GITLAB_COM_CLIENTID ?? ""};
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
        const state = randomBase64UrlString(16);
        const codeVerifier = randomBase64UrlString(32); // 43 characters once encoded
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
    return fetchWithGitLabToken(auth, `${auth.instance.url}/api/v4${path}`, init);
}

// Calls a URL of the user's instance with their token.
async function fetchWithGitLabToken(auth: GitLabAuth, url: string, init: RequestInit): Promise<Response> {
    const response = await fetch(url, {
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

// Runs a query on the GitLab GraphQL API of the user's instance with their token, and returns its data.
// (GraphQL reports the query's errors in the body of an OK response: we throw them as GitLabHttpError too)
async function gitLabGraphQL<T>(auth: GitLabAuth, query: string, variables: Record<string, unknown>): Promise<T> {
    const response = await fetchWithGitLabToken(auth, `${auth.instance.url}/api/graphql`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({query, variables}),
    });
    if (!response.ok) {
        throw new GitLabHttpError(response.status, await readGitErrorDetails(response));
    }
    const body: {data?: T, errors?: {message: string}[]} = await response.json();
    if (body.errors?.length || body.data == undefined) {
        throw new GitLabHttpError(response.status, body.errors?.map((error) => error.message).join("\n"));
    }
    return body.data;
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

// The number of files we get the sizes of with one GraphQL query. GraphQL allows pages of up to 100 items,
// but a query's "complexity" grows with its page size (about 2 per item), and GitLab rejects queries above 200
// (250 when signed in, but we keep a margin): 100 items is over, 50 is well under.
const GRAPHQL_FILES_PAGE_SIZE = 50;

// Returns the sizes (in bytes) of files of a project's branch, by their paths. The REST API doesn't give them when listing
// a folder, so we get them from the GraphQL API, for many files at once.
async function getGitLabFileSizes(auth: GitLabAuth, projectFullPath: string, branch: string, filePaths: string[]): Promise<Map<string, number>> {
    const query = `query($fullPath: ID!, $ref: String!, $paths: [String!]!) {
        project(fullPath: $fullPath) { repository { blobs(ref: $ref, paths: $paths, first: ${GRAPHQL_FILES_PAGE_SIZE}) { nodes { path size } } } }
    }`;
    // (a page has at most GRAPHQL_FILES_PAGE_SIZE files, so we ask for that many files at a time)
    const pathsGroups: string[][] = [];
    for (let start = 0; start < filePaths.length; start += GRAPHQL_FILES_PAGE_SIZE) {
        pathsGroups.push(filePaths.slice(start, start + GRAPHQL_FILES_PAGE_SIZE));
    }
    const sizes = new Map<string, number>();
    await Promise.all(pathsGroups.map(async (paths) => {
        const data = await gitLabGraphQL<{project: {repository: {blobs: {nodes: {path: string, size: string | number | null}[]}}} | null}>(auth, query, {fullPath: projectFullPath, ref: branch, paths});
        // (the size is a "BigInt", which GraphQL gives as a string)
        data.project?.repository.blobs.nodes.forEach((blob) => {
            if (blob.size != null) {
                sizes.set(blob.path, Number(blob.size));
            }
        });
    }));
    return sizes;
}

// Returns the files and folders directly inside a folder ("" for the root) of a project's branch,
// with the files' sizes if withSizes is set (it takes another query, see getGitLabFileSizes()).
export async function listGitLabFolderContent(auth: GitLabAuth, projectFullPath: string, branch: string, folderPath: string, withSizes?: boolean): Promise<GitContentItem[]> {
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
    const contentItems: GitContentItem[] = items.filter((item) => item.type === "blob" || item.type === "tree")
        .map((item) => ({name: item.name, path: item.path, isFolder: item.type === "tree"}));
    const filePaths = contentItems.filter((item) => !item.isFolder).map((item) => item.path);
    if (withSizes && filePaths.length > 0) {
        try {
            const sizes = await getGitLabFileSizes(auth, projectFullPath, branch, filePaths);
            contentItems.forEach((item) => item.size = (item.isFolder) ? undefined : sizes.get(item.path));        
        }
        catch (error) {
            // The sizes are only a nice to have (reading a file still gets all its content): we list the files without them
            if (error instanceof GitAuthExpiredError) {
                throw error;
            }
            console.warn("Could not get the sizes of the GitLab files in " + folderPath, error);
        }
    }
    return contentItems;
}

// Returns the response with the raw content of a file in a project's branch.
async function fetchGitLabRawFile(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string): Promise<Response> {
    // (the file path is a single URL parameter here: its slashes must be encoded too)
    const response = await gitLabFetch(auth, `${projectApiPath(projectFullPath)}/repository/files/${encodeURIComponent(filePath)}/raw?ref=${encodeURIComponent(branch)}`);
    if (!response.ok) {
        throw new GitLabHttpError(response.status);
    }
    return response;
}

// Returns the (UTF-8) text content of a file in a project's branch.
export async function getGitLabFileContent(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string): Promise<string> {
    return (await fetchGitLabRawFile(auth, projectFullPath, branch, filePath)).text();
}

// Returns the raw content of a file in a project's branch.
export async function getGitLabFileBytes(auth: GitLabAuth, projectFullPath: string, branch: string, filePath: string): Promise<Uint8Array> {
    return new Uint8Array(await (await fetchGitLabRawFile(auth, projectFullPath, branch, filePath)).arrayBuffer());
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
    getFileBytes: getGitLabFileBytes,
    getFileLastCommitDate: getGitLabFileLastCommitDate,
    canPushToRepository: canPushToGitLabProject,
    commitFile: commitGitLabFile,
    createRepository: createGitLabProject,
};
