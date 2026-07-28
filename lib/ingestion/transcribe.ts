import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import OpenAI from 'openai'
import ffmpegPath from 'ffmpeg-static'
import { logger } from '../logger'

const execFileAsync = promisify(execFile)

let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }
  return _openai
}

const WHISPER_MODEL = process.env.WHISPER_MODEL ?? 'whisper-1'

// Whisper API caps uploads at 25MB. At 32kbps mono, 4500s (75 min) ≈ 18MB,
// leaving comfortable headroom per segment.
const SEGMENT_SECONDS = 4500
const AUDIO_BITRATE = '32k'
const SAMPLE_RATE = '16000'

/** Enabled by default when OPENAI_API_KEY is set; opt out with TRANSCRIPTION_ENABLED=false. */
export function isTranscriptionEnabled(): boolean {
  if (process.env.TRANSCRIPTION_ENABLED === 'false') return false
  return Boolean(process.env.OPENAI_API_KEY)
}

export interface TranscriptionResult {
  text: string
  durationSeconds: number
}

function getFfmpegBinary(): string {
  const custom = process.env.FFMPEG_PATH?.trim()
  if (custom) return custom
  if (!ffmpegPath) {
    throw new Error('ffmpeg binary not found (ffmpeg-static unsupported on this platform)')
  }
  return ffmpegPath
}

/**
 * Extract audio (mono 16kHz mp3) from a video/audio file and split into
 * segments small enough for the Whisper API in a single ffmpeg pass.
 * Returns segment paths in playback order.
 */
async function extractAudioSegments(inputPath: string, workDir: string): Promise<string[]> {
  const outPattern = path.join(workDir, 'seg_%04d.mp3')
  await execFileAsync(
    getFfmpegBinary(),
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', inputPath,
      '-vn',
      '-ac', '1',
      '-ar', SAMPLE_RATE,
      '-b:a', AUDIO_BITRATE,
      '-f', 'segment',
      '-segment_time', String(SEGMENT_SECONDS),
      outPattern,
    ],
    // Long videos can take a while to demux; cap at 30 minutes.
    { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }
  )

  const files = await fsp.readdir(workDir)
  return files
    .filter((f) => f.startsWith('seg_') && f.endsWith('.mp3'))
    .sort((a, b) => a.localeCompare(b))
    .map((f) => path.join(workDir, f))
}

async function transcribeSegment(segmentPath: string): Promise<TranscriptionResult> {
  const openai = getOpenAI()
  const response = await openai.audio.transcriptions.create({
    file: fs.createReadStream(segmentPath),
    model: WHISPER_MODEL,
    response_format: 'verbose_json',
  })
  const verbose = response as unknown as { text?: string; duration?: number | string }
  return {
    text: (verbose.text ?? '').trim(),
    durationSeconds: Number(verbose.duration ?? 0) || 0,
  }
}

/**
 * Transcribe a local video/audio file: ffmpeg extracts compressed audio
 * segments, each is sent to the Whisper API, transcripts are concatenated.
 * Throws on failure so the ingestion worker can mark the document failed.
 */
export async function transcribeMediaFile(
  inputPath: string,
  context: { documentId: string; userId: string }
): Promise<TranscriptionResult> {
  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'transcribe-'))
  const startedAt = Date.now()

  try {
    const segments = await extractAudioSegments(inputPath, workDir)
    if (segments.length === 0) {
      throw new Error('No audio track found in file')
    }

    logger.info('Transcription started', {
      ...context,
      segmentCount: segments.length,
      model: WHISPER_MODEL,
    })

    const parts: string[] = []
    let totalDuration = 0
    for (const segment of segments) {
      const result = await transcribeSegment(segment)
      if (result.text) parts.push(result.text)
      totalDuration += result.durationSeconds
      // Free disk as we go — long videos can produce several segments.
      await fsp.unlink(segment).catch(() => {})
    }

    const text = parts.join('\n').trim()
    logger.info('Transcription finished', {
      ...context,
      durationSeconds: Math.round(totalDuration),
      charCount: text.length,
      elapsedMs: Date.now() - startedAt,
    })

    return { text, durationSeconds: totalDuration }
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
