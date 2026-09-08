# HalfStack London 2026, session proposal

Paste this into a Living Spec document (livingspec.com, free account), then share the document with hello@halfstackconf.com as admin. HalfStack asks for at most two ideas per document and says all correspondence happens inside the document, so watch the email address you sign up with for a task assignment. They are slow, sometimes weeks.

## Speaker

Fuad Laguda, founder of Postbarrel (postbarrel.com), Stirling, Scotland. Solo builder. MSc Financial Technology, University of Stirling, 2025. Building a product that interviews you, writes your video script in your own words, and scrolls it over your phone camera so you can say it.

Links: https://github.com/lagudafuadtosin/web-teleprompter, https://dev.to/lagudafuad/why-your-web-teleprompter-records-sideways-on-iphone-and-the-fix-549m, https://bugs.webkit.org/show_bug.cgi?id=323550

Location preference: London, 16 November 2026. Happy to stay for the full day, the speaker dinner and the afterparty.

## Session 1: The track lies. Recording portrait video in the browser on iOS 26.6 and Android.

Length: 25 to 30 minutes, live demo on my own phone.

The pitch: a teleprompter that records you in the phone browser sounds like an afternoon's work. The recording came out landscape, or zoomed into one eye, for three nights. This is the story of those three nights told as two wrong theories and the one thing that was true.

Wrong theory one: ask for portrait dimensions. The phone has no portrait preset. It has landscape presets and rotates the picture to match how it is held, and the WebRTC samples knew that all along.

Wrong theory two: make it portrait myself. Cut the middle 9:16 out of the landscape file. That is how you get a three times zoom of one eye.

What is true: the video track reports the sensor buffer and the browser draws something else. The track lies. The picture does not.

The fix: a sixteen pixel canvas probe (draw one frame, see which corner has paint) and a forty line planner that picks between the raw track, a canvas of the whole picture, or a crop. Plus a codec trap: isTypeSupported says yes to Baseline and High, list order decides, and Baseline first gives you soft video forever.

The demo: the audience watches the wrong file come out of a real iPhone, then the right one. MIT code on GitHub, and a WebKit bug filed with the reproduction.

Why HalfStack: it is a "here is how I made a thing, here is what the platform did to me, here is the fun demo" talk. No framework, no library, just the web platform and a phone.

## Session 2 (alternative): Building a solo product to launch from Stirling, alone.

Length: 20 minutes.

The founder story. Nigerian, came to the UK for a Master's, built the teleprompter I could not buy, then the product around it. Live since September 2026. What building alone actually costs, what the browser did to me, what shipped, and what the numbers said. For a room that likes side projects that became the main project.
