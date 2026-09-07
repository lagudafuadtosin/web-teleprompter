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

On iOS Safari and on Android Chrome that gives you the sensor's wide preset, 1920 by 1080, unrotated. `exact` instead of `ideal` gave the same thing or an error. `aspectRatio: 9/16` gave the same thing. The phone does not have a portrait preset. It has landscape presets and it rotates the picture to match how the phone is held.

So ask in landscape numbers.

```js
{ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } }
```

That is what the WebRTC samples do, which I found out after two nights, not before. Read the samples first.

## Wrong theory two: the rotation is in the metadata

It used to be. WebKit's MP4 recorder has written a rotation and mirror transform into the file since a [2020 fix](https://bugs.webkit.org/show_bug.cgi?id=198912), and as late as April 2025 Apple's own [commit message](https://commits.webkit.org/294257@main) for the WebM fix says that mp4, unlike WebM, carries metadata telling the player to rotate. On my iPhone 15 on iOS 26.6 that flag is gone. The file is the sideways buffer and nothing tells the player to turn it, and Android Chrome gave me the same sideways file. An [Apple Developer Forums thread](https://developer.apple.com/forums/thread/786803) has people finding the same from June 2025, one of them noting the file used to show a displaymatrix rotation of minus 90 and now shows nothing. I filed it as [WebKit bug 323550](https://bugs.webkit.org/show_bug.cgi?id=323550), and Apple triaged it as a regression the same day.

I spent a while looking for a way to read the rotation off the track. There is nothing to read. `getSettings()` gives you width 1920 and height 1080 and that is that.

## What is actually true: the track lies, the picture does not

The video track reports the sensor buffer. The frame the browser draws into the `<video>` element is already rotated, which is why the preview always looked right. So do not trust the reported size. Measure the drawn picture.

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

Draw one frame at natural size, scaled down onto a sixteen pixel square, and see which corner got paint. If the bottom left is painted and the top right is not, the picture is tall. That is the whole probe.

## Wrong theory three: crop everything to 9:16

Before I had the probe, I recorded through a canvas that always cut the centre 9:16 out of the reported size. On iOS 26.6 and on Android the picture was already portrait, so that cut a 608 by 1080 slice out of a 1080 by 1920 frame. A three times zoom of an eye and a nose. That was the "zoomed in" half of the bug, and it was entirely mine.

## The fix: three cases

With the probe you can decide what to record.

1. Portrait picture, and the track agrees. Record the raw stream. Best quality, nothing to do.
2. Portrait picture, but the track says landscape. This is what iOS 26.6 and Android Chrome both did to me. The recorder would write the sideways buffer with no rotation flag, so draw the picture to a canvas at its own size and record the canvas stream instead.
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

## Why I was doing this at all

The teleprompter is part of [Postbarrel](https://postbarrel.com), which interviews you about what you want to say and writes the script in your own words, then scrolls it over your camera so you can say it. The recording never leaves the phone, so the camera fix had to work in the browser with no server to fall back on. It does now. The standalone component and demo are here: [github.com/lagudafuadtosin/web-teleprompter](https://github.com/lagudafuadtosin/web-teleprompter). If it saves you a night, a star helps other people find it.
