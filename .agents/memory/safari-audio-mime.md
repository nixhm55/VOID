---
name: Safari local-audio MIME handling
description: Preserve MP3/M4A decoding and duration when Safari supplies generic file MIME types.
---

Do not treat a local audio file's declared MIME type as authoritative. Some Safari imports can surface with a generic type such as `application/octet-stream`, which prevents the browser from reading duration or decoding an otherwise valid MP3. Resolve common audio extensions to canonical MIME types for both newly imported files and older IndexedDB records, without changing the audio bytes.

**Why:** A VOID user saw an MP3 in their library with no duration and a Safari decode error. A generated MP3 labeled with a generic MIME reproduced the failure in Chromium and worked after assigning the canonical MP3 type.

**How to apply:** When changing local audio import or playback, test extension-based MIME repair for new imports and previously stored blobs. Do not clear or require reimporting the user's library.
