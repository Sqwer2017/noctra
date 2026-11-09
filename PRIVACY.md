# Noctra Privacy Policy

**Effective date:** 9 November 2026

Noctra is a local-first desktop music player. This policy explains what data
the application processes and where it is stored.

## Data we collect

The Noctra project does **not** operate an account server and does **not**
collect telemetry, analytics, advertising identifiers, or listening history on
behalf of the developer.

Noctra does not send your library, favorites, playlists, listening history, or
settings to the maintainer.

## Data stored on your device

The application stores its settings, profile progress, playlists, favorites,
listening history, cached metadata, and downloaded media locally:

- Windows: `%APPDATA%\Noctra` and `%LOCALAPPDATA%\Noctra`
- macOS: `~/Library/Application Support/Noctra`
- Linux: `~/.config/noctra` and `~/.cache/noctra`

You can remove this data by deleting the application data folders. Backups can
be created and restored from the application settings.

## Third-party services

Noctra can connect to third-party services to search, stream, import, or
display music metadata. Depending on the features you use, requests may be sent
to services such as YouTube, YouTube Music, SoundCloud, Deezer, Apple Music,
Spotify, Last.fm, Discord, Genius, LRCLIB, or Google.

These requests are made from your device and are subject to the privacy policies
of the respective services. Noctra does not control those services.

Optional integrations:

- **Discord Rich Presence** shares the current track, artist, and playback time
  with the local Discord client when enabled.
- **Last.fm** sends scrobbles and now-playing information when you connect an
  account and enable scrobbling.
- **Google sign-in** is optional and is used to access your YouTube library
  and playlists.
- **Spotify import** sends the playlist URL to Spotify to read public playlist
  metadata, or reads a Spotify data export you select locally.
- **Spotify login** uses Spotify's OAuth flow and stores the resulting tokens
  locally when configured.

You can disable optional integrations in the application settings.

## Cookies and local tokens

Authentication tokens and cookies for connected services are stored locally on
your device. They are not sent to the Noctra maintainer. You can disconnect
services and clear this data from the application settings or by removing the
application data folders.

## Children's privacy

Noctra is not directed at children and does not knowingly collect personal data
from children.

## Security

Noctra is open source. The source code is available at
https://github.com/Sqwer2017/noctra. If you find a security issue, please report
it privately to the maintainer through GitHub's security reporting tools or by
opening an issue without including secrets.

## Changes to this policy

This policy may be updated when the application changes. The current version is
always published in this repository.

## Contact

Questions about this policy can be sent through the issue tracker:
https://github.com/Sqwer2017/noctra/issues
