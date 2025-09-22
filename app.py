import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import io
import json
from datetime import datetime
import numpy as np
import PyPDF2
import re
from sklearn.linear_model import LinearRegression

app = Flask(__name__)
CORS(app)

# -----------------------------
# In-memory history storage
# This will be reset every time the application restarts.
# For persistent storage, a database like Firestore is recommended.
# -----------------------------
xrd_history = []
ir_history = []
bet_history = []
tga_history = []
combined_history = []

# -----------------------------
# Helper Functions
# -----------------------------
def get_ai_suggestion(prompt):
    """Generate suggestion using Gemini API."""
    try:
        api_key = "YOUR_API_KEY_HERE"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
        headers = {'Content-Type': 'application/json'}
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        response = requests.post(url, headers=headers, data=json.dumps(payload))
        response.raise_for_status()
        candidate = response.json().get('candidates', [{}])[0]
        generated_text = candidate.get('content', {}).get('parts', [{}])[0].get('text', 'No response from AI.')
        return generated_text
    except requests.exceptions.RequestException as e:
        print(f"API request failed: {e}")
        return f"Error: Failed to connect to AI service. {e}"

def parse_xrd_data(file):
    import pandas as pd
    import io
    import numpy as np
    
    # Read the data from the CSV file
    content = file.stream.read().decode('utf-8')
    df = pd.read_csv(io.StringIO(content))
    
    # Identify position and intensity columns based on keywords
    pos_col = None
    iobs_col = None
    
    for col in df.columns:
        col_lower = col.lower()
        if 'pos' in col_lower or '2θ' in col_lower:
            pos_col = col
        if 'iobs' in col_lower or 'intensity' in col_lower:
            iobs_col = col

    # Check if the required columns were found
    if not pos_col or not iobs_col:
        raise ValueError("The XRD file must contain 'Pos' (or '2θ') and 'Iobs' (or 'Intensity') columns.")

    # Create a new DataFrame containing ONLY the two relevant columns
    df_clean = df[[pos_col, iobs_col]].copy()
    
    # Rename columns to a consistent format for the rest of the program
    df_clean.rename(columns={pos_col: 'Pos', iobs_col: 'Iobs'}, inplace=True)
    
    # Ensure columns are numeric and clean up any non-numeric data
    df_clean['Pos'] = pd.to_numeric(df_clean['Pos'], errors='coerce')
    df_clean['Iobs'] = pd.to_numeric(df_clean['Iobs'], errors='coerce')
    df_clean.dropna(subset=['Pos', 'Iobs'], inplace=True)

    # Simple peak detection
    df_clean['Smoothed_Iobs'] = df_clean['Iobs'].rolling(window=5, center=True).mean().fillna(0)
    df_clean['Peak_Marker'] = (df_clean['Smoothed_Iobs'] > df_clean['Smoothed_Iobs'].shift(1)) & \
                             (df_clean['Smoothed_Iobs'] > df_clean['Smoothed_Iobs'].shift(-1))
    
    peak_locations = df_clean[df_clean['Peak_Marker']]
    
    # Sort peaks by intensity and get the top 10
    peaks_info = peak_locations[['Pos', 'Iobs']].sort_values(by='Iobs', ascending=False).head(10).to_dict('records')
    
    # Return both the full data and the detected peaks
    return df_clean.to_dict('records'), peaks_info

def parse_ir_data(file):
    content = file.stream.read().decode('utf-8')
    data_io = io.StringIO(content)

    try:
        df = pd.read_csv(data_io)
    except pd.errors.ParserError:
        data_io.seek(0)
        df = pd.read_csv(data_io, header=None)

    numeric_cols = df.select_dtypes(include=np.number).columns
    if len(numeric_cols) < 2:
        raise ValueError("The IR file must contain at least two numeric data columns.")

    df.rename(columns={numeric_cols[0]: 'Wavenumber', numeric_cols[1]: 'Absorbance'}, inplace=True)
    df = df[['Wavenumber', 'Absorbance']]

    # Simple peak detection
    peaks = df[(df['Absorbance'] > np.mean(df['Absorbance']) + 2 * np.std(df['Absorbance'])) &
               (df['Absorbance'].diff().shift(-1) < 0) &
               (df['Absorbance'].diff().shift(1) > 0)]
    peaks = peaks.sort_values(by='Absorbance', ascending=False).head(5)

    peak_info = peaks.to_dict('records')

    return df.to_dict('records'), peak_info

def parse_bet_data(file):
    content = file.stream.read().decode('utf-8')
    df = pd.read_csv(io.StringIO(content))

    if 'P/P0' not in df.columns or 'Va' not in df.columns:
        raise ValueError("CSV must contain 'P/P0' and 'Va' columns.")

    # Call the main parsing function that handles the calculation
    return parse_bet_data_from_df(df)

def parse_pdf_bet_data(file):
    reader = PyPDF2.PdfReader(io.BytesIO(file.stream.read()))
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""

    # Attempt to find the specific BET surface area value first
    area_match = re.search(r'BET Surface Area: (\d+\.\d+) m²/g', text)
    if area_match:
        surface_area = float(area_match.group(1))
        # No full data available from this method, so return empty list
        return surface_area, []

    # If the specific value isn't found, try to find a data table
    data_patterns = [
        r'P/P0\s+Va\s+.*\n((?:\s*-?\d+\.\d+\s+-?\d+\.\d+\n)+)',  # Original pattern
        r'Rel\.\s+Pressure\s+Quantity\s+Adsorbed\n((?:\s*-?\d+\.\d+\s+-?\d+\.\d+\n)+)', # Common alternative
        r'p/p0\s+v\n((?:\s*-?\d+\.\d+\s+-?\d+\.\d+\n)+)' # Another common pattern
    ]

    for pattern in data_patterns:
        bet_data_match = re.search(pattern, text)
        if bet_data_match:
            data_lines = bet_data_match.group(1).strip().split('\n')
            data = [line.strip().split() for line in data_lines]

            df = pd.DataFrame(data, columns=['P/P0', 'Va']).astype(float)
            # Call the main BET calculation function to get the area and full data
            return parse_bet_data_from_df(df)

    # If neither method works, raise an error
    raise ValueError("Could not find a valid BET surface area or data table in the PDF.")

def parse_bet_data_from_df(df):
    """Parses BET data from a DataFrame and calculates surface area."""
    df['BET_Plot'] = 1 / (df['Va'] * ((1 / df['P/P0']) - 1))

    linear_region = df[(df['P/P0'] >= 0.05) & (df['P/P0'] <= 0.35)]
    if linear_region.empty or len(linear_region) < 2:
        raise ValueError("Not enough data points in the linear region (0.05-0.35 p/p0) for regression.")

    X = linear_region[['P/P0']]
    y = linear_region['BET_Plot']

    model = LinearRegression()
    model.fit(X, y)
    slope = model.coef_[0]
    intercept = model.intercept_

    Vm = 1 / (slope + intercept)
    C = (slope/intercept) + 1

    # Correct calculation of surface area with a conversion factor
    # Na = 6.022e23 (molecules/mol)
    # Am = 16.2 (Å^2) for N2
    # 22414 is the molar volume of an ideal gas at STP (cm³/mol)
    # 1e18 Å^2 per m^2
    surface_area = (Vm * 6.022e23 * 16.2) / 22414 / 1e18 * 1e4

    return surface_area, df.to_dict('records')

def parse_tga_data(file):
    """
    Parses TGA-related data from a file-like object, focusing on
    adsorption capacity and desorption energy, by intelligently
    searching for relevant column names.

    Args:
        file: A file-like object containing TGA-related data in CSV format.
              The CSV should ideally contain columns related to 'adsorption
              capacity' and 'desorption energy'.

    Returns:
        A dictionary containing the parsed data from the found columns.
        
    Raises:
        ValueError: If a suitable column for either adsorption capacity or
                    desorption energy cannot be found.
    """
    df = pd.read_csv(io.StringIO(file.stream.read().decode('utf-8')))
    df.columns = df.columns.str.strip()  # Clean up column names

    # Define a list of possible keywords for each column
    adsorption_keywords = ['adsorption', 'capacity', 'mmol', 'g']
    desorption_keywords = ['desorption', 'energy', 'consumption', 'kj', 'mol']

    # Function to find the best matching column
    def find_column(df, keywords):
        for col in df.columns:
            # Check if all keywords are present in the column name (case-insensitive)
            if all(keyword.lower() in col.lower() for keyword in keywords):
                return col
        # If a perfect match isn't found, try a looser match with any keyword
        for col in df.columns:
            if any(keyword.lower() in col.lower() for keyword in keywords):
                return col
        return None

    adsorption_col = find_column(df, adsorption_keywords)
    desorption_col = find_column(df, desorption_keywords)

    if not adsorption_col:
        raise ValueError(f"Could not find a suitable column for 'adsorption capacity'. Please check the column headers in your CSV file. It should contain keywords like {', '.join(adsorption_keywords)}.")

    if not desorption_col:
        raise ValueError(f"Could not find a suitable column for 'desorption energy'. Please check the column headers in your CSV file. It should contain keywords like {', '.join(desorption_keywords)}.")

    adsorption_capacity = df[adsorption_col].values.tolist()
    desorption_energy = df[desorption_col].values.tolist()

    return {
        "adsorption_capacity": adsorption_capacity,
        "desorption_energy": desorption_energy
    }

# -----------------------------
# API Endpoints
# -----------------------------
@app.route('/')
def index():
    return "Material Analysis Backend is running!"

@app.route('/analyze-xrd', methods=['POST'])
def analyze_xrd():
    try:
        # Get the files and form data
        original_file = request.files.get('original_file')
        modified_file = request.files.get('modified_file')
        explanation = request.form.get('explanation', '')
        ai_query = request.form.get('ai_query', '')

        # Ensure both files are present
        if not original_file or not modified_file:
            return jsonify({"error": "Missing original or modified file"}), 400

        # Process the files and get the data and peaks
        original_data, original_peaks = parse_xrd_data(original_file)
        modified_data, modified_peaks = parse_xrd_data(modified_file)

        # Build the prompt for the AI
        prompt = f"""
        Analyze the following XRD data. The original material was modified.
        Original XRD Peaks: {json.dumps(original_peaks)}
        Modified XRD Peaks: {json.dumps(modified_peaks)}
        Modification Description: {explanation}
        User's Specific Query: {ai_query}

        Provide a comprehensive summary of the changes observed between the original and modified XRD patterns. Discuss the potential implications of these changes from a materials science perspective (e.g., changes in crystallinity, phase transformations, or crystallite size).
        """

        # Get the AI suggestion
        ai_suggestion = get_ai_suggestion(prompt)

        # Store history
        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "original_file_name": original_file.filename,
            "modified_file_name": modified_file.filename,
            "explanation": explanation,
            "user_query": ai_query,
            "original_xrd_peaks": original_peaks,
            "modified_xrd_peaks": modified_peaks,
            "ai_suggestion": ai_suggestion
        }
        xrd_history.append(history_entry)

        # Return the results as a JSON response
        return jsonify({
            "original_data": original_data,
            "modified_data": modified_data,
            "ai_suggestion": ai_suggestion,
            "original_peaks": original_peaks,
            "modified_peaks": modified_peaks
        })

    except Exception as e:
        # This will catch any error and send a specific message to the client
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500

@app.route('/analyze-ir', methods=['POST'])
def analyze_ir():
    try:
        original_file = request.files['original_file']
        modified_file = request.files['modified_file']
        explanation = request.form.get('explanation', '')
        ai_query = request.form.get('ai_query', '')

        original_data, original_peaks = parse_ir_data(original_file)
        modified_data, modified_peaks = parse_ir_data(modified_file)

        prompt = f"""
        Analyze the following IR data. The original material was modified.
        Original IR Peaks: {json.dumps(original_peaks)}
        Modified IR Peaks: {json.dumps(modified_peaks)}
        Modification Description: {explanation}
        User's Specific Query: {ai_query}

        Provide a comprehensive summary of the changes observed between the original and modified IR spectra. Discuss the potential implications of these changes from a materials science perspective (e.g., formation or disappearance of functional groups, changes in bonding).
        """

        ai_suggestion = get_ai_suggestion(prompt)

        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "original_file_name": original_file.filename,
            "modified_file_name": modified_file.filename,
            "explanation": explanation,
            "user_query": ai_query,
            "original_ir_peaks": original_peaks,
            "modified_ir_peaks": modified_peaks,
            "ai_suggestion": ai_suggestion
        }
        ir_history.append(history_entry)

        return jsonify({
            "original_data": original_data,
            "modified_data": modified_data,
            "ai_suggestion": ai_suggestion,
            "original_peaks": original_peaks,
            "modified_peaks": modified_peaks
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze-bet', methods=['POST'])
def analyze_bet():
    try:
        original_file = request.files.get('original_file')
        modified_file = request.files.get('modified_file')
        explanation = request.form.get('explanation', '')
        ai_query = request.form.get('ai_query', '')

        original_data = None
        modified_data = None
        original_surface_area = None
        modified_surface_area = None

        if original_file:
            if original_file.filename.lower().endswith('.pdf'):
                original_surface_area, original_data = parse_pdf_bet_data(original_file)
            else:
                original_surface_area, original_data = parse_bet_data(original_file)

        if modified_file:
            if modified_file.filename.lower().endswith('.pdf'):
                modified_surface_area, modified_data = parse_pdf_bet_data(modified_file)
            else:
                modified_surface_area, modified_data = parse_bet_data(modified_file)

        prompt = f"""
        Analyze the following BET data. The original material was modified.
        Original BET Surface Area: {original_surface_area} m²/g
        Modified BET Surface Area: {modified_surface_area} m²/g
        Modification Description: {explanation}
        User's Specific Query: {ai_query}

        Provide a comprehensive summary of the changes in surface area and pore volume between the original and modified materials. Discuss the potential implications of these changes from a materials science perspective.
        """

        ai_suggestion = get_ai_suggestion(prompt)

        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "original_file_name": original_file.filename if original_file else None,
            "modified_file_name": modified_file.filename if modified_file else None,
            "explanation": explanation,
            "user_query": ai_query,
            "original_bet_surface_area": original_surface_area,
            "modified_bet_surface_area": modified_surface_area,
            "ai_suggestion": ai_suggestion
        }
        bet_history.append(history_entry)

        return jsonify({
            "original_data": original_data,
            "modified_data": modified_data,
            "ai_suggestion": ai_suggestion,
            "original_surface_area": original_surface_area,
            "modified_surface_area": modified_surface_area
        })
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

@app.route('/analyze-tga', methods=['POST'])
def analyze_tga():
    try:
        tga_file = request.files.get('tga_file')
        ai_query = request.form.get('ai_query', '')

        if not tga_file or tga_file.filename == '':
            return jsonify({"error": "No TGA file provided."}), 400

        # The parse_tga_data function returns a single dictionary.
        # We assign the result to a single variable.
        tga_results = parse_tga_data(tga_file)

        # We can't use total_weight_loss and peak_info as they aren't
        # returned by the parse_tga_data function. We'll use the available data.
        adsorption_capacity = tga_results.get('adsorption_capacity', [])
        desorption_energy = tga_results.get('desorption_energy', [])

        prompt = f"""
Analyze the following TGA data analysis results:
Adsorption Capacity (mmol/g): {adsorption_capacity}
Desorption Energy Consumption (kJ/mol)_exp: {desorption_energy}
User's Specific Query: {ai_query}

Provide a detailed interpretation based on these values. Discuss the relationship between the adsorption capacity and desorption energy, and what this suggests about the material's properties and performance.
"""

        ai_suggestion = get_ai_suggestion(prompt)

        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "tga_file_name": tga_file.filename,
            "user_query": ai_query,
            "adsorption_capacity": adsorption_capacity,
            "desorption_energy": desorption_energy,
            "ai_suggestion": ai_suggestion
        }
        tga_history.append(history_entry)

        return jsonify({
            "tga_results": tga_results, # Returning the full dictionary for convenience
            "ai_suggestion": ai_suggestion
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

@app.route('/analyze-combined', methods=['POST'])
def analyze_combined():
    try:
        original_xrd_file = request.files.get('original_xrd_file')
        modified_xrd_file = request.files.get('modified_xrd_file')
        original_ir_file = request.files.get('original_ir_file')
        modified_ir_file = request.files.get('modified_ir_file')
        original_bet_file = request.files.get('original_bet_file')
        modified_bet_file = request.files.get('modified_bet_file')
        tga_file = request.files.get('tga_file')
        ai_query = request.form.get('ai_query', '')

        original_xrd_data = None
        modified_xrd_data = None
        original_ir_data = None
        modified_ir_data = None
        original_bet_data = None
        modified_bet_data = None
        tga_data = None

        original_xrd_peaks = None
        modified_xrd_peaks = None
        original_ir_peaks = None
        modified_ir_peaks = None
        original_bet_surface_area = None
        modified_bet_surface_area = None
        tga_results = None

        if original_xrd_file:
            original_xrd_data, original_xrd_peaks = parse_xrd_data(original_xrd_file)

        if modified_xrd_file:
            modified_xrd_data, modified_xrd_peaks = parse_xrd_data(modified_xrd_file)

        if original_ir_file:
            original_ir_data, original_ir_peaks = parse_ir_data(original_ir_file)

        if modified_ir_file:
            modified_ir_data, modified_ir_peaks = parse_ir_data(modified_ir_file)

        if original_bet_file:
            if original_bet_file.filename.lower().endswith('.pdf'):
                original_bet_surface_area, original_bet_data = parse_pdf_bet_data(original_bet_file)
            else:
                original_bet_surface_area, original_bet_data = parse_bet_data(original_bet_file)
        
        if modified_bet_file:
            if modified_bet_file.filename.lower().endswith('.pdf'):
                modified_bet_surface_area, modified_bet_data = parse_pdf_bet_data(modified_bet_file)
            else:
                modified_bet_surface_area, modified_bet_data = parse_bet_data(modified_bet_file)
        
        if tga_file:
            tga_results = parse_tga_data(tga_file)

        # Build the prompt for the AI based on the data that was actually provided
        prompt = "Analyze the following combined materials data. "
        
        # CORRECTED LOGIC: Check for existence of EITHER original OR modified BET data
        if original_bet_data or modified_bet_data:
            if original_bet_data and modified_bet_data:
                prompt += f"Original BET Surface Area: {original_bet_surface_area} m²/g. Modified BET Surface Area: {modified_bet_surface_area} m²/g. "
            elif original_bet_data:
                prompt += f"Original BET Surface Area: {original_bet_surface_area} m²/g. "
            elif modified_bet_data:
                prompt += f"Modified BET Surface Area: {modified_bet_surface_area} m²/g. "
        
        # Include other data if provided
        if original_xrd_data or modified_xrd_data:
            prompt += f"Original XRD Peaks: {json.dumps(original_xrd_peaks)}. Modified XRD Peaks: {json.dumps(modified_xrd_peaks)}. "
        if original_ir_data or modified_ir_data:
            prompt += f"Original IR Peaks: {json.dumps(original_ir_peaks)}. Modified IR Peaks: {json.dumps(modified_ir_peaks)}. "
        if tga_results:
            prompt += f"TGA Results: {json.dumps(tga_results)}. "
        prompt += f"User's Specific Query: {ai_query}"
        
        # Get the AI suggestion
        ai_suggestion = get_ai_suggestion(prompt)

        # Store history
        history_entry = {
            "timestamp": datetime.now().isoformat(),
            "user_query": ai_query,
            "ai_suggestion": ai_suggestion
        }
        if original_xrd_data: history_entry['original_xrd_data'] = original_xrd_data
        if modified_xrd_data: history_entry['modified_xrd_data'] = modified_xrd_data
        if original_ir_data: history_entry['original_ir_data'] = original_ir_data
        if modified_ir_data: history_entry['modified_ir_data'] = modified_ir_data
        if original_bet_data: history_entry['original_bet_data'] = original_bet_data
        if modified_bet_data: history_entry['modified_bet_data'] = modified_bet_data
        if tga_results: history_entry['tga_data'] = tga_results
        
        combined_history.append(history_entry)

        return jsonify({
            "original_xrd": original_xrd_data,
            "modified_xrd": modified_xrd_data,
            "original_ir": original_ir_data,
            "modified_ir": modified_ir_data,
            "original_bet": original_bet_data,
            "modified_bet": modified_bet_data,
            "tga_data": tga_results,
            "ai_suggestion": ai_suggestion
        })

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"An unexpected error occurred: {e}"}), 500

# -----------------------------
# Follow-up question
# -----------------------------
@app.route('/analyze-xrd-followup', methods=['POST'])
def follow_up_xrd():
    try:
        data = request.form
        query = data.get('user_query', '')
        prev_analysis = json.loads(data.get('previous_analysis', '{}'))

        if not query or not prev_analysis:
            return jsonify({"error": "Missing query or previous analysis data."}), 400

        prompt = f"""
Based on the previous XRD analysis:
Previous analysis results: {json.dumps(prev_analysis)}
Previous AI suggestion: {prev_analysis.get('ai_suggestion', '')}
Answer the following follow-up question:
{query}
"""
        ai_suggestion = get_ai_suggestion(prompt)
        return jsonify({"ai_suggestion": ai_suggestion})

    except Exception as e:
        return jsonify({"error": f"Follow-up request failed: {e}"}), 500

@app.route('/analyze-ir-followup', methods=['POST'])
def follow_up_ir():
    try:
        data = request.form
        query = data.get('user_query', '')
        prev_analysis = json.loads(data.get('previous_analysis', '{}'))

        if not query or not prev_analysis:
            return jsonify({"error": "Missing query or previous analysis data."}), 400

        prompt = f"""
Based on the previous IR analysis:
Previous analysis results: {json.dumps(prev_analysis)}
Previous AI suggestion: {prev_analysis.get('ai_suggestion', '')}
Answer the following follow-up question:
{query}
"""
        ai_suggestion = get_ai_suggestion(prompt)
        return jsonify({"ai_suggestion": ai_suggestion})

    except Exception as e:
        return jsonify({"error": f"Follow-up request failed: {e}"}), 500

@app.route('/analyze-bet-followup', methods=['POST'])
def follow_up_bet():
    try:
        data = request.form
        query = data.get('user_query', '')
        prev_analysis = json.loads(data.get('previous_analysis', '{}'))

        if not query or not prev_analysis:
            return jsonify({"error": "Missing query or previous analysis data."}), 400

        prompt = f"""
Based on the previous BET analysis:
Previous analysis results: {json.dumps(prev_analysis)}
Previous AI suggestion: {prev_analysis.get('ai_suggestion', '')}
Answer the following follow-up question:
{query}
"""
        ai_suggestion = get_ai_suggestion(prompt)
        return jsonify({"ai_suggestion": ai_suggestion})

    except Exception as e:
        return jsonify({"error": f"Follow-up request failed: {e}"}), 500

@app.route('/analyze-tga-followup', methods=['POST'])
def follow_up_tga():
    try:
        data = request.form
        query = data.get('user_query', '')
        prev_analysis = json.loads(data.get('previous_analysis', '{}'))

        if not query or not prev_analysis:
            return jsonify({"error": "Missing query or previous analysis data."}), 400

        prompt = f"""
Based on the previous TGA analysis:
Previous analysis results: {json.dumps(prev_analysis)}
Previous AI suggestion: {prev_analysis.get('ai_suggestion', '')}
Answer the following follow-up question:
{query}
"""
        ai_suggestion = get_ai_suggestion(prompt)
        return jsonify({"ai_suggestion": ai_suggestion})

    except Exception as e:
        return jsonify({"error": f"Follow-up request failed: {e}"}), 500

@app.route('/analyze-combined-followup', methods=['POST'])
def follow_up_combined():
    try:
        data = request.form
        query = data.get('user_query', '')
        prev_analysis = json.loads(data.get('previous_analysis', '{}'))

        if not query or not prev_analysis:
            return jsonify({"error": "Missing query or previous analysis data."}), 400

        prompt = f"""
Based on the previous combined analysis:
Previous analysis results: {json.dumps(prev_analysis)}
Previous AI suggestion: {prev_analysis.get('ai_suggestion', '')}
Answer the following follow-up question:
{query}
"""
        ai_suggestion = get_ai_suggestion(prompt)
        return jsonify({"ai_suggestion": ai_suggestion})

    except Exception as e:
        return jsonify({"error": f"Follow-up request failed: {e}"}), 500

# -----------------------------
# History
# -----------------------------
@app.route('/history/xrd', methods=['GET'])
def get_xrd_history():
    return jsonify(xrd_history)

@app.route('/history/ir', methods=['GET'])
def get_ir_history():
    return jsonify(ir_history)

@app.route('/history/bet', methods=['GET'])
def get_bet_history():
    # Return a stripped-down history to avoid large payloads
    history_to_send = [{
        "ai_suggestion": item["ai_suggestion"],
        "original_bet_surface_area": item["original_bet_surface_area"],
        "modified_bet_surface_area": item["modified_bet_surface_area"],
        "timestamp": item["timestamp"],
        "user_query": item["user_query"]
    } for item in bet_history]
    return jsonify(history_to_send)

@app.route('/history/tga', methods=['GET'])
def get_tga_history():
    # Return a stripped-down history for TGA
    history_to_send = [{
        "ai_suggestion": item["ai_suggestion"],
        "adsorption_capacity": item["adsorption_capacity"],
        "desorption_energy": item["desorption_energy"],
        "timestamp": item["timestamp"],
        "user_query": item["user_query"]
    } for item in tga_history]
    return jsonify(history_to_send)

@app.route('/history/combined', methods=['GET'])
def get_combined_history():
    # Return a stripped-down history to avoid large payloads
    history_to_send = [{
        "ai_suggestion": item["ai_suggestion"],
        "original_xrd_peaks": item["original_xrd_peaks"],
        "modified_xrd_peaks": item["modified_xrd_peaks"],
        "original_ir_peaks": item["original_ir_peaks"],
        "modified_ir_peaks": item["modified_ir_peaks"],
        "original_bet_surface_area": item["original_bet_surface_area"],
        "modified_bet_surface_area": item["modified_bet_surface_area"],
        "tga_results": item["tga_results"],
        "timestamp": item["timestamp"],
        "user_query": item["user_query"]
    } for item in combined_history]
    return jsonify(history_to_send)

if __name__ == '__main__':

    app.run(debug=True)
