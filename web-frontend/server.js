const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const net = require('net');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const JAVA_SERVER_HOST = 'localhost';
const JAVA_SERVER_PORT = 8000;
const WEB_SERVER_PORT = 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Store active connections
const connections = new Map();

// Handle WebSocket connections from web clients
io.on('connection', (webSocket) => {
    console.log('New web client connected:', webSocket.id);
    
    let javaSocket = null;
    let username = null;
    let authenticated = false;
    
    // Connect to Java server
    webSocket.on('connect-server', (data) => {
        username = data.username;
        const password = data.password;
        
        console.log(`Attempting to connect user: ${username} to Java server`);
        
        javaSocket = new net.Socket();
        javaSocket.setKeepAlive(true, 1000);
        
        javaSocket.connect(JAVA_SERVER_PORT, JAVA_SERVER_HOST, () => {
            console.log(`Connected to Java server for user: ${username}`);
            
            // Send auth mode, username and password
            const authMode = data.authMode || 'LOGIN';
            javaSocket.write(authMode + '\n');
            javaSocket.write(username + '\n');
            javaSocket.write(password + '\n');
            
            // Send extra fields based on auth mode
            if (authMode === 'SIGNUP' && data.securityAnswer) {
                javaSocket.write(data.securityAnswer + '\n');
            }
            if (authMode === 'RECOVER' && data.newPassword) {
                javaSocket.write(data.newPassword + '\n');
            }
        });
        
        // Handle data from Java server
        let downloadMode = false;
        let downloadBuffer = Buffer.alloc(0);
        let expectedFileSize = 0;
        let receivedBytes = 0;
        
        javaSocket.on('data', (data) => {
            if (downloadMode) {
                downloadBuffer = Buffer.concat([downloadBuffer, data]);
                
                // Process chunks: each chunk has 4-byte length prefix + data
                while (downloadBuffer.length >= 4) {
                    // Check for DOWNLOAD_COMPLETE text message
                    // It might be at the end of the buffer as text
                    const bufferStr = downloadBuffer.toString('utf-8');
                    const completeIdx = bufferStr.indexOf('DOWNLOAD_COMPLETE');
                    
                    if (completeIdx === 0) {
                        // Download complete signal at start
                        downloadMode = false;
                        webSocket.emit('server-message', { message: 'DOWNLOAD_COMPLETE' });
                        console.log('Download complete, received', receivedBytes, 'bytes');
                        
                        // Handle remaining data after DOWNLOAD_COMPLETE\n
                        const remaining = downloadBuffer.slice('DOWNLOAD_COMPLETE\n'.length);
                        downloadBuffer = Buffer.alloc(0);
                        if (remaining.length > 0) {
                            const text = remaining.toString('utf-8').trim();
                            if (text) {
                                webSocket.emit('server-message', { message: text });
                            }
                        }
                        break;
                    }
                    
                    // Read 4-byte chunk length (big-endian int)
                    const chunkLen = downloadBuffer.readInt32BE(0);
                    
                    // Sanity check - if chunk length looks invalid, it might be text
                    if (chunkLen < 0 || chunkLen > 1000000) {
                        // Try to parse as text - might be DOWNLOAD_COMPLETE or error
                        const text = downloadBuffer.toString('utf-8');
                        if (text.includes('DOWNLOAD_COMPLETE')) {
                            downloadMode = false;
                            webSocket.emit('server-message', { message: 'DOWNLOAD_COMPLETE' });
                            downloadBuffer = Buffer.alloc(0);
                            console.log('Download complete (text detected)');
                        } else {
                            console.log('Unexpected data in download mode:', text.substring(0, 100));
                            webSocket.emit('server-message', { message: text });
                            downloadBuffer = Buffer.alloc(0);
                            downloadMode = false;
                        }
                        break;
                    }
                    
                    // Wait for full chunk if not enough data
                    if (downloadBuffer.length < 4 + chunkLen) {
                        break;
                    }
                    
                    // Extract chunk data
                    const chunkData = downloadBuffer.slice(4, 4 + chunkLen);
                    receivedBytes += chunkLen;
                    
                    // Send to web client
                    webSocket.emit('binary-data', {
                        data: chunkData.toString('base64'),
                        bytes: chunkLen
                    });
                    
                    // Remove processed data from buffer
                    downloadBuffer = downloadBuffer.slice(4 + chunkLen);
                }
            } else {
                // Text mode - might contain mixed messages
                let buffer = data;
                
                // Check if this data contains DOWNLOAD_START
                const text = buffer.toString('utf-8');
                
                if (text.includes('DOWNLOAD_START:')) {
                    // Extract DOWNLOAD_START message
                    const lines = text.split('\n');
                    let binaryDataStart = 0;
                    
                    for (const line of lines) {
                        if (line.startsWith('DOWNLOAD_START:')) {
                            webSocket.emit('server-message', { message: line });
                            
                            // Parse file size
                            const parts = line.substring(15).split('|');
                            expectedFileSize = parseInt(parts[1]);
                            receivedBytes = 0;
                            downloadMode = true;
                            
                            console.log('Entering download mode, expected size:', expectedFileSize);
                        } else if (line.trim()) {
                            webSocket.emit('server-message', { message: line });
                        }
                        binaryDataStart += line.length + 1; // +1 for newline
                    }
                    
                    // Check if there's binary data after the text
                    if (downloadMode && binaryDataStart < buffer.length) {
                        downloadBuffer = buffer.slice(binaryDataStart);
                    }
                } else {
                    // Regular text message handling
                    const message = text;
                    console.log(`Message from Java server for ${username}:`, message.substring(0, 100));
                    
                    // Handle SUCCESS/ERROR messages from Java server
                    if (message.startsWith('SUCCESS:') && !authenticated) {
                        authenticated = true;
                        connections.set(webSocket.id, { webSocket, javaSocket, username });
                        webSocket.emit('connection-success', { message: message.substring(8) });
                        webSocket.emit('server-message', { message });
                    } else if (message.startsWith('ERROR:') && !authenticated) {
                        // Only treat ERROR as connection failure during login
                        webSocket.emit('connection-error', { message: message.substring(6) });
                        webSocket.emit('server-message', { message });
                        if (!javaSocket.destroyed) {
                            javaSocket.destroy();
                        }
                    } else {
                        webSocket.emit('server-message', { message });
                    }
                }
            }
        });
        
        javaSocket.on('error', (error) => {
            console.error('Java socket error:', error);
            webSocket.emit('connection-error', { 
                message: 'Cannot connect to server. Please ensure the Java server is running.' 
            });
            if (!javaSocket.destroyed) {
                javaSocket.destroy();
            }
        });
        
        javaSocket.on('close', () => {
            console.log('Java socket closed for:', username);
            webSocket.emit('disconnected');
            connections.delete(webSocket.id);
        });
    });
    
    // Handle commands from web client
    webSocket.on('send-command', (data) => {
        if (javaSocket && !javaSocket.destroyed) {
            const cmd = data.command.toString().trim();
            if (cmd) {
                console.log(`Sending command to Java server for ${username}: "${cmd}"`);
                javaSocket.write(cmd + '\n');
            } else {
                console.log(`Ignoring empty command for ${username}`);
            }
        }
    });
    
    // Handle file upload
    webSocket.on('upload-file', (data) => {
        if (javaSocket && !javaSocket.destroyed) {
            // Send file data as binary
            const buffer = Buffer.from(data.fileData, 'base64');
            javaSocket.write(buffer);
        }
    });
    
    // Handle upload chunk data
    webSocket.on('upload-chunk-data', (data) => {
        if (javaSocket && !javaSocket.destroyed) {
            // Convert base64 to binary and send to Java server
            const buffer = Buffer.from(data.data, 'base64');
            console.log(`Sending chunk data: ${buffer.length} bytes`);
            javaSocket.write(buffer);
        }
    });
    
    // Handle disconnect
    webSocket.on('disconnect', () => {
        console.log('Web client disconnected:', webSocket.id);
        if (javaSocket && !javaSocket.destroyed) {
            javaSocket.destroy();
        }
        connections.delete(webSocket.id);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', connections: connections.size });
});

server.listen(WEB_SERVER_PORT, () => {
    console.log(`Web server running on http://localhost:${WEB_SERVER_PORT}`);
    console.log(`Connecting to Java server at ${JAVA_SERVER_HOST}:${JAVA_SERVER_PORT}`);
});
