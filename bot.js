// bot.js - MODIFIED TO ACCEPT COMMAND LINE ARGUMENTS

require('dotenv').config(); // Load environment variables from .env file
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
const { spawn } = require('child_process'); // Import spawn for running Python script

// --- Configuration ---
// Now pulling from .env file
const LINKEDIN_EMAIL = process.env.LINKEDIN_EMAIL;
const LINKEDIN_PASSWORD = process.env.LINKEDIN_PASSWORD;

// --- Define Timeout Constants ---
const MAX_PAGES_WITHOUT_NEW_CONNECTS = 5; // Stop after 5 consecutive pages with no new successful connections
const MAX_TIME_WITHOUT_NEW_CONNECTS_MS = 60 * 1000 * 5; // Stop after 5 minutes without a new successful connection (5 minutes * 60 seconds * 1000 ms)

// PARAMETERS ARE NOW PASSED VIA COMMAND LINE ARGUMENTS
// process.argv[0] is 'node'
// process.argv[1] is 'bot.js' (this file)
// process.argv[2] will be SEARCH_KEYWORDS
// process.argv[3] will be CONNECTIONS_TO_MAKE

const SEARCH_KEYWORDS = process.argv[2];
const CONNECTIONS_TO_MAKE = parseInt(process.argv[3], 10); // Ensure it's parsed as an integer

// Basic validation for passed arguments
if (!SEARCH_KEYWORDS || isNaN(CONNECTIONS_TO_MAKE) || CONNECTIONS_TO_MAKE < 0) {
    console.error("Usage: node bot.js <SEARCH_KEYWORDS> <CONNECTIONS_TO_MAKE>");
    console.error("SEARCH_KEYWORDS must be a string and CONNECTIONS_TO_MAKE must be a non-negative number.");
    process.exit(1); // Exit if arguments are missing or invalid
}

const USER_DATA_DIR = path.resolve(__dirname, './linkedin_user_data'); // Directory to store browser profile (cookies, etc.)
const PYTHON_SCRIPT_PATH = path.resolve(__dirname, 'generate_graphs.py'); // Path to your Python script
const ERROR_SCREENSHOT_DIR = path.resolve(__dirname, 'errors'); // Directory to save error screenshots

// --- Utility for Native Node.js Sleep ---
/**
 * Pauses execution for a given number of milliseconds.
 * @param {number} time - The duration to pause in milliseconds.
 */
function delay(time) {
    return new Promise(function(resolve) {
        setTimeout(resolve, time);
    });
}

/**
 * Generates a random delay between min and max milliseconds.
 * @param {number} min - Minimum delay in milliseconds.
 * @param {number} max - Maximum delay in milliseconds.
 * @returns {number} Random delay.
 */
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// --- Helper Functions ---

/**
 * Saves a screenshot to the errors folder with a timestamp.
 * @param {object} page - Puppeteer Page object.
 * @param {string} filenamePrefix - Prefix for the filename (e.g., 'login_error').
 */
async function saveErrorScreenshot(page, filenamePrefix) {
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, ''); // YYYY-MM-DDTHH-MM-SS
    const filename = `${filenamePrefix}_${timestamp}.png`;
    const screenshotPath = path.join(ERROR_SCREENSHOT_DIR, filename);
    try {
        await fs.mkdir(ERROR_SCREENSHOT_DIR, { recursive: true }); // Ensure errors directory exists
        await page.screenshot({ path: screenshotPath });
        console.log(`Error screenshot saved to: ${screenshotPath}`);
    } catch (err) {
        console.error(`Failed to save error screenshot to ${screenshotPath}:`, err);
    }
}


/**
 * Checks if logged in and performs login if necessary.
 * Uses userDataDir for persistence.
 * @param {object} page - Puppeteer Page object.
 * @param {string} email - LinkedIn email.
 * @param {string} password - LinkedIn password.
 */
async function checkAndLogin(page, email, password) {
    console.log('Checking login status...');
    try {
        await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(getRandomDelay(2000, 4000));

        // Check for a common element only present when logged in (e.g., home feed content)
        const loggedInElementSelector = 'div.scaffold-layout__row'; // A common element on the feed page
        try {
            await page.waitForSelector(loggedInElementSelector, { timeout: 10000 });
            console.log('Already logged in or successfully logged in previously.');
            return true;
        } catch (e) {
            console.log('Not logged in. Attempting to log in...');
        }

        // Navigate to login page explicitly if needed, though feed usually redirects
        await page.goto('https://www.linkedin.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(getRandomDelay(2000, 4000));

        // Wait for login form elements and fill them
        const emailSelector = '#username';
        const passwordSelector = '#password';
        const signInButtonSelector = 'button[data-litms-control-urn="login-submit"]';

        await page.waitForSelector(emailSelector, { timeout: 15000 });
        console.log(`Typing email into ${emailSelector}...`);
        await page.type(emailSelector, email, { delay: getRandomDelay(50, 150) });
        await delay(getRandomDelay(1000, 2000)); // Increased delay after email

        // Re-wait for password input to ensure it's fresh and ready after email entry
        await page.waitForSelector(passwordSelector, { timeout: 15000 }); // Increased timeout for password field
        console.log(`Typing password into ${passwordSelector}...`);
        await page.type(passwordSelector, password, { delay: getRandomDelay(50, 150) });
        await delay(getRandomDelay(1500, 3000)); // Increased delay after typing password

        // --- Sign-in button waiting and clicking ---
        await page.waitForSelector(signInButtonSelector, { timeout: 15000 }); // Increased timeout for button
        console.log(`Clicking sign-in button: ${signInButtonSelector}...`);
        await page.click(signInButtonSelector);

        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(getRandomDelay(3000, 6000));

        // --- Check for 2FA (Verification) Page ---
        // These selectors are examples; inspect the page for current ones if 2FA appears
        const twoFactorCodeInputSelector = '#input__phone_number';
        const twoFactorSubmitButtonSelector = 'button[data-test-id="verification-pin-submit-button"]';

        try {
            await page.waitForSelector(twoFactorCodeInputSelector, { timeout: 10000 });
            console.warn('2FA detected! Please enter the code manually in the browser window.');
            console.warn('The script will pause for 60 seconds for you to enter the code and click "Verify".');

            await delay(60000); // Give user 60 seconds to enter code and click "Verify"

            console.log('Attempting to continue after 2FA manual input.');
            await page.waitForSelector(loggedInElementSelector, { timeout: 15000 }); // Check for logged-in element again

        } catch (e2fa) {
            console.log('2FA not detected or already handled.');
            await page.waitForSelector(loggedInElementSelector, { timeout: 15000 }); // Final check for logged-in element
        }

        console.log('Successfully logged in (or bypassed 2FA through persistence)!');
        return true;

    } catch (error) {
        console.error('Login or 2FA handling failed:', error);
        await saveErrorScreenshot(page, 'login_error');
        return false;
    }
}

/**
 * Performs a search on LinkedIn.
 * @param {object} page - Puppeteer Page object.
 * @param {string} keywords - Keywords to search for.
 */
async function searchLinkedIn(page, keywords) {
    console.log(`Searching for "${keywords}"...`);
    try {
        // LinkedIn's main search bar has an aria-label "Search"
        const searchInputSelector = 'input[aria-label="Search"]';

        await page.waitForSelector(searchInputSelector, { timeout: 15000 });
        await page.click(searchInputSelector); // Click to activate if needed
        await delay(getRandomDelay(500, 1000));
        await page.type(searchInputSelector, keywords, { delay: getRandomDelay(50, 150) });
        await delay(getRandomDelay(1000, 2000));
        await page.keyboard.press('Enter');

        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(getRandomDelay(3000, 6000)); // Wait for search results to load
        console.log('Search initiated and results loaded.');
    } catch (error) {
        console.error('Error during search:', error);
        await saveErrorScreenshot(page, 'search_error');
        throw error; // Re-throw to stop execution if search fails
    }
}

/**
 * Switches to the 'People' tab in search results.
 * @param {object} page - Puppeteer Page object.
 */
async function switchToPeopleTab(page) {
    console.log('Switching to "People" tab...');
    try {
        // Using XPath to find a button that contains the text "People"
        const peopleTabXPath = '//button[contains(., "People")]';

        // Wait for the button using waitForSelector with 'xpath/' prefix
        await page.waitForSelector(`xpath/${peopleTabXPath}`, { timeout: 15000 });

        // Get the element handle for the button using page.$ with 'xpath/' prefix
        const peopleTabButton = await page.$(`xpath/${peopleTabXPath}`);

        if (peopleTabButton) {
            await peopleTabButton.click();
            console.log('Clicked "People" tab.');
        } else {
            // This case should ideally not be reached if waitForSelector succeeds
            throw new Error('People tab button not found after waiting (logic error).');
        }

        // Wait for the page to update after clicking the filter
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}); // Navigation might not always happen explicitly, sometimes it's just a content update
        await delay(getRandomDelay(3000, 6000));
        console.log('Switched to "People" tab.');
    } catch (error) {
        console.error('Error switching to People tab:', error);
        await saveErrorScreenshot(page, 'people_tab_error');
        throw error;
    }
}

/**
 * Finds and clicks 'Connect' buttons, then 'Send without note', handling pagination.
 * Includes timeout conditions for finding new connections.
 * @param {object} page - Puppeteer Page object.
 * @param {number} limit - Maximum number of connections to make.
 * @returns {object} Metrics collected during the connection process.
 */
async function connectWithUsers(page, limit) {
    console.log(`Attempting to connect with up to ${limit} users across pages...`);
    let connectionsMade = 0;
    let currentPage = 1;
    let pagesSearchedWithoutConnect = 0; // Counts consecutive pages without a new successful connection
    let lastSuccessfulConnectTime = Date.now();

    // --- NEW METRICS FOR REPORTING ---
    let totalProfilesScanned = 0; // Total LinkedIn profile cards seen across all pages.
    let totalConnectButtonsFound = 0; // Total "Connect" buttons found.

    // Loop through pages until limit is met or no more pages
    while (connectionsMade < limit) {
        console.log(`Processing page ${currentPage}. Connections made so far: ${connectionsMade}.`);

        // --- Check for timeout conditions at the beginning of each page iteration ---
        if (pagesSearchedWithoutConnect >= MAX_PAGES_WITHOUT_NEW_CONNECTS) {
            console.warn(`Timeout: No new connections made for ${MAX_PAGES_WITHOUT_NEW_CONNECTS} consecutive pages. Stopping.`);
            break;
        }
        if (Date.now() - lastSuccessfulConnectTime > MAX_TIME_WITHOUT_NEW_CONNECTS_MS) {
            console.warn(`Timeout: No new connections made for ${MAX_TIME_WITHOUT_NEW_CONNECTS_MS / 1000 / 60} minutes. Stopping.`);
            break;
        }

        await delay(getRandomDelay(3000, 5000));

        // --- Collect Total People Profiles Found ---
        // A common selector for individual profile cards on LinkedIn search results
        const profileCardSelector = 'li.reusable-search__result-container';
        try {
            // Wait briefly for profile cards to ensure page content is loaded
            await page.waitForSelector(profileCardSelector, { timeout: 5000 });
            const profilesOnPage = await page.$$(profileCardSelector);
            totalProfilesScanned += profilesOnPage.length;
            console.log(`Found ${profilesOnPage.length} profiles on page ${currentPage}. Total profiles scanned: ${totalProfilesScanned}.`);
        } catch (e) {
            console.log("No profile cards found on this page or page not fully loaded for profile cards within timeout.");
            // Continue, but this might mean the page is empty or structured differently
        }


        // Define a robust XPath selector for "Connect" buttons
        // It looks for any <button> element that contains a <span> with the exact text "Connect"
        const connectButtonsXPath = '//button[.//span[text()="Connect"]]';
        let buttonsOnPage = []; // Array to store actual button handles found on the current page
        let connectionMadeOnThisPage = false; // Flag to track if any connection was successfully made on this specific page

        try {
            // Wait for at least one connect button to appear to ensure content is loaded.
            // If none appear within timeout, `buttonsOnPage` will remain empty.
            await page.waitForSelector(`xpath/${connectButtonsXPath}`, { timeout: 10000 });
            buttonsOnPage = await page.$$(`xpath/${connectButtonsXPath}`);
            totalConnectButtonsFound += buttonsOnPage.length; // Increment total count of 'Connect' buttons found
            console.log(`Found ${buttonsOnPage.length} 'Connect' buttons on page ${currentPage}. Total found: ${totalConnectButtonsFound}.`);
        } catch (e) {
            console.log("No 'Connect' buttons found on this page within timeout.");
            // If no buttons, `connectionMadeOnThisPage` remains false, which will lead to incrementing `pagesSearchedWithoutConnect` later.
        }

        if (buttonsOnPage.length === 0) {
            console.log("No 'Connect' buttons found to interact with on this page. Checking for next page.");
        }

        for (const button of buttonsOnPage) {
            if (connectionsMade >= limit) break; // Break if limit is reached during iteration

            try {
                // Ensure the button is visible and interactable before clicking
                const isVisible = await page.evaluate(el => {
                    const style = window.getComputedStyle(el);
                    return style.visibility !== 'hidden' && style.display !== 'none' && el.offsetParent !== null;
                }, button);

                if (!isVisible) {
                    continue; // Skip if button is not visible
                }

                console.log('Found a "Connect" button. Clicking...');
                await button.click();
                await delay(getRandomDelay(1000, 2000)); // Wait for connection modal to appear

                // --- Handle the "Add a note" / "Send without note" modal ---
                // Define two possible selectors for the 'send' button based on observed variations
                const sendWithoutNoteSelector = 'button[aria-label="Send without a note"]'; // Matches your latest screenshot
                const sendNowSelector = 'button[aria-label="Send now"]'; // Keeping this for other potential variations
                const dismissButtonSelector = 'button[aria-label="Dismiss"]'; // General 'Dismiss' button

                try {
                    // Use Promise.race to wait for any of the relevant buttons to appear first in the modal
                    const buttonFoundInModal = await Promise.race([
                        page.waitForSelector(sendWithoutNoteSelector, { timeout: 5000 }),
                        page.waitForSelector(sendNowSelector, { timeout: 5000 }),
                        page.waitForSelector(dismissButtonSelector, { timeout: 5000 })
                    ]);

                    if (buttonFoundInModal) {
                        const foundAriaLabel = await page.evaluate(el => el.ariaLabel, buttonFoundInModal);
                        const foundTextContent = await page.evaluate(el => el.textContent.trim(), buttonFoundInModal);

                        // Check if the found button is one of our "Send" variations
                        if (foundAriaLabel === 'Send without a note' || foundAriaLabel === 'Send now' || foundTextContent === 'Send' || foundTextContent === 'Send without a note') {
                            await buttonFoundInModal.click();
                            console.log(`Clicked "${foundAriaLabel || foundTextContent}" button.`);
                            connectionsMade++;
                            connectionMadeOnThisPage = true; // Mark as successful on this page

                            // --- Reset timeout counters on successful connection ---
                            pagesSearchedWithoutConnect = 0;
                            lastSuccessfulConnectTime = Date.now();
                        } else if (foundAriaLabel === 'Dismiss') {
                            // If a dismiss button was found first (meaning no send option immediately)
                            await buttonFoundInModal.click();
                            console.log('Dismissed modal (neither "Send" button found, or user must add note).');
                        } else {
                            // If some other unexpected button was found
                            console.log(`Unexpected button found in modal: ${foundAriaLabel || foundTextContent}. Attempting to dismiss.`);
                            const dismissButton = await page.$(dismissButtonSelector);
                            if (dismissButton) await dismissButton.click();
                        }
                    } else {
                        // This case means no relevant button appeared within the timeout
                        console.log('No relevant button found in connection modal within timeout. Attempting to dismiss any potential modal.');
                        const dismissButton = await page.$(dismissButtonSelector);
                        if (dismissButton) await dismissButton.click();
                    }

                } catch (modalError) {
                    console.warn(`Connection modal interaction failed or timed out: ${modalError.message}. Attempting to close any open modal.`);
                    try {
                        // Attempt to dismiss any modal that might be stuck
                        const closeButton = await page.$('button[aria-label="Dismiss"]');
                        if (closeButton) {
                            await closeButton.click();
                            console.log('Closed unexpected/stuck modal.');
                        }
                    } catch (closeErr) {
                        // No close button found, ignore
                    }
                }
                await delay(getRandomDelay(5000, 10000)); // Long delay to appear more human and avoid detection

            } catch (buttonError) {
                console.error('Error processing a connect button:', buttonError.message);
                // Continue to the next button even if one fails
            }
        }

        // --- Increment page counter if no successful connection was made on this page ---
        if (!connectionMadeOnThisPage) {
            pagesSearchedWithoutConnect++;
            console.log(`No new connections made on page ${currentPage}. pagesSearchedWithoutConnect: ${pagesSearchedWithoutConnect}.`);
        }


        // --- Pagination Logic ---
        if (connectionsMade >= limit) {
            console.log('Connection limit reached. Exiting pagination loop.');
            break;
        }

        // XPath for "Next" button - common patterns including text and aria-label
        const nextButtonXPath = '//button[@aria-label="Next"] | //a[@aria-label="Next"] | //button[contains(., "Next")] | //a[contains(., "Next")]';

        const nextButton = await page.$(`xpath/${nextButtonXPath}`);
        let isNextButtonDisabled = true;

        if (nextButton) {
            // Check for disabled attribute or disabled class on the button
            isNextButtonDisabled = await page.evaluate(btn => {
                return btn.disabled || btn.ariaDisabled === 'true' || btn.classList.contains('artdeco-button--disabled');
            }, nextButton);
        } else {
            console.log('No "Next" button found on page.');
        }

        if (nextButton && !isNextButtonDisabled) {
            console.log(`Clicking next page (Page ${currentPage + 1})...`);
            await nextButton.click();
            await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 });
            currentPage++;
        } else {
            console.log('No more "Next" pages or the button is disabled. Finishing connection attempts.');
            break; // Exit the loop as no more pages
        }
    }

    console.log(`Finished connection attempts. Made ${connectionsMade} connections.`);
    if (connectionsMade < limit) {
        console.warn(`Could not reach the target of ${limit} connections.`);
    }

    // Return the collected metrics
    return {
        connectionsMade,
        totalProfilesScanned,
        totalConnectButtonsFound
    };
}

/**
 * Generates and saves a report of the bot's run.
 * @param {object} metrics - Metrics collected during the connection process.
 */
async function generateReport(metrics) {
    const resultsDir = path.resolve(__dirname, 'results');
    await fs.mkdir(resultsDir, { recursive: true }); // Ensure results directory exists

    let runNumber = 1;
    const runNumberFilePath = path.join(resultsDir, 'run_number.txt');
    try {
        // Read the last run number and increment it
        const lastRunNumber = await fs.readFile(runNumberFilePath, 'utf8');
        runNumber = parseInt(lastRunNumber) + 1;
    } catch (e) {
        // If file doesn't exist, it's the first run, so start from 1
        console.log('No previous run number found, starting from run 1.');
    }
    // Save the new run number for the next execution
    await fs.writeFile(runNumberFilePath, runNumber.toString());

    // Create a timestamp for the folder name (YYYYMMDD_HHMMSS)
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
                      (now.getMonth() + 1).toString().padStart(2, '0') +
                      now.getDate().toString().padStart(2, '0') + '_' +
                      now.getHours().toString().padStart(2, '0') +
                      now.getMinutes().toString().padStart(2, '0') +
                      now.getSeconds().toString().padStart(2, '0');

    // Format the run folder name
    const runFolderName = `run_${String(runNumber).padStart(3, '0')}_${timestamp}`;
    const currentRunDir = path.join(resultsDir, runFolderName);
    await fs.mkdir(currentRunDir, { recursive: true }); // Create subfolder for this run

    // --- Generate TXT Report ---
    const reportTxtFilePath = path.join(currentRunDir, 'report.txt');
    let reportTxtContent = `--- LinkedIn Bot Run Report ---\n\n`;
    reportTxtContent += `Run ID: ${runFolderName}\n`;
    reportTxtContent += `Timestamp: ${new Date().toLocaleString()}\n`;
    reportTxtContent += `Search Keywords: ${SEARCH_KEYWORDS}\n`; // Now using the passed parameter
    reportTxtContent += `Target Connections: ${CONNECTIONS_TO_MAKE}\n\n`; // Now using the passed parameter

    reportTxtContent += `Total Connections Made: ${metrics.connectionsMade}\n`;
    reportTxtContent += `Total People Profiles Scanned: ${metrics.totalProfilesScanned}\n`;
    reportTxtContent += `Total 'Connect' Buttons Found: ${metrics.totalConnectButtonsFound}\n`;

    const ratioConnectToProfiles = metrics.totalProfilesScanned > 0
        ? (metrics.totalConnectButtonsFound / metrics.totalProfilesScanned).toFixed(2)
        : 'N/A';
    reportTxtContent += `Ratio of 'Connect' buttons found to total profiles scanned: ${ratioConnectToProfiles}\n`;

    reportTxtContent += `\n--- End of Report ---\n`;

    await fs.writeFile(reportTxtFilePath, reportTxtContent);
    console.log(`Text report saved to: ${reportTxtFilePath}`);

    // --- Generate CSV Report for current run ---
    const reportCsvFilePath = path.join(currentRunDir, 'report.csv');
    const csvHeader = 'RunID,Timestamp,ConnectionsMade,TotalProfilesScanned,TotalConnectButtonsFound,SearchKeywords,TargetConnections\n'; // Added new columns
    const csvRow = `${runFolderName},${timestamp},${metrics.connectionsMade},${metrics.totalProfilesScanned},${metrics.totalConnectButtonsFound},"${SEARCH_KEYWORDS}",${CONNECTIONS_TO_MAKE}\n`; // Included new parameters

    await fs.writeFile(reportCsvFilePath, csvHeader + csvRow); // Write with header for current run
    console.log(`CSV report saved to: ${reportCsvFilePath}`);

    // --- Append to Master CSV for historical data ---
    const masterCsvFilePath = path.join(resultsDir, 'master_report.csv');
    
    let masterFileExists = true;
    try {
        await fs.access(masterCsvFilePath); // Check if file exists
    } catch (e) {
        masterFileExists = false; // File does not exist
    }

    if (!masterFileExists) {
        // If file does not exist, write header first
        await fs.writeFile(masterCsvFilePath, csvHeader);
        console.log(`Created new master report CSV with header: ${masterCsvFilePath}`);
    }

    // Now append the data row
    await fs.appendFile(masterCsvFilePath, csvRow);
    console.log(`Data appended to master report CSV: ${masterCsvFilePath}`);

    // --- Run Python script to generate graphs ---
    console.log('Running Python script to generate graphs...');
    const pythonProcess = spawn('python', [
        PYTHON_SCRIPT_PATH,
        currentRunDir, // Arg 1: Path for current run's data/graphs
        resultsDir     // Arg 2: Path for master data/historical graphs
    ]);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python stdout: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python stderr: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        if (code === 0) {
            console.log('Python script finished successfully.');
        } else {
            console.error(`Python script exited with code ${code}`);
            console.error('Check Python script output above for details. Common issues: missing libraries (pandas, matplotlib), syntax errors.');
        }
    });

    pythonProcess.on('error', (err) => {
        console.error('Failed to start Python process:', err);
        console.error('Please ensure Python is installed and accessible in your system\'s PATH,');
        console.error(`and that the script path is correct: ${PYTHON_SCRIPT_PATH}`);
    });
}


/**
 * Main function to run the bot.
 */
async function runBot() {
    let browser;
    let page;

    try {
        console.log(`Starting bot with keywords: "${SEARCH_KEYWORDS}" and connections: ${CONNECTIONS_TO_MAKE}`);
        console.log('Launching browser...');
        browser = await puppeteer.launch({
            headless: false, // Set to true for production, false for debugging
            userDataDir: USER_DATA_DIR, // This maintains your login session across runs
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-notifications', // Disable browser notifications
                '--start-maximized', // Start browser maximized
                '--disable-blink-features=AutomationControlled' // Helps in avoiding detection
            ]
        });

        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 }); // Set a common desktop resolution

        // Set a more human-like user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Pass some custom JS to avoid detection (e.g., spoofing navigator.webdriver)
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
            // Also spoof plugins for more realism
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5], // A non-empty array
            });
            // And languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
        });


        const isLoggedIn = await checkAndLogin(page, LINKEDIN_EMAIL, LINKEDIN_PASSWORD);
        if (!isLoggedIn) {
            console.error('Failed to log in. Exiting.');
            // Do not throw error here, just return, as checkAndLogin already handles logging and screenshot
            return; 
        }

        await searchLinkedIn(page, SEARCH_KEYWORDS);
        await switchToPeopleTab(page);
        // Call connectWithUsers and capture the returned metrics
        const metrics = await connectWithUsers(page, CONNECTIONS_TO_MAKE);

        console.log('Bot finished successfully!');
        // Generate and save the report with the collected metrics
        await generateReport(metrics);

    } catch (error) {
        console.error('An unhandled error occurred during bot execution:', error);
        if (browser) { 
            if (page) { // Only call saveErrorScreenshot if page object exists
                await saveErrorScreenshot(page, 'bot_execution_error');
            } else {
                console.error('Could not take screenshot as page object was not created before the error.');
            }
        }
    } finally {
        if (browser) {
            await browser.close();
            console.log('Browser closed.');
        }
    }
}

// Run the bot
runBot();