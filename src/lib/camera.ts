// Front camera helpers for recording a portrait take in a phone browser.
// Plain browser APIs, no dependencies. The commented out code is what was
// tried first and why it was dropped. It is left in on purpose.

export type DrawnFrame = { w: number; h: number }

// Which way does the picture actually extend when this <video> is drawn?
// On iOS 26.6 and on Android Chrome the track says 1920x1080 while the browser draws a portrait
// frame, and the old rotation flag is gone (Apple forums thread 786803).
// So we draw one frame onto a 16px canvas and look at where the paint lands.
export function measureDrawnFrame(video: HTMLVideoElement, reportedW: number, reportedH: number): DrawnFrame | null {
  // Wrong theory 1: read the rotation from the track. There is nothing to read.
  //   const angle = (video.srcObject as MediaStream).getVideoTracks()[0].getSettings().rotation
  // Wrong theory 2: the sensor is square, so width and height are the same thing.
  //   if (reportedW === reportedH) return { w: reportedW, h: reportedH }
  try {
    const big = Math.max(reportedW, reportedH)
    const S = 16
    const c = document.createElement('canvas')
    c.width = S
    c.height = S
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.clearRect(0, 0, S, S)
    ctx.save()
    ctx.scale(S / big, S / big)
    ctx.drawImage(video, 0, 0)
    ctx.restore()
    const px = ctx.getImageData(0, 0, S, S).data
    const painted = (x: number, y: number) => px[(y * S + x) * 4 + 3] > 0
    const wide = painted(S - 1, 1) && !painted(1, S - 1)
    const tall = painted(1, S - 1) && !painted(S - 1, 1)
    if (wide) return { w: big, h: Math.min(reportedW, reportedH) }
    if (tall) return { w: Math.min(reportedW, reportedH), h: big }
    return null
  } catch {
    return null
  }
}

// Best container and codec this browser supports, strongest H.264 profile
// first. Safari says yes to Baseline and to High, so list order decides.
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  // First version. Baseline was listed first, got picked, and every take
  // came out soft.
  //   const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm']
  const candidates = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.64001F,mp4a.40.2',
    'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ]
  return candidates.find((c) => {
    try {
      return MediaRecorder.isTypeSupported(c)
    } catch {
      return false
    }
  })
}

export function extensionFor(mime: string | undefined): 'mp4' | 'webm' {
  return mime && mime.startsWith('video/mp4') ? 'mp4' : 'webm'
}

// Open the front camera. Ask in landscape numbers even for a portrait take.
// The phone matches them to a native preset and rotates the picture itself.
// Permission errors are thrown at once, anything else tries the next set.
export async function openFrontCamera(): Promise<MediaStream> {
  const audio = { echoCancellation: true, noiseSuppression: true }
  // First version. Asking for portrait numbers, exact or ideal, made both iOS
  // Safari and Android Chrome return the wide 1920x1080 preset unrotated.
  // The take landed sideways and zoomed in on one eye.
  //   { video: { facingMode: 'user', width: { exact: 1080 }, height: { exact: 1920 } }, audio },
  //   { video: { facingMode: 'user', width: { exact: 720 }, height: { exact: 1280 } }, audio },
  //   { video: { facingMode: 'user', aspectRatio: { exact: 9 / 16 } }, audio },
  //   { video: { facingMode: 'user', width: { ideal: 1080 }, height: { ideal: 1920 } }, audio },
  const attempts: MediaStreamConstraints[] = [
    { video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio },
    { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio },
    { video: { facingMode: 'user' }, audio },
  ]
  let lastErr: unknown = null
  for (const c of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(c)
    } catch (e) {
      lastErr = e
      const n = (e as { name?: string })?.name
      if (n === 'NotAllowedError' || n === 'SecurityError') throw e
    }
  }
  throw lastErr ?? new Error('camera')
}

export type RecordingPlan = {
  stream: MediaStream
  // Stops the canvas loop and its track if one was used. Call after the recorder stops.
  stop: () => void
  reason: 'raw' | 'canvas-whole' | 'canvas-crop'
}

// Decide what to record.
//   raw: portrait picture and the track agrees. Best quality.
//   canvas-whole: portrait picture but the track says landscape (iOS 26.6, Android Chrome).
//     The recorder would write the sideways buffer, so draw the picture to a
//     canvas at its own size and record that.
//   canvas-crop: wide picture on a portrait screen. Record the centre 9:16.
export function planRecordingStream(liveVideo: HTMLVideoElement, stream: MediaStream): RecordingPlan {
  // First version. Always cropped the centre 9:16 out of the reported size.
  // On iOS 26.6 and Android that cut a 608x1080 slice out of a picture that was already
  // portrait, a 3x zoom of an eye and a nose.
  //   const W = Math.round((st.height * 9) / 16)
  //   plan = { W, H: st.height, sx: Math.round((st.width - W) / 2), sw: W }
  const raw: RecordingPlan = { stream, stop: () => {}, reason: 'raw' }
  const vt = stream.getVideoTracks()[0]
  const st = vt?.getSettings()
  const canCanvas = typeof HTMLCanvasElement.prototype.captureStream === 'function'
  if (!st?.width || !st?.height || !canCanvas) return raw
  const portraitScreen = window.innerHeight >= window.innerWidth
  const drawn = measureDrawnFrame(liveVideo, st.width, st.height) ?? { w: st.width, h: st.height }
  const trackLandscape = st.width > st.height
  const pictureLandscape = drawn.w > drawn.h
  let plan: { W: number; H: number; sx: number; sw: number; reason: RecordingPlan['reason'] } | null = null
  if (!pictureLandscape && trackLandscape) {
    plan = { W: drawn.w, H: drawn.h, sx: 0, sw: drawn.w, reason: 'canvas-whole' }
  } else if (pictureLandscape && portraitScreen) {
    const W = Math.round((drawn.h * 9) / 16)
    plan = { W, H: drawn.h, sx: Math.round((drawn.w - W) / 2), sw: W, reason: 'canvas-crop' }
  }
  if (!plan) return raw
  try {
    const canvas = document.createElement('canvas')
    canvas.width = plan.W
    canvas.height = plan.H
    const ctx = canvas.getContext('2d')
    if (!ctx) return raw
    const { W, H, sx, sw } = plan
    let loop: number | null = null
    const draw = () => {
      ctx.drawImage(liveVideo, sx, 0, sw, H, 0, 0, W, H)
      loop = requestAnimationFrame(draw)
    }
    draw()
    const cs = canvas.captureStream(30)
    const ct = cs.getVideoTracks()[0]
    return {
      stream: new MediaStream([ct, ...stream.getAudioTracks()]),
      stop: () => {
        if (loop) cancelAnimationFrame(loop)
        loop = null
        ct.stop()
      },
      reason: plan.reason,
    }
  } catch {
    return raw
  }
}

export function isIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)
}
