// public/script.js
document.addEventListener('DOMContentLoaded', function() {
    // Common ports data
    const commonPorts = [
        {"port": 21, "service": "FTP"},
        {"port": 22, "service": "SSH"},
        {"port": 23, "service": "Telnet"},
        {"port": 25, "service": "SMTP"},
        {"port": 53, "service": "DNS"},
        {"port": 80, "service": "HTTP"},
        {"port": 110, "service": "POP3"},
        {"port": 143, "service": "IMAP"},
        {"port": 443, "service": "HTTPS"},
        {"port": 993, "service": "IMAPS"},
        {"port": 995, "service": "POP3S"},
        {"port": 3389, "service": "RDP"},
        {"port": 5900, "service": "VNC"}
    ];

    // DOM elements
    const hostInput = document.getElementById('host');
    const portRangeInput = document.getElementById('port-range');
    const timeoutInput = document.getElementById('timeout');
    const startTestBtn = document.getElementById('start-test');
    const testCommonBtn = document.getElementById('test-common');
    const stopTestBtn = document.getElementById('stop-test');
    const exportResultsBtn = document.getElementById('export-results');
    const clearResultsBtn = document.getElementById('clear-results');
    const commonPortsGrid = document.getElementById('common-ports-grid');
    const progressContainer = document.getElementById('progress-container');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const resultCount = document.getElementById('result-count');
    const resultsTableContainer = document.getElementById('results-table-container');
    const emptyResults = document.getElementById('empty-results');
    const resultsBody = document.getElementById('results-body');
    const errorMessage = document.getElementById('error-message');
    const successMessage = document.getElementById('success-message');

    // Application state
    let isTestingActive = false;
    let results = [];
    let sortField = 'timestamp';
    let sortDirection = 'desc';
    let abortController = null;

    // Initialize common ports grid
    function initCommonPortsGrid() {
        commonPortsGrid.innerHTML = '';
        commonPorts.forEach(port => {
            const portButton = document.createElement('div');
            portButton.className = 'port-button';
            portButton.innerHTML = `
                <div class="port-number">${port.port}</div>
                <div class="port-service">${port.service}</div>
            `;
            portButton.addEventListener('click', () => {
                if (!isTestingActive && hostInput.value) {
                    startTest([port.port]);
                }
            });
            commonPortsGrid.appendChild(portButton);
        });
    }

    // Validate host
    function validateHost(host) {
        if (!host.trim()) return false;
        
        // Basic IP address validation
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        
        // Basic hostname validation
        const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
        
        return ipRegex.test(host) || hostnameRegex.test(host);
    }

    // Parse port range
    function parsePortRange(range) {
        if (!range.trim()) return [];
        
        if (range.includes('-')) {
            const [start, end] = range.split('-').map(p => parseInt(p.trim()));
            if (isNaN(start) || isNaN(end) || start > end || start < 1 || end > 65535) {
                throw new Error('Invalid port range. Use format like "80-90"');
            }
            const ports = [];
            for (let i = start; i <= end; i++) {
                ports.push(i);
            }
            return ports;
        } else {
            const port = parseInt(range.trim());
            if (isNaN(port) || port < 1 || port > 65535) {
                throw new Error('Invalid port number. Must be between 1-65535');
            }
            return [port];
        }
    }

    // Test a single port
    async function testSinglePort(host, port, timeout) {
        try {
            const response = await fetch('/api/test-port', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    host,
                    port,
                    timeout
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to test port');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Port test error:', error);
            return {
                host,
                port,
                protocol: 'TCP',
                status: 'error',
                responseTime: 0,
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    // Test multiple ports
    async function testMultiplePorts(host, ports, timeout) {
        try {
            const response = await fetch('/api/test-ports', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    host,
                    ports,
                    timeout
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to test ports');
            }
            
            return await response.json();
        } catch (error) {
            console.error('Multiple ports test error:', error);
            showError(error.message);
            return [];
        }
    }

    // Start testing
    async function startTest(ports = null) {
        hideMessages();
        
        if (!validateHost(hostInput.value)) {
            showError('Please enter a valid IP address or hostname');
            return;
        }

        let portsToTest;
        if (ports) {
            portsToTest = ports;
        } else {
            try {
                portsToTest = parsePortRange(portRangeInput.value);
            } catch (err) {
                showError(err.message);
                return;
            }
        }

        if (portsToTest.length === 0) {
            showError('Please specify at least one port to test');
            return;
        }

        if (portsToTest.length > 100) {
            showError('Too many ports to test. Maximum is 100 ports');
            return;
        }

        setTestingActive(true);
        updateProgress(0, `Testing ${portsToTest.length} port${portsToTest.length > 1 ? 's' : ''} on ${hostInput.value}`);
        
        try {
            // For small number of ports, test one by one to show progress
            if (portsToTest.length <= 10) {
                for (let i = 0; i < portsToTest.length; i++) {
                    const port = portsToTest[i];
                    const result = await testSinglePort(hostInput.value, port, parseInt(timeoutInput.value));
                    
                    // Add result
                    addResults([result]);
                    
                    // Update progress
                    const progressPercent = ((i + 1) / portsToTest.length) * 100;
                    updateProgress(progressPercent, `Tested ${i + 1} of ${portsToTest.length} ports`);
                }
            } else {
                // For larger batches, use the batch endpoint
                const batchSize = 10;
                for (let i = 0; i < portsToTest.length; i += batchSize) {
                    const batch = portsToTest.slice(i, i + batchSize);
                    const batchResults = await testMultiplePorts(
                        hostInput.value, 
                        batch, 
                        parseInt(timeoutInput.value)
                    );
                    
                    // Add results
                    addResults(batchResults);
                    
                    // Update progress
                    const completed = Math.min(i + batchSize, portsToTest.length);
                    const progressPercent = (completed / portsToTest.length) * 100;
                    updateProgress(progressPercent, `Tested ${completed} of ${portsToTest.length} ports`);
                }
            }
            
            showSuccess(`Successfully tested ${portsToTest.length} port${portsToTest.length > 1 ? 's' : ''}`);
            updateProgress(100, 'Testing completed');
            
        } catch (err) {
            showError('Testing failed: ' + err.message);
        } finally {
            setTestingActive(false);
        }
    }

    // Test common ports
    function testCommonPorts() {
        const ports = commonPorts.map(p => p.port);
        startTest(ports);
    }

    // Add results to the table
    function addResults(newResults) {
        results.push(...newResults);
        updateResultsDisplay();
    }

    // Update results display
    function updateResultsDisplay() {
        // Update count
        resultCount.textContent = results.length;
        
        // Sort results
        const sortedResults = [...results].sort((a, b) => {
            let aVal = a[sortField];
            let bVal = b[sortField];
            
            if (sortField === 'port' || sortField === 'responseTime') {
                aVal = parseInt(aVal);
                bVal = parseInt(bVal);
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
        
        // Show/hide appropriate elements
        if (results.length > 0) {
            emptyResults.style.display = 'none';
            resultsTableContainer.style.display = 'block';
            exportResultsBtn.disabled = false;
            clearResultsBtn.disabled = false;
        } else {
            emptyResults.style.display = 'block';
            resultsTableContainer.style.display = 'none';
            exportResultsBtn.disabled = true;
            clearResultsBtn.disabled = true;
        }
        
        // Clear and rebuild table
        resultsBody.innerHTML = '';
        
        sortedResults.forEach(result => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.host}</td>
                <td>${result.port}</td>
                <td>${result.protocol}</td>
                <td><span class="status-badge status-${result.status}">${result.status}</span></td>
                <td>${result.responseTime}ms</td>
                <td>${new Date(result.timestamp).toLocaleString()}</td>
            `;
            resultsBody.appendChild(row);
        });
        
        // Update sort indicators
        document.querySelectorAll('th .sort-indicator').forEach(el => {
            el.textContent = '';
        });
        
        const activeHeader = document.querySelector(`th[data-sort="${sortField}"] .sort-indicator`);
        if (activeHeader) {
            activeHeader.textContent = sortDirection === 'asc' ? '↑' : '↓';
        }
    }

    // Sort results by column
    function sortResults(field) {
        if (sortField === field) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            sortField = field;
            sortDirection = 'asc';
        }
        
        updateResultsDisplay();
    }

    // Export results
    function exportResults() {
        if (results.length === 0) return;
        
        const dataStr = JSON.stringify(results, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `port-test-results-${new Date().toISOString().slice(0, 19)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }

    // Clear results
    function clearResults() {
        results = [];
        updateResultsDisplay();
        hideMessages();
        updateProgress(0, '');
        progressContainer.style.display = 'none';
    }

    // Set testing active/inactive
    function setTestingActive(active) {
        isTestingActive = active;
        
        // Update UI elements
        hostInput.disabled = active;
        portRangeInput.disabled = active;
        timeoutInput.disabled = active;
        startTestBtn.style.display = active ? 'none' : 'inline-block';
        testCommonBtn.style.display = active ? 'none' : 'inline-block';
        stopTestBtn.style.display = active ? 'inline-block' : 'none';
        progressContainer.style.display = active ? 'block' : 'none';
        
        // Disable port buttons when testing
        document.querySelectorAll('.port-button').forEach(btn => {
            btn.style.opacity = active ? '0.5' : '1';
            btn.style.pointerEvents = active ? 'none' : 'auto';
        });
    }

    // Update progress bar
    function updateProgress(percent, text) {
        progressFill.style.width = `${percent}%`;
        progressText.textContent = text;
    }

    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }

    // Show success message
    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }

    // Hide all messages
    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }

    // Stop testing
    function stopTest() {
        // Currently not implemented since we can't easily abort fetch requests
        // This would require additional server-side implementation
        setTestingActive(false);
        showError('Testing was stopped by user');
    }

    // Initialize the application
    function init() {
        // Initialize common ports grid
        initCommonPortsGrid();
        
        // Set up event listeners
        startTestBtn.addEventListener('click', () => startTest());
        testCommonBtn.addEventListener('click', testCommonPorts);
        stopTestBtn.addEventListener('click', stopTest);
        exportResultsBtn.addEventListener('click', exportResults);
        clearResultsBtn.addEventListener('click', clearResults);
        
        // Set up sorting
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                sortResults(th.getAttribute('data-sort'));
            });
        });
    }

    // Start the app
    init();
});