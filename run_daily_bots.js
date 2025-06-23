// run_daily_bots.js - Orchestration script for running LinkedIn Bot daily

const { spawn } = require('child_process');
const path = require('path');

// --- Configuration for Orchestration ---

const BOT_SCRIPT_PATH = path.resolve(__dirname, 'bot.js'); // Absolute path to your main bot script

// Define the different search keyword and connection pairs
// The orchestrator will run bot.js for each entry in this array, sequentially.
// Example: Run for different keywords on the same day
const botConfigurations = [
    { keywords: 'artificial intelligence recruiter', connections: 5 },
    { keywords: 'artificial intelligence vrije universiteit', connections: 5 },
    { keywords: 'Software Engineer netherlands', connections: 2 }, 
    { keywords: 'artificial intelligence netherlands', connections: 2 }, 
    { keywords: 'Recruitment Specialist artificial intelligence', connections: 3 },
    { keywords: 'Talent Acquisition artificial intelligence', connections: 4 },
];

// Random deviation in minutes for the start time of the FIRST bot run of the day.
// Example: If cron is set for 9:00 AM and this is 10, the first run can start between 8:50 AM and 9:10 AM.
const RANDOM_START_OFFSET_MINUTES = 10;

// Delay between successive bot runs (if multiple configurations are present for a day).
// This is important to space out LinkedIn activity.
const DELAY_BETWEEN_BOTS_MINUTES = 20; // Wait 20 minutes before starting the next bot in the sequence

// --- Utility for Native Node.js Sleep ---
function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time);
    });
}

/**
 * Executes the bot.js script as a child process with specified parameters.
 * @param {string} keywords - Search keywords to pass to bot.js.
 * @param {number} connections - Number of connections to make, passed to bot.js.
 * @returns {Promise<number>} - Resolves with the exit code of the bot process.
 */
async function executeBot(keywords, connections) {
    return new Promise((resolve, reject) => {
        console.log(`\n--- Starting bot.js with Keywords: "${keywords}", Connections: ${connections} ---`);
        // `spawn` is used to run an external command (node bot.js)
        // `stdio: 'inherit'` makes the child process's output (console.log, console.error)
        // visible in the parent process's console.
        const botProcess = spawn('node', [BOT_SCRIPT_PATH, keywords, connections.toString()], {
            stdio: 'inherit'
        });

        botProcess.on('close', (code) => {
            if (code === 0) {
                console.log(`--- bot.js for "${keywords}" finished successfully with code ${code} ---`);
                resolve(code);
            } else {
                console.error(`--- bot.js for "${keywords}" exited with code ${code} (Error) ---`);
                resolve(code); // Resolve even on error, so the sequence can attempt to continue
            }
        });

        botProcess.on('error', (err) => {
            console.error(`Failed to start bot.js process for "${keywords}":`, err);
            reject(err); // Reject if the process itself fails to spawn
        });
    });
}

/**
 * Main function to run the daily sequence of bot tasks.
 */
async function runDailyBots() {
    console.log(`\nOrchestration script started at ${new Date().toLocaleString()}`);

    // Calculate a random offset for the start of the first bot run
    // This will be a value between -RANDOM_START_OFFSET_MINUTES and +RANDOM_START_OFFSET_MINUTES
    const randomOffsetMinutes = Math.floor(Math.random() * (2 * RANDOM_START_OFFSET_MINUTES + 1)) - RANDOM_START_OFFSET_MINUTES;
    const initialDelayMs = randomOffsetMinutes * 60 * 1000;

    if (initialDelayMs !== 0) {
        console.log(`Applying initial random delay of ${randomOffsetMinutes} minutes before the first bot run.`);
        await delay(Math.abs(initialDelayMs)); // Always delay by a positive amount
    }

    console.log(`Starting bot execution sequence at ${new Date().toLocaleString()} (after initial random delay).`);

    for (let i = 0; i < botConfigurations.length; i++) {
        const config = botConfigurations[i];
        try {
            await executeBot(config.keywords, config.connections);
        } catch (error) {
            console.error(`Unhandled error during execution of bot for "${config.keywords}":`, error);
            // Decide here if you want to stop the entire sequence or continue.
            // For now, it will just log the error and proceed to the next configuration.
        }

        // If there are more configurations to run, wait before starting the next one
        if (i < botConfigurations.length - 1) {
            console.log(`\nWaiting ${DELAY_BETWEEN_BOTS_MINUTES} minutes before starting the next bot run...`);
            await delay(DELAY_BETWEEN_BOTS_MINUTES * 60 * 1000);
        }
    }

    console.log(`\nAll bot runs completed for today at ${new Date().toLocaleString()}.`);
}

// Execute the daily run sequence
runDailyBots();