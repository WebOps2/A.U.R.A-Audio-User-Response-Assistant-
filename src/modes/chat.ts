import { waitForPushToTalk, recordAudio } from '../voice/record.js';
import { transcribe } from '../voice/transcribe.js';
import { routeIntent, createPlan } from '../intents/router.js';
import { getCommandForIntent } from '../intents/whitelist.js';
import { executeCommand } from '../exec/runner.js';
import { summarize } from '../summarize/index.js';
import { speak } from '../tts/elevenlabs.js';
import { createMemory, updateMemory, explainFailure, getDetails } from '../session/memory.js';
import { Intent } from '../intents/types.js';
import { existsSync } from 'fs';

/**
 * Multi-turn chat mode: interactive loop with session memory.
 */
export async function chatMode(repoPath: string, mute: boolean): Promise<void> {
  console.log('🎤 DevVoice - Chat Mode');
  console.log(`📁 Repository: ${repoPath}`);
  console.log('💬 Say "exit" to quit\n');
  
  // Validate repo path
  if (!existsSync(repoPath)) {
    console.error(`❌ Repository path does not exist: ${repoPath}`);
    process.exit(1);
  }
  
  const memory = createMemory();
  
  while (true) {
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
      
      // Handle special intents
      if (plan.intent === Intent.EXIT) {
        const goodbyeText = 'Goodbye!';
        console.log(goodbyeText);
        if (!mute) {
          await speak(goodbyeText, mute);
        }
        break;
      }
      
      if (plan.intent === Intent.HELP) {
        const helpText = getHelpText();
        console.log(helpText);
        if (!mute) {
          await speak(helpText, mute);
        }
        continue;
      }
      
      if (plan.intent === Intent.REPEAT_LAST) {
        if (memory.lastSummary) {
          console.log(`\n📊 Repeating: ${memory.lastSummary}`);
          if (!mute) {
            await speak(memory.lastSummary, mute);
          }
        } else {
          const noLastText = 'No previous summary to repeat.';
          console.log(noLastText);
          if (!mute) {
            await speak(noLastText, mute);
          }
        }
        continue;
      }
      
      if (plan.intent === Intent.EXPLAIN_FAILURE) {
        const explanation = explainFailure(memory);
        console.log(`\n📊 Explanation: ${explanation}`);
        if (!mute) {
          await speak(explanation, mute);
        }
        continue;
      }
      
      if (plan.intent === Intent.DETAILS) {
        const details = getDetails(memory);
        console.log(`\n📄 Details:\n${details}`);
        if (!mute) {
          // Summarize details for speech (first 200 chars)
          const speechDetails = details.length > 200 ? details.substring(0, 200) + '...' : details;
          await speak(`Details: ${speechDetails}`, mute);
        }
        continue;
      }
      
      if (plan.intent === Intent.UNKNOWN) {
        const unknownText = `I didn't understand that. Try saying "help" for available commands.`;
        console.log(unknownText);
        if (!mute) {
          await speak(unknownText, mute);
        }
        continue;
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
        continue;
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
          continue;
        }
      }
      
      // Step 7: Execute
      console.log(`\n⚙️  Executing: ${commandTemplate.command} ${commandTemplate.args.join(' ')}`);
      const result = await executeCommand(commandTemplate);
      
      // Step 8: Update memory
      const summary = summarize(plan.intent, result);
      updateMemory(memory, plan.intent, result, summary);
      
      // Step 9: Summarize and speak
      console.log(`\n📊 Summary: ${summary}`);
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
      
      // Step 10: Ask for next action
      console.log('\n💬 Anything else? (Press Enter to continue, or say "exit" to quit)');
      
    } catch (error) {
      console.error('❌ Error:', error);
      const errorText = `An error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`;
      if (!mute) {
        await speak(errorText, mute);
      }
      // Continue loop instead of exiting
    }
  }
}

function getHelpText(): string {
  return `Available commands: run tests, git status, run lint, run build, create branch, commit, explain failure, details, repeat, help, exit.`;
}
