// Third-party library for linear regression, required for the BET plot
// Note: Ensure this is included in your HTML before scripts.js
// <script src="https://unpkg.com/regression@2.0.1/dist/regression.min.js"></script>
const BASE_URL = 'http://127.0.0.1:5000';
let xrdHistoryData = [];
let irHistoryData = [];
let betHistoryData = [];
let tgaHistoryData = []; // New history list for TGA analysis
let combinedHistoryData = [];

// Global variables to store the most recent analysis data for follow-up questions
let lastXrdResult = null;
let lastIrResult = null;
let lastBetResult = null;
let lastTgaResult = null; // New global variable for TGA results
let lastCombinedResult = null;

// --- Markdown and Plotting Utility Functions ---
function formatMarkdownToHtml(markdownText) {
    let lines = markdownText.split('\n'),
        html = '',
        inList = false;
    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('* ')) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${trimmed.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</li>`;
        } else {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            if (trimmed.startsWith('### ')) {
                html += `<h3>${trimmed.substring(4)}</h3>`;
            } else if (trimmed.startsWith('## ')) {
                html += `<h2>${trimmed.substring(3)}</h2>`;
            } else if (trimmed.startsWith('# ')) {
                html += `<h1>${trimmed.substring(2)}</h1>`;
            } else if (trimmed.length > 0) {
                html += `<p>${trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</p>`;
            }
        }
    });
    if (inList) {
        html += '</ul>';
    }
    return html;
}

function plotXRD(divId, fullData, title, peaks) {
    const angles = fullData.map(d => d.Pos);
    const intensities = fullData.map(d => d.Iobs);
    const peakAngles = peaks.map(p => p.Pos);
    const peakIntensities = peaks.map(p => p.Iobs);

    const data = [
        {
            x: angles,
            y: intensities,
            mode: 'lines',
            name: 'Full Scan',
            line: { color: 'blue' }
        },
        {
            x: peakAngles,
            y: peakIntensities,
            mode: 'markers',
            name: 'Identified Peaks',
            marker: { color: 'red', size: 8 }
        }
    ];

    const layout = {
        title: title,
        xaxis: {
            title: '2θ (degrees)',
        },
        yaxis: {
            title: 'Intensity (a.u.)',
        },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };

    Plotly.newPlot(divId, data, layout, { responsive: true });
}

function plotIR(divId, fullData, title, peaks) {
    const wavenumbers = fullData.map(d => d.Wavenumber);
    const absorbances = fullData.map(d => d.Absorbance);
    const peakWavenumbers = peaks.map(p => p.Wavenumber);
    const peakAbsorbances = peaks.map(p => p.Absorbance);

    const data = [
        {
            x: wavenumbers,
            y: absorbances,
            mode: 'lines',
            name: 'Full Scan',
            line: { color: 'purple' }
        },
        {
            x: peakWavenumbers,
            y: peakAbsorbances,
            mode: 'markers',
            name: 'Identified Peaks',
            marker: { color: 'red', size: 8 }
        }
    ];

    const layout = {
        title: title,
        xaxis: {
            title: 'Wavenumber (cm-1)',
            autorange: 'reversed'
        },
        yaxis: {
            title: 'Absorbance (a.u.)',
        },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };

    Plotly.newPlot(divId, data, layout, { responsive: true });
}

function plotBET(divId, fullData, title) {
    const pP0 = fullData.map(d => d['P/P0']);
    const betPlot = fullData.map(d => d['BET_Plot']);

    const data = [{
        x: pP0,
        y: betPlot,
        mode: 'markers',
        type: 'scatter',
        name: 'Data Points',
        marker: { color: 'green' }
    }];

    const layout = {
        title: title,
        xaxis: { title: 'P/P₀' },
        yaxis: { title: '1 / [Vₐ(P₀/P - 1)]' },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };

    Plotly.newPlot(divId, data, layout, { responsive: true });
}

function plotTGA(divId, fullData, title) {
    const temps = fullData.map(d => d['Temp']);
    const weights = fullData.map(d => d['Weight_normalized']);
    const dtg = fullData.map(d => d['DTG']);

    const data = [
        {
            x: temps,
            y: weights,
            name: 'Weight (%)',
            mode: 'lines',
            line: {color: 'orange'},
            yaxis: 'y1'
        },
        {
            x: temps,
            y: dtg,
            name: 'DTG (d(%) / d(°C))',
            mode: 'lines',
            line: {color: 'red'},
            yaxis: 'y2'
        }
    ];

    const layout = {
        title: title,
        xaxis: {
            title: 'Temperature (°C)',
        },
        yaxis: {
            title: 'Weight (%)',
            side: 'left',
            showgrid: false,
            zeroline: false
        },
        yaxis2: {
            title: 'DTG (d(%) / d(°C))',
            side: 'right',
            overlaying: 'y',
            showgrid: false,
            zeroline: false
        },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };

    Plotly.newPlot(divId, data, layout, {responsive: true});
}

function plotCombinedXRD(divId, originalData, modifiedData) {
    const originalAngles = originalData.map(d => d.Pos);
    const originalIntensities = originalData.map(d => d.Iobs);
    const modifiedAngles = modifiedData.map(d => d.Pos);
    const modifiedIntensities = modifiedData.map(d => d.Iobs);
    const data = [
        {
            x: originalAngles,
            y: originalIntensities,
            mode: 'lines',
            name: 'Original',
            line: { color: 'blue' }
        },
        {
            x: modifiedAngles,
            y: modifiedIntensities,
            mode: 'lines',
            name: 'Modified',
            line: { color: 'red' }
        }
    ];

    const layout = {
        title: 'Combined XRD Analysis',
        xaxis: { title: '2θ (degrees)' },
        yaxis: { title: 'Intensity (a.u.)' },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };
    Plotly.newPlot(divId, data, layout, { responsive: true });
}

function plotCombinedIR(divId, originalData, modifiedData) {
    const originalWavenumbers = originalData.map(d => d.Wavenumber);
    const originalAbsorbances = originalData.map(d => d.Absorbance);
    const modifiedWavenumbers = modifiedData.map(d => d.Wavenumber);
    const modifiedAbsorbances = modifiedData.map(d => d.Absorbance);
    const data = [
        {
            x: originalWavenumbers,
            y: originalAbsorbances,
            mode: 'lines',
            name: 'Original',
            line: { color: 'purple' }
        },
        {
            x: modifiedWavenumbers,
            y: modifiedAbsorbances,
            mode: 'lines',
            name: 'Modified',
            line: { color: 'red' }
        }
    ];

    const layout = {
        title: 'Combined IR Analysis',
        xaxis: { title: 'Wavenumber (cm-1)', autorange: 'reversed' },
        yaxis: { title: 'Absorbance (a.u.)' },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };
    Plotly.newPlot(divId, data, layout, { responsive: true });
}

function plotCombinedBET(divId, originalData, modifiedData) {
    const originalPP0 = originalData.map(d => d['P/P0']);
    const originalBetPlot = originalData.map(d => d['BET_Plot']);
    const modifiedPP0 = modifiedData.map(d => d['P/P0']);
    const modifiedBetPlot = modifiedData.map(d => d['BET_Plot']);
    const data = [
        {
            x: originalPP0,
            y: originalBetPlot,
            mode: 'markers',
            type: 'scatter',
            name: 'Original',
            marker: { color: 'green' }
        },
        {
            x: modifiedPP0,
            y: modifiedBetPlot,
            mode: 'markers',
            type: 'scatter',
            name: 'Modified',
            marker: { color: 'red' }
        }
    ];

    const layout = {
        title: 'Combined BET Analysis',
        xaxis: { title: 'P/P₀' },
        yaxis: { title: '1 / [Vₐ(P₀/P - 1)]' },
        margin: { t: 40, b: 40, l: 40, r: 40 },
        autosize: true
    };
    Plotly.newPlot(divId, data, layout, { responsive: true });
}
// --- Form Submission Handlers ---

// Individual forms
document.getElementById('xrdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('xrdLoading').style.display = 'block';
    document.getElementById('xrdResult').style.display = 'none';
    document.getElementById('xrdError').style.display = 'none';

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch(`${BASE_URL}/analyze-xrd`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            plotXRD('xrdOriginalPlot', result.original_data, 'Original XRD Data', result.original_peaks);
            plotXRD('xrdModifiedPlot', result.modified_data, 'Modified XRD Data', result.modified_peaks);
            
            const aiSuggestionDiv = document.querySelector('#xrdAiSuggestion .markdown-content');
            aiSuggestionDiv.innerHTML = formatMarkdownToHtml(result.ai_suggestion);
            
            document.getElementById('xrdResult').style.display = 'block';
            document.getElementById('xrdFollowUpSection').style.display = 'block';
            lastXrdResult = result;
        } else {
            document.getElementById('xrdError').textContent = result.error || 'Unknown error occurred.';
            document.getElementById('xrdError').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('xrdError').textContent = `Request failed: ${error.message}`;
        document.getElementById('xrdError').style.display = 'block';
    } finally {
        document.getElementById('xrdLoading').style.display = 'none';
    }
});

document.getElementById('irForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('irLoading').style.display = 'block';
    document.getElementById('irResult').style.display = 'none';
    document.getElementById('irError').style.display = 'none';

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch(`${BASE_URL}/analyze-ir`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            plotIR('irOriginalPlot', result.original_data, 'Original IR Data', result.original_peaks);
            plotIR('irModifiedPlot', result.modified_data, 'Modified IR Data', result.modified_peaks);
            
            const aiSuggestionDiv = document.querySelector('#irAiSuggestion .markdown-content');
            aiSuggestionDiv.innerHTML = formatMarkdownToHtml(result.ai_suggestion);
            
            document.getElementById('irResult').style.display = 'block';
            document.getElementById('irFollowUpSection').style.display = 'block';
            lastIrResult = result;
        } else {
            document.getElementById('irError').textContent = result.error || 'Unknown error occurred.';
            document.getElementById('irError').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('irError').textContent = `Request failed: ${error.message}`;
        document.getElementById('irError').style.display = 'block';
    } finally {
        document.getElementById('irLoading').style.display = 'none';
    }
});

document.getElementById('betForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('betLoading').style.display = 'block';
    document.getElementById('betResult').style.display = 'none';
    document.getElementById('betError').style.display = 'none';

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch(`${BASE_URL}/analyze-bet`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            if (result.original_data) {
                plotBET('betOriginalPlot', result.original_data, 'Original BET Analysis');
                document.getElementById('originalSurfaceArea').textContent = result.original_surface_area.toFixed(2);
            } else {
                document.getElementById('betOriginalPlot').innerHTML = '<p class="text-gray-500">No original data provided.</p>';
                document.getElementById('originalSurfaceArea').textContent = 'N/A';
            }
            if (result.modified_data) {
                plotBET('betModifiedPlot', result.modified_data, 'Modified BET Analysis');
                document.getElementById('modifiedSurfaceArea').textContent = result.modified_surface_area.toFixed(2);
            } else {
                document.getElementById('betModifiedPlot').innerHTML = '<p class="text-gray-500">No modified data provided.</p>';
                document.getElementById('modifiedSurfaceArea').textContent = 'N/A';
            }
            
            const aiSuggestionDiv = document.querySelector('#betAiSuggestion .markdown-content');
            aiSuggestionDiv.innerHTML = formatMarkdownToHtml(result.ai_suggestion);
            
            document.getElementById('betResult').style.display = 'block';
            document.getElementById('betFollowUpSection').style.display = 'block';
            lastBetResult = result;
        } else {
            document.getElementById('betError').textContent = result.error || 'Unknown error occurred.';
            document.getElementById('betError').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('betError').textContent = `Request failed: ${error.message}`;
        document.getElementById('betError').style.display = 'block';
    } finally {
        document.getElementById('betLoading').style.display = 'none';
    }
});

document.getElementById('tgaForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('tgaLoading').style.display = 'block';
    document.getElementById('tgaResult').style.display = 'none';
    document.getElementById('tgaError').style.display = 'none';

    const formData = new FormData(e.target);
    
    try {
        const response = await fetch(`${BASE_URL}/analyze-tga`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            // Check if the response contains plot data or summary data
            if (result.tga_data && Array.isArray(result.tga_data)) {
                // This branch would handle the full plot data if the backend was updated
                plotTGA('tgaPlot', result.tga_data, 'TGA Analysis');
                document.getElementById('tgaPlot').style.display = 'block';
                document.getElementById('tgaSummary').style.display = 'none';
            } else if (result.tga_results) {
                // This branch handles the current backend response with adsorption/desorption
                const tgaDiv = document.getElementById('tgaPlot');
                tgaDiv.innerHTML = `<p><strong>Adsorption Capacity:</strong> ${result.tga_results.adsorption_capacity}</p>
                                    <p><strong>Desorption Energy:</strong> ${result.tga_results.desorption_energy}</p>`;
                document.getElementById('tgaPlot').style.display = 'block';
                document.getElementById('tgaSummary').style.display = 'block';
            } else {
                document.getElementById('tgaPlot').innerHTML = '<p class="text-gray-500">No TGA data provided or data format is incorrect.</p>';
                document.getElementById('tgaPlot').style.display = 'block';
            }
            
            const aiSuggestionDiv = document.querySelector('#tgaAiSuggestion .markdown-content');
            aiSuggestionDiv.innerHTML = formatMarkdownToHtml(result.ai_suggestion);
            
            document.getElementById('tgaResult').style.display = 'block';
            document.getElementById('tgaFollowUpSection').style.display = 'block';
            lastTgaResult = result;
        } else {
            document.getElementById('tgaError').textContent = result.error || 'Unknown error occurred.';
            document.getElementById('tgaError').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('tgaError').textContent = `Request failed: ${error.message}`;
        document.getElementById('tgaError').style.display = 'block';
    } finally {
        document.getElementById('tgaLoading').style.display = 'none';
    }
});

// Combined form
document.getElementById('analyzeAllForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    document.getElementById('combinedLoading').style.display = 'block';
    document.getElementById('analyzeAllResult').style.display = 'none';
    document.getElementById('combinedError').style.display = 'none';

    const formData = new FormData();
    const originalXrdFile = document.getElementById('xrdOriginalFileCombined').files[0];
    const modifiedXrdFile = document.getElementById('xrdModifiedFileCombined').files[0];
    const originalIrFile = document.getElementById('irOriginalFileCombined').files[0];
    const modifiedIrFile = document.getElementById('irModifiedFileCombined').files[0];
    const originalBetFile = document.getElementById('betOriginalFileCombined').files[0];
    const modifiedBetFile = document.getElementById('betModifiedFileCombined').files[0];
    const tgaFile = document.getElementById('tgaFileCombined').files[0];

    if (originalXrdFile) formData.append('original_xrd_file', originalXrdFile);
    if (modifiedXrdFile) formData.append('modified_xrd_file', modifiedXrdFile);
    if (originalIrFile) formData.append('original_ir_file', originalIrFile);
    if (modifiedIrFile) formData.append('modified_ir_file', modifiedIrFile);
    if (originalBetFile) formData.append('original_bet_file', originalBetFile);
    if (modifiedBetFile) formData.append('modified_bet_file', modifiedBetFile);
    if (tgaFile) formData.append('tga_file', tgaFile);
    formData.append('ai_query', document.getElementById('aiQueryCombined').value);

    try {
        const response = await fetch(`${BASE_URL}/analyze-combined`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();

        if (response.ok) {
            // Plot all data, handling cases where files were not provided
            if (result.original_xrd && result.modified_xrd) {
                document.getElementById('xrdOriginalPlotCombined').style.display = 'block';
                document.getElementById('xrdModifiedPlotCombined').style.display = 'block';
                plotCombinedXRD('xrdOriginalPlotCombined', result.original_xrd, result.modified_xrd);
            } else {
                document.getElementById('xrdOriginalPlotCombined').style.display = 'none';
                document.getElementById('xrdModifiedPlotCombined').style.display = 'none';
            }

            if (result.original_ir && result.modified_ir) {
                document.getElementById('irOriginalPlotCombined').style.display = 'block';
                document.getElementById('irModifiedPlotCombined').style.display = 'block';
                plotCombinedIR('irOriginalPlotCombined', result.original_ir, result.modified_ir);
            } else {
                document.getElementById('irOriginalPlotCombined').style.display = 'none';
                document.getElementById('irModifiedPlotCombined').style.display = 'none';
            }

            if (result.original_bet && result.modified_bet) {
                document.getElementById('betOriginalPlotCombined').style.display = 'block';
                document.getElementById('betModifiedPlotCombined').style.display = 'block';
                plotCombinedBET('betOriginalPlotCombined', result.original_bet, result.modified_bet);
            } else {
                document.getElementById('betOriginalPlotCombined').style.display = 'none';
                document.getElementById('betModifiedPlotCombined').style.display = 'none';
            }

            if (result.tga_data) {
                document.getElementById('tgaPlotCombined').style.display = 'block';
                // Check if the data is an array before trying to map it
                if (Array.isArray(result.tga_data)) {
                    plotTGA('tgaPlotCombined', result.tga_data, 'TGA Analysis');
                } else {
                    // Handle the TGA data as a dictionary
                    const tgaDiv = document.getElementById('tgaPlotCombined');
                    tgaDiv.innerHTML = `<p><strong>Adsorption Capacity:</strong> ${result.tga_data.adsorption_capacity}</p>
                                        <p><strong>Desorption Energy:</strong> ${result.tga_data.desorption_energy}</p>`;
                }
            } else {
                document.getElementById('tgaPlotCombined').style.display = 'none';
            }

            // These lines should be outside the tga_data check
            const aiSuggestionDiv = document.querySelector('#combinedAiSuggestion .markdown-content');
            aiSuggestionDiv.innerHTML = formatMarkdownToHtml(result.ai_suggestion);

            document.getElementById('analyzeAllResult').style.display = 'block';
            document.getElementById('combinedFollowUpSection').style.display = 'block';
            lastCombinedResult = result;
        } else {
            document.getElementById('combinedError').textContent = result.error || 'Unknown error occurred.';
            document.getElementById('combinedError').style.display = 'block';
        }
    } catch (error) {
        document.getElementById('combinedError').textContent = `Request failed: ${error.message}`;
        document.getElementById('combinedError').style.display = 'block';
    } finally {
        document.getElementById('combinedLoading').style.display = 'none';
    }
});


// --- Follow-up Questions ---
document.getElementById('xrdFollowUpBtn').addEventListener('click', async () => {
    await handleFollowUp('xrd', document.getElementById('xrdFollowUpQuery').value, lastXrdResult);
});

document.getElementById('irFollowUpBtn').addEventListener('click', async () => {
    await handleFollowUp('ir', document.getElementById('irFollowUpQuery').value, lastIrResult);
});

document.getElementById('betFollowUpBtn').addEventListener('click', async () => {
    await handleFollowUp('bet', document.getElementById('betFollowUpQuery').value, lastBetResult);
});

document.getElementById('tgaFollowUpBtn').addEventListener('click', async () => {
    await handleFollowUp('tga', document.getElementById('tgaFollowUpQuery').value, lastTgaResult);
});

document.getElementById('combinedFollowUpBtn').addEventListener('click', async () => {
    await handleFollowUp('combined', document.getElementById('combinedFollowUpQuery').value, lastCombinedResult);
});

async function handleFollowUp(type, query, previousAnalysis) {
    if (!query) {
        alert("Please enter a question.");
        return;
    }
    
    const loadingDiv = document.getElementById(`${type}Loading`);
    const errorDiv = document.getElementById(`${type}Error`);
    loadingDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    
    const formData = new FormData();
    formData.append('user_query', query);
    formData.append('previous_analysis', JSON.stringify(previousAnalysis));
    
    try {
        const response = await fetch(`${BASE_URL}/analyze-${type}-followup`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        
        if (response.ok) {
            const followUpHtml = `
                <div class="mt-4 p-4 bg-gray-100 rounded-lg border border-gray-200">
                    <h5 class="text-md font-semibold text-gray-800 mb-2">Follow-up Response</h5>
                    <div class="markdown-content text-gray-700">${formatMarkdownToHtml(result.ai_suggestion)}</div>
                </div>`;
            document.getElementById(`${type}FollowUpSection`).insertAdjacentHTML('beforeend', followUpHtml);
        } else {
            errorDiv.textContent = result.error || 'Unknown error occurred during follow-up.';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = `Follow-up request failed: ${error.message}`;
        errorDiv.style.display = 'block';
    } finally {
        loadingDiv.style.display = 'none';
    }
}


// --- History Toggles and Search ---
document.getElementById('xrdHistoryBtn').addEventListener('click', async () => {
    const container = document.getElementById('xrdHistoryContainer');
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
        container.classList.add('hidden');
        return;
    }
    try {
        const resp = await fetch(`${BASE_URL}/history/xrd`);
        xrdHistoryData = await resp.json();
        updateHistoryUI('xrd');
        container.classList.remove('hidden');
    } catch (err) {
        const contentDiv = document.getElementById('xrdHistoryContent');
        contentDiv.innerHTML = `<p class="text-red-600">Error fetching XRD history: ${err.message}</p>`;
        container.classList.remove('hidden');
    }
});

document.getElementById('irHistoryBtn').addEventListener('click', async () => {
    const container = document.getElementById('irHistoryContainer');
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
        container.classList.add('hidden');
        return;
    }
    try {
        const resp = await fetch(`${BASE_URL}/history/ir`);
        irHistoryData = await resp.json();
        updateHistoryUI('ir');
        container.classList.remove('hidden');
    } catch (err) {
        const contentDiv = document.getElementById('irHistoryContent');
        contentDiv.innerHTML = `<p class="text-red-600">Error fetching IR history: ${err.message}</p>`;
        container.classList.remove('hidden');
    }
});

document.getElementById('betHistoryBtn').addEventListener('click', async () => {
    const container = document.getElementById('betHistoryContainer');
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
        container.classList.add('hidden');
        document.getElementById('betHistoryDisplay').classList.add('hidden');
        return;
    }
    try {
        const resp = await fetch(`${BASE_URL}/history/bet`);
        betHistoryData = await resp.json();
        updateHistoryUI('bet');
        container.classList.remove('hidden');
    } catch (err) {
        const contentDiv = document.getElementById('betHistoryContent');
        contentDiv.innerHTML = `<p class="text-red-600">Error fetching BET history: ${err.message}</p>`;
        container.classList.remove('hidden');
    }
});

document.getElementById('tgaHistoryBtn').addEventListener('click', async () => {
    const container = document.getElementById('tgaHistoryContainer');
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
        container.classList.add('hidden');
        return;
    }
    try {
        const resp = await fetch(`${BASE_URL}/history/tga`);
        tgaHistoryData = await resp.json();
        updateHistoryUI('tga');
        container.classList.remove('hidden');
    } catch (err) {
        const contentDiv = document.getElementById('tgaHistoryContent');
        contentDiv.innerHTML = `<p class="text-red-600">Error fetching TGA history: ${err.message}</p>`;
        container.classList.remove('hidden');
    }
});

document.getElementById('combinedHistoryBtn').addEventListener('click', async () => {
    const container = document.getElementById('combinedHistoryContainer');
    const isHidden = container.classList.contains('hidden');
    if (!isHidden) {
        container.classList.add('hidden');
        document.getElementById('combinedHistoryDisplay').classList.add('hidden');
        return;
    }
    try {
        const resp = await fetch(`${BASE_URL}/history/combined`);
        combinedHistoryData = await resp.json();
        updateHistoryUI('combined');
        container.classList.remove('hidden');
    } catch (err) {
        const contentDiv = document.getElementById('combinedHistoryContent');
        contentDiv.innerHTML = `<p class="text-red-600">Error fetching combined history: ${err.message}</p>`;
        container.classList.remove('hidden');
    }
});

function updateHistoryUI(type) {
    const data = type === 'xrd' ? xrdHistoryData :
                 type === 'ir' ? irHistoryData :
                 type === 'bet' ? betHistoryData :
                 type === 'tga' ? tgaHistoryData :
                 combinedHistoryData;

    const contentDiv = document.getElementById(`${type}HistoryContent`);
    contentDiv.innerHTML = ''; // Clear previous content

    if (data.length === 0) {
        contentDiv.innerHTML = `<p class="text-gray-500">No analysis history found.</p>`;
        return;
    }

    data.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-row p-3 mb-2 rounded-lg bg-white border border-gray-200 shadow-sm transition-transform transform hover:scale-[1.01]';
        
        let details = `
            <p><strong>Date:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
        `;
        if (item.user_query) {
            details += `<p><strong>Query:</strong> ${item.user_query}</p>`;
        }
        
        if (type === 'xrd' || type === 'combined') {
            const originalPeaks = item.original_xrd_peaks ? JSON.stringify(item.original_xrd_peaks) : 'N/A';
            const modifiedPeaks = item.modified_xrd_peaks ? JSON.stringify(item.modified_xrd_peaks) : 'N/A';
            details += `
                <p><strong>Original XRD Peaks:</strong> ${originalPeaks}</p>
                <p><strong>Modified XRD Peaks:</strong> ${modifiedPeaks}</p>
            `;
        }
        if (type === 'ir' || type === 'combined') {
            const originalPeaks = item.original_ir_peaks ? JSON.stringify(item.original_ir_peaks) : 'N/A';
            const modifiedPeaks = item.modified_ir_peaks ? JSON.stringify(item.modified_ir_peaks) : 'N/A';
            details += `
                <p><strong>Original IR Peaks:</strong> ${originalPeaks}</p>
                <p><strong>Modified IR Peaks:</strong> ${modifiedPeaks}</p>
            `;
        }
        if (type === 'bet' || type === 'combined') {
            const originalArea = item.original_bet_surface_area ? item.original_bet_surface_area.toFixed(2) : 'N/A';
            const modifiedArea = item.modified_bet_surface_area ? item.modified_bet_surface_area.toFixed(2) : 'N/A';
            details += `
                <p><strong>Original BET Surface Area:</strong> ${originalArea} m²/g</p>
                <p><strong>Modified BET Surface Area:</strong> ${modifiedArea} m²/g</p>
            `;
        }
        if (type === 'tga' || type === 'combined') {
            // Check if tga_results exists and is an object
            const tgaResults = item.tga_results;
            if (tgaResults) {
                const adsorption = tgaResults.adsorption_capacity ? tgaResults.adsorption_capacity : 'N/A';
                const desorption = tgaResults.desorption_energy ? tgaResults.desorption_energy : 'N/A';
                details += `
                    <p><strong>Adsorption Capacity:</strong> ${adsorption}</p>
                    <p><strong>Desorption Energy:</strong> ${desorption}</p>
                `;
            } else {
                details += `<p><strong>TGA Results:</strong> N/A</p>`;
            }
        }
        
        const aiSummary = item.ai_suggestion ? item.ai_suggestion.substring(0, 150) + '...' : 'N/A';
        details += `<p class="mt-2 text-sm text-gray-600"><strong>AI Summary:</strong> ${aiSummary}</p>`;
        
        historyItem.innerHTML = details;
        contentDiv.appendChild(historyItem);
    });
}

function filterHistory(type, query) {
    const data = type === 'xrd' ? xrdHistoryData :
                 type === 'ir' ? irHistoryData :
                 type === 'bet' ? betHistoryData :
                 type === 'tga' ? tgaHistoryData :
                 combinedHistoryData;
                 
    const contentDiv = document.getElementById(`${type}HistoryContent`);
    contentDiv.innerHTML = '';
    
    const filteredData = data.filter(item => {
        const aiSuggestion = item.ai_suggestion.toLowerCase();
        const userQuery = item.user_query ? item.user_query.toLowerCase() : '';
        const timestamp = new Date(item.timestamp).toLocaleString().toLowerCase();
        return aiSuggestion.includes(query) || userQuery.includes(query) || timestamp.includes(query);
    });
    
    if (filteredData.length === 0) {
        contentDiv.innerHTML = `<p class="text-gray-500">No matching analysis history found.</p>`;
        return;
    }
    
    filteredData.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-row p-3 mb-2 rounded-lg bg-white border border-gray-200 shadow-sm transition-transform transform hover:scale-[1.01]';
        
        let details = `
            <p><strong>Date:</strong> ${new Date(item.timestamp).toLocaleString()}</p>
        `;
        if (item.user_query) {
            details += `<p><strong>Query:</strong> ${item.user_query}</p>`;
        }
        
        const aiSummary = item.ai_suggestion ? item.ai_suggestion.substring(0, 150) + '...' : 'N/A';
        details += `<p class="mt-2 text-sm text-gray-600"><strong>AI Summary:</strong> ${aiSummary}</p>`;
        
        historyItem.innerHTML = details;
        contentDiv.appendChild(historyItem);
    });
}

// Search listeners
document.getElementById('xrdSearch').addEventListener('input', (e) => {
    filterHistory('xrd', e.target.value.toLowerCase());
});

document.getElementById('irSearch').addEventListener('input', (e) => {
    filterHistory('ir', e.target.value.toLowerCase());
});

document.getElementById('betSearch').addEventListener('input', (e) => {
    filterHistory('bet', e.target.value.toLowerCase());
});

document.getElementById('tgaSearch').addEventListener('input', (e) => {
    filterHistory('tga', e.target.value.toLowerCase());
});

document.getElementById('combinedSearch').addEventListener('input', (e) => {
    filterHistory('combined', e.target.value.toLowerCase());
});