import sys
import json
import requests
import os # Import os to handle file paths

# Configuration for Ollama API
OLLAMA_API_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "llama3.1:8b-instruct-q4_K_S"

def call_ollama(prompt, system_message="", response_format=None):
    """
    Calls the Ollama API to generate text based on the given prompt and system message.
    """
    headers = {"Content-Type": "application/json"}
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "stream": False,  # We want the full response at once
        "options": {
            "temperature": 0.7, # Controls randomness. Lower is more deterministic.
            "top_k": 40,        # Limits the vocabulary to the top_k most likely tokens.
            "top_p": 0.9        # Nucleus sampling: picks from the smallest set of tokens whose cumulative probability exceeds top_p.
        }
    }
    if system_message:
        payload["system"] = system_message
    if response_format:
        payload["format"] = response_format

    try:
        response = requests.post(OLLAMA_API_URL, headers=headers, json=payload, timeout=600) # Added timeout
        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)
        return response.json()['response']
    except requests.exceptions.Timeout:
        print(f"Error: Ollama API call timed out after 600 seconds.", file=sys.stderr)
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error calling Ollama API: {e}", file=sys.stderr)
        return None
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON response from Ollama API.", file=sys.stderr)
        return None
    except KeyError:
        print(f"Error: 'response' key not found in Ollama API response.", file=sys.stderr)
        return None

def extract_profile_info(html_content):
    """
    Uses Ollama to extract key professional information from LinkedIn profile HTML.
    """
    extraction_system_message = """You are an AI assistant that extracts key professional information from raw HTML content of a LinkedIn profile.
    Focus on extracting:
    - User's Name
    - Current Job Title and Company
    - Previous Job Titles and Companies
    - Education (Degrees, Universities)
    - Key Skills/Expertise
    - Any notable achievements or projects (briefly)
    - Industries they have worked in
    - Location

    Format the output as a concise, readable summary, using bullet points for lists.
    Do NOT include any personal opinions, greetings, or conversational filler.
    If information is not present, omit that section.
    """
    # Truncate HTML to avoid exceeding token limits for the LLM, if necessary.
    # A full LinkedIn profile HTML can be very large. You might need to adjust this.
    # For now, let's pass the whole thing, but keep this in mind for very large profiles.
    extraction_prompt = f"Extract professional information from the following LinkedIn profile HTML:\n\n{html_content}"
    return call_ollama(extraction_prompt, system_message=extraction_system_message)

def generate_connection_message(extracted_info, person_name):
    """
    Uses Ollama to generate a personalized LinkedIn connection message.
    """
    message_system_message = f"""You are an AI assistant that generates a polite and concise LinkedIn connection request message based on extracted professional information.
    The message should be:
    - Personalized using the person's name ({person_name}).
    - Professional and to the point (max 2-3 sentences).
    - Briefly mention a commonality or reason for connecting based on the extracted info (e.g., shared industry, interesting role, common skill).
    - End with a polite closing.
    - Do NOT include any greetings like "Hello" or "Hi [Name]", just start with the message content directly.
    - Do NOT include your own name or signature.
    - Ensure the message is under 200 characters, as LinkedIn connection notes have a character limit.
    """
    message_prompt = f"Generate a LinkedIn connection message for {person_name} based on their profile summary:\n\n{extracted_info}"
    return call_ollama(message_prompt, system_message=message_system_message)

if __name__ == "__main__":
    # The script expects two command-line arguments:
    # 1. Path to the temporary HTML file containing the profile content.
    # 2. The name of the person from the search result.
    if len(sys.argv) < 3:
        print("Usage: python generate_message.py <profile_html_path> <person_name>", file=sys.stderr)
        sys.exit(1)

    profile_html_path = sys.argv[1]
    person_name = sys.argv[2]

    try:
        if not os.path.exists(profile_html_path):
            raise FileNotFoundError(f"HTML file not found at {profile_html_path}")

        with open(profile_html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        # First LLM call: extract information
        extracted_info = extract_profile_info(html_content)
        if not extracted_info:
            print("Failed to extract profile information from LLM.", file=sys.stderr)
            sys.exit(1)

        # Second LLM call: generate connection message
        connection_message = generate_connection_message(extracted_info, person_name)
        if connection_message:
            # Print the generated message to stdout for Node.js to capture
            print(connection_message)
        else:
            print("Failed to generate connection message from LLM.", file=sys.stderr)
            sys.exit(1)

    except FileNotFoundError as fnf_e:
        print(f"Error: {fnf_e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"An unexpected error occurred: {e}", file=sys.stderr)
        sys.exit(1)

