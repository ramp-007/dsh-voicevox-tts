# Security policy

## Reporting

Please report vulnerabilities privately through GitHub's "Report a vulnerability" (Security → Advisories) on this repository. Do not open a public issue for security problems.

## Design

- Connection target: loopback by default. Remote hosts require an explicit setting and https; URL credentials, non-http(s) schemes and link-local addresses are always rejected.
- Local API (`/dsh-voicevox-api/*`): not covered by DSH's `/api` authentication. It rejects cross-site and non-loopback `Origin`, requires `application/json` for writes, limits body and text size, and offers four fixed operations only.
- Privacy: reply text is sent only to the configured VOICEVOX Engine and is never logged. Audio is kept in memory only.
- The repository must not contain secrets, personal settings, conversations or absolute local paths.

## Known gaps

No authentication header for remote Engines; no protection against DNS rebinding of a remote hostname beyond requiring https.
