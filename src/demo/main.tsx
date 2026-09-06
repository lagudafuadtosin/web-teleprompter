import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Teleprompter } from '../lib'
import './demo.css'

const SAMPLE = `Halfway down Eversholt Street, this guy I'd known for 25 minutes stops walking and says his sister lives two roads away and she has a sofa. And I said yes before he even finished the sentence.

Let me back up.

I'd been at a friend's birthday in Camden. Good night, nothing mad, just a normal night out. Problem is I looked at my phone and it was almost dead, I had no cash on me, none, and the night bus I needed had stopped running a whole hour earlier.

So there I am outside, phone dying in my hand, no train, no bus, no money for a taxi, nothing.

Best night I never planned.`

const SAMPLE_CUES = `[eyes up] Halfway down Eversholt Street, this guy I'd known for 25 minutes stops walking and says his sister lives two roads away and she has a sofa. [one breath] And I said yes before he even finished the sentence.

[pull back] Let me back up.

I'd been at a friend's birthday in Camden. Good night, nothing mad, just a normal night out. [pause] Problem is I looked at my phone and it was almost dead, I had no cash on me, none, and the night bus I needed had stopped running a whole hour earlier.

So there I am outside, phone dying in my hand, no train, no bus, no money for a taxi, nothing.

[hold the look] Best night I never planned.`

function Demo() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(SAMPLE)
  const [cues, setCues] = useState(SAMPLE_CUES)
  const [useCues, setUseCues] = useState(true)
  return (
    <main className="demo">
      <h1>web-teleprompter</h1>
      <p className="lede">
        A teleprompter for phones that records the take in the browser, with the front camera behind the script. Open it on your
        phone, press Play to read, or Record to film. Nothing leaves your device.
      </p>
      <label>
        Script
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} />
      </label>
      <label>
        <input type="checkbox" checked={useCues} onChange={(e) => setUseCues(e.target.checked)} /> Provide a cued version (delivery notes in [brackets])
      </label>
      {useCues && (
        <label>
          Cued script
          <textarea value={cues} onChange={(e) => setCues(e.target.value)} rows={8} />
        </label>
      )}
      <button type="button" className="open" onClick={() => setOpen(true)}>
        Open teleprompter
      </button>
      <p className="small">
        Keys on a laptop: space play/pause, arrows speed, + and − size, Esc close. On a phone: tap the text to pause, Record for a take.
      </p>
      {open && (
        <Teleprompter
          title="Demo script"
          text={text}
          cueText={useCues ? cues : undefined}
          initialCues={false}
          editable
          onSaveLine={async (i, line) => {
            setText((t) => t.split('\n').map((l, k) => (k === i ? line : l)).join('\n'))
            return true
          }}
          onClose={() => setOpen(false)}
        />
      )}
      <footer>
        Built for <a href="https://postbarrel.com">Postbarrel</a>, where the script comes from an interview with you. MIT licensed.
      </footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
)
