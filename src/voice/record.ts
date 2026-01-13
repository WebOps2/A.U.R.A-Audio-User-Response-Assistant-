import { createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import * as recorder from 'node-record-lpcm16';
// WAV package uses CommonJS, so we need to use createRequire for ES modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const wav = require('wav');
const { Writer } = wav;

export interface RecordingOptions {
  durationSeconds?: number;
  sampleRate?: number;
}

/**
 * Records audio from the microphone for a specified duration.
 * Returns the path to the saved WAV file.
 */
export async function recordAudio(options: RecordingOptions = {}): Promise<string> {
  const durationSeconds = options.durationSeconds || 8;
  const sampleRate = options.sampleRate || 16000;
  
  const outputPath = join(tmpdir(), `devvoice-${randomUUID()}.wav`);
  
  return new Promise((resolve, reject) => {
    const writer = new Writer({
      sampleRate,
      channels: 1,
      bitDepth: 16,
    });
    
    const fileStream = createWriteStream(outputPath);
    writer.pipe(fileStream);
    
    const recording = recorder.record({
      sampleRateHertz: sampleRate,
      threshold: 0,
      verbose: false,
      recordProgram: process.platform === 'win32' ? 'sox' : 'rec',
      silence: '0.0',
    });

    recording.stream().pipe(writer);

    // Stop recording after duration
    setTimeout(() => {
      recording.stop();
      writer.end();
      fileStream.on('close', () => {
        resolve(outputPath);
      });
    }, durationSeconds * 1000);

    recording.stream().on('error', (err) => {
      recording.stop();
      writer.end();
      reject(err);
    });
  });
}

/**
 * Wait for Enter key press to start recording.
 */
export function waitForPushToTalk(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    
    console.log('\n🎤 Press Enter to start recording (will record for up to 8 seconds)...');
    
    process.stdin.once('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      resolve();
    });
  });
}
