import { useCallback, useEffect, useRef, useState } from 'react'
import styles from './Teleprompter.module.css'
import { extensionFor, isIOS, openFrontCamera, pickMimeType, planRecordingStream } from './camera'

// A full-screen teleprompter for phones, with an in-browser Record mode.
//
// READ mode: big type, high contrast, controls along the bottom where thumbs
// are, tap the text to pause, a wake lock so the screen doesn't dim mid-take,
// mirror mode for a beam-splitter rig.
//
// RECORD mode: the front camera goes BEHIND the script. The script scrolls in a
// translucent band over the picture, right under the lens, with a 3-2-1
// countdown, Record/Stop and a timer. The take is handed to the phone's share
// sheet (Save Video / TikTok / Instagram) or downloaded. Nothing leaves the
// phone.
//
// Scrolling is driven by requestAnimationFrame at a px/second rate set by the
// speed slider, so it is smooth on phones and independent of frame rate.

const MIN_SPEED = 0.4
const MAX_SPEED = 3
const BASE_PX_PER_SEC = 40

type Mode = 'read' | 'record'
type RecState = 'idle' | 'countdown' | 'recording' | 'done'

function safeBase(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50)
  return base || 'take'
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

export type TeleprompterProps = {
  /** Shown in the top bar and used for the file name of a take. */
  title: string
  /** The script, plain text. Line breaks are kept. */
  text: string
  /** Optional version with [delivery cues] in square brackets; toggled with the Cues button. */
  cueText?: string
  /** Start with cues showing. */
  initialCues?: boolean
  /** Let the reader tap a line while paused and edit it. onSaveLine must resolve true on success. */
  editable?: boolean
  onSaveLine?: (lineIndex: number, newLine: string) => Promise<boolean>
  onClose: () => void
}

export function Teleprompter({ title, text, cueText, editable = false, onSaveLine, onClose, initialCues = false }: TeleprompterProps) {
  const canRecord =
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  const [mode, setMode] = useState<Mode>('read')
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [mirror, setMirror] = useState(false)
  const [showCues, setShowCues] = useState(initialCues && Boolean(cueText))
  const [fontStep, setFontStep] = useState(1)
  const [editLine, setEditLine] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const planStopRef = useRef<(() => void) | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const carryRef = useRef(0)

  const [rec, setRec] = useState<RecState>('idle')
  const [countdown, setCountdown] = useState(3)
  const [elapsed, setElapsed] = useState(0)
  const [camError, setCamError] = useState<string | null>(null)
  const [take, setTake] = useState<{ blob: Blob; url: string; ext: 'mp4' | 'webm' } | null>(null)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<number | null>(null)

  // Entering Record (and coming back to idle after a take): the text goes back
  // below the screen. Done after the next frame and again a moment later once
  // the camera has attached, because each layout can move the scroll position.
  useEffect(() => {
    if (mode !== 'record' || rec !== 'idle') return
    const reset = () => {
      const el = scrollerRef.current
      if (el) el.scrollTop = 0
      carryRef.current = 0
    }
    const raf = requestAnimationFrame(reset)
    const late = window.setTimeout(reset, 300)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
    }
  }, [mode, rec])

  // Auto-scroll loop.
  useEffect(() => {
    if (!playing) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      lastTsRef.current = null
      return
    }
    const step = (ts: number) => {
      const el = scrollerRef.current
      if (!el) return
      if (lastTsRef.current === null) lastTsRef.current = ts
      const dt = (ts - lastTsRef.current) / 1000
      lastTsRef.current = ts
      carryRef.current += dt * BASE_PX_PER_SEC * speed
      const px = Math.floor(carryRef.current)
      if (px > 0) {
        el.scrollTop += px
        carryRef.current -= px
      }
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        setPlaying(false)
        return
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [playing, speed])

  // Keyboard: space/enter play-pause, arrows speed, +/- size, escape close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        setSpeed((s) => Math.min(MAX_SPEED, +(s + 0.2).toFixed(1)))
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        setSpeed((s) => Math.max(MIN_SPEED, +(s - 0.2).toFixed(1)))
      } else if (e.key === '+' || e.key === '=') {
        setFontStep((f) => Math.min(2, f + 1))
      } else if (e.key === '-') {
        setFontStep((f) => Math.max(0, f - 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Body scroll lock + wake lock.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => { /* not granted */ })
    return () => {
      document.body.style.overflow = prev
      void lock?.release().catch(() => { /* already released */ })
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop() } catch { /* already stopped */ }
    }
    recorderRef.current = null
    planStopRef.current?.()
    planStopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
  }, [])

  // Attach the live stream whenever the live <video> is on screen.
  useEffect(() => {
    if (mode !== 'record' || rec === 'done') return
    const v = videoRef.current
    if (v && streamRef.current && v.srcObject !== streamRef.current) {
      v.srcObject = streamRef.current
      void v.play().catch(() => { /* autoplay blocked until a gesture */ })
    }
  }, [mode, rec])

  useEffect(() => () => {
    stopCamera()
    if (take?.url) URL.revokeObjectURL(take.url)
  }, [stopCamera]) // eslint-disable-line react-hooks/exhaustive-deps

  async function enterRecord() {
    setCamError(null)
    setShareNote(null)
    try {
      streamRef.current = await openFrontCamera()
      setMode('record')
      requestAnimationFrame(() => {
        const el = scrollerRef.current
        if (el) el.scrollTop = 0
        carryRef.current = 0
      })
      setPlaying(false)
      setMirror(false)
      setFontStep(0)
      setRec('idle')
    } catch (err) {
      const name = (err as { name?: string })?.name
      setCamError(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Camera access was refused. Allow the camera for this site in your browser settings, or prop the phone up and record with your camera app while reading from a second screen.'
          : "Couldn't start the camera on this device. Prop the phone up and record with your camera app while reading from a second screen.",
      )
    }
  }

  function exitRecord() {
    stopCamera()
    if (take?.url) URL.revokeObjectURL(take.url)
    setTake(null)
    setRec('idle')
    setElapsed(0)
    setMode('read')
    setFontStep(1)
  }

  const restart = useCallback(() => {
    const el = scrollerRef.current
    if (el) el.scrollTop = 0
    carryRef.current = 0
    setPlaying(true)
  }, [])

  function beginCountdown() {
    if (!streamRef.current) return
    if (take?.url) URL.revokeObjectURL(take.url)
    setTake(null)
    setShareNote(null)
    const el = scrollerRef.current
    if (el) el.scrollTop = 0
    carryRef.current = 0
    setPlaying(false)
    setRec('countdown')
    setCountdown(3)
    let n = 3
    const tick = window.setInterval(() => {
      n -= 1
      if (n <= 0) {
        window.clearInterval(tick)
        startRecording()
      } else {
        setCountdown(n)
      }
    }, 1000)
  }

  function startRecording() {
    const stream = streamRef.current
    const liveVideo = videoRef.current
    if (!stream) return
    const mime = pickMimeType()
    mimeRef.current = mime
    chunksRef.current = []
    const plan = liveVideo ? planRecordingStream(liveVideo, stream) : { stream, stop: () => {}, reason: 'raw' as const }
    planStopRef.current = plan.stop

    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(plan.stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 }) : new MediaRecorder(plan.stream)
    } catch {
      setCamError("Recording isn't supported in this browser. Prop the phone up and record with your camera app while reading from a second screen.")
      setRec('idle')
      return
    }
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      planStopRef.current?.()
      planStopRef.current = null
      const type = mimeRef.current ?? recorder.mimeType ?? 'video/webm'
      const blob = new Blob(chunksRef.current, { type })
      const url = URL.createObjectURL(blob)
      setTake({ blob, url, ext: extensionFor(type) })
      setRec('done')
    }
    recorderRef.current = recorder
    recorder.start(1000)
    setElapsed(0)
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000)
    setRec('recording')
    setPlaying(true)
  }

  function stopRecording() {
    setPlaying(false)
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    const r = recorderRef.current
    if (r && r.state !== 'inactive') r.stop()
  }

  async function shareOrSave() {
    if (!take) return
    const name = `${safeBase(title)}.${take.ext}`
    // Plain container MIME, no codec parameters: the share sheet decides what
    // it can do from the type, and "video/mp4;codecs=..." is not "video/mp4" to it.
    const type = take.ext === 'mp4' ? 'video/mp4' : 'video/webm'
    const file = new File([take.blob], name, { type })
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.share) {
      try {
        await nav.share({ files: [file], title })
        setShareNote(isIOS() ? 'If you chose Save Video, it is in Photos.' : 'If you chose Photos or Gallery, it is saved there.')
        return
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
      }
    }
    const a = document.createElement('a')
    a.href = take.url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setShareNote(
      isIOS()
        ? 'Saved to Files. Open Files, tap the video, then the share icon, then Save Video to put it in Photos.'
        : take.ext === 'webm'
          ? 'Saved to Downloads as .webm. TikTok and Instagram may not accept it directly; open it in Google Photos, which converts it on share.'
          : 'Saved to Downloads. Google Photos will pick it up, or share it from your Files app.',
    )
  }

  const body = showCues && cueText ? renderCues(cueText) : text
  const isRecordMode = mode === 'record'
  const canLineEdit = mode === 'read' && !playing && editable && !showCues && Boolean(onSaveLine) && rec === 'idle'

  async function confirmPromptLine() {
    if (editLine === null || !onSaveLine) return
    setEditSaving(true)
    const ok = await onSaveLine(editLine, editDraft)
    setEditSaving(false)
    if (ok) setEditLine(null)
  }

  return (
    <div className={`${styles.overlay} ${isRecordMode ? styles.recordMode : ''}`} role="dialog" aria-modal="true" aria-label={`Teleprompter: ${title}`}>
      {isRecordMode && rec !== 'done' && <video ref={videoRef} className={styles.camera} autoPlay muted playsInline aria-hidden="true" />}
      {isRecordMode && rec === 'done' && take && (
        <video className={`${styles.camera} ${styles.takePreview}`} src={take.url} controls playsInline aria-label="Your take" />
      )}

      <div className={styles.top}>
        <span className={styles.title}>
          {isRecordMode ? (rec === 'recording' ? `● REC ${fmtTime(elapsed)}` : rec === 'done' ? `Take · ${fmtTime(elapsed)}` : 'Record') : title}
        </span>
        {isRecordMode ? (
          <button type="button" className={styles.close} onClick={exitRecord} aria-label="Back to reading">Back</button>
        ) : (
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close teleprompter">Close</button>
        )}
      </div>

      <div ref={scrollerRef} className={`${styles.scroller} ${mirror ? styles.mirror : ''}`} onClick={() => rec !== 'countdown' && setPlaying((p) => !p)} role="presentation">
        <div className={`${styles.text} ${styles[`size${fontStep}`]}`}>
          <div className={styles.lead} aria-hidden="true" />
          {canLineEdit
            ? text.split('\n').map((line, i) => (
                <span key={i}>
                  {line.trim() === '' ? line : (
                    <span
                      role="button"
                      tabIndex={0}
                      className={styles.pLine}
                      onClick={(e) => { e.stopPropagation(); setEditLine(i); setEditDraft(line) }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setEditLine(i); setEditDraft(line) } }}
                    >
                      {line}
                    </span>
                  )}
                  {'\n'}
                </span>
              ))
            : body}
          <div className={styles.tail} aria-hidden="true" />
        </div>
        {!playing && rec !== 'countdown' && rec !== 'done' && editLine === null && (
          <div className={styles.pausedBadge} aria-live="polite">
            {isRecordMode && rec === 'idle' ? 'Press Record when you are set' : canLineEdit ? 'Paused · tap a line to fix it, or the space around the text to read' : 'Paused · tap to read'}
          </div>
        )}
      </div>

      {rec === 'countdown' && <div className={styles.countdown} aria-live="assertive">{countdown}</div>}

      {editLine !== null && (
        <div className={styles.promptEditor}>
          <textarea
            className={styles.promptEditorInput}
            value={editDraft}
            autoFocus
            rows={Math.max(2, Math.ceil(editDraft.length / 50))}
            onChange={(e) => setEditDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void confirmPromptLine() }
              else if (e.key === 'Escape') setEditLine(null)
            }}
          />
          <div className={styles.promptEditorActions}>
            <button type="button" className={styles.ctl} onClick={() => setEditLine(null)}>Cancel</button>
            <button type="button" className={styles.primary} onClick={() => void confirmPromptLine()} disabled={editSaving}>{editSaving ? 'Saving…' : 'Save line'}</button>
          </div>
        </div>
      )}

      {camError && <p className={styles.camError} role="alert">{camError}</p>}

      {isRecordMode ? (
        <div className={styles.controls}>
          {rec === 'idle' && (
            <button type="button" className={styles.recordBtn} onClick={beginCountdown}><span className={styles.recDot} aria-hidden="true" /> Record</button>
          )}
          {rec === 'countdown' && <button type="button" className={styles.ctl} disabled>Get ready…</button>}
          {rec === 'recording' && (
            <button type="button" className={styles.recordBtn} onClick={stopRecording}><span className={styles.stopSquare} aria-hidden="true" /> Stop</button>
          )}
          {rec === 'done' && take && (
            <>
              <button type="button" className={styles.primary} onClick={() => void shareOrSave()}>Share / Save</button>
              <button type="button" className={styles.ctl} onClick={beginCountdown}>Record again</button>
              <a className={styles.ctl} href={take.url} download={`${safeBase(title)}.${take.ext}`}>Download .{take.ext}</a>
            </>
          )}
          <label className={styles.speed}>
            <span>Speed {speed.toFixed(1)}×</span>
            <input type="range" min={MIN_SPEED} max={MAX_SPEED} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Scroll speed" />
          </label>
          <div className={styles.group}>
            <button type="button" className={styles.ctl} onClick={() => setFontStep((f) => Math.max(0, f - 1))} aria-label="Smaller text" disabled={fontStep === 0}>A−</button>
            <button type="button" className={styles.ctl} onClick={() => setFontStep((f) => Math.min(2, f + 1))} aria-label="Larger text" disabled={fontStep === 2}>A+</button>
          </div>
          {cueText && (
            <button type="button" className={`${styles.ctl} ${showCues ? styles.on : ''}`} onClick={() => setShowCues((v) => !v)} aria-pressed={showCues}>Cues</button>
          )}
          {rec === 'done' && <span className={styles.note}>{isIOS() ? 'Share / Save, then choose Save Video to put it in Photos.' : 'Share / Save, then choose Photos or your Gallery app.'}</span>}
          {shareNote && <span className={styles.note} role="status">{shareNote}</span>}
        </div>
      ) : (
        <div className={styles.controls}>
          <button type="button" className={styles.primary} onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" className={styles.ctl} onClick={restart}>Restart</button>
          {canRecord && (
            <button type="button" className={styles.recordBtn} onClick={() => void enterRecord()}><span className={styles.recDot} aria-hidden="true" /> Record</button>
          )}
          <label className={styles.speed}>
            <span>Speed {speed.toFixed(1)}×</span>
            <input type="range" min={MIN_SPEED} max={MAX_SPEED} step={0.1} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Scroll speed" />
          </label>
          <div className={styles.group}>
            <button type="button" className={styles.ctl} onClick={() => setFontStep((f) => Math.max(0, f - 1))} aria-label="Smaller text" disabled={fontStep === 0}>A−</button>
            <button type="button" className={styles.ctl} onClick={() => setFontStep((f) => Math.min(2, f + 1))} aria-label="Larger text" disabled={fontStep === 2}>A+</button>
          </div>
          {cueText && (
            <button type="button" className={`${styles.ctl} ${showCues ? styles.on : ''}`} onClick={() => setShowCues((v) => !v)} aria-pressed={showCues}>Cues</button>
          )}
          <button type="button" className={`${styles.ctl} ${mirror ? styles.on : ''}`} onClick={() => setMirror((v) => !v)} aria-pressed={mirror}>Mirror</button>
          {!canRecord && <span className={styles.note}>One phone? Prop it on a laptop, read from here, record with your camera app.</span>}
        </div>
      )}
    </div>
  )
}

function renderCues(text: string) {
  return text.split(/(\[[^\]]*\])/g).map((part, i) =>
    part.startsWith('[') && part.endsWith(']') ? <span key={i} className={styles.cue}>{part}</span> : part,
  )
}
