// app.js - External JavaScript for whiteboard feedback system

// Global state variables
let currentTool = 'pin';
let currentPage = null;
let currentClient = null;
let currentCommentPin = null;
let isDrawing = false;
let drawingContext = null;
let currentSourceTab = 'upload';

// Configuration
const CONFIG = {
    apiUrl: 'https://whiteboard-app-omega.vercel.app/api', // Your actual API URL
    maxFileSize: 5 * 1024 * 1024, // 5MB
    adminPassword: 'maven' // Consider moving to environment variable
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing app...');
    initializeApp();
});

function initializeApp() {
    try {
        setupFileUpload();
        loadAdminPages();
        initializeSourceTabs();
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
    }
}

function initializeSourceTabs() {
    switchSourceTab('upload');
}

// Admin panel functionality
function toggleAdmin() {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) {
        console.error('Admin panel not found');
        return;
    }

    if (adminPanel.classList.contains('active')) {
        adminPanel.classList.remove('active');
        return;
    }

    if (sessionStorage.getItem('adminAuthenticated') === 'true') {
        adminPanel.classList.add('active');
        return;
    }

    const password = prompt('Enter admin password:');
    if (password === CONFIG.adminPassword) {
        sessionStorage.setItem('adminAuthenticated', 'true');
        adminPanel.classList.add('active');
        console.log('Admin access granted');
    } else if (password !== null) {
        alert('Incorrect password');
    }
}

// Source tab management
function switchSourceTab(tabName) {
    currentSourceTab = tabName;
    
    // Update tab buttons
    document.getElementById('upload-tab').classList.remove('active', 'source-tab');
    document.getElementById('screenshot-tab').classList.remove('active', 'source-tab');
    
    const activeTab = document.getElementById(tabName + '-tab');
    if (activeTab) {
        activeTab.classList.add('active', 'source-tab');
    }
    
    // Show/hide content
    document.getElementById('upload-option').style.display = tabName === 'upload' ? 'block' : 'none';
    document.getElementById('screenshot-option').style.display = tabName === 'screenshot' ? 'block' : 'none';
    
    // Clear any existing previews/files
    if (tabName === 'upload') {
        clearScreenshotPreview();
    } else {
        clearFileUpload();
    }
}

function clearScreenshotPreview() {
    const preview = document.getElementById('screenshot-preview');
    if (preview) {
        preview.style.display = 'none';
    }
    window.selectedScreenshot = null;
}

function clearFileUpload() {
    window.selectedFile = null;
    const uploadArea = document.getElementById('file-upload');
    const preview = uploadArea.querySelector('img');
    if (preview) {
        preview.remove();
    }
}

// File upload handling
function setupFileUpload() {
    const fileUploadArea = document.getElementById('file-upload');
    const fileInput = document.getElementById('image-upload');

    if (fileUploadArea && fileInput) {
        fileUploadArea.addEventListener('click', () => fileInput.click());
        fileUploadArea.addEventListener('dragover', handleDragOver);
        fileUploadArea.addEventListener('drop', handleDrop);
        fileInput.addEventListener('change', handleFileSelect);
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files } });
    }
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        window.selectedFile = file;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const preview = document.createElement('img');
            preview.src = e.target.result;
            preview.style.maxWidth = '200px';
            preview.style.marginTop = '12px';
            preview.style.borderRadius = '8px';
            
            const uploadArea = document.getElementById('file-upload');
            const existingPreview = uploadArea.querySelector('img');
            if (existingPreview) {
                existingPreview.remove();
            }
            uploadArea.appendChild(preview);
        };
        reader.readAsDataURL(file);
    }
}

// Screenshot functionality
async function previewScreenshot() {
    const urlInput = document.getElementById('screenshot-url');
    const passwordInput = document.getElementById('screenshot-password');
    const fullPageSelect = document.getElementById('screenshot-fullpage');
    const deviceSelect = document.getElementById('screenshot-device');
    
    if (!urlInput) {
        alert('URL input not found');
        return;
    }
    
    const url = urlInput.value.trim();
    if (!url) {
        alert('Please enter a website URL');
        return;
    }
    
    const password = passwordInput ? passwordInput.value : '';
    const fullPage = fullPageSelect ? fullPageSelect.value === 'true' : true;
    const device = deviceSelect ? deviceSelect.value : 'desktop';
    
    // Get viewport based on device selection
    let viewport;
    switch(device) {
        case 'tablet':
            viewport = { width: 768, height: 1024 };
            break;
        case 'mobile':
            viewport = { width: 375, height: 667 };
            break;
        default:
            viewport = { width: 1920, height: 1080 };
    }
    
    try {
        showLoading('Taking screenshot...');
        
        const response = await fetch(`${CONFIG.apiUrl}/screenshot-test`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: url,
                password: password,
                fullPage: fullPage,
                viewport: viewport
            })
        });
        
        hideLoading();
        
        if (response.ok) {
            const result = await response.json();
            
            // Show preview
            const previewContainer = document.getElementById('screenshot-preview');
            const previewImg = document.getElementById('screenshot-preview-img');
            
            if (previewContainer && previewImg) {
                previewImg.src = result.imageData;
                previewContainer.style.display = 'block';
                
                // Store the screenshot data for upload
                window.selectedScreenshot = result.imageData;
                
                console.log('Screenshot preview loaded:', result.size);
            }
        } else {
            const error = await response.json();
            if (response.status === 401) {
                alert('This site requires a password. Please enter the password and try again.');
            } else {
                alert('Screenshot failed: ' + (error.message || error.error));
            }
        }
        
    } catch (error) {
        hideLoading();
        console.error('Screenshot error:', error);
        alert('Failed to take screenshot: ' + error.message);
    }
}

// Upload functionality
async function uploadPage() {
    console.log('Upload function called');
    
    try {
        // Get all form elements with defensive checking
        const clientNameEl = document.getElementById('client-name');
        const pageNameEl = document.getElementById('page-name');
        const versionEl = document.getElementById('page-version');
        const pageUrlEl = document.getElementById('page-url');
        const passwordEl = document.getElementById('page-access-password');

        console.log('Form elements found:', {
            clientName: !!clientNameEl,
            pageName: !!pageNameEl,
            version: !!versionEl,
            pageUrl: !!pageUrlEl,
            password: !!passwordEl
        });

        // Check if all required elements exist
        if (!clientNameEl || !pageNameEl || !versionEl) {
            console.error('Required form fields not found');
            alert('Error: Required form fields not found');
            return;
        }

        // Get values
        const clientName = clientNameEl.value.trim();
        const pageName = pageNameEl.value.trim();
        const version = versionEl.value.trim();
        let pageUrl = pageUrlEl ? pageUrlEl.value.trim() : '';
        const password = passwordEl ? passwordEl.value : '';

        // Auto-add https:// to URL
        if (pageUrl && !pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) {
            pageUrl = 'https://' + pageUrl;
        }

        console.log('Form values:', { clientName, pageName, version, pageUrl, hasPassword: !!password });

        // Validation
        if (!clientName || !pageName || !version) {
            alert('Please fill in Client Name, Page Name, and Version');
            return;
        }

        let imageData = null;

        // Check source type and get image data accordingly
        if (currentSourceTab === 'upload') {
            if (!window.selectedFile) {
                alert('Please select an image file');
                return;
            }

            // Check file size
            if (window.selectedFile.size > CONFIG.maxFileSize) {
                alert('File size must be less than 5MB. Please choose a smaller image or compress it.');
                return;
            }

            console.log('Using uploaded file...');
            imageData = await fileToBase64(window.selectedFile);
        } else if (currentSourceTab === 'screenshot') {
            if (!window.selectedScreenshot) {
                alert('Please take a screenshot preview first');
                return;
            }

            console.log('Using screenshot data...');
            imageData = window.selectedScreenshot;
        } else {
            alert('Please select an image source (upload or screenshot)');
            return;
        }

        console.log('Starting upload process...');
        showLoading('Uploading page...');

        // Send to API
        const response = await fetch(`${CONFIG.apiUrl}/pages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                clientName,
                pageName,
                version,
                pageUrl,
                password,
                imageData
            })
        });

        console.log('API response received, status:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log('Upload successful:', result);
            hideLoading();
            alert('Page uploaded successfully!');
            clearUploadForm();
            loadAdminPages();
        } else {
            const errorText = await response.text();
            console.error('Upload failed:', response.status, errorText);
            hideLoading();
            alert('Upload failed: ' + response.status + ' - ' + errorText);
        }

    } catch (error) {
        console.error('Upload error:', error);
        hideLoading();
        alert('Upload error: ' + error.message);
    }
}

// Utility functions
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showLoading(text = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const loadingText = overlay.querySelector('.loading-text');
    if (loadingText) {
        loadingText.textContent = text;
    }
    overlay.classList.add('active');
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.remove('active');
}

function clearUploadForm() {
    const elements = {
        'client-name': '',
        'page-name': '',
        'page-version': '1.0',
        'page-url': '',
        'page-access-password': '',
        'screenshot-url': '',
        'screenshot-password': ''
    };

    Object.keys(elements).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.value = elements[id];
        }
    });

    // Clear upload state
    window.selectedFile = null;
    window.selectedScreenshot = null;
    
    // Clear upload preview
    const uploadArea = document.getElementById('file-upload');
    const preview = uploadArea.querySelector('img');
    if (preview) {
        preview.remove();
    }
    
    // Clear screenshot preview
    clearScreenshotPreview();
    
    // Reset to upload tab
    switchSourceTab('upload');
}

// Admin pages management
async function loadAdminPages() {
    try {
        const response = await fetch(`${CONFIG.apiUrl}/pages`);
        const pages = await response.json();
        const pagesList = document.getElementById('admin-pages-list');
        
        if (!pagesList) return;

        if (pages.length === 0) {
            pagesList.innerHTML = '<p style="color: #6b7280;">No pages uploaded yet.</p>';
            return;
        }

        // Group pages by client
        const groupedPages = {};
        pages.forEach(page => {
            const clientName = page.client_name || 'Unknown Client';
            if (!groupedPages[clientName]) {
                groupedPages[clientName] = [];
            }
            groupedPages[clientName].push(page);
        });

        // Sort clients alphabetically
        const sortedClients = Object.keys(groupedPages).sort();

        let html = '';
        sortedClients.forEach(clientName => {
            const clientPages = groupedPages[clientName];
            html += `
                <div class="client-group">
                    <div class="client-header" onclick="toggleClientGroup('${clientName}')">
                        <div>
                            <span class="client-name-header">${clientName}</span>
                            <span class="client-count">(${clientPages.length} pages)</span>
                        </div>
                        <span class="expand-icon" id="icon-${clientName}">▶</span>
                    </div>
                    <div class="client-pages" id="pages-${clientName}">
            `;
            
            clientPages.forEach(page => {
                const hasPassword = page.password_hash ? '🔒' : '🔓';
                const hasUrl = page.page_url ? `<a href="${page.page_url}" target="_blank">🔗 View Live</a>` : '';
                
                html += `
                    <div class="page-item">
                        <div class="page-info">
                            <div class="page-name">${page.name} (${page.version})</div>
                            <div class="page-details">
                                Created: ${new Date(page.created_at).toLocaleDateString()}
                                ${page.page_url ? `• URL: ${page.page_url}` : ''}
                            </div>
                        </div>
                        <div class="page-actions">
                            ${hasUrl}
                            <span class="password-indicator">${hasPassword}</span>
                            <button class="btn btn-danger" onclick="deletePage(${page.id})" style="padding: 4px 8px; font-size: 12px;">Delete</button>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });

        pagesList.innerHTML = html;
        console.log('Admin pages loaded successfully');
        
    } catch (error) {
        console.error('Error loading admin pages:', error);
        const pagesList = document.getElementById('admin-pages-list');
        if (pagesList) {
            pagesList.innerHTML = '<p style="color: #ef4444;">Error loading pages</p>';
        }
    }
}

function toggleClientGroup(clientName) {
    const pagesDiv = document.getElementById(`pages-${clientName}`);
    const iconDiv = document.getElementById(`icon-${clientName}`);
    const headerDiv = pagesDiv.previousElementSibling;
    
    if (pagesDiv.classList.contains('expanded')) {
        pagesDiv.classList.remove('expanded');
        iconDiv.classList.remove('expanded');
        headerDiv.classList.remove('expanded');
        iconDiv.textContent = '▶';
    } else {
        pagesDiv.classList.add('expanded');
        iconDiv.classList.add('expanded');
        headerDiv.classList.add('expanded');
        iconDiv.textContent = '▼';
    }
}

async function deletePage(pageId) {
    if (!confirm('Are you sure you want to delete this page?')) {
        return;
    }

    try {
        showLoading('Deleting page...');
        
        // For now, show a helpful message since we haven't implemented the delete API yet
        hideLoading();
        alert('Delete functionality will be available once the delete API endpoint is created. The page data is safely stored in your database.');
        
        // Uncomment this when you create the delete API endpoint:
        /*
        const response = await fetch(`${CONFIG.apiUrl}/pages/${pageId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            hideLoading();
            alert('Page deleted successfully');
            loadAdminPages();
        } else {
            hideLoading();
            alert('Failed to delete page');
        }
        */
        
    } catch (error) {
        console.error('Delete error:', error);
        hideLoading();
        alert('Error deleting page: ' + error.message);
    }
}

// Client dashboard functionality
async function loadClientDashboard() {
    const clientInput = document.getElementById('client-access');
    if (!clientInput) {
        console.error('Client access input not found');
        return;
    }

    const clientName = clientInput.value.trim().toLowerCase();
    console.log('Loading dashboard for client:', clientName);

    if (!clientName) {
        alert('Please enter your client name');
        return;
    }

    try {
        showLoading('Loading your dashboard...');
        
        const response = await fetch(`${CONFIG.apiUrl}/pages`);
        const allPages = await response.json();
        
        console.log('All pages loaded:', allPages.length);

        // Filter pages for this client (case-insensitive)
        const clientPages = allPages.filter(page => 
            page.client_name && page.client_name.toLowerCase() === clientName
        );

        console.log('Client pages found:', clientPages.length);

        if (clientPages.length === 0) {
            hideLoading();
            
            // Show available clients for debugging
            const availableClients = [...new Set(allPages.map(p => p.client_name))];
            console.log('Available clients:', availableClients);
            
            alert(`No pages found for "${clientInput.value}". Available clients: ${availableClients.join(', ')}`);
            return;
        }

        currentClient = clientName;
        displayClientDashboard(clientInput.value, clientPages);
        hideLoading();
        
    } catch (error) {
        console.error('Error loading client dashboard:', error);
        hideLoading();
        alert('Error loading dashboard: ' + error.message);
    }
}

function displayClientDashboard(displayName, pages) {
    const clientSelector = document.querySelector('.client-selector');
    const clientDashboard = document.getElementById('client-dashboard');
    const clientDisplayName = document.getElementById('client-display-name');
    const clientInfo = document.getElementById('client-info');
    const pagesGrid = document.getElementById('pages-grid');

    if (clientSelector) clientSelector.style.display = 'none';
    if (clientDashboard) clientDashboard.style.display = 'block';
    if (clientDisplayName) clientDisplayName.textContent = displayName;
    if (clientInfo) clientInfo.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'} available for review`;

    if (pagesGrid) {
        let html = '';
        pages.forEach(page => {
            const status = getPageStatus(page);
            const statusClass = status.toLowerCase().replace(/\s+/g, '-');
            const livePageLink = page.page_url ? 
                `<div class="page-live-link">
                    <a href="${page.page_url}" target="_blank" onclick="event.stopPropagation()">🔗 View Live Page</a>
                </div>` : '';
            
            html += `
                <div class="page-card ${statusClass}" onclick="openPage('${page.client_name}', '${page.name}', '${page.version}')">
                    <div class="page-title">${page.name}</div>
                    <div class="page-version">Version ${page.version}</div>
                    ${livePageLink}
                    <div class="page-status">
                        <span class="status-indicator status-${statusClass}">${status}</span>
                    </div>
                    <div class="page-date">Uploaded ${new Date(page.created_at).toLocaleDateString()}</div>
                </div>
            `;
        });
        pagesGrid.innerHTML = html;
    }
}

function getPageStatus(page) {
    const statusKey = `${page.client_name.toLowerCase()}_${page.name}_${page.version}_status`;
    const status = localStorage.getItem(statusKey);
    
    if (status === 'completed') return 'COMPLETED';
    if (status === 'viewed') return 'VIEWED';
    return 'NOT VIEWED';
}

function setPageStatus(clientName, pageName, version, status) {
    const statusKey = `${clientName.toLowerCase()}_${pageName}_${version}_status`;
    localStorage.setItem(statusKey, status);
}

async function openPage(clientName, pageName, version) {
    try {
        showLoading('Loading page...');
        
        const response = await fetch(`${CONFIG.apiUrl}/pages`);
        const allPages = await response.json();
        
        // Find the specific page
        const page = allPages.find(p => 
            p.client_name.toLowerCase() === clientName.toLowerCase() && 
            p.name === pageName && 
            p.version === version
        );

        if (!page) {
            hideLoading();
            alert('Page not found');
            return;
        }

        // Check password protection
        if (page.password_hash && page.password_hash.trim() !== '') {
            const password = prompt('This page is password protected. Please enter the password:');
            if (!password || password !== page.password_hash) {
                hideLoading();
                alert('Incorrect password');
                return;
            }
        }

        currentPage = page;
        setPageStatus(clientName, pageName, version, 'viewed');
        displayPageViewer(page);
        hideLoading();
        
    } catch (error) {
        console.error('Error opening page:', error);
        hideLoading();
        alert('Error opening page: ' + error.message);
    }
}

function displayPageViewer(page) {
    const clientDashboard = document.getElementById('client-dashboard');
    const pageViewer = document.getElementById('page-viewer');
    const pageImage = document.getElementById('page-image');
    const liveUrlBtn = document.getElementById('live-url-btn');
    const passwordDisplay = document.getElementById('page-password-display');
    const passwordText = document.getElementById('password-text');

    if (clientDashboard) clientDashboard.style.display = 'none';
    if (pageViewer) pageViewer.style.display = 'block';
    
    // Show/hide live URL button
    if (liveUrlBtn) {
        if (page.page_url) {
            liveUrlBtn.style.display = 'inline-block';
        } else {
            liveUrlBtn.style.display = 'none';
        }
    }
    
    // Show/hide password display
    if (passwordDisplay && passwordText) {
        if (page.password_hash && page.password_hash.trim() !== '') {
            passwordDisplay.style.display = 'inline-block';
            passwordText.textContent = page.password_hash;
        } else {
            passwordDisplay.style.display = 'none';
        }
    }
    
    if (pageImage) {
        pageImage.src = page.image_data;
        pageImage.onload = () => {
            setupWhiteboard();
            loadComments();
            loadVersions();
        };
    }
}

// Whiteboard functionality
function setupWhiteboard() {
    const pageImage = document.getElementById('page-image');
    const canvas = document.getElementById('drawing-canvas');
    const overlay = document.getElementById('image-overlay');

    if (!pageImage || !canvas || !overlay) return;

    // Set canvas dimensions to match image
    canvas.width = pageImage.offsetWidth;
    canvas.height = pageImage.offsetHeight;
    canvas.style.width = pageImage.offsetWidth + 'px';
    canvas.style.height = pageImage.offsetHeight + 'px';

    drawingContext = canvas.getContext('2d');

    // Clear existing event listeners
    const newOverlay = overlay.cloneNode(true);
    overlay.parentNode.replaceChild(newOverlay, overlay);

    // Add click handler for pins
    newOverlay.addEventListener('click', handleOverlayClick);
    
    // Add drawing handlers
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
}

function handleOverlayClick(e) {
    if (currentTool !== 'pin') return;

    const rect = e.target.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    openCommentModal(x, y);
}

function startDrawing(e) {
    if (currentTool !== 'draw') return;
    
    isDrawing = true;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingContext.beginPath();
    drawingContext.moveTo(x, y);
}

function draw(e) {
    if (!isDrawing || currentTool !== 'draw') return;

    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawingContext.lineWidth = 3;
    drawingContext.lineCap = 'round';
    drawingContext.strokeStyle = '#ef4444';
    drawingContext.lineTo(x, y);
    drawingContext.stroke();
    drawingContext.beginPath();
    drawingContext.moveTo(x, y);
}

function stopDrawing() {
    isDrawing = false;
    drawingContext.beginPath();
}

function handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        e.target.dispatchEvent(mouseEvent);
    }
}

function handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length > 0) {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        e.target.dispatchEvent(mouseEvent);
    }
}

function selectTool(tool) {
    currentTool = tool;
    
    // Update button states
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const toolBtn = document.getElementById(tool + '-tool');
    if (toolBtn) {
        toolBtn.classList.add('active');
    }

    // Update canvas and overlay states
    const canvas = document.getElementById('drawing-canvas');
    const overlay = document.getElementById('image-overlay');

    if (tool === 'draw') {
        if (canvas) canvas.classList.add('active');
        if (overlay) overlay.classList.remove('active');
    } else {
        if (canvas) canvas.classList.remove('active');
        if (overlay) overlay.classList.add('active');
    }
}

function clearDrawing() {
    const canvas = document.getElementById('drawing-canvas');
    if (canvas && drawingContext) {
        drawingContext.clearRect(0, 0, canvas.width, canvas.height);
    }
}

// Comment functionality
function openCommentModal(x, y) {
    const modal = document.getElementById('comment-modal');
    const commentText = document.getElementById('comment-text');
    const deleteBtn = document.getElementById('delete-comment-btn');

    if (modal) modal.classList.add('active');
    if (commentText) commentText.value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';

    currentCommentPin = { x, y, isNew: true };
}

function closeCommentModal() {
    const modal = document.getElementById('comment-modal');
    if (modal) modal.classList.remove('active');
    currentCommentPin = null;
}

function saveComment() {
    const commentText = document.getElementById('comment-text');
    if (!commentText || !currentCommentPin || !currentPage) return;

    const text = commentText.value.trim();
    if (!text) {
        alert('Please enter a comment');
        return;
    }

    const comment = {
        id: Date.now(),
        x: currentCommentPin.x,
        y: currentCommentPin.y,
        text: text,
        client: currentPage.client_name,
        page: currentPage.name,
        version: currentPage.version,
        timestamp: new Date().toISOString()
    };

    // Save to localStorage
    const commentsKey = `comments_${currentPage.client_name.toLowerCase()}_${currentPage.name}_${currentPage.version}`;
    const existingComments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    existingComments.push(comment);
    localStorage.setItem(commentsKey, JSON.stringify(existingComments));

    closeCommentModal();
    loadComments();
}

function loadComments() {
    if (!currentPage) return;

    const commentsKey = `comments_${currentPage.client_name.toLowerCase()}_${currentPage.name}_${currentPage.version}`;
    const comments = JSON.parse(localStorage.getItem(commentsKey) || '[]');

    // Clear existing pins
    document.querySelectorAll('.pin').forEach(pin => pin.remove());

    // Create pins for comments
    const overlay = document.getElementById('image-overlay');
    if (!overlay) return;

    comments.forEach(comment => {
        const pin = document.createElement('div');
        pin.className = 'pin';
        pin.style.left = comment.x + '%';
        pin.style.top = comment.y + '%';
        pin.onclick = (e) => {
            e.stopPropagation();
            editComment(comment);
        };
        overlay.appendChild(pin);
    });

    // Update comments list
    displayCommentsList(comments);
}

function displayCommentsList(comments) {
    const commentsList = document.getElementById('comments-list');
    if (!commentsList) return;

    if (comments.length === 0) {
        commentsList.innerHTML = '<p style="color: #6b7280;">No comments yet. Click on the image to add feedback.</p>';
        return;
    }

    let html = '';
    comments.forEach(comment => {
        html += `
            <div class="comment">
                <div class="comment-meta">
                    Version ${comment.version} • ${new Date(comment.timestamp).toLocaleDateString()}
                </div>
                <div>${comment.text}</div>
                <div class="comment-actions">
                    <button onclick="editComment(${JSON.stringify(comment).replace(/"/g, '&quot;')})" class="btn btn-secondary">Edit</button>
                    <button onclick="deleteCommentById(${comment.id})" class="btn btn-danger">Delete</button>
                </div>
            </div>
        `;
    });
    commentsList.innerHTML = html;
}

function editComment(comment) {
    const modal = document.getElementById('comment-modal');
    const commentText = document.getElementById('comment-text');
    const deleteBtn = document.getElementById('delete-comment-btn');

    if (modal) modal.classList.add('active');
    if (commentText) commentText.value = comment.text;
    if (deleteBtn) deleteBtn.style.display = 'block';

    currentCommentPin = { 
        x: comment.x, 
        y: comment.y, 
        id: comment.id, 
        isNew: false 
    };
}

function deleteComment() {
    if (!currentCommentPin || !currentPage) return;

    if (!confirm('Are you sure you want to delete this comment?')) return;

    deleteCommentById(currentCommentPin.id);
    closeCommentModal();
}

function deleteCommentById(commentId) {
    if (!currentPage) return;

    const commentsKey = `comments_${currentPage.client_name.toLowerCase()}_${currentPage.name}_${currentPage.version}`;
    const comments = JSON.parse(localStorage.getItem(commentsKey) || '[]');
    const filteredComments = comments.filter(c => c.id !== commentId);
    localStorage.setItem(commentsKey, JSON.stringify(filteredComments));

    loadComments();
}

function loadVersions() {
    // This would load different versions of the same page
    // For now, just show current version
    const versionSelector = document.getElementById('version-selector');
    if (versionSelector && currentPage) {
        versionSelector.innerHTML = `<option value="${currentPage.version}" selected>Version ${currentPage.version}</option>`;
    }
}

function loadVersion() {
    // Implementation for loading different versions
    console.log('Load version functionality would go here');
}

function markAsCompleted() {
    if (!currentPage) return;

    setPageStatus(currentPage.client_name, currentPage.name, currentPage.version, 'completed');
    alert('Page marked as completed!');

    const completeBtn = document.getElementById('complete-btn');
    if (completeBtn) {
        completeBtn.textContent = '✓ Completed';
        completeBtn.disabled = true;
    }
}

function backToDashboard() {
    const clientDashboard = document.getElementById('client-dashboard');
    const pageViewer = document.getElementById('page-viewer');

    if (clientDashboard) clientDashboard.style.display = 'block';
    if (pageViewer) pageViewer.style.display = 'none';

    // Refresh the dashboard to show updated status
    if (currentClient) {
        loadClientDashboard();
    }
}

function openLiveUrl() {
    if (currentPage && currentPage.page_url) {
        window.open(currentPage.page_url, '_blank');
    }
}
