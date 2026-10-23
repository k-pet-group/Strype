import { test, expect } from "@playwright/test";
import { compareGitRepositories, findStrypeRepository, getGitFileLocation, getGitLocationLabel, GitFileIdStruct, GitLocationStruct, GitRepository, parseGitFileId, parseGitLocationId, toGitFileId, toGitLocationId } from "@/types/git-provider-types";
import { forgetGitLabInstance, getSelfManagedGitLabInstance, GITLAB_COM_URL, loadGitLabInstancesHistory, normaliseGitLabInstanceUrl, rememberGitLabInstance } from "@/helpers/gitlabInstances";
import { escapeHTML } from "@/helpers/common";

// NOTE: this is really a *unit* test for the pure helpers used by the Git providers (GitHub and GitLab) -- none of it
// touches a browser page. It's written as a Playwright spec to reuse the existing test infrastructure, as
// python-to-frames-preprocess.spec.ts does. (The helpers tested here are kept in modules that can be loaded without
// the rest of the app for that reason: see src/helpers/gitlabInstances.ts.)

const repository = (fullName: string, details: Partial<GitRepository> = {}): GitRepository => ({fullName, defaultBranch: "main", canPush: true, isOwnedByUser: false, ...details});

test.describe("Git file and location IDs", () => {
    const fileIds: GitFileIdStruct[] = [
        {repoId: "owner/repo", branchId: "main", path: "project.spy", fileName: "project.spy"},
        {repoId: "group/subgroup/project", branchId: "feature/new-thing", path: "some folder/sub#dir/élève ☃.spy", fileName: "élève ☃.spy"},
        {repoId: "owner/repo", branchId: "main", path: "\"quoted\" \\ back.spy", fileName: "\"quoted\" \\ back.spy"},
    ];
    for (const fileId of fileIds) {
        test(`round-trips the file ID of ${fileId.path}`, () => {
            expect(parseGitFileId(toGitFileId(fileId))).toEqual(fileId);
        });
    }

    test("round-trips a location ID, including the repository's root", () => {
        for (const location of [{repoId: "owner/repo", branchId: "dev/1", folderPath: "a/b c"}, {repoId: "owner/repo", branchId: "main", folderPath: ""}]) {
            expect(parseGitLocationId(toGitLocationId(location))).toEqual(location);
        }
    });

    test("doesn't take another Cloud Drive's IDs, or malformed ones, for Git IDs", () => {
        // (Google Drive and OneDrive IDs are plain strings, some only made of digits)
        for (const id of ["1AbCdEfGhIjKlMnOpQrStUvWxYz", "0123456789", "", "null", "{}", "[]", "{\"repoId\": \"owner/repo\"}", "{\"repoId\": 1, \"branchId\": \"main\", \"path\": \"a\", \"fileName\": \"a\"}", "{not json"]) {
            expect(parseGitFileId(id), id).toBeNull();
            expect(parseGitLocationId(id), id).toBeNull();
        }
        // A file ID isn't a location ID, and vice versa
        expect(parseGitLocationId(toGitFileId(fileIds[0]))).toBeNull();
        expect(parseGitFileId(toGitLocationId({repoId: "owner/repo", branchId: "main", folderPath: ""}))).toBeNull();
    });

    test("gives the folder containing a file as its location", () => {
        expect(getGitFileLocation({repoId: "owner/repo", branchId: "main", path: "a/b/project.spy", fileName: "project.spy"}))
            .toEqual({repoId: "owner/repo", branchId: "main", folderPath: "a/b"});
        expect(getGitFileLocation({repoId: "owner/repo", branchId: "main", path: "project.spy", fileName: "project.spy"}))
            .toEqual({repoId: "owner/repo", branchId: "main", folderPath: ""});
    });

    test("shows a location as the repository, its folder and the branch", () => {
        const label = (location: GitLocationStruct) => getGitLocationLabel(location);
        expect(label({repoId: "owner/repo", branchId: "main", folderPath: "some/folder"})).toBe("owner/repo/some/folder (main)");
        expect(label({repoId: "owner/repo", branchId: "dev", folderPath: ""})).toBe("owner/repo (dev)");
    });
});

test.describe("Git repositories", () => {
    test("lists the repositories the user can push to first, then alphabetically ignoring the case", () => {
        const repositories = [
            repository("zeta/readonly", {canPush: false}),
            repository("Beta/repo"),
            repository("alpha/readonly", {canPush: false}),
            repository("gamma/repo"),
            repository("alpha/repo"),
        ];
        expect(repositories.sort(compareGitRepositories).map((r) => r.fullName)).toEqual(["alpha/repo", "Beta/repo", "gamma/repo", "alpha/readonly", "zeta/readonly"]);
    });

    test("finds the user's own Strype repository rather than another one they can push to", () => {
        const repositories = [
            repository("my-org/Strype"),
            repository("someone-else/strype"),
            repository("me/STRYPE", {isOwnedByUser: true}),
        ];
        expect(findStrypeRepository(repositories)?.fullName).toBe("me/STRYPE");
    });

    test("falls back on the first Strype repository the user can push to when they don't own one", () => {
        const repositories = [
            repository("someone-else/Strype", {canPush: false, isOwnedByUser: true}),
            repository("group/subgroup/Strype"),
            repository("my-org/Strype"),
        ];
        expect(findStrypeRepository(repositories)?.fullName).toBe("group/subgroup/Strype");
    });

    test("only takes repositories named Strype that the user can push to and that pass the filter", () => {
        const repositories = [
            repository("me/Strype-old", {isOwnedByUser: true}),
            repository("me/my-strype", {isOwnedByUser: true}),
            repository("Strype/projects", {isOwnedByUser: true}),
            repository("someone-else/Strype", {canPush: false}),
        ];
        expect(findStrypeRepository(repositories)).toBeUndefined();
        expect(findStrypeRepository([])).toBeUndefined();

        const withEmptyOne = [repository("me/Strype", {isOwnedByUser: true, defaultBranch: ""}), repository("my-org/Strype")];
        expect(findStrypeRepository(withEmptyOne, (r) => r.defaultBranch.length > 0)?.fullName).toBe("my-org/Strype");
    });
});

test.describe("GitLab instance URLs", () => {
    test("normalises the address typed by the user", () => {
        expect(normaliseGitLabInstanceUrl("gitlab.example.org")).toBe("https://gitlab.example.org");
        expect(normaliseGitLabInstanceUrl("  gitlab.example.org/  ")).toBe("https://gitlab.example.org");
        expect(normaliseGitLabInstanceUrl("https://gitlab.example.org///")).toBe("https://gitlab.example.org");
        expect(normaliseGitLabInstanceUrl("HTTPS://GitLab.Example.org")).toBe("https://gitlab.example.org");
        expect(normaliseGitLabInstanceUrl("https://gitlab.example.org:8443/")).toBe("https://gitlab.example.org:8443");
        // (an instance can be served under a path)
        expect(normaliseGitLabInstanceUrl("https://example.org/gitlab/")).toBe("https://example.org/gitlab");
        // (a query or a fragment isn't part of the base URL)
        expect(normaliseGitLabInstanceUrl("https://gitlab.example.org/?tab=1#top")).toBe("https://gitlab.example.org");
    });

    test("only allows plain HTTP for a local server", () => {
        expect(normaliseGitLabInstanceUrl("http://gitlab.example.org")).toBeUndefined();
        expect(normaliseGitLabInstanceUrl("http://localhost:8080/")).toBe("http://localhost:8080");
        expect(normaliseGitLabInstanceUrl("http://127.0.0.1")).toBe("http://127.0.0.1");
        expect(normaliseGitLabInstanceUrl("http://[::1]:3000")).toBe("http://[::1]:3000");
        expect(normaliseGitLabInstanceUrl("http://localhost.example.org")).toBeUndefined();
    });

    test("rejects addresses that aren't HTTPS ones, contain credentials, or aren't valid", () => {
        for (const input of ["", "   ", "ftp://gitlab.example.org", "javascript://gitlab.example.org", "https://user:password@gitlab.example.org", "https://user@gitlab.example.org", "https://", "not a valid host"]) {
            expect(normaliseGitLabInstanceUrl(input), input).toBeUndefined();
        }
    });

    test("needs a valid address and an application ID for a self-managed instance", () => {
        expect(getSelfManagedGitLabInstance(" gitlab.example.org/ ", "  app-id  ")).toEqual({url: "https://gitlab.example.org", clientId: "app-id"});
        expect(getSelfManagedGitLabInstance("gitlab.example.org", "   ")).toBeUndefined();
        expect(getSelfManagedGitLabInstance("http://gitlab.example.org", "app-id")).toBeUndefined();
    });
});

test.describe("GitLab instances history", () => {
    const HISTORY_KEY = "strypeGitLabInstances", LEGACY_KEY = "strypeGitLabInstanceChoice";
    const selfManaged = {url: "https://gitlab.example.org", clientId: "app-1"};
    const otherSelfManaged = {url: "https://example.org/gitlab", clientId: "app-2"};
    let storage: Map<string, string>;

    test.beforeEach(() => {
        // The history is kept in the browser's local storage, which we replace by an in-memory one
        storage = new Map();
        Object.defineProperty(globalThis, "localStorage", {configurable: true, value: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: (key: string, value: string) => storage.set(key, String(value)),
            removeItem: (key: string) => storage.delete(key),
        }});
    });

    test.afterEach(() => {
        delete (globalThis as any).localStorage;
    });

    test("offers gitlab.com only, when no instance was remembered", () => {
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [], lastUsedUrl: GITLAB_COM_URL});
    });

    test("remembers the self-managed instances connected to, and the last one used", () => {
        rememberGitLabInstance(selfManaged);
        rememberGitLabInstance(otherSelfManaged);
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [selfManaged, otherSelfManaged], lastUsedUrl: otherSelfManaged.url});

        // Connecting again to a known instance updates its application ID without adding it again
        rememberGitLabInstance({...selfManaged, clientId: "app-1-new"});
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [{...selfManaged, clientId: "app-1-new"}, otherSelfManaged], lastUsedUrl: selfManaged.url});

        // gitlab.com is never added to the self-managed instances, but can be the last one used
        rememberGitLabInstance({url: GITLAB_COM_URL, clientId: "strype"});
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [{...selfManaged, clientId: "app-1-new"}, otherSelfManaged], lastUsedUrl: GITLAB_COM_URL});
    });

    test("forgets an instance, going back to gitlab.com if it was the last one used", () => {
        rememberGitLabInstance(selfManaged);
        rememberGitLabInstance(otherSelfManaged);
        forgetGitLabInstance(selfManaged.url);
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [otherSelfManaged], lastUsedUrl: otherSelfManaged.url});
        forgetGitLabInstance(otherSelfManaged.url);
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [], lastUsedUrl: GITLAB_COM_URL});
    });

    test("ignores invalid saved instances, and a last used one that isn't known", () => {
        storage.set(HISTORY_KEY, JSON.stringify({selfManagedInstances: [selfManaged, {url: "https://no-client-id.org"}, "https://a-string.org", null], lastUsedUrl: "https://unknown.org"}));
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [selfManaged], lastUsedUrl: GITLAB_COM_URL});

        storage.set(HISTORY_KEY, JSON.stringify({selfManagedInstances: "not a list", lastUsedUrl: 42}));
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [], lastUsedUrl: GITLAB_COM_URL});
    });

    test("uses the defaults when the saved history is corrupted", () => {
        storage.set(HISTORY_KEY, "{not json");
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [], lastUsedUrl: GITLAB_COM_URL});
    });

    test("keeps the self-managed instance remembered by the previous versions of Strype", () => {
        storage.set(LEGACY_KEY, JSON.stringify({useGitLabCom: false, selfManagedUrl: "gitlab.example.org/", selfManagedClientId: "app-1"}));
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [selfManaged], lastUsedUrl: selfManaged.url});

        storage.set(LEGACY_KEY, JSON.stringify({useGitLabCom: true, selfManagedUrl: "gitlab.example.org", selfManagedClientId: "app-1"}));
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [selfManaged], lastUsedUrl: GITLAB_COM_URL});

        // Once the history is saved, the previous versions' choice is dropped
        rememberGitLabInstance(otherSelfManaged);
        expect(storage.has(LEGACY_KEY)).toBe(false);
        expect(loadGitLabInstancesHistory()).toEqual({selfManagedInstances: [selfManaged, otherSelfManaged], lastUsedUrl: otherSelfManaged.url});
    });
});

test.describe("escapeHTML", () => {
    test("escapes the characters that are special in HTML", () => {
        expect(escapeHTML("<a href=\"x\" title='y'>Tom & Jerry</a>")).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;Tom &amp; Jerry&lt;/a&gt;");
        // (an "&" already escaped is escaped again, so the text shows as typed)
        expect(escapeHTML("&amp;")).toBe("&amp;amp;");
        expect(escapeHTML("Changes must be made through a pull request.")).toBe("Changes must be made through a pull request.");
    });
});
