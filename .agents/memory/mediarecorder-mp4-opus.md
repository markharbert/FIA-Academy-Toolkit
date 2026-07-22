---
name: MediaRecorder MP4 audio is Opus — silent in desktop players
description: Why browser-recorded .mp4 files play with no audio in QuickTime/Windows Media Player and what a fix requires.
---

## Rule
Chrome/Edge MediaRecorder producing `video/mp4` muxes **H.264 video + Opus audio** (Chromium ships no AAC encoder). Opus-in-MP4 is not supported by QuickTime (macOS default player) or Windows Media Player — the downloaded file plays video with **silent audio**, while browser playback (Toolkit, Chrome tab) plays the same file with audio fine.

## Why
Confirmed July 2026 via ffprobe on a member's production teleprompter recording: streams were `h264/avc1 + opus` in an .mp4 container. Member reported "downloads but no audio on playback" across machines; audio was present and fine in-browser.

## How to Apply
- Any feature that lets users download browser-recorded MP4s needs a server-side audio transcode to AAC before the file is universally playable: `ffmpeg -i in.mp4 -c:v copy -c:a aac out.mp4` (video stream copied, fast even for large files; can be folded into the existing faststart remux step).
- Do NOT assume "it's already .mp4 so it plays everywhere." Check the audio codec.
- A `-c copy` faststart remux preserves Opus — it does not fix this.
