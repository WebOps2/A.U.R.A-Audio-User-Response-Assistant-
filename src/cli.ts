#!/usr/bin/env node

import { Command } from 'commander';
import { listenMode } from './modes/listen.js';
import { chatMode } from './modes/chat.js';

const program = new Command();

program
  .name('devvoice')
  .description('Voice-first developer assistant for local git repositories')
  .version('1.0.0');

program
  .command('listen')
  .description('Single-turn voice command execution')
  .option('--repo <path>', 'Repository path (default: current directory)')
  .option('--mute', 'Disable text-to-speech output')
  .action(async (options) => {
    const repoPath = options.repo || process.cwd();
    const mute = options.mute || false;
    await listenMode(repoPath, mute);
  });

program
  .command('chat')
  .description('Multi-turn interactive voice chat')
  .option('--repo <path>', 'Repository path (default: current directory)')
  .option('--mute', 'Disable text-to-speech output')
  .action(async (options) => {
    const repoPath = options.repo || process.cwd();
    const mute = options.mute || false;
    await chatMode(repoPath, mute);
  });

program.parse();
