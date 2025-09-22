# xrd-material-app
I can definitely help with that. Here is a comprehensive README.md file for your GitHub repository, based on the code files you provided. It's structured to be clear and informative for users and potential contributors.

### Material Analysis Platform

This application is a web-based platform for analyzing and comparing material science data, specifically focusing on XRD, IR, TGA, and BET techniques. It uses AI to provide insightful interpretations and suggestions, helping researchers and students understand the effects of material modifications.

### Features

  * **Individual Analysis:** Upload and analyze data files for each technique separately (XRD, IR, TGA, and BET).
  * **Combined Analysis:** Get a holistic, AI-powered summary of a material's transformation by analyzing all data files at once.
  * **Data Visualization:** Interactive plots for XRD, IR, and BET isotherms, making it easy to visualize your data.
  * **AI-Powered Insights:** A custom AI model provides interpretations based on the uploaded data and your specific queries.
  * **History Tracking:** All analyses are saved to an in-memory history, allowing you to review past results.
  * **User-Friendly Interface:** A clean, responsive design built with Tailwind CSS.

-----

### Technologies

  * **Backend:** Python with Flask
  * **Frontend:** HTML, CSS (Tailwind CSS), and JavaScript
  * **Core Libraries:**
      * **Plotly.js:** For generating interactive plots.
      * **Scikit-learn:** Used for linear regression in the BET analysis.
      * **PyPDF2 & `re`:** For parsing data from PDF files.
      * **requests:** For making API calls to the AI model.

-----

### Setup and Installation

Follow these steps to get the application up and running on your local machine.

#### Prerequisites

  * Python 3.7+
  * pip (Python package installer)

#### 1\. Clone the Repository

```bash
git clone [Your Repository URL]
cd [Your Repository Name]
```

#### 2\. Install Dependencies

Install all the required Python libraries using the `pip` command.

```bash
pip install Flask requests pandas numpy PyPDF2 scikit-learn
```

#### 3\. Set up the AI API Key

The application uses an AI model to generate analysis summaries. You will need to obtain your own API key and add it to the `app.py` file.

1.  Sign up for an API key from your preferred provider (e.g., Google's Gemini API).

2.  Open `app.py` and replace the placeholder with your actual key in the `get_ai_suggestion` function:

    ```python
    def get_ai_suggestion(prompt):
        try:
            api_key = "YOUR_API_KEY_HERE"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key={api_key}"
            # ... rest of the code
    ```

#### 4\. Run the Application

You can start the server by running the `app.py` file.

```bash
python app.py
```

Alternatively, if you are on Windows, you can use the provided batch file:

```bash
start_server.bat
```

The application will now be running at `http://127.0.0.1:5000`.

-----

### Usage

1.  Open your web browser and navigate to `http://127.0.0.1:5000`.
2.  Use the different tabs to upload your `.txt`, `.csv`, or `.pdf` data files for analysis.
3.  Fill in any relevant details, such as the `explanation` or `user_query`, to get more tailored AI responses.
4.  Click the "Analyze" button to view the results, which will include interactive plots and an AI-generated summary.

-----

### Contributing

Contributions are welcome\! If you have suggestions for new features or find a bug, please open an issue or submit a pull request.
