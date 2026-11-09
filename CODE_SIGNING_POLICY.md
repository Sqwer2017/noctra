# Noctra Code Signing Policy

Free code signing provided by SignPath.io, certificate by SignPath Foundation.

This policy applies to Windows builds of Noctra distributed through the official
GitHub Releases page.

## Roles

Noctra is a solo-maintained open-source project. One person holds all roles:

| Role | Person | Responsibility |
| --- | --- | --- |
| Author / Committer | Sqwer2017 | Maintains the source code and prepares releases |
| Reviewer | Sqwer2017 | Reviews changes before they are merged and released |
| Signing Approver | Sqwer2017 | Manually approves every SignPath signing request |

If additional maintainers join the project, release signing approval becomes a
two-person process and will not be performed by the release author alone.

## Build and signing process

- Builds are produced from the official repository:
  https://github.com/Sqwer2017/noctra
- Windows builds are produced by GitHub Actions from the tagged source.
- Only artifacts built from this repository are submitted to SignPath.
- Each signing request is manually approved in the SignPath portal before the
  artifact is published.
- Signed files are timestamped so the signature remains valid after the
  certificate expires.

## Scope

SignPath signs Noctra binaries built from this repository. Third-party tools
such as yt-dlp, FFmpeg, or ffprobe are separate projects and are not signed by
the SignPath Foundation certificate.

## Verification

Users can verify the signature of Windows executables with:

```powershell
Get-AuthenticodeSignature .\Noctra.exe
```

A valid signature reports `Status: Valid` and the SignPath Foundation as the
certificate publisher.
