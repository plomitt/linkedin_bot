import pandas as pd
import matplotlib.pyplot as plt
import os
import sys

def generate_graphs(current_run_dir, results_dir):
    # --- Read current run's data ---
    current_run_csv_path = os.path.join(current_run_dir, 'report.csv')
    try:
        current_run_df = pd.read_csv(current_run_csv_path)
        current_data = current_run_df.iloc[0] # Get the first (and only) row
        
        connections_made = current_data['ConnectionsMade']
        total_connect_buttons_found = current_data['TotalConnectButtonsFound']
        total_profiles_scanned = current_data['TotalProfilesScanned']

        # Calculate derived metrics for the bar chart
        unsuccessful_connects = total_connect_buttons_found - connections_made
        # "Other types" are profiles where a connect button wasn't found, or wasn't the primary action
        # This is a simplification; a profile could have a "Follow" button instead, etc.
        # This counts profiles scanned MINUS connect buttons found, essentially
        profiles_without_connects = total_profiles_scanned - total_connect_buttons_found
        
        # Ensure non-negative values for plotting
        unsuccessful_connects = max(0, unsuccessful_connects)
        profiles_without_connects = max(0, profiles_without_connects)

        # --- Per-Run Bar Chart ---
        labels = ['Successful Connects', 'Unsuccessful/Skipped Connects', 'Profiles without Connect Button']
        values = [connections_made, unsuccessful_connects, profiles_without_connects]
        
        # Filter out categories with zero values for better visualization if they exist
        filtered_labels = [labels[i] for i, val in enumerate(values) if val > 0]
        filtered_values = [val for val in values if val > 0]

        if not filtered_values:
            print(f"No data to plot for per-run chart in {current_run_dir} (all values are zero).") # Added more context
        else:
            plt.figure(figsize=(10, 6))
            plt.bar(filtered_labels, filtered_values, color=['green', 'orange', 'red'])
            plt.ylabel('Count')
            plt.title(f'Connection Statistics for Run: {current_data["RunID"]}')
            plt.grid(axis='y', linestyle='--', alpha=0.7)
            
            per_run_chart_path = os.path.join(current_run_dir, 'connections_per_run.png')
            plt.savefig(per_run_chart_path)
            plt.close() # Close the plot to free memory
            print(f"Per-run chart saved to: {per_run_chart_path}")

    except FileNotFoundError:
        print(f"Current run CSV not found at {current_run_csv_path}. Skipping per-run chart.")
        # Do not return here, we still want to try for the all-runs chart
    except Exception as e:
        print(f"Error generating per-run chart from {current_run_csv_path}: {e}") # Generic error for per-run

    # --- Read Master Data for All Runs Chart ---
    master_csv_path = os.path.join(results_dir, 'master_report.csv')
    try:
        master_df = pd.read_csv(master_csv_path)
        # Ensure data is sorted by timestamp if necessary, though appending should keep it ordered
        master_df['Timestamp'] = pd.to_datetime(master_df['Timestamp'], format='%Y%m%d_%H%M%S')
        master_df = master_df.sort_values('Timestamp').reset_index(drop=True)

        # Calculate 'Other Interactions' for historical chart
        # This is total profiles scanned minus successful connections made
        master_df['OtherInteractions'] = master_df['TotalProfilesScanned'] - master_df['ConnectionsMade']
        # Ensure non-negative
        master_df['OtherInteractions'] = master_df['OtherInteractions'].apply(lambda x: max(0, x))

        # Check if there's enough data to plot a line chart (at least 2 points for lines)
        if len(master_df) < 1: # Changed to 1, if only one run, we can still show a point
            print(f"Not enough data in master CSV ({len(master_df)} rows) for all-runs chart. Skipping.")
        else:
            plt.figure(figsize=(12, 7))
            plt.plot(master_df['Timestamp'], master_df['ConnectionsMade'], marker='o', label='Successful Connections', color='blue')
            plt.plot(master_df['Timestamp'], master_df['OtherInteractions'], marker='x', label='Other Profile Interactions (Scanned - Connected)', color='purple', linestyle='--')
            
            plt.xlabel('Run Timestamp')
            plt.ylabel('Count')
            plt.title('Connection Statistics Over All Runs')
            plt.legend()
            plt.grid(True)
            plt.tight_layout() # Adjust layout to prevent labels overlapping
            
            # Format x-axis for better readability if many runs
            plt.xticks(rotation=45, ha='right')
            
            all_runs_chart_path = os.path.join(results_dir, 'historical_connections.png')
            plt.savefig(all_runs_chart_path)
            plt.close() # Close the plot
            print(f"Historical chart saved to: {all_runs_chart_path}")

    except FileNotFoundError:
        print(f"Master CSV not found at {master_csv_path}. Skipping all-runs chart (first run?).")
    except pd.errors.EmptyDataError:
        print(f"Master CSV at {master_csv_path} is empty. Skipping all-runs chart.")
    except Exception as e:
        print(f"Error generating all-runs chart from {master_csv_path}: {e}") # Generic error for all-runs

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python generate_graphs.py <current_run_dir> <results_dir>")
        sys.exit(1)
    
    current_run_directory = sys.argv[1]
    results_directory = sys.argv[2]
    
    generate_graphs(current_run_directory, results_directory)