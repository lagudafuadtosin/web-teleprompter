// Front-camera helpers for recording a portrait take in a phone browser.
//
// Three findings from shipping this on real phones (Sept 2026), each of which
// cost a night:
//
// 1. Ask for the camera in LANDSCAPE numbers even when you want portrait.
//    Requesting { width: 1080, height: 1920 } makes iOS Safari and Android
//    Chrome hand back the sensor's wide 1920x1080 preset, unrotated, and the
//    take lands sideways and zoomed. Requesting { width: 1920, height: 1080 }
//    lets the phone pick the preset and rotate the picture to the way the
//    phone is held. This is what the WebRTC samples do; read them first.
//
// 2. Do not trust the track's reported size. On iOS 18 the track reports the
//    sensor buffer (1920x1080) while the frame the browser actually draws is
//    the rotated portrait picture, and the rotation flag that older iOS wrote
//    into recordings is gone (Apple Developer Forums thread 786803). So we
//    probe: draw the frame onto a tiny canvas and see which way it extends.
//
// 3. When the reported size and the drawn picture disagree, record through a
//    canvas instead of the raw track, so the file is the picture the user saw.
//
// Everything here is plain browser APIs. No dependencies.

export type DrawnFrame = { w: number; h: number }

/** Which way does the picture actually extend when this <video> is drawn? */
export function measureDrawnFrame(video: HTMLVideoElement, reportedW: number, reportedH: number): DrawnFrame | null {
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

/** Best MediaRecorder container/codec this browser supports, strongest H.264 profile first. */
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  // Safari says yes to Baseline (42E01E) and to High (6400xx); Baseline is the
  // weakest profile and gets picked purely by list order if you let it.
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

/**
 * Open the front camera the way phones expect: landscape numbers, falling back
 * to looser constraints. Permission errors are thrown immediately; other
 * failures try the next constraint set.
 */
export async function openFrontCamera(): Promise<MediaStream> {
  const audio = { echoCancellation: true, noiseSuppression: true }
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
  /** The stream to hand to MediaRecorder. */
  stream: MediaStream
  /** Stop the canvas loop and its track, if one was used. Call after the recorder stops. */
  stop: () => void
  /** Why this plan was chosen, for diagnostics. */
  reason: 'raw' | 'canvas-whole' | 'canvas-crop'
}

/**
 * Decide what to record. Three cases:
 *  1. Portrait picture, track agrees: record the raw stream. Best quality.
 *  2. Portrait picture, track says landscape (iOS 18): the recorder would write
 *     the sideways buffer with no rotation flag. Draw the picture to a canvas at
 *     its own size and record that, whole.
 *  3. Wide picture on a portrait screen: record what the preview shows, the
 *     centre cut to 9:16 at the frame's own pixel height.
 */
export function planRecordingStream(liveVideo: HTMLVideoElement, stream: MediaStream): RecordingPlan {
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
