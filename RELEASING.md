# Releasing

Releases are published to npm by GitHub Actions using npm **trusted publishing**
(OIDC). There is no npm token stored on this repository.

## One-time setup

Trusted publishing is configured from a package's settings page, so it cannot be
used for the very first publish of a package that does not exist yet. The first
release goes out from a workstation; everything after that goes out from CI.

### 1. Publish the first version manually

```bash
npm login --auth-type=web   # opens a browser, covers 2FA including passkeys
npm publish --access public # prepublishOnly reruns typecheck, tests and build
```

If the account requires two-factor authentication on writes and the second
factor is a security key rather than an authenticator app, the CLI cannot prompt
for it. Use a recovery code from the account's 2FA settings:
`npm publish --access public --otp=<recovery-code>`.

### 2. Register the trusted publisher

On npmjs.com, open the package, then **Settings** and the **Trusted Publisher**
section. Every field is case-sensitive and must match this repository exactly:

| Field                | Value            |
| -------------------- | ---------------- |
| Publisher            | GitHub Actions   |
| Organization or user | `smeet666`       |
| Repository           | `mcp-archiveorg` |
| Workflow filename    | `publish.yml`    |
| Environment          | leave empty      |

### 3. Revoke anything used to bootstrap

Any token or recovery code used for the first publish should be revoked once
trusted publishing works, since it is no longer needed.

## Every release after that

1. Bump the version in **five** places, which must stay in step:
   - `package.json`
   - `package-lock.json`, whose root `version` field is easy to forget by hand
   - `server.json` (twice: the top-level `version` and each package `version`)
   - `packaging/manifest.json`, which names the version inside the `.mcpb`
   - `src/version.ts`, which feeds the User-Agent sent to the Internet Archive

   `npm version patch --no-git-tag-version` covers the first two together, which
   is why it is preferred over editing `package.json` directly.

2. Update `CHANGELOG.md`.
3. Commit, then tag and push:

```bash
npm version patch --no-git-tag-version   # package.json + package-lock.json
# then edit server.json, packaging/manifest.json and src/version.ts to match
git commit -am "Release v1.0.1"
git tag v1.0.1
git push origin main --tags
```

The `publish.yml` workflow reruns typecheck, tests and build, then publishes
with `--provenance`, which links the published tarball to the exact commit and
workflow run that produced it. A second job builds the `.mcpb` bundle and
attaches it to the GitHub release.

## Verifying a release

```bash
npm view mcp-archiveorg version
npx -y mcp-archiveorg          # should start and wait on stdin
```

The npm package page should show a provenance badge pointing at the workflow
run.

Note that publishing is permanent: a version can only be unpublished within 72
hours, and the name stays reserved afterwards.

## Listing on the MCP registry

`server.json` at the repository root is ready for the official MCP registry.
`publish-registry.yml` runs after a successful npm publish, stamps the bundle's
SHA-256 into the `mcpb` package entry, and publishes the listing. It can also be
dispatched by hand to catch up a version whose registry entry was missed.

Publishing the listing from a workstation instead:

```bash
mcp-publisher login github -token "$(gh auth token)"
mcp-publisher publish
```

Ownership is proven by matching the `mcpName` field in `package.json` against
this repository.

## The live canary

`live-canary.yml` runs the live suite nightly and opens an issue when it fails.
It matters here because the upstream is a public site rather than a versioned
API: the response shapes this server reads can change without notice, and the
unit tests run on generated fixtures that would stay green while the published
server is broken for everyone.
