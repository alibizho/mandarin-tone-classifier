import { useState, useRef, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const CHARACTERS = [
  { char: '妈', pinyin: 'mā', tone: 1, meaning: 'mother' },
  { char: '麻', pinyin: 'má', tone: 2, meaning: 'hemp' },
  { char: '马', pinyin: 'mǎ', tone: 3, meaning: 'horse' },
  { char: '骂', pinyin: 'mà', tone: 4, meaning: 'to scold' },
  { char: '书', pinyin: 'shū', tone: 1, meaning: 'book' },
  { char: '学', pinyin: 'xué', tone: 2, meaning: 'to study' },
  { char: '我', pinyin: 'wǒ', tone: 3, meaning: 'I / me' },
  { char: '是', pinyin: 'shì', tone: 4, meaning: 'to be' },
  { char: '她', pinyin: 'tā', tone: 1, meaning: 'she / her' },
  { char: '茶', pinyin: 'chá', tone: 2, meaning: 'tea' },
  { char: '你', pinyin: 'nǐ', tone: 3, meaning: 'you' },
  { char: '爸', pinyin: 'bà', tone: 4, meaning: 'father' },
  { char: '飞', pinyin: 'fēi', tone: 1, meaning: 'to fly' },
  { char: '来', pinyin: 'lái', tone: 2, meaning: 'to come' },
  { char: '好', pinyin: 'hǎo', tone: 3, meaning: 'good' },
  { char: '大', pinyin: 'dà', tone: 4, meaning: 'big' },
  { char: '天', pinyin: 'tiān', tone: 1, meaning: 'sky' },
  { char: '人', pinyin: 'rén', tone: 2, meaning: 'person' },
  { char: '水', pinyin: 'shuǐ', tone: 3, meaning: 'water' },
  { char: '月', pinyin: 'yuè', tone: 4, meaning: 'moon' },
  { char: '花', pinyin: 'huā', tone: 1, meaning: 'flower' },
  { char: '鱼', pinyin: 'yú', tone: 2, meaning: 'fish' },
  { char: '火', pinyin: 'huǒ', tone: 3, meaning: 'fire' },
  { char: '树', pinyin: 'shù', tone: 4, meaning: 'tree' },
  { char: '吃', pinyin: 'chī', tone: 1, meaning: 'to eat' },
  { char: '白', pinyin: 'bái', tone: 2, meaning: 'white' },
  { char: '小', pinyin: 'xiǎo', tone: 3, meaning: 'small' },
  { char: '路', pinyin: 'lù', tone: 4, meaning: 'road' },
  { char: '风', pinyin: 'fēng', tone: 1, meaning: 'wind' },
  { char: '红', pinyin: 'hóng', tone: 2, meaning: 'red' },
  { char: '雨', pinyin: 'yǔ', tone: 3, meaning: 'rain' },
  { char: '去', pinyin: 'qù', tone: 4, meaning: 'to go' },
]

const TONE_LABELS = ['', 'Tone 1 — flat ā', 'Tone 2 — rising á', 'Tone 3 — dip-rise ǎ', 'Tone 4 — falling à']
const TONE_COLORS = ['', '#818cf8', '#34d399', '#fbbf24', '#f87171']
const RECORD_SECONDS = 2

function encodeWav(pcm, sampleRate) {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * bitsPerSample / 8
  const blockAlign = numChannels * bitsPerSample / 8
  const samples = new Int16Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    samples[i] = Math.max(-32768, Math.min(32767, pcm[i] * 32768))
  }
  const buf = new ArrayBuffer(44 + samples.byteLength)
  const v = new DataView(buf)
  const str = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)) }
  str(0, 'RIFF'); v.setUint32(4, 36 + samples.byteLength, true); str(8, 'WAVE')
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, numChannels, true); v.setUint32(24, sampleRate, true)
  v.setUint32(28, byteRate, true); v.setUint16(32, blockAlign, true)
  v.setUint16(34, bitsPerSample, true); str(36, 'data')
  v.setUint32(40, samples.byteLength, true)
  new Int16Array(buf, 44).set(samples)
  return new Blob([buf], { type: 'audio/wav' })
}

// Decode browser audio and resample to 22050 Hz to match training
async function decodeAndResample(blob, targetSampleRate = 22050) {
  const arrayBuffer = await blob.arrayBuffer()
  const ctx = new AudioContext()
  const decoded = await ctx.decodeAudioData(arrayBuffer)
  await ctx.close()

  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetSampleRate), targetSampleRate)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start(0)
  const resampled = await offline.startRendering()
  return resampled.getChannelData(0)
}

function random(arr) { return arr[Math.floor(Math.random() * arr.length)] }

export default function App() {
  const [card, setCard] = useState(() => random(CHARACTERS))
  const [phase, setPhase] = useState('idle')  // idle | recording | loading
  const [countdown, setCountdown] = useState(RECORD_SECONDS)
  const [result, setResult] = useState(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)

  // Cleanup timer on unmount
  useEffect(() => () => clearInterval(timerRef.current), [])

  const next = () => { setCard(random(CHARACTERS)); setResult(null); setPhase('idle'); setCountdown(RECORD_SECONDS) }

  const startRecording = async () => {
    if (phase !== 'idle') return
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert('Microphone access denied.')
      return
    }

    chunksRef.current = []
    const mr = new MediaRecorder(stream)
    mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.onstop = async () => {
      stream.getTracks().forEach(t => t.stop())
      setPhase('loading')
      try {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        const pcm = await decodeAndResample(blob, 22050)
        const wav = encodeWav(pcm, 22050)
        const form = new FormData()
        form.append('audio', wav, 'rec.wav')
        const res = await fetch('${API_URL}/predict', { method: 'POST', body: form })
        const data = await res.json()
        setResult({ correct: data.predicted_tone === card.tone, predicted: data.predicted_tone, probs: data.probabilities })
      } catch (e) {
        console.error(e)
        setResult({ error: true })
      }
      setPhase('idle')
      setCountdown(RECORD_SECONDS)
    }

    mr.start(100) // collect chunks every 100ms
    mediaRecorderRef.current = mr
    setPhase('recording')
    setResult(null)
    setCountdown(RECORD_SECONDS)

    // Auto-stop after RECORD_SECONDS
    let remaining = RECORD_SECONDS
    timerRef.current = setInterval(() => {
      remaining -= 1
      setCountdown(remaining)
      if (remaining <= 0) {
        clearInterval(timerRef.current)
        mediaRecorderRef.current?.stop()
      }
    }, 1000)
  }

  const score = result && !result.error ? Math.round(result.probs[card.tone - 1] * 100) : null

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center gap-10 px-6">

      <p className="text-zinc-600 text-xs tracking-[0.2em] uppercase">Mandarin Tone Trainer</p>

      {/* Character card */}
      <div className="flex flex-col items-center gap-3 select-none">
        <span className="text-[7rem] leading-none" style={{ fontFamily: 'serif' }}>{card.char}</span>
        <span className="text-3xl text-zinc-300 font-light">{card.pinyin}</span>
        <span className="text-sm text-zinc-600">{card.meaning}</span>
        <span
          className="text-xs px-3 py-1 rounded-full mt-1 font-medium"
          style={{ background: TONE_COLORS[card.tone] + '18', color: TONE_COLORS[card.tone] }}
        >
          {TONE_LABELS[card.tone]}
        </span>
      </div>

      {/* Record button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={startRecording}
          disabled={phase !== 'idle'}
          className={`w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all duration-150 select-none
            ${phase === 'recording' ? 'border-red-500 bg-red-500/10 scale-110' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900'}
            ${phase !== 'idle' ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {phase === 'loading' ? (
            <div className="w-5 h-5 rounded-full border-2 border-zinc-600 border-t-white animate-spin" />
          ) : phase === 'recording' ? (
            <span className="text-2xl font-semibold text-red-400">{countdown}</span>
          ) : (
            <div className="w-5 h-5 rounded-full bg-zinc-500" />
          )}
        </button>
        <p className="text-zinc-600 text-xs">
          {phase === 'recording' ? 'recording...' : phase === 'loading' ? 'analyzing...' : `click to record (${RECORD_SECONDS}s)`}
        </p>
      </div>

      {/* Result */}
      {result && !result.error && (
        <div className={`w-full max-w-xs rounded-2xl border p-6 flex flex-col items-center gap-4
          ${result.correct ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-red-900/60 bg-red-950/20'}`}>
          <div className="flex items-end gap-1">
            <span className="text-5xl font-semibold" style={{ color: result.correct ? '#34d399' : '#f87171' }}>
              {result.correct ? score : 0}
            </span>
            <span className="text-zinc-600 text-lg mb-1">/100</span>
          </div>
          <p className="text-sm text-zinc-400">
            {result.correct ? 'Correct pronunciation!' : `Heard tone ${result.predicted} — expected tone ${card.tone}`}
          </p>
          <div className="flex gap-4 mt-1">
            {result.probs.map((p, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="w-8 h-20 bg-zinc-800 rounded-lg relative overflow-hidden">
                  <div
                    className="absolute bottom-0 w-full rounded-lg transition-all duration-500"
                    style={{ height: `${Math.round(p * 100)}%`, background: TONE_COLORS[i + 1] + '99' }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500">T{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result?.error && <p className="text-red-500/80 text-sm">Could not reach the server.</p>}

      <button onClick={next} className="text-zinc-600 hover:text-zinc-300 text-sm transition-colors">
        next character →
      </button>
    </div>
  )
}
