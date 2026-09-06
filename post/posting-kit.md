# Posting kit for the teleprompter release. Everything to paste, in order. Written 6 Sep 2026.

Order today: dev.to first (it gives the canonical link), then Hacker News, then r/webdev (Showoff Saturday is today), then the Apple thread and the videojs issue, then LinkedIn and X. Stay near the phone for three hours after the Hacker News post and send me any comment you want an answer for.

## 1. dev.to

Create the post from `why-your-web-teleprompter-records-sideways-on-iphone.md`. Set published to true. Cover image: the demo GIF. Tags: javascript, webdev, ios, webrtc.

## 2. Hacker News, Show HN

Title (under 80 characters):

Show HN: A phone teleprompter that records in the browser, and the iOS portrait fix

URL: https://github.com/lagudafuadtosin/web-teleprompter

First comment, post it yourself right after submitting:

I built this for a product I'm working on. The teleprompter part is ordinary, the recording part is where three nights went: on iOS 26.6 and on Android Chrome the video track reports 1920x1080 while the browser draws a portrait frame, and on iOS the rotation flag older versions wrote into the file is gone, so recordings come out sideways. Asking for the camera in landscape numbers fixes half of it, probing the drawn frame on a tiny canvas and recording through a canvas when the two disagree fixes the rest. Write-up with the dead ends here: (dev.to link). Happy to answer anything about MediaRecorder on phones.

## 3. Reddit, r/webdev, Showoff Saturday thread or a post flaired Showoff Saturday

Title: A teleprompter that records the take in the phone browser, with the iOS and Android portrait camera fix

Body:

Open source, MIT, React. Read mode scrolls the script, Record mode puts the front camera behind it and records in the browser, nothing uploaded. The interesting part is the camera: iOS 26.6 and Android Chrome both report a landscape track while drawing a portrait frame, and iOS dropped the rotation flag, so I probe the drawn picture and record through a canvas when they disagree. Repo: https://github.com/lagudafuadtosin/web-teleprompter. Write-up: (dev.to link).

## 4. Reddit, r/reactjs, Sunday

Title: web-teleprompter: a React teleprompter component with in-browser recording

Body: same as above, one sentence added at the top: "Drop src/lib into a project, it needs React and nothing else."

## 5. Apple Developer Forums, reply on thread 786803

https://developer.apple.com/forums/thread/786803

Reply:

Same finding here on iPhone with iOS 26.6, and Android Chrome does the same: the track reports 1920x1080, the drawn frame is portrait, and the file has no displaymatrix. Two things worked for me. Request the camera in landscape numbers (width 1920, height 1080), which makes Safari rotate the picture itself. Then probe the drawn frame by drawing one frame of the video element onto a small canvas and checking which way it extends, and if the track and the picture disagree, record a canvas stream of the picture rather than the raw track. Working code, MIT: https://github.com/lagudafuadtosin/web-teleprompter (src/lib/camera.ts).

## 6. GitHub, comment on collab-project/videojs-record issue 370

https://github.com/collab-project/videojs-record/issues/370

Comment:

For anyone still hitting this: on iOS 26.6 and on Android Chrome the track reports the landscape sensor buffer while the browser draws the rotated portrait frame, and the rotation flag is no longer written to the file. Asking for width 1920 and height 1080 (not 1080 by 1920) gets Safari to rotate the picture, and when the reported size and the drawn frame still disagree, recording through a canvas of the drawn frame gives a correct file. Standalone code here: https://github.com/lagudafuadtosin/web-teleprompter/blob/master/src/lib/camera.ts

## 7. LinkedIn

I open sourced a piece of Postbarrel today.

It's a teleprompter that runs in the phone's browser and records the take with the front camera behind the script. The scrolling took an evening. The recording took three nights, because on iOS 26.6 and on Android the camera track says one thing and the picture says another, and the file comes out sideways.

The fix, the dead ends, and the code are here: https://github.com/lagudafuadtosin/web-teleprompter

Why it exists: Postbarrel asks you questions about what you want to say, writes the script in your own words, and scrolls it over your camera so you can say it. The recording never leaves your phone, so this had to work with no server behind it.

If you build for phone browsers, the write-up will save you a night: (dev.to link)

## 8. X, one post

Three nights on one bug: iOS 26.6 and Android Chrome report a landscape camera track while drawing a portrait frame, and iOS dropped the rotation flag, so browser recordings come out sideways. Fixed it, open sourced it, dead ends included. https://github.com/lagudafuadtosin/web-teleprompter

## What to screenshot for the file

Repo stars page, the dev.to stats page, the HN thread with points, each with the date visible. One folder, named by date.
