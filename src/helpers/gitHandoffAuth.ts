// What the Git providers give, as their connection, to a new Strype tab opened by Strype, and accept back there
// (see cloudHandoff.ts and GitProviderAPI's toHandoffAuth()/fromHandoffAuth()).
// Kept apart from githubAuth.ts and gitlabAuth.ts (which use import.meta) so it can be loaded without the rest of the app,
// e.g. in tests (see cloud-handoff.spec.ts): only types are imported from them.
import type { GitHubAuth } from "@/helpers/githubAuth";
import type { GitLabAuth } from "@/helpers/gitlabAuth";
import { getSelfManagedGitLabInstance } from "@/helpers/gitlabInstances";

// A refresh token can only be used once, so two tabs can't share it: it isn't given
// (the new tab asks the user to connect again when the access token expires).
export function toGitHubHandoffAuth(auth: GitHubAuth): GitHubAuth {
    return {accessToken: auth.accessToken, expiresAt: auth.expiresAt};
}

export function fromGitHubHandoffAuth(data: unknown): GitHubAuth | null {
    const auth = data as Partial<GitHubAuth> | null | undefined;
    if(typeof auth?.accessToken !== "string" || auth.accessToken.length == 0 || (auth.expiresAt !== undefined && typeof auth.expiresAt !== "number")){
        return null;
    }
    return {accessToken: auth.accessToken, expiresAt: auth.expiresAt};
}

export function toGitLabHandoffAuth(auth: GitLabAuth): GitLabAuth {
    return {instance: {url: auth.instance.url, clientId: auth.instance.clientId}, accessToken: auth.accessToken, expiresAt: auth.expiresAt};
}

export function fromGitLabHandoffAuth(data: unknown): GitLabAuth | null {
    const auth = data as Partial<GitLabAuth> | null | undefined;
    // (the instance is checked like one typed by the user: the token is sent to it)
    const instance = (typeof auth?.instance?.url === "string" && typeof auth.instance.clientId === "string")
        ? getSelfManagedGitLabInstance(auth.instance.url, auth.instance.clientId)
        : undefined;
    if(instance == undefined || typeof auth?.accessToken !== "string" || auth.accessToken.length == 0 || (auth.expiresAt !== undefined && typeof auth.expiresAt !== "number")){
        return null;
    }
    return {instance, accessToken: auth.accessToken, expiresAt: auth.expiresAt};
}
