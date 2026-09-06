# web-teleprompter

A teleprompter for phones that records from the browser, with the front camera behind like a teleprompter scrolling text.

Open it on a phone, prop the phone up, press Play to read or Record to film. The script scrolls over the camera picture right under the lens so your eyes stay near it. The take is handed to the phone's share sheet.

Built for [Postbarrel](https://postbarrel.com), where the script comes from an interview with you, and released on its own because the camera part cost several nights and the fixes deserve to be findable.

## Why this exists: the iPhone portrait problem

If you have ever tried to record a portrait video from the front camera in a mobile browser and got a sideways, zoomed in file, then this is for you. Three things are true on real phones in 2026 and none of them are in the docs:

1. **Ask for the camera in landscape numbers even when you want portrait.** Requesting `{ width: 1080, height: 1920 }` makes iOS Safari and Android Chrome hand back the sensor's wide 1920x1080 preset, unrotated. Requesting `{ width: 1920, height: 1080 }` lets the phone pick the preset and rotate the picture to the way it is held. This is what the WebRTC samples do. Read them before theorising.
2. **Do not trust the track's reported size.** On iOS 26.6, and on Android Chrome, the video track reports the sensor buffer (1920x1080) while the frame the browser draws is the rotated portrait picture, and the rotation flag that older iOS wrote into recordings is gone (Apple Developer Forums thread 786803). `measureDrawnFrame()` probes the real picture by drawing one frame onto a 16 pixel canvas and checking which way it extends.
3. **When the two disagree, record through a canvas.** `planRecordingStream()` returns either the raw stream (portrait picture, track agrees), a canvas stream of the whole picture (portrait picture, track says landscape) or a centre 9:16 crop (wide picture on a portrait screen). The file is then the picture the user saw.

There is a fourth thing: `MediaRecorder.isTypeSupported` says yes to H.264 Baseline and to High on Safari, and if you let list order decide you get Baseline and soft takes. `pickMimeType()` asks for High first.

## Use it

```bash
npm install
npm run dev      # demo page at http://localhost:5173, open it on your phone over your LAN to try Record
npm run build    # static demo in dist/
```

Or drop `src/lib/` into a React project. The component needs React 18 or 19 and nothing else.

```tsx
import { Teleprompter } from './lib'

<Teleprompter
  title="My take"
  text={script}                 // plain text, line breaks kept
  cueText={scriptWithCues}      // optional: same text with [delivery cues] in brackets (used in the postbarrel site)
  initialCues={false}
  editable                      // tap a line while paused to fix it
  onSaveLine={async (i, line) => { /* persist it, then return true on success */ return true }}
  onClose={() => setOpen(false)}
/>
```

Only the camera fixes, without the UI:

```ts
import { openFrontCamera, planRecordingStream, pickMimeType } from './lib'

const stream = await openFrontCamera()          // landscape constraints, sane fallbacks, permission errors thrown
video.srcObject = stream
const plan = planRecordingStream(video, stream) // raw | canvas-whole | canvas-crop
const rec = new MediaRecorder(plan.stream, { mimeType: pickMimeType(), videoBitsPerSecond: 10_000_000 })
rec.onstop = () => plan.stop()
```

## What the component does

- Read mode: three text sizes, speed slider, tap the text to pause, Restart, Mirror for a beam-splitter rig, Cues toggle, a wake lock so the screen does not dim mid-take, keyboard control on a laptop.
- Record mode: front camera behind the script, 3-2-1 countdown, Record and Stop with a timer, review the take, Share / Save through the share sheet, Download as a fallback, Record again.
- The text starts below the screen and rises, so nothing is on screen before the reader has read it. A faint reading line sits a third of the way down.
- Formats: Safari records `video/mp4` (uploads straight to TikTok and Instagram). Chrome on Android usually records `video/webm`, which those apps may not accept directly; the share sheet route usually handles it, the download route may not. The UI says so rather than hiding it.
- Serve over HTTPS or localhost: camera access needs a secure context. Add `Permissions-Policy: camera=(self), microphone=(self)` if your host sends a restrictive policy.

## Licence

MIT. Copyright 2026 Fuad Laguda.
