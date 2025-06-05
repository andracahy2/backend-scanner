const net = require('net');
const express = require('express');
const path = require('path');
const app = express();
const PORT = 3000;
const cors = require('cors');
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Endpoint to test a single port
app.post('/api/test-port', (req, res) => {
  const { host, port, timeout = 5000 } = req.body;
  
  if (!host || !port) {
    return res.status(400).json({ error: 'Host and port are required' });
  }
  
  testPort(host, port, timeout)
    .then(result => {
      res.json(result);
    })
    .catch(error => {
      res.status(500).json({ error: error.message });
    });
});

// Endpoint to test multiple ports
app.post('/api/test-ports', (req, res) => {
  const { host, ports, timeout = 5000 } = req.body;
  
  if (!host || !ports || !Array.isArray(ports)) {
    return res.status(400).json({ error: 'Host and array of ports are required' });
  }
  
  // Limit the number of ports to test
  if (ports.length > 100) {
    return res.status(400).json({ error: 'Maximum 100 ports can be tested at once' });
  }
  
  const portPromises = ports.map(port => testPort(host, port, timeout));
  
  Promise.all(portPromises)
    .then(results => {
      res.json(results);
    })
    .catch(error => {
      res.status(500).json({ error: error.message });
    });
});

// Function to test if a port is open
function testPort(host, port, timeout) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let status = 'closed';
    
    // Set timeout
    socket.setTimeout(timeout);
    
    // Attempt to connect
    socket.connect(port, host, () => {
      const responseTime = Date.now() - startTime;
      status = 'open';
      socket.destroy();
      resolve({
        host,
        port,
        protocol: 'TCP', // Currently only TCP is supported
        status,
        responseTime,
        timestamp: new Date().toISOString()
      });
    });
    
    // Handle connection timeout
    socket.on('timeout', () => {
      const responseTime = Date.now() - startTime;
      status = 'timeout';
      socket.destroy();
      resolve({
        host,
        port,
        protocol: 'TCP',
        status,
        responseTime,
        timestamp: new Date().toISOString()
      });
    });
    
    // Handle connection error
    socket.on('error', (err) => {
      const responseTime = Date.now() - startTime;
      // Different error handling based on error code
      if (err.code === 'ECONNREFUSED') {
        status = 'closed';
      } else if (err.code === 'EHOSTUNREACH') {
        status = 'unreachable';
      } else {
        status = 'error';
      }
      
      socket.destroy();
      resolve({
        host,
        port,
        protocol: 'TCP',
        status,
        responseTime,
        timestamp: new Date().toISOString(),
        error: err.code
      });
    });
  });
}

// Start the server
app.listen(PORT, () => {
  console.log(`Port scanner server running at http://localhost:${PORT}`);
});

// Create the public directory and index.html file for the frontend
/*
Directory structure:
- real-port-scanner.js (this file)
- public/
  - index.html
  - style.css
  - script.js
*/