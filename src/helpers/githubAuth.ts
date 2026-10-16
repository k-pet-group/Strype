import { GitAuthExpiredError, GitContentItem, GitHttpError, GitProviderAPI, readGitErrorDetails, GitRepository } from "@/types/git-provider-types";

const GH_AUTH_API = "/gh-auth/api"; // same origin; use an absolute URL if the editor is served elsewhere
const GITHUB_API = "https://api.github.com";
const CHANNEL_NAME = "strype-gh-auth";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const INSTALL_TIMEOUT_MS = 15 * 60 * 1000;
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface GitHubAuth {
    accessToken: string;
    // Timestamps (ms). Absent if token expiry is disabled in the GitHub App settings.
    expiresAt?: number;
    refreshToken?: string;
    refreshTokenExpiresAt?: number;
}

export interface GitHubConnection {
    auth: GitHubAuth;
    // Whether Strype is installed on at least one of the user's accounts (otherwise it sees none of their repositories)
    installed: boolean;
    // When not installed, the popup has moved on to the installation page:
    // this resolves when the user has finished there (true if Strype is now installed).
    installation?: Promise<boolean>;
}

// Thrown when the user must connect again (token revoked, or refresh token expired).
export class GitHubAuthExpiredError extends GitAuthExpiredError {
    constructor() {
        super("The connection to GitHub has expired. Please connect again.");
    }
}

interface GhAuthConfig {clientId: string, redirectUri: string, installUrl: string}
interface TokenResponse {access_token: string, expires_in?: number, refresh_token?: string, refresh_token_expires_in?: number}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(byteCount: number): string {
    return base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
}

async function postJson<T>(endpoint: string, body: object): Promise<T> {
    const response = await fetch(`${GH_AUTH_API}/${endpoint}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error_description || data.error || `HTTP ${response.status}`);
    }
    return data as T;
}

async function getConfig(): Promise<GhAuthConfig> {
    const response = await fetch(`${GH_AUTH_API}/config`);
    if (!response.ok) {
        throw new Error(`Cannot reach the GitHub connection service (HTTP ${response.status})`);
    }
    return response.json();
}

function toAuth(token: TokenResponse): GitHubAuth {
    const now = Date.now();
    return {
        accessToken: token.access_token,
        expiresAt: token.expires_in ? now + token.expires_in * 1000 : undefined,
        refreshToken: token.refresh_token,
        refreshTokenExpiresAt: token.refresh_token_expires_in ? now + token.refresh_token_expires_in * 1000 : undefined,
    };
}

// Resolves with the first channel message for which "accept" returns a value (undefined = not for us; throwing rejects).
// We cannot rely on popup.closed to detect a cancelled popup: it can wrongly read true once GitHub's
// Cross-Origin-Opener-Policy has applied. So we time out instead.
function waitForMessage<T>(channel: BroadcastChannel, timeoutMs: number, accept: (message: any) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("The connection to GitHub timed out.")), timeoutMs);
        channel.onmessage = (event) => {
            try {
                const result = accept(event.data);
                if (result !== undefined) {
                    clearTimeout(timeout);
                    resolve(result);
                }
            }
            catch (error) {
                clearTimeout(timeout);
                reject(error);
            }
        };
    });
}

function waitForInstallation(channel: BroadcastChannel, auth: GitHubAuth): Promise<boolean> {
    return waitForMessage(channel, INSTALL_TIMEOUT_MS, (message) => message?.type === "strype-gh-auth-installed" ? true : undefined)
        .catch(() => false) // timed out: the user probably closed the popup; we check anyway below
        .then(() => isGitHubAppInstalled(auth))
        .finally(() => channel.close());
}

// Must be called directly from the button's click handler: the popup is opened synchronously
// so that popup blockers allow it, and is only pointed at GitHub once the async work is done.
export function connectToGitHub(): Promise<GitHubConnection> {
    const popup = window.open("", "strype-gh-auth", "width=1000,height=750");
    if (!popup) {
        return Promise.reject(new Error("The popup was blocked. Please allow popups for Strype."));
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);

    return (async (): Promise<GitHubConnection> => {
        const config = await getConfig();
        const state = randomString(16);
        const codeVerifier = randomString(32); // 43 characters once encoded
        const codeChallenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier))));

        // Listen before navigating the popup, so we cannot miss the reply.
        const codeReceived = waitForMessage(channel, AUTH_TIMEOUT_MS, (message) => {
            if (message?.type !== "strype-gh-auth-callback" || message.state !== state) {
                return undefined; // Not for us (e.g. another Strype tab's sign-in, or a forged message)
            }
            if (message.error || !message.code) {
                throw new Error(message.errorDescription || message.error || "GitHub did not return a code.");
            }
            return message.code as string;
        });
        popup.location.href = "https://github.com/login/oauth/authorize?" + new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: "S256",
            allow_signup: "true",
        });
        const code = await codeReceived;

        // The callback page waits for our answer: close, or go on to the installation page.
        let auth: GitHubAuth;
        let installed: boolean;
        try {
            auth = toAuth(await postJson<TokenResponse>("token", {code, code_verifier: codeVerifier}));
            installed = await isGitHubAppInstalled(auth);
        }
        catch (error) {
            channel.postMessage({type: "strype-gh-auth-continue", state, error: true});
            throw error;
        }
        if (installed) {
            channel.postMessage({type: "strype-gh-auth-continue", state});
            channel.close();
            return {auth, installed};
        }
        const installation = waitForInstallation(channel, auth);
        channel.postMessage({type: "strype-gh-auth-continue", state, installUrl: config.installUrl});
        return {auth, installed, installation};
    })().catch((error) => {
        channel.close();
        popup.close();
        throw error;
    });
}

// Lets an already connected user install Strype, or change which repositories it can use.
// Like connectToGitHub(), it must be called directly from a click handler.
export function manageGitHubRepositories(auth: GitHubAuth): Promise<boolean> {
    const popup = window.open("", "strype-gh-auth", "width=1000,height=750");
    if (!popup) {
        return Promise.reject(new Error("The popup was blocked. Please allow popups for Strype."));
    }
    const channel = new BroadcastChannel(CHANNEL_NAME);
    const installation = waitForInstallation(channel, auth);
    getConfig().then((config) => {
        popup.location.href = config.installUrl;
    }, () => popup.close());
    return installation;
}

const refreshes = new WeakMap<GitHubAuth, Promise<void>>();

// Returns a valid access token, renewing it first if it is about to expire. "auth" is updated in place
// (with a new refresh token too), so save it again after calling this if you persist it.
export async function getGitHubAccessToken(auth: GitHubAuth): Promise<string> {
    if (auth.expiresAt !== undefined && auth.expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        if (!auth.refreshToken || (auth.refreshTokenExpiresAt !== undefined && auth.refreshTokenExpiresAt < Date.now())) {
            throw new GitHubAuthExpiredError();
        }
        // A refresh token can only be used once, so concurrent calls share the same refresh.
        let refresh = refreshes.get(auth);
        if (!refresh) {
            refresh = postJson<TokenResponse>("refresh", {refresh_token: auth.refreshToken})
                .then((token) => {
                    Object.assign(auth, toAuth(token));
                }, () => {
                    throw new GitHubAuthExpiredError();
                })
                .finally(() => refreshes.delete(auth));
            refreshes.set(auth, refresh);
        }
        await refresh;
    }
    return auth.accessToken;
}

// Calls the GitHub REST API (path like "/user/installations") with the user's token.
export async function gitHubFetch(auth: GitHubAuth, path: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(GITHUB_API + path, {
        ...init,
        headers: {
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            ...(init.headers as Record<string, string> | undefined),
            "Authorization": `Bearer ${await getGitHubAccessToken(auth)}`,
        },
    });
    if (response.status === 401) {
        throw new GitHubAuthExpiredError();
    }
    return response;
}

export async function isGitHubAppInstalled(auth: GitHubAuth): Promise<boolean> {
    const response = await gitHubFetch(auth, "/user/installations");
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    return (await response.json()).total_count > 0;
}

// Returns the full names ("owner/repo") of all the repositories Strype can access for the user,
// across all the accounts on which it is installed.
export async function listGitHubRepositories(auth: GitHubAuth): Promise<string[]> {
    return (await listGitHubRepositoriesDetails(auth)).map((repository) => repository.fullName);
}

// Same as listGitHubRepositories(), with some details about each repository.
export async function listGitHubRepositoriesDetails(auth: GitHubAuth): Promise<GitRepository[]> {
    const getAllPages = async <T>(path: string, key: string): Promise<T[]> => {
        const items: T[] = [];
        for (let page = 1; ; page++) {
            const response = await gitHubFetch(auth, `${path}?per_page=100&page=${page}`);
            if (!response.ok) {
                throw new GitHubHttpError(response.status);
            }
            const data = await response.json();
            items.push(...data[key]);
            if (items.length >= data.total_count || data[key].length == 0) {
                return items;
            }
        }
    };
    const [userLogin, installations] = await Promise.all([getGitHubUserLogin(auth), getAllPages<{id: number}>("/user/installations", "installations")]);
    const repositories = await Promise.all(installations.map((installation) =>
        getAllPages<{full_name: string, default_branch: string, owner: {login: string}, permissions?: {push?: boolean}}>(`/user/installations/${installation.id}/repositories`, "repositories")));
    return repositories.flat().map((repository) => ({
        fullName: repository.full_name,
        defaultBranch: repository.default_branch,
        canPush: repository.permissions?.push === true,
        // (GitHub logins are case insensitive)
        isOwnedByUser: repository.owner.login.toLowerCase() === userLogin.toLowerCase(),
    }));
}

// Returns the login of the user the token is for.
async function getGitHubUserLogin(auth: GitHubAuth): Promise<string> {
    const response = await gitHubFetch(auth, "/user");
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    return (await response.json()).login;
}

// Returns the names of all the branches of a repository ("owner/repo").
export async function listGitHubBranches(auth: GitHubAuth, repositoryFullName: string): Promise<string[]> {
    const branches: string[] = [];
    for (let page = 1; ; page++) {
        const response = await gitHubFetch(auth, `/repos/${repositoryFullName}/branches?per_page=100&page=${page}`);
        if (!response.ok) {
            throw new GitHubHttpError(response.status);
        }
        const data: {name: string}[] = await response.json();
        branches.push(...data.map((branch) => branch.name));
        if (data.length < 100) {
            return branches;
        }
    }
}

// Returns the files and folders directly inside a folder ("" for the root) of a repository's branch.
export async function listGitHubFolderContent(auth: GitHubAuth, repositoryFullName: string, branch: string, folderPath: string): Promise<GitContentItem[]> {
    const items = await getGitHubFolderItems(auth, repositoryFullName, branch, folderPath);
    // Other types are symbolic links and submodules, which we cannot browse.
    return items.filter((item) => item.type === "file" || item.type === "dir")
        .map((item) => ({name: item.name, path: item.path, isFolder: item.type === "dir"}));
}

// The raw description of the items directly inside a folder ("" for the root) of a repository's branch.
async function getGitHubFolderItems(auth: GitHubAuth, repositoryFullName: string, branch: string, folderPath: string): Promise<{name: string, path: string, type: string, sha: string}[]> {
    const encodedPath = encodeGitHubPath(folderPath);
    const response = await gitHubFetch(auth, `/repos/${repositoryFullName}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);
    if (response.status === 404 && encodedPath.length === 0) {
        return []; // An empty repository has no root folder
    }
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    return response.json();
}

// Thrown when a GitHub API call fails, with the HTTP status of the response.
export class GitHubHttpError extends GitHttpError {
    constructor(status: number, details?: string) {
        super(status, "GitHub", details);
    }
}

function encodeGitHubPath(path: string): string {
    return path.split("/").filter((part) => part.length > 0).map(encodeURIComponent).join("/");
}

// Returns the (UTF-8) text content of a file in a repository's branch.
// We ask for the raw content: the default (JSON) answer only contains the content for files up to 1 MB.
export async function getGitHubFileContent(auth: GitHubAuth, repositoryFullName: string, branch: string, filePath: string): Promise<string> {
    const response = await gitHubFetch(auth, `/repos/${repositoryFullName}/contents/${encodeGitHubPath(filePath)}?ref=${encodeURIComponent(branch)}`, {headers: {"Accept": "application/vnd.github.raw+json"}});
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    return response.text();
}

// Returns the date (ISO 8601) of the last commit that changed a file in a repository's branch,
// as Git doesn't keep a modification date for files.
export async function getGitHubFileLastCommitDate(auth: GitHubAuth, repositoryFullName: string, branch: string, filePath: string): Promise<string> {
    const response = await gitHubFetch(auth, `/repos/${repositoryFullName}/commits?` + new URLSearchParams({sha: branch, path: filePath, per_page: "1"}));
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    const commits: {commit: {committer: {date: string}}}[] = await response.json();
    if (commits.length == 0) {
        throw new GitHubHttpError(404);
    }
    return commits[0].commit.committer.date;
}

// Returns whether the user can push to a repository ("owner/repo").
export async function canPushToGitHubRepository(auth: GitHubAuth, repositoryFullName: string): Promise<boolean> {
    const response = await gitHubFetch(auth, `/repos/${repositoryFullName}`);
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    return (await response.json()).permissions?.push === true;
}

// The base64 encoding of a text's UTF-8 bytes (btoa() alone only accepts Latin-1 text).
function utf8ToBase64(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    // (by chunks: spreading a large array as arguments would overflow the stack)
    const CHUNK_SIZE = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
    }
    return btoa(binary);
}

// Commits a file's (UTF-8) text content to a repository's branch, creating the file if it doesn't exist yet.
// The commit is done on GitHub, so there is nothing else to push. (Strype must have the "Contents" write permission.)
export async function commitGitHubFile(auth: GitHubAuth, repositoryFullName: string, branch: string, filePath: string, content: string, commitMessage: string): Promise<void> {
    const contentPath = `/repos/${repositoryFullName}/contents/${encodeGitHubPath(filePath)}`;
    // Updating a file requires the SHA of the blob it replaces: we get the current one, so the commit goes on top of the branch's latest version.
    // We look for the file in its folder's content (which gives the SHAs) rather than asking for the file itself: a new file
    // would then get a "404 Not Found" response, that browsers show as an error in the console even though it is expected.
    const lastSlashIndex = filePath.lastIndexOf("/");
    let folderItems: {path: string, type: string, sha: string}[];
    try {
        folderItems = await getGitHubFolderItems(auth, repositoryFullName, branch, (lastSlashIndex > -1) ? filePath.substring(0, lastSlashIndex) : "");
    }
    catch (error) {
        if (!(error instanceof GitHubHttpError && error.status === 404)) {
            throw error;
        }
        folderItems = []; // The folder doesn't exist (yet): the file is new, the commit creates the folder too
    }
    const sha = folderItems.find((item) => item.path === filePath && item.type === "file")?.sha;
    const response = await gitHubFetch(auth, contentPath, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({message: commitMessage, content: utf8ToBase64(content), branch, sha}),
    });
    if (!response.ok) {
        // (the provider explains why, for example when the branch is protected)
        throw new GitHubHttpError(response.status, await readGitErrorDetails(response));
    }
}

// Creates a private, empty repository owned by the user. (Strype must have the "Administration" write permission,
// and must be installed on all the user's repositories to then access it.)
export async function createGitHubRepository(auth: GitHubAuth, name: string): Promise<GitRepository> {
    const response = await gitHubFetch(auth, "/user/repos", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({name, private: true}),
    });
    if (!response.ok) {
        throw new GitHubHttpError(response.status);
    }
    const repository: {full_name: string, default_branch?: string} = await response.json();
    return {fullName: repository.full_name, defaultBranch: repository.default_branch ?? "", canPush: true, isOwnedByUser: true};
}

// Revokes the token. This does not uninstall the app: users do that in their GitHub settings > Applications.
export async function disconnectFromGitHub(auth: GitHubAuth): Promise<void> {
    await postJson("revoke", {access_token: auth.accessToken});
}

// Whether the connection is (still) valid: asking for the authenticated user checks the token.
// (gitHubFetch() renews the token first if it is about to expire, and throws GitHubAuthExpiredError on a 401.)
async function isGitHubConnectionValid(auth: GitHubAuth): Promise<boolean> {
    return (await gitHubFetch(auth, "/user")).ok;
}

// GitHub for the parts of Strype shared by all Git providers. A repository is identified by its full name ("owner/repo").
export const gitHubAPI: GitProviderAPI<GitHubAuth> = {
    isConnectionValid: isGitHubConnectionValid,
    listRepositories: listGitHubRepositoriesDetails,
    listBranches: listGitHubBranches,
    listFolderContent: listGitHubFolderContent,
    getFileContent: getGitHubFileContent,
    getFileLastCommitDate: getGitHubFileLastCommitDate,
    canPushToRepository: canPushToGitHubRepository,
    commitFile: commitGitHubFile,
    createRepository: createGitHubRepository,
};
