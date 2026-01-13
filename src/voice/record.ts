import { randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import * as recorder from "node-record-lpcm16";
import { tmpdir } from 'os';
import { join } from 'path';
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

    // Track if promise is already settled to prevent double resolution
    let settled = false;

    // Attach close listener immediately (before error handler) to handle early errors
    fileStream.on('close', () => {
      if (!settled) {
        settled = true;
        resolve(outputPath);
      }
    });

    // Error handler - reject immediately and clean up
    recording.stream().on('error', (err: Error) => {
      if (!settled) {
        settled = true;
        recording.stop();
        writer.end();
        reject(err);
      }
    });

    // Stop recording after duration
    setTimeout(() => {
      if (!settled) {
        recording.stop();
        writer.end();
        // Close listener will handle resolution
      }
    }, durationSeconds * 1000);
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
