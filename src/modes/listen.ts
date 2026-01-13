import { waitForPushToTalk, recordAudio } from '../voice/record.js';
import { transcribe } from '../voice/transcribe.js';
import { routeIntent, createPlan } from '../intents/router.js';
import { getCommandForIntent } from '../intents/whitelist.js';
import { executeCommand } from '../exec/runner.js';
import { summarize } from '../summarize/index.js';
import { speak } from '../tts/elevenlabs.js';
import { Intent } from '../intents/types.js';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Single-turn listen mode: record, transcribe, plan, confirm if needed, execute, summarize, speak.
 */
export async function listenMode(repoPath: string, mute: boolean): Promise<void> {
  console.log('🎤 DevVoice - Single Turn Mode');
  console.log(`📁 Repository: ${repoPath}`);
  
  // Validate repo path
  if (!existsSync(repoPath)) {
    console.error(`❌ Repository path does not exist: ${repoPath}`);
    process.exit(1);
  }
  
  try {
    // Step 1: Wait for push-to-talk
    await waitForPushToTalk();
    
    // Step 2: Record audio
    console.log('🔴 Recording... (up to 8 seconds)');
    const audioPath = await recordAudio({ durationSeconds: 8 });
    console.log('✅ Recording complete');
    
    // Step 3: Transcribe
    console.log('📝 Transcribing...');
    const transcription = await transcribe(audioPath);
    console.log(`\n💬 Heard: "${transcription}"`);
    
    // Step 4: Route intent
    const intentResult = routeIntent(transcription);
    const plan = createPlan(intentResult);
    
    console.log(`\n📋 Plan: ${plan.description}`);
    
    // Handle special intents that don't require execution
    if (plan.intent === Intent.HELP) {
      const helpText = getHelpText();
      console.log(helpText);
      if (!mute) {
        await speak(helpText, mute);
      }
      return;
    }
    
    if (plan.intent === Intent.UNKNOWN) {
      const unknownText = `I didn't understand that. Try saying "help" for available commands.`;
      console.log(unknownText);
      if (!mute) {
        await speak(unknownText, mute);
      }
      return;
    }
    
    // Step 5: Get command
    const commandTemplate = await getCommandForIntent(plan.intent, plan.params, repoPath);
    
    if (!commandTemplate) {
      let errorText: string;
      if (plan.intent === Intent.MAKE_COMMIT) {
        errorText = 'Cannot commit: no staged changes. Please stage files first using git add.';
      } else {
        errorText = `Cannot execute ${plan.intent}. Command not available or parameters missing.`;
      }
      console.log(`❌ ${errorText}`);
      if (!mute) {
        await speak(errorText, mute);
      }
      return;
    }
    
    // Step 6: Confirm if needed
    if (plan.requiresConfirmation) {
      console.log('\n⚠️  This action requires confirmation.');
      await waitForPushToTalk();
      console.log('🔴 Recording confirmation...');
      const confirmAudioPath = await recordAudio({ durationSeconds: 5 });
      const confirmText = await transcribe(confirmAudioPath);
      console.log(`💬 Confirmation: "${confirmText}"`);
      
      const normalized = confirmText.toLowerCase();
      if (!normalized.includes('confirm') && !normalized.includes('proceed') && !normalized.includes('yes')) {
        const cancelledText = 'Action cancelled.';
        console.log(`❌ ${cancelledText}`);
        if (!mute) {
          await speak(cancelledText, mute);
        }
        return;
      }
    }
    
    // Step 7: Execute
    console.log(`\n⚙️  Executing: ${commandTemplate.command} ${commandTemplate.args.join(' ')}`);
    const result = await executeCommand(commandTemplate);
    
    // Step 8: Summarize
    const summary = summarize(plan.intent, result);
    console.log(`\n📊 Summary: ${summary}`);
    
    // Step 9: Speak
    if (!mute) {
      await speak(summary, mute);
    }
    
    // Show full output if verbose
    if (result.stdout) {
      console.log('\n📄 Output:');
      console.log(result.stdout);
    }
    if (result.stderr) {
      console.log('\n⚠️  Errors:');
      console.log(result.stderr);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    const errorText = `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
    if (!mute) {
      await speak(errorText, mute);
    }
    process.exit(1);
  }
}

function getHelpText(): string {
  return `Available commands: run tests, git status, run lint, run build, create branch, commit, explain failure, details, repeat, help, exit.`;
}
