---
title: Why your web teleprompter records sideways on iPhone, and the fix
published: false
tags: javascript, webdev, ios, webrtc
canonical_url: https://github.com/lagudafuadtosin/web-teleprompter
---

I built a teleprompter that runs in the phone's browser and records the take with the front camera behind the script. The scrolling part took an evening. The recording part took three nights, and every one of them was the same bug wearing a different hat: the take came out sideways, or zoomed into one eye, or both.

If you have ever asked `getUserMedia` for a portrait video on a phone and got a landscape file back, this is what was going on, and what fixed it. The code is on GitHub: [web-teleprompter](https://github.com/lagudafuadtosin/web-teleprompter). MIT, no dependencies beyond React.

## The setup

A phone, held upright, front camera. The page asks for the camera, shows the preview in a `<video>`, and records with `MediaRecorder`. Nothing exotic. The preview looked right. The file did not.

## Wrong theory one: I need to ask for portrait

My first request was the obvious one.

```js
navigator.mediaDevices.getUserMedia({
  video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } },
})
```

The preview on screen was portrait and looked right, so I recorded. The file came back landscape, on its side, and badly off. On iOS Safari and on Android Chrome that request gives you the sensor's wide preset, 1920 by 1080, unrotated. `exact` instead of `ideal` gave the same thing or an error. `aspectRatio: 9/16` gave the same thing. The phone does not have a portrait preset. It has landscape presets and it rotates the picture on screen to match how the phone is held, and the recorder saves the unrotated one.

That is the bug. Ask for portrait, get a landscape file with nothing in it telling the player to turn it.

## Wrong theory two: make it portrait myself

If the file is landscape, cut a portrait out of it. I recorded through a canvas that always took the centre 9:16 out of the reported size. That gave a 608 by 1080 slice out of a 1080 by 1920 picture, a three times zoom of an eye and a nose. That was the "zoomed in" half of the bug, and it was entirely mine.

## What fixed it: ask in landscape numbers

I only tried this to check the picture quality. I asked for landscape, expecting a landscape file I could at least look at, and the file came out portrait.

```js
{ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } }
```

Ask for landscape and you get portrait, because the phone picks a real preset and turns the picture to match how it is held. That is what the WebRTC samples do, which I found out after two nights, not before. Read the samples first.

## Belt and braces: measure the picture, not the track

Even with the landscape request, the video track reports the sensor size. `getSettings()` says width 1920 and height 1080 while the frame on screen is portrait. So the shipped code does not trust the reported size. It draws one frame onto a sixteen pixel canvas and looks at which corner got paint.

```ts
function measureDrawnFrame(video, reportedW, reportedH) {
  const big = Math.max(reportedW, reportedH)
  const S = 16
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.scale(S / big, S / big)
  ctx.drawImage(video, 0, 0)
  const px = ctx.getImageData(0, 0, S, S).data
  const painted = (x, y) => px[(y * S + x) * 4 + 3] > 0
  const wide = painted(S - 1, 1) && !painted(1, S - 1)
  const tall = painted(1, S - 1) && !painted(S - 1, 1)
  if (wide) return { w: big, h: Math.min(reportedW, reportedH) }
  if (tall) return { w: Math.min(reportedW, reportedH), h: big }
  return null
}
```

If the bottom left is painted and the top right is not, the picture is tall. That is the whole probe. With it the recorder picks one of three plans.

1. Portrait picture, and the track agrees. Record the raw stream. Best quality, nothing to do.
2. Portrait picture, but the track says landscape. Draw the picture to a canvas at its own size and record the canvas stream.
3. Wide picture on a portrait screen. Some Android devices. Record what the preview shows, the centre cut to 9:16 at the frame's own height.

```ts
const plan = planRecordingStream(video, stream) // raw | canvas-whole | canvas-crop
const rec = new MediaRecorder(plan.stream, { mimeType: pickMimeType(), videoBitsPerSecond: 10_000_000 })
rec.onstop = () => plan.stop()
```

`planRecordingStream` is about forty lines and it is in the repo with the dead ends left in as comments, because the dead ends are the useful part.

## One more thing: Baseline

`MediaRecorder.isTypeSupported` on Safari says yes to H.264 Baseline and to High. If your candidate list has Baseline first, you get Baseline, and every take looks soft. Put the High profile first.

```ts
'video/mp4;codecs=avc1.640028,mp4a.40.2'
```

## The bug report

I filed it as [WebKit bug 323550](https://bugs.webkit.org/show_bug.cgi?id=323550). Apple's triage retitled it a regression the same day, imported it to Radar, and added three engineers. The history, from their own tracker: WebKit's MP4 recorder has written a rotation transform into the file since a [2020 fix](https://bugs.webkit.org/show_bug.cgi?id=198912), and Apple's [April 2025 commit](https://commits.webkit.org/294257@main) for the WebM fix still describes mp4 as carrying that metadata. Reports of it missing on the front camera start in June 2025 on an [Apple Developer Forums thread](https://developer.apple.com/forums/thread/786803). My file plays sideways in Photos, which honours the rotation note when it is there.

## Why I was doing this at all

The teleprompter is part of [Postbarrel](https://postbarrel.com), which interviews you about what you want to say and writes the script in your own words, then scrolls it over your camera so you can say it. The recording never leaves the phone, so the camera fix had to work in the browser with no server to fall back on. It does now. The standalone component and demo are here: [github.com/lagudafuadtosin/web-teleprompter](https://github.com/lagudafuadtosin/web-teleprompter). If it saves you a night, a star helps other people find it.
