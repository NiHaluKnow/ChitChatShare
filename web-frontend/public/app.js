// Socket.IO connection
let socket;
let currentUsername = '';
let selectedFile = null;
let serverMessages = [];

// DOM Elements 
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const passwordInput = document.getElementById('password-input');
const connectionStatus = document.getElementById('connection-status');
const currentUsernameSpan = document.getElementById('current-username');
const userInitial = document.getElementById('user-initial');
const logoutBtn = document.getElementById('logout-btn');
const consoleBody = document.getElementById('console-body');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    socket = io();
    setupSocketListeners();
});

function setupEventListeners() {
    // Login
    loginForm.addEventListener('submit', handleLogin);
    
    // Logout
    logoutBtn.addEventListener('click', handleLogout);
    
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            switchView(view);
        });
    });
    
    // File upload
    const uploadBox = document.getElementById('upload-box');
    const fileInput = document.getElementById('file-input');
    const browseBtn = document.getElementById('browse-btn');
    const uploadBtn = document.getElementById('upload-btn');
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');
    const requestResponseCheck = document.getElementById('request-response');
    const requestIdInput = document.getElementById('request-id');
    
    browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    uploadBox.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    uploadBtn.addEventListener('click', handleFileUpload);
    cancelUploadBtn.addEventListener('click', cancelFileSelection);
    
    requestResponseCheck.addEventListener('change', (e) => {
        requestIdInput.style.display = e.target.checked ? 'block' : 'none';
    });
    
    // Drag and drop
    uploadBox.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadBox.style.borderColor = 'var(--primary-color)';
    });
    
    uploadBox.addEventListener('dragleave', () => {
        uploadBox.style.borderColor = 'var(--border-color)';
    });
    
    uploadBox.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadBox.style.borderColor = 'var(--border-color)';
        if (e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });
    
    // Refresh buttons
    document.getElementById('refresh-my-files').addEventListener('click', () => sendCommand('LIST_OWN_FILES:'));
    document.getElementById('refresh-users').addEventListener('click', () => sendCommand('LIST_CLIENTS:'));
    document.getElementById('refresh-history').addEventListener('click', () => sendCommand('VIEW_HISTORY:'));
    
    // File request
    document.getElementById('new-request-btn').addEventListener('click', openRequestModal);
    document.getElementById('cancel-request').addEventListener('click', closeRequestModal);
    document.getElementById('file-request-form').addEventListener('submit', handleFileRequest);
    document.getElementById('request-type').addEventListener('change', (e) => {
        document.getElementById('recipient-group').style.display = 
            e.target.value === 'unicast' ? 'block' : 'none';
    });
}

function setupSocketListeners() {
    socket.on('connection-success', (data) => {
        logConsole('SUCCESS: ' + data.message);
        connectionStatus.innerHTML = '';
        // Successfully connected
        loginScreen.classList.remove('active');
        mainScreen.classList.add('active');
        currentUsernameSpan.textContent = currentUsername;
        userInitial.textContent = currentUsername.charAt(0).toUpperCase();
        
        console.log('Login successful, scheduling file list load');
        // Auto-load my files after a short delay to ensure connection is stable
        setTimeout(() => {
            console.log('Auto-loading file list...');
            sendCommand('LIST_OWN_FILES:');
        }, 1000);
    });
    
    socket.on('connection-error', (data) => {
        showStatus(data.message, 'error');
        logConsole('ERROR: ' + data.message);
        currentUsername = '';
    });
    
    socket.on('server-message', (data) => {
        const msg = data.message.trim();
        
        // Log summary for large messages instead of full content
        if (msg.startsWith('HISTORY:')) {
            logConsole('✓ History loaded');
        } else if (msg.startsWith('OWN_FILES:')) {
            const count = msg.split(';').filter(f => f.trim()).length;
            logConsole(`✓ My files loaded (${count} files)`);
        } else if (msg.startsWith('CLIENT_LIST:')) {
            const count = msg.split(',').filter(u => u.trim()).length;
            logConsole(`✓ Users list loaded (${count} users)`);
        } else if (msg.startsWith('PUBLIC_FILES:')) {
            const count = msg.split(';').filter(f => f.trim()).length;
            logConsole(`✓ Public files loaded (${count} files)`);
        } else if (msg.startsWith('MESSAGES:')) {
            const count = msg.substring(9).split(';').filter(m => m.trim()).length;
            logConsole(`✓ Messages loaded (${count} messages)`);
        } else if (!msg.startsWith('DOWNLOAD_START:') && 
                   !msg.startsWith('DOWNLOAD_COMPLETE') && 
                   !msg.startsWith('BINARY:')) {
            // Log all other messages normally
            logConsole(data.message);
        }
        
        handleServerMessage(data.message);
    });
    
    socket.on('binary-data', (data) => {
        handleBinaryData(data);
    });
    
    socket.on('error', (data) => {
        showStatus(data.message, 'error');
        logConsole('ERROR: ' + data.message);
    });
    
    socket.on('disconnected', () => {
        // Only show disconnect if we were actually connected
        if (mainScreen.classList.contains('active')) {
            showStatus('Disconnected from server', 'error');
            setTimeout(() => handleLogout(), 2000);
        }
    });
}

let authMode = 'LOGIN';

function switchAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });
    const btn = document.getElementById('auth-submit-btn');
    const passwordGroup = document.getElementById('password-group');
    const securityGroup = document.getElementById('security-answer-group');
    const newPassGroup = document.getElementById('new-password-group');
    const passwordField = document.getElementById('password-input');
    const securityField = document.getElementById('security-answer-input');
    const newPassField = document.getElementById('new-password-input');
    
    if (mode === 'LOGIN') {
        btn.textContent = 'Login';
        passwordGroup.style.display = '';
        securityGroup.style.display = 'none';
        newPassGroup.style.display = 'none';
        passwordField.required = true;
        securityField.required = false;
        newPassField.required = false;
        passwordField.placeholder = 'Enter your password';
    } else if (mode === 'SIGNUP') {
        btn.textContent = 'Sign Up';
        passwordGroup.style.display = '';
        securityGroup.style.display = '';
        newPassGroup.style.display = 'none';
        passwordField.required = true;
        securityField.required = true;
        newPassField.required = false;
        passwordField.placeholder = 'Create a password';
    } else if (mode === 'RECOVER') {
        btn.textContent = 'Reset Password';
        passwordGroup.style.display = 'none';
        securityGroup.style.display = '';
        newPassGroup.style.display = '';
        passwordField.required = false;
        securityField.required = true;
        newPassField.required = true;
        securityField.placeholder = 'Enter your security answer';
    }
    connectionStatus.innerHTML = '';
}

window.switchAuthMode = switchAuthMode;

function handleLogin(e) {
    e.preventDefault();
    const username = usernameInput.value.trim();
    const password = document.getElementById('password-input').value.trim();
    const securityAnswer = document.getElementById('security-answer-input').value.trim();
    const newPassword = document.getElementById('new-password-input').value.trim();
    
    if (!username) {
        showStatus('Please enter a username', 'error');
        return;
    }
    
    if (authMode === 'RECOVER') {
        if (!securityAnswer) {
            showStatus('Please enter your security answer', 'error');
            return;
        }
        if (!newPassword) {
            showStatus('Please enter a new password', 'error');
            return;
        }
        showStatus('Resetting password...', 'info');
        socket.emit('connect-server', { username, password: securityAnswer, authMode: 'RECOVER', newPassword });
    } else {
        if (!password) {
            showStatus('Please enter a password', 'error');
            return;
        }
        
        if (authMode === 'SIGNUP' && !securityAnswer) {
            showStatus('Please enter a security answer for account recovery', 'error');
            return;
        }
        
        currentUsername = username;
        showStatus(authMode === 'LOGIN' ? 'Logging in...' : 'Creating account...', 'info');
        
        socket.emit('connect-server', { username, password, authMode, securityAnswer });
    }
}

function handleLogout() {
    passwordInput.value = '';
    if (socket) {
        socket.disconnect();
    }
    mainScreen.classList.remove('active');
    loginScreen.classList.add('active');
    usernameInput.value = '';
    connectionStatus.innerHTML = '';
    currentUsername = '';
    
    // Reconnect socket
    socket = io();
    setupSocketListeners();
}

function switchView(viewName) {
    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewName) {
            item.classList.add('active');
        }
    });
    
    // Update view
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');
    
    // Load data for view
    switch(viewName) {
        case 'my-files':
            sendCommand('LIST_OWN_FILES:');
            break;
        case 'users':
            sendCommand('LIST_CLIENTS:');
            break;
        case 'history':
            sendCommand('VIEW_HISTORY:');
            break;
        case 'messages':
        case 'requests':
            sendCommand('VIEW_MESSAGES:');
            // Clear notification badge when viewing messages
            const messagesNavItem = document.querySelector('.nav-item[data-view="messages"]');
            if (messagesNavItem) {
                const badge = messagesNavItem.querySelector('.notification-badge');
                if (badge) {
                    badge.remove();
                }
            }
            break;
    }
}

window.switchView = switchView;

function sendCommand(command) {
    if (socket && socket.connected) {
        const cmd = String(command).trim();
        if (cmd) {
            // Map menu numbers to server commands
            const commandMap = {
                '1': 'LIST_CLIENTS:',
                '2': 'LIST_OWN_FILES:',
                '3': 'LIST_PUBLIC_FILES',  // Needs username parameter
                '4': 'UPLOAD_REQUEST',     // Needs file info
                '5': 'DOWNLOAD_REQUEST',   // Needs file info
                '6': 'FILE_REQUEST',       // Needs request info
                '7': 'VIEW_MESSAGES:',
                '8': 'VIEW_HISTORY:',
                '9': 'LOGOUT'
            };
            
            // If it's a number, map it to the command
            const actualCommand = commandMap[cmd] || cmd;
            console.log('Sending command:', actualCommand);
            socket.emit('send-command', { command: actualCommand });
        } else {
            console.log('Ignoring empty command');
        }
    }
}

function handleServerMessage(message) {
    const msg = message.trim();
    
    console.log('Processing server message:', msg.substring(0, 100));
    
    // Handle new message notification
    if (msg.startsWith('NEW_MESSAGE:')) {
        handleNewMessage(msg.substring(12)); // Remove "NEW_MESSAGE:"
    }
    
    // Handle upload approval
    else if (msg.startsWith('UPLOAD_APPROVED:')) {
        handleUploadApproved(msg);
    }
    
    // Handle chunk acknowledgment
    else if (msg === 'CHUNK_ACK') {
        handleChunkAck();
    }
    
    // Handle upload success
    else if (msg === 'UPLOAD_SUCCESS') {
        handleUploadSuccess();
    }
    
    // Handle upload complete (legacy)
    else if (msg.startsWith('UPLOAD_COMPLETE:')) {
        handleUploadSuccess();
    }
    
    // Parse file list (OWN_FILES:file1|public|id;file2|private|id;)
    else if (msg.startsWith('OWN_FILES:')) {
        parseMyFiles(msg);
    }
    
    // Parse client list (CLIENT_LIST:user1,online;user2,offline;)
    else if (msg.startsWith('CLIENT_LIST:')) {
        parseUserList(msg);
    }
    
    // Parse history  
    else if (msg.startsWith('HISTORY:')) {
        parseHistory(msg);
    }
    
    // Parse messages
    else if (msg.startsWith('MESSAGES:')) {
        parseMessages(msg);
    }
    
    // Parse public files list
    else if (msg.startsWith('PUBLIC_FILES:')) {
        parsePublicFiles(msg);
    }
    
    // Handle download start
    else if (msg.startsWith('DOWNLOAD_START:')) {
        handleDownloadStart(msg);
    }
    
    // Handle download errors (file not found, private, etc.)
    else if (msg.startsWith('ERROR:File not found') || msg.startsWith('ERROR:File is private')) {
        showStatus(msg.substring(6), 'error');
        
        // If this was a message-based download, remove the message since file is gone
        if (window.pendingMessageDelete) {
            const deleteCmd = `DELETE_MESSAGE:${window.pendingMessageDelete}`;
            sendCommand(deleteCmd);
            window.pendingMessageDelete = null;
            setTimeout(() => sendCommand('VIEW_MESSAGES:'), 500);
        }
    }
    
    // Handle delete success
    else if (msg.startsWith('DELETE_SUCCESS:')) {
        const deletedFile = msg.substring(15);
        showStatus(`"${deletedFile}" deleted successfully`, 'success');
        sendCommand('LIST_OWN_FILES:');
    }
    
    // Handle message deleted
    else if (msg === 'MESSAGE_DELETED') {
        console.log('Message deleted successfully');
        // Refresh messages view if currently on it
        const messagesView = document.getElementById('messages-view');
        if (messagesView && messagesView.classList.contains('active')) {
            sendCommand('VIEW_MESSAGES:');
        }
    }
    
    // Handle download complete
    else if (msg === 'DOWNLOAD_COMPLETE') {
        // Download completion is handled in handleBinaryData when all chunks received
        console.log('Download complete signal received');
    }
}

// Handle new message notification
function handleNewMessage(messageText) {
    console.log('New message received:', messageText);
    
    // Show toast notification
    showToast(messageText, 'info');
    
    // Add badge to messages nav item
    const messagesNavItem = document.querySelector('.nav-item[data-view="messages"]');
    if (messagesNavItem) {
        let badge = messagesNavItem.querySelector('.notification-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notification-badge';
            badge.textContent = '1';
            messagesNavItem.style.position = 'relative';
            messagesNavItem.appendChild(badge);
        } else {
            badge.textContent = parseInt(badge.textContent) + 1;
        }
    }
}

// Upload handling functions
let uploadContext = null;

function handleUploadApproved(message) {
    // UPLOAD_APPROVED:fileId|chunkSize
    const data = message.substring(16); // Remove "UPLOAD_APPROVED:"
    const parts = data.split('|');
    const fileId = parts[0];
    const chunkSize = parseInt(parts[1]);
    
    console.log(`Upload approved. File ID: ${fileId}, Chunk size: ${chunkSize}`);
    
    if (!window.pendingUpload) {
        console.error('No pending upload found!');
        return;
    }
    
    // Initialize upload context
    uploadContext = {
        fileId: fileId,
        chunkSize: chunkSize,
        file: window.pendingUpload.file,
        offset: 0,
        totalSize: window.pendingUpload.file.size,
        chunkNum: 0
    };
    
    // Start uploading chunks
    uploadNextChunk();
}

function uploadNextChunk() {
    if (!uploadContext) return;
    
    const { file, offset, chunkSize, totalSize, fileId } = uploadContext;
    
    if (offset >= totalSize) {
        console.log('All chunks sent!');
        return;
    }
    
    const chunk = file.slice(offset, Math.min(offset + chunkSize, totalSize));
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const arrayBuffer = e.target.result;
        const base64Data = arrayBufferToBase64(arrayBuffer);
        const bytesRead = arrayBuffer.byteLength;
        
        uploadContext.chunkNum++;
        uploadContext.offset += bytesRead;
        
        // Update progress
        const progress = Math.round((uploadContext.offset / totalSize) * 100);
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('upload-percent').textContent = progress + '%';
        
        console.log(`Sending chunk ${uploadContext.chunkNum} (${bytesRead} bytes)`);
        
        // Send chunk command: UPLOAD_CHUNK:fileId|bytesRead
        const chunkCommand = `UPLOAD_CHUNK:${fileId}|${bytesRead}`;
        socket.emit('send-command', { command: chunkCommand });
        
        // Send binary data
        setTimeout(() => {
            socket.emit('upload-chunk-data', { data: base64Data });
        }, 50);
    };
    
    reader.readAsArrayBuffer(chunk);
}

function handleChunkAck() {
    console.log('Chunk acknowledged');
    if (uploadContext) {
        if (uploadContext.offset < uploadContext.totalSize) {
            // Upload next chunk
            uploadNextChunk();
        } else {
            // All chunks sent, finalize upload
            console.log('All chunks uploaded, sending completion signal');
            const completeCommand = `UPLOAD_COMPLETE:${uploadContext.fileId}`;
            socket.emit('send-command', { command: completeCommand });
        }
    }
}

function handleUploadSuccess() {
    console.log('Upload successful!');
    uploadContext = null;
    window.pendingUpload = null;
    
    // Hide progress, show box
    document.getElementById('upload-progress').style.display = 'none';
    document.getElementById('upload-box').style.display = 'block';
    cancelFileSelection();
    
    // Show success message
    showStatus('File uploaded successfully!', 'success');
    
    // Refresh file list
    setTimeout(() => {
        sendCommand('LIST_OWN_FILES:');
    }, 500);
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function parseMyFiles(message) {
    const container = document.getElementById('my-files-container');
    
    // Parse OWN_FILES:file1|public|id;file2|private|id;
    const filesData = message.substring(10); // Remove "OWN_FILES:"
    const files = [];
    
    if (filesData && filesData.length > 0) {
        const fileEntries = filesData.split(';').filter(f => f.trim());
        fileEntries.forEach(entry => {
            const parts = entry.split('|');
            if (parts.length >= 2) {
                files.push({
                    name: parts[0],
                    type: parts[1],
                    requestId: parts[2] || '',
                    description: parts[3] || ''
                });
            }
        });
    }
    
    if (files.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                    <polyline points="13 2 13 9 20 9"></polyline>
                </svg>
                <p>No files yet</p>
                <button class="btn btn-primary" onclick="switchView('upload')">Upload a file</button>
            </div>
        `;
    } else {
        container.innerHTML = files.map(file => `
            <div class="file-card">
                <div class="file-card-main" onclick="downloadFile('${currentUsername}', '${file.name}')">
                    <div class="file-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                            <polyline points="13 2 13 9 20 9"></polyline>
                        </svg>
                    </div>
                    <div class="file-name">${file.name}</div>
                    <span class="file-badge badge-${file.type}">${file.type}</span>
                    ${file.description ? `<div class="file-description">${file.description}</div>` : ''}
                    ${file.requestId ? `<div class="file-meta">Request: ${file.requestId}</div>` : ''}
                </div>
                <button class="delete-file-btn" onclick="event.stopPropagation(); deleteFile('${file.name}')" title="Delete file">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </button>
            </div>
        `).join('');
    }
}

function parseUserList(message) {
    const container = document.getElementById('users-container');
    
    // Parse CLIENT_LIST:user1(online),user2(offline),
    const usersData = message.substring(12); // Remove "CLIENT_LIST:"
    const users = [];
    
    if (usersData && usersData.length > 0) {
        const userEntries = usersData.split(',').filter(u => u.trim());
        userEntries.forEach(entry => {
            const match = entry.match(/(.+?)\((online|offline)\)/);
            if (match) {
                users.push({
                    name: match[1],
                    online: match[2] === 'online'
                });
            }
        });
    }
    
    container.innerHTML = users.map(user => `
        <div class="user-section" id="user-section-${user.name}">
            <div class="user-card" onclick="toggleUserFiles('${user.name}')">
                <div class="user-card-avatar">${user.name.charAt(0).toUpperCase()}</div>
                <div class="user-card-info">
                    <div class="user-card-name">${user.name}</div>
                    <div class="user-status">
                        <span class="status-dot ${user.online ? 'online' : ''}"></span>
                        ${user.online ? 'Online' : 'Offline'}
                    </div>
                </div>
                <div class="user-card-toggle">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                </div>
            </div>
            <div class="user-files-inline" id="user-files-${user.name}" style="display: none;">
                <div class="user-files-loading">Loading files...</div>
            </div>
        </div>
    `).join('');
}

function parseHistory(message) {
    const container = document.getElementById('history-container');
    
    // Parse HISTORY:file|timestamp|action|status;file2|timestamp2|action2|status2;
    const historyData = message.substring(8); // Remove "HISTORY:"
    const entries = historyData.split(';').filter(e => e.trim());
    
    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No activity yet</p></div>';
    } else {
        container.innerHTML = entries.reverse().map(entry => {
            const parts = entry.split('|');
            const fileName = parts[0] || '';
            const timestamp = parts[1] || '';
            const action = parts[2] || '';
            const status = parts[3] || '';
            
            const actionIcon = action.includes('upload') ? '⬆️' :
                              action.includes('download') ? '⬇️' :
                              action.includes('delete') ? '🗑️' : '📋';
            
            const isSuccess = status.toLowerCase().startsWith('success');
            const statusColor = isSuccess ? 'var(--success-color)' : '#ef4444';
            const borderColor = isSuccess ? 'var(--success-color)' : '#ef4444';
            
            return `
                <div style="background: var(--bg-primary); border: 1px solid var(--border-color); border-left: 3px solid ${borderColor}; border-radius: 10px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 20px;">${actionIcon}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; font-size: 14px; color: var(--text-primary);">${action}</div>
                        <div style="font-size: 13px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${fileName}</div>
                        <div style="font-size: 11px; color: var(--text-secondary); opacity: 0.7; margin-top: 2px;">${timestamp}</div>
                    </div>
                    <div style="font-size: 11px; font-weight: 600; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; color: ${statusColor}; background: ${isSuccess ? 'rgba(52,211,153,0.1)' : 'rgba(239,68,68,0.1)'}; flex-shrink: 0;">${status}</div>
                </div>
            `;
        }).join('');
    }
}

function parseMessages(message) {
    const container = document.getElementById('messages-container');
    
    // Parse MESSAGES:msg1;msg2;msg3;
    const messagesData = message.substring(9); // Remove "MESSAGES:"
    const messages = messagesData.split(';').filter(m => m.trim());
    
    if (messages.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>No unread messages</p>
            </div>
        `;
    } else {
        container.innerHTML = messages.map(msg => {
            // Check if message is a file upload notification
            const fileUploadPattern = /(.+) uploaded requested file '(.+)' \(Request ID: (.+)\)/;
            const match = msg.match(fileUploadPattern);
            
            if (match) {
                const uploader = match[1];
                const filename = match[2];
                const requestId = match[3];
                const escapedMsg = msg.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                return `
                    <div class="message-card file-upload-notification">
                        <div class="message-icon">📦</div>
                        <div class="message-content">
                            <div style="margin-bottom: 8px;">${msg}</div>
                            <div class="message-actions">
                                <button class="download-btn" onclick="downloadFromMessage('${uploader}', '${filename}', this)">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="7 10 12 15 17 10"></polyline>
                                        <line x1="12" y1="15" x2="12" y2="3"></line>
                                    </svg>
                                    Download ${filename}
                                </button>
                                <button class="delete-msg-btn" onclick="deleteMessage('${escapedMsg}')" title="Delete message">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                const escapedMsg = msg.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                return `
                    <div class="message-card">
                        <div class="message-icon">📩</div>
                        <div class="message-content">${msg}</div>
                        <button class="delete-msg-btn" onclick="deleteMessage('${escapedMsg}')" title="Delete message">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `;
            }
        }).join('');
    }
}

function parsePublicFiles(message) {
    // Parse PUBLIC_FILES:file1~desc1;file2~desc2;
    const filesData = message.substring(13); // Remove "PUBLIC_FILES:"
    const fileEntries = filesData.split(';').filter(f => f.trim());
    
    const files = fileEntries.map(entry => {
        const parts = entry.split('~');
        return { name: parts[0], description: parts.length > 1 ? parts[1] : '' };
    });
    
    const targetUser = window.currentViewedUser;
    if (!targetUser) return;
    
    // Render files inline under the user card
    const inlineContainer = document.getElementById(`user-files-${targetUser}`);
    if (!inlineContainer) return;
    
    if (files.length === 0) {
        inlineContainer.innerHTML = `
            <div class="user-files-empty">No public files</div>
        `;
    } else {
        inlineContainer.innerHTML = `
            <div class="user-files-grid">
                ${files.map(file => `
                    <div class="file-card" onclick="downloadFile('${targetUser}', '${file.name}')">
                        <div class="file-card-main">
                            <div class="file-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
                                    <polyline points="13 2 13 9 20 9"></polyline>
                                </svg>
                            </div>
                            <div class="file-name">${file.name}</div>
                            ${file.description ? `<div class="file-description">${file.description}</div>` : ''}
                            <span class="file-badge badge-public">public</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }
}

function handleDownloadStart(message) {
    // DOWNLOAD_START:filename|filesize
    const data = message.substring(15); // Remove "DOWNLOAD_START:"
    const parts = data.split('|');
    const fileName = parts[0];
    const fileSize = parseInt(parts[1]);
    
    console.log(`Download starting: ${fileName} (${fileSize} bytes)`);
    showStatus(`Downloading ${fileName}...`, 'info');
    
    // Initialize download context
    window.currentDownload = { 
        fileName, 
        fileSize, 
        received: 0,
        chunks: [] 
    };
}

function handleBinaryData(data) {
    if (!window.currentDownload) {
        console.error('Received binary data without active download');
        return;
    }
    
    const chunkData = atob(data.data); // Decode base64
    const bytes = new Uint8Array(chunkData.length);
    for (let i = 0; i < chunkData.length; i++) {
        bytes[i] = chunkData.charCodeAt(i);
    }
    
    window.currentDownload.chunks.push(bytes);
    window.currentDownload.received += bytes.length;
    
    console.log(`Download progress: ${window.currentDownload.received}/${window.currentDownload.fileSize} bytes`);
    
    // Check if download is complete
    if (window.currentDownload.received >= window.currentDownload.fileSize) {
        completeDownload();
    }
}

function completeDownload() {
    if (!window.currentDownload) return;
    
    // Combine all chunks
    const totalSize = window.currentDownload.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const fileData = new Uint8Array(totalSize);
    let offset = 0;
    
    window.currentDownload.chunks.forEach(chunk => {
        fileData.set(chunk, offset);
        offset += chunk.length;
    });
    
    // Create download link
    const blob = new Blob([fileData]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = window.currentDownload.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showStatus(`Downloaded ${window.currentDownload.fileName} successfully!`, 'success');
    console.log('Download completed:', window.currentDownload.fileName);
    
    // If download was from a message, delete that message
    if (window.pendingMessageDelete) {
        const deleteCmd = `DELETE_MESSAGE:${window.pendingMessageDelete}`;
        console.log('Deleting message after download:', deleteCmd);
        sendCommand(deleteCmd);
        window.pendingMessageDelete = null;
        
        // Refresh messages view after a short delay
        setTimeout(() => sendCommand('VIEW_MESSAGES:'), 500);
    }
    
    window.currentDownload = null;
}

function handleFileSelect() {
    const fileInput = document.getElementById('file-input');
    if (fileInput.files.length > 0) {
        selectedFile = fileInput.files[0];
        document.getElementById('upload-box').style.display = 'none';
        document.getElementById('upload-options').style.display = 'block';
    }
}

function cancelFileSelection() {
    selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('upload-box').style.display = 'block';
    document.getElementById('upload-options').style.display = 'none';
    document.getElementById('upload-description').value = '';
}

function handleFileUpload() {
    if (!selectedFile) return;
    
    const accessType = document.querySelector('input[name="access-type"]:checked').value;
    const isRequestResponse = document.getElementById('request-response').checked;
    const requestId = isRequestResponse ? document.getElementById('request-id').value : '';
    const description = document.getElementById('upload-description').value.trim();
    
    // Show progress
    document.getElementById('upload-options').style.display = 'none';
    document.getElementById('upload-progress').style.display = 'block';
    document.getElementById('upload-filename').textContent = selectedFile.name;
    
    const isPublic = accessType === 'public';
    const fileSize = selectedFile.size;
    
    // Send complete upload request: UPLOAD_REQUEST:fileName|fileSize|isPublic|requestId|description
    const uploadCommand = `UPLOAD_REQUEST:${selectedFile.name}|${fileSize}|${isPublic}|${requestId}|${description}`;
    console.log('Sending upload request:', uploadCommand);
    
    sendCommand(uploadCommand);
    
    // The uploadFileData will be called when we receive UPLOAD_APPROVED response
    // Store upload context for later
    window.pendingUpload = {
        file: selectedFile,
        isPublic: isPublic,
        requestId: requestId
    };
}

function downloadFile(owner, filename) {
    // Send DOWNLOAD_REQUEST:owner|filename
    const downloadCommand = `DOWNLOAD_REQUEST:${owner}|${filename}`;
    console.log('Requesting download:', downloadCommand);
    sendCommand(downloadCommand);
    showStatus('Download starting...', 'info');
}

window.downloadFile = downloadFile;

function downloadFromMessage(owner, filename, btnElement) {
    // Store the message text so we can delete it after download
    const messageCard = btnElement.closest('.message-card');
    const msgText = messageCard ? messageCard.querySelector('.message-content > div').textContent : null;
    
    window.pendingMessageDelete = msgText;
    
    downloadFile(owner, filename);
}

window.downloadFromMessage = downloadFromMessage;

function deleteMessage(messageText) {
    const msg = messageText.replace(/&quot;/g, '"').replace(/\\'/g, "'");
    const deleteCmd = `DELETE_MESSAGE:${msg}`;
    sendCommand(deleteCmd);
}

window.deleteMessage = deleteMessage;

function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    const deleteCommand = `DELETE_FILE:${filename}`;
    console.log('Requesting delete:', deleteCommand);
    sendCommand(deleteCommand);
}

window.deleteFile = deleteFile;

function toggleUserFiles(username) {
    const filesContainer = document.getElementById(`user-files-${username}`);
    const userSection = document.getElementById(`user-section-${username}`);
    
    if (!filesContainer) return;
    
    const isVisible = filesContainer.style.display !== 'none';
    
    if (isVisible) {
        // Collapse
        filesContainer.style.display = 'none';
        userSection.classList.remove('expanded');
    } else {
        // Expand and load files
        filesContainer.style.display = 'block';
        filesContainer.innerHTML = '<div class="user-files-loading">Loading files...</div>';
        userSection.classList.add('expanded');
        
        window.currentViewedUser = username;
        const listCommand = `LIST_PUBLIC_FILES:${username}`;
        console.log('Requesting public files for:', username);
        sendCommand(listCommand);
    }
}

window.toggleUserFiles = toggleUserFiles;

function viewUserFiles(username) {
    // Legacy - now uses inline toggle
    toggleUserFiles(username);
}

window.viewUserFiles = viewUserFiles;

function openRequestModal() {
    console.log('Opening request modal...');
    const modal = document.getElementById('modal-overlay');
    const recipientGroup = document.getElementById('recipient-group');
    
    // Show recipient input by default (unicast is default)
    if (recipientGroup) {
        recipientGroup.style.display = 'block';
    }
    
    // Clear form
    const form = document.getElementById('file-request-form');
    if (form) {
        form.reset();
    }
    
    // Show modal
    if (modal) {
        modal.classList.add('active');
        console.log('Modal opened successfully');
    } else {
        console.error('Modal overlay not found!');
    }
}

window.openRequestModal = openRequestModal;

function closeRequestModal() {
    const modal = document.getElementById('modal-overlay');
    if (modal) {
        modal.classList.remove('active');
    }
}

window.closeRequestModal = closeRequestModal;

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeRequestModal();
            }
        });
    }
});

function handleFileRequest(e) {
    e.preventDefault();
    
    const type = document.getElementById('request-type').value;
    const recipient = type === 'unicast' ? 
        document.getElementById('recipient-username').value.trim() : 'ALL';
    const description = document.getElementById('request-description').value.trim();
    
    if (!description) {
        showStatus('Please enter a file description', 'error');
        return;
    }
    
    if (type === 'unicast' && !recipient) {
        showStatus('Please enter a recipient username', 'error');
        return;
    }
    
    // Send FILE_REQUEST:description|recipient
    const requestCommand = `FILE_REQUEST:${description}|${recipient}`;
    console.log('Sending file request:', requestCommand);
    sendCommand(requestCommand);
    
    // Clear form and close modal
    document.getElementById('file-request-form').reset();
    closeRequestModal();
    
    // Show success message
    const recipientText = type === 'broadcast' ? 'all users' : recipient;
    showStatus(`File request sent to ${recipientText}!`, 'success');
}

function showStatus(message, type = 'info') {
    // Update connection status (for login screen)
    if (connectionStatus) {
        connectionStatus.innerHTML = `<div class="status-message ${type}">${message}</div>`;
    }
    
    // Show toast notification (for dashboard)
    if (mainScreen && mainScreen.classList.contains('active')) {
        showToast(message, type);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = document.createElement('div');
    icon.className = 'toast-icon';
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'i';
    
    const text = document.createElement('div');
    text.className = 'toast-message';
    text.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(text);
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

function logConsole(message) {
    serverMessages.push(message);
    const messageDiv = document.createElement('div');
    messageDiv.className = 'console-message';
    messageDiv.textContent = message;
    consoleBody.appendChild(messageDiv);
    consoleBody.scrollTop = consoleBody.scrollHeight;
    
    // Limit console messages
    if (serverMessages.length > 100) {
        serverMessages.shift();
        consoleBody.removeChild(consoleBody.firstChild);
    }
}

// Toggle console
document.getElementById('toggle-console').addEventListener('click', () => {
    const panel = document.getElementById('console-panel');
    const currentHeight = panel.style.height || '150px';
    if (currentHeight === '60px') {
        panel.style.height = '150px';
    } else {
        panel.style.height = '60px';
    }
});
