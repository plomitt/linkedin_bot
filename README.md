# LinkedIn Connection Bot

This repository contains a set of Node.js and Python scripts designed to automate LinkedIn connection requests based on specified search keywords and generate reports and graphs of the bot's activity.

## Table of Contents

* [Features](#features)

* [Prerequisites](#prerequisites)

* [Setup](#setup)

  * [Environment Variables](#environment-variables)

  * [Dependencies](#dependencies)

* [Usage](#usage)

  * [Running the Bot Manually](#running-the-bot-manually)

  * [Running Daily Orchestration](#running-daily-orchestration)

* [Configuration](#configuration)

  * [bot.js](#botjs)

  * [run_daily_bots.js](#run_daily_botsjs)

* [Reports and Graphs](#reports-and-graphs)

* [Error Handling and Screenshots](#error-handling-and-screenshots)

* [Important Notes](#important-notes)

## Features

* **Automated LinkedIn Login**: Uses Puppeteer to log into LinkedIn, persisting session data for future runs.

* **Keyword-Based Search**: Searches for people on LinkedIn based on provided keywords.

* **Connection Requests**: Automatically sends connection requests to profiles found in search results.

* **Human-like Delays**: Incorporates random delays to mimic human interaction and reduce detection risk.

* **Daily Orchestration**: A separate script to run multiple bot configurations sequentially with controlled delays.

* **Detailed Reporting**: Generates `.txt` and `.csv` reports for each bot run, logging connections made and profiles scanned.

* **Historical Data Tracking**: Appends run data to a master CSV for long-term analytics.

* **Graphical Analysis**: Generates per-run and historical graphs (bar chart and line chart) of bot activity using Matplotlib.

* **Error Screenshots**: Automatically takes screenshots on errors for debugging.

## Prerequisites

Before you begin, ensure you have the following installed:

* [Node.js](https://nodejs.org/): Version 14 or higher.

* [npm](https://www.npmjs.com/get-npm): Comes with Node.js.

* [Python](https://www.python.org/): Version 3.7 or higher.

* [pip](https://pip.pypa.io/en/stable/installation/): Comes with Python.

## Setup

### Environment Variables

Create a `.env` file in the root directory of the project to store your LinkedIn credentials.

Example `.env` file:

```

LINKEDIN_EMAIL=your_linkedin_email@example.com
LINKEDIN_PASSWORD=your_linkedin_password

```

**Security Note**: Never commit your `.env` file to version control.

### Dependencies

1. **Node.js Dependencies**:
   Navigate to the project root in your terminal and install the Node.js packages:

```

npm install puppeteer dotenv

```

2. **Python Dependencies**:
Navigate to the project root in your terminal and install the Python packages:

```

pip install pandas matplotlib

```

## Usage

### Running the Bot Manually

You can run the `bot.js` script directly from your terminal by providing search keywords and the number of connections to make as command-line arguments:

```

node bot.js "artificial intelligence recruiter" 5

```

* Replace `"artificial intelligence recruiter"` with your desired search keywords (enclose in quotes if it contains spaces).

* Replace `5` with the number of connections you want to attempt.

### Running Daily Orchestration

The `run_daily_bots.js` script allows you to run multiple bot configurations sequentially with predefined delays, which is ideal for daily scheduled tasks.

To run the orchestration script:

```

node run_daily_bots.js

```

This script will read its configurations from the `botConfigurations` array within `run_daily_bots.js` and execute `bot.js` for each entry.

## Configuration

### `bot.js`

This is the core bot script. Key configurable constants are:

* `LINKEDIN_EMAIL`, `LINKEDIN_PASSWORD`: Pulled from `.env`.

* `MAX_PAGES_WITHOUT_NEW_CONNECTS`: Number of consecutive search result pages without a new connection attempt before stopping (default: 5).

* `MAX_TIME_WITHOUT_NEW_CONNECTS_MS`: Time in milliseconds without a new successful connection before stopping (default: 5 minutes).

* `USER_DATA_DIR`: Directory where Puppeteer stores browser profile data (cookies, local storage, etc.) to maintain login sessions. Default: `./linkedin_user_data`.

* `PYTHON_SCRIPT_PATH`: Path to the `generate_graphs.py` script. Default: `./generate_graphs.py`.

* `ERROR_SCREENSHOT_DIR`: Directory to save screenshots when errors occur. Default: `./errors`.

### `run_daily_bots.js`

This script orchestrates multiple runs of `bot.js`.

* `BOT_SCRIPT_PATH`: Absolute path to your `bot.js` script.

* `botConfigurations`: An array of objects, where each object defines a set of `keywords` and `connections` for a single `bot.js` run.

```

const botConfigurations = [
{ keywords: 'artificial intelligence recruiter', connections: 5 },
{ keywords: 'artificial intelligence netherlands', connections: 5 },
// Add more configurations as needed
];

```

* `RANDOM_START_OFFSET_MINUTES`: A random delay (in minutes) applied to the start time of the *first* bot run of the day. This helps randomize daily activity if scheduled with a cron job.

* `DELAY_BETWEEN_BOTS_MINUTES`: The delay (in minutes) between successive `bot.js` runs when multiple configurations are present in `botConfigurations`.

## Reports and Graphs

After each successful run of `bot.js` (whether direct or via `run_daily_bots.js`), the script will:

1. Create a timestamped directory under `./results/` (e.g., `results/run_001_20231027_143000`).

2. Generate `report.txt` and `report.csv` within this directory, detailing metrics for that specific run.

3. Append the run's data to `./results/master_report.csv`, which tracks historical data across all runs.

4. Execute `generate_graphs.py` to create two types of charts:

 * **Per-Run Bar Chart**: `connections_per_run.png` (saved in the current run's directory)

 * **Historical Line Chart**: `historical_connections.png` (saved in the main `results` directory)

## Error Handling and Screenshots

The `bot.js` script includes robust error handling. In case of a login failure, search error, or other unhandled exceptions, it will attempt to:

* Log the error to the console.

* Save a screenshot with a descriptive filename and timestamp in the `./errors` directory.

## Important Notes

* **LinkedIn's Terms of Service**: Please be aware that automated interactions with LinkedIn may violate their Terms of Service. Use this tool responsibly and at your own risk.

* **2FA (Two-Factor Authentication)**: If 2FA is enabled on your LinkedIn account, the bot will pause for 60 seconds when it detects the 2FA page, allowing you to manually enter the code and proceed.

* **Rate Limiting**: The script includes delays to mimic human behavior. However, excessive or rapid activity may still lead to LinkedIn detecting bot behavior or temporarily restricting your account. Adjust delays in `bot.js` (`getRandomDelay` calls) and `run_daily_bots.js` (`DELAY_BETWEEN_BOTS_MINUTES`) as needed.

* **Puppeteer Headless Mode**: For development and debugging, `headless: false` is set in `bot.js`, meaning a browser window will open. For production use, consider changing `headless: true` in `bot.js` to run the browser in the background without a UI.

* **Maintainability**: LinkedIn's UI and selectors can change. If the bot stops working, you may need to inspect the LinkedIn page elements and update the CSS selectors or XPath expressions in `bot.js`.

* **Python Environment**: Ensure your Python environment is correctly set up and `pandas` and `matplotlib` are installed for graph generation to work.