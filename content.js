const API_KEY = 'AIzaSyDtRxzdQ1RLZNH2KSMtsNWP8ZKyIrtDBUo';
const RATE_LIMIT_DELAY = 1000; // 1 second between requests
let lastRequestTime = 0;

function getPageContent() {
    const title = document.title;
    const mainContent = document.body.innerText;
    const h1s = Array.from(document.getElementsByTagName('h1')).map(h1 => h1.innerText).join(' ');
    const h2s = Array.from(document.getElementsByTagName('h2')).map(h2 => h2.innerText).join(' ');
    
    return `
        Page Title: ${title}
        URL: ${window.location.href}
        Main Headings: ${h1s}
        Subheadings: ${h2s}
        
        Page Content:
        ${mainContent}
    `;
}

class ChatMemory {
    constructor(maxMessages = 10) {
        this.messages = [];
        this.maxMessages = maxMessages;
        this.pageContext = null;
        this.codeChanges = [];
    }

    initializeContext(pageContent) {
        this.pageContext = pageContent;
    }

    addMessage(role, content) {
        this.messages.push({ role, content });
        if (this.messages.length > this.maxMessages) {
            this.messages = this.messages.slice(-this.maxMessages);
        }
    }

    getConversationContext() {
        return this.messages.map(msg => 
            `${msg.role}: ${msg.content}`
        ).join('\n');
    }

    addCodeChange(oldCode, newCode) {
        this.codeChanges.push({ oldCode, newCode, timestamp: Date.now() });
    }
}

function createCodeComparisonPopup() {
    const popup = document.createElement('div');
    popup.className = 'code-comparison-popup';
    popup.innerHTML = `
        <div class="comparison-header">
            <h3>Proposed Code Changes</h3>
            <button class="close-comparison">×</button>
        </div>
        <div class="comparison-content">
            <div class="code-container">
                <div class="code-old"></div>
                <div class="code-new"></div>
            </div>
        </div>
        <div class="comparison-footer">
            <button class="apply-changes">Apply Changes</button>
            <button class="reject-changes">Reject</button>
        </div>
    `;
    return popup;
}

async function generateResponse(prompt, chatMemory) {
    const MAX_RETRIES = 3;
    let retries = 0;

    while (retries < MAX_RETRIES) {
        try {
            console.log(`Attempt ${retries + 1} of ${MAX_RETRIES}`);

            // Exponential backoff for retries
            if (retries > 0) {
                const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, retries);
                console.log(`Retry backoff: waiting ${backoffDelay}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffDelay));
            }

            // Regular rate limiting
            const now = Date.now();
            const timeSinceLastRequest = now - lastRequestTime;
            if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
                const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
                console.log(`Rate limit: waiting ${waitTime}ms`);
                await new Promise(resolve => 
                    setTimeout(resolve, waitTime)
                );
            }
            lastRequestTime = Date.now();

            console.log('Making API request...', {
                timestamp: new Date().toISOString(),
                prompt: prompt.substring(0, 50) + '...'
            });

            const fullPrompt = `
                You are a code modification expert. I will provide you with the current webpage code and a user's modification request.
                Your task is to:

                1. Analyze the entire codebase thoroughly
                2. Provide COMPLETE code changes that can be directly implemented
                3. Ensure the changes are syntactically correct and maintain functionality
                4. Include ALL necessary code including imports and dependencies
                5. Respond ONLY in this exact format:

                ###CODE_CHANGES_START###
                DESCRIPTION: <brief description of changes>
                
                FILE: <filename>
                OLD:
                <complete section of old code to be replaced>
                NEW:
                <complete section of new code that will replace it>
                
                [Repeat FILE/OLD/NEW sections for each file if multiple files need changes]
                ###CODE_CHANGES_END###

                Please ALSO be sure to provide the entire old code snippet EXACTLY in the OLD section
                so that it can be matched and replaced easily.

                Current webpage source:
                ${getPageSource()}

                User modification request: ${prompt}
            `;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: fullPrompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const data = await response.json();
            console.log('API response received:', data);

            return data.candidates[0].content.parts[0].text;

        } catch (error) {
            console.error('Error in API request:', {
                error: error.message,
                retry: retries + 1,
                maxRetries: MAX_RETRIES
            });
            
            retries++;
            if (retries === MAX_RETRIES || !error.message.includes('429')) {
                throw error;
            }
        }
    }
}

function createChatElements() {
    const chatMemory = new ChatMemory();
    
    const chatIcon = document.createElement('div');
    chatIcon.className = 'floating-chat-icon';
    chatIcon.innerHTML = `
        <svg class="chat-icon" viewBox="0 0 24 24">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
        </svg>
    `;

    const modal = document.createElement('div');
    modal.className = 'chat-modal';
    modal.innerHTML = `
        <div class="modal-header">Page Assistant</div>
        <div class="modal-content">
            <div class="bot-message message">Hello! I can help you understand this page. What would you like to know?</div>
        </div>
        <div class="chat-input-container">
            <input type="text" class="chat-input" placeholder="Ask anything about this page...">
            <button class="send-button">Send</button>
        </div>
    `;

    document.body.appendChild(chatIcon);
    document.body.appendChild(modal);

    const chatInput = modal.querySelector('.chat-input');
    const sendButton = modal.querySelector('.send-button');
    const chatContent = modal.querySelector('.modal-content');

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        try {
            const response = await generateResponse(message, chatMemory);
            console.log('Raw response:', response);
            
            if (response.includes('###CODE_CHANGES_START###')) {
                const changesSection = response
                    .split('###CODE_CHANGES_START###')[1]
                    .split('###CODE_CHANGES_END###')[0]
                    .trim();
                
                console.log('Extracted changes section:', changesSection);
                
                const codeChanges = parseCodeChanges(changesSection);
                showCodeComparison(codeChanges);
            } else {
                console.warn('No code changes found in response');
            }
        } catch (error) {
            console.error('Error:', error);
        }

        chatInput.value = '';
    }

    chatIcon.addEventListener('click', () => {
        modal.classList.toggle('active');
        if (modal.classList.contains('active') && !chatMemory.pageContext) {
            chatMemory.initializeContext(getPageContent());
        }
    });

    sendButton.addEventListener('click', sendMessage);

    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.addEventListener('click', (e) => {
        if (!modal.contains(e.target) && !chatIcon.contains(e.target)) {
            modal.classList.remove('active');
        }
    });
}

function getPageSource() {
    // This will need to be implemented via background script
    // For now, we'll use a placeholder that gets the HTML
    return document.documentElement.outerHTML;
}

function applyCodeChanges(oldNewPairs) {
    try {
        console.log('Starting to apply code changes...', oldNewPairs);
        let changesApplied = false;

        oldNewPairs.forEach(({ oldCode, newCode }, index) => {
            console.log(`Processing change ${index + 1}:`, { oldCode, newCode });
            
            // Clean up the code strings
            const cleanOldCode = oldCode.trim();
            const cleanNewCode = newCode.trim();
            
            // Enhanced element finding strategies
            const strategies = [
                // Strategy 1: Exact innerHTML match
                () => {
                    const elements = document.evaluate(
                        `//*[contains(., '${cleanOldCode}')]`,
                        document,
                        null,
                        XPathResult.ANY_TYPE,
                        null
                    );
                    return elements.iterateNext();
                },
                
                // Strategy 2: Partial content match with similarity check
                () => {
                    const elements = Array.from(document.querySelectorAll('*'));
                    return elements.find(el => {
                        const similarity = compareStrings(el.innerHTML, cleanOldCode);
                        return similarity > 0.6; // 60% similarity threshold
                    });
                },
                
                // Strategy 3: DOM traversal with fuzzy matching
                () => {
                    const walker = document.createTreeWalker(
                        document.body,
                        NodeFilter.SHOW_ELEMENT
                    );
                    let node;
                    while (node = walker.nextNode()) {
                        if (node.innerHTML.includes(cleanOldCode)) {
                            return node;
                        }
                    }
                    return null;
                }
            ];

            let targetElement = null;
            for (const strategy of strategies) {
                targetElement = strategy();
                if (targetElement) {
                    console.log('Found matching element using strategy:', targetElement);
                    break;
                }
            }
            
            if (targetElement) {
                console.log('Applying changes to element:', targetElement);
                
                // Create a mutation observer to verify changes
                const observer = new MutationObserver((mutations) => {
                    console.log('DOM changes detected:', mutations);
                });
                observer.observe(targetElement, { 
                    attributes: true, 
                    childList: true, 
                    subtree: true 
                });

                // Apply changes with error catching
                try {
                    if (cleanNewCode.includes('<')) {
                        // HTML content
                        targetElement.innerHTML = cleanNewCode;
                    } else {
                        // Plain text content
                        targetElement.textContent = cleanNewCode;
                    }
                    changesApplied = true;
                    console.log('Changes applied successfully to element');
                } catch (e) {
                    console.error('Error applying changes:', e);
                    // Fallback: try creating new element
                    const temp = document.createElement('div');
                    temp.innerHTML = cleanNewCode;
                    targetElement.parentNode.replaceChild(temp.firstElementChild, targetElement);
                }

                observer.disconnect();
            } else {
                console.warn('No matching element found for:', cleanOldCode);
            }
        });

        if (!changesApplied) {
            throw new Error('No changes were applied to the page');
        }

        showNotification('Changes applied successfully!', 'success');
        
    } catch (error) {
        console.error('Error in applyCodeChanges:', error);
        showNotification('Failed to apply changes: ' + error.message, 'error');
        throw error;
    }
}

// Helper function to compare string similarity
function compareStrings(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function editDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = str1[i - 1] === str2[j - 1] 
                ? dp[i - 1][j - 1] 
                : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
    }
    return dp[m][n];
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `extension-notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        background: ${type === 'success' ? '#4caf50' : '#f44336'};
        color: white;
        border-radius: 4px;
        z-index: 100000;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showCodeComparison(codeChanges) {
    console.log('Showing code comparison:', codeChanges);
    
    if (!codeChanges || codeChanges.length === 0) {
        console.error('No code changes to display');
        return;
    }

    const popup = createCodeComparisonPopup();
    document.body.appendChild(popup);

    const codeOld = popup.querySelector('.code-old');
    const codeNew = popup.querySelector('.code-new');
    
    // Clear existing content
    codeOld.innerHTML = '';
    codeNew.innerHTML = '';

    codeChanges.forEach(({oldCode, newCode}, index) => {
        console.log(`Displaying change ${index + 1}`);
        
        const oldDiv = document.createElement('div');
        const newDiv = document.createElement('div');
        
        oldDiv.className = 'code-section';
        newDiv.className = 'code-section';
        
        oldDiv.innerHTML = `<h4>Original Code:</h4><pre><code>${oldCode}</code></pre>`;
        newDiv.innerHTML = `<h4>New Code:</h4><pre><code>${newCode}</code></pre>`;
        
        codeOld.appendChild(oldDiv);
        codeNew.appendChild(newDiv);
    });

    // Add event listeners for buttons
    const closeButton = popup.querySelector('.close-comparison');
    const applyButton = popup.querySelector('.apply-changes');
    const rejectButton = popup.querySelector('.reject-changes');

    closeButton.addEventListener('click', () => {
        popup.remove();
    });

    applyButton.addEventListener('click', async () => {
        try {
            await applyCodeChanges(codeChanges);
            popup.remove();
        } catch (error) {
            console.error('Failed to apply changes:', error);
            showNotification('Failed to apply changes: ' + error.message, 'error');
        }
    });

    rejectButton.addEventListener('click', () => {
        popup.remove();
    });

    // Make sure popup is visible
    popup.style.display = 'flex';
    popup.classList.add('active');
}

function parseCodeChanges(changesSection) {
    console.log('Parsing changes section:', changesSection);
    const changes = [];
    const sections = changesSection.split('FILE:').filter(Boolean);
    
    console.log('Found sections:', sections.length);
    
    sections.forEach(section => {
        // Skip lines with only DESCRIPTION
        if (section.trim().startsWith('DESCRIPTION:')) {
            return;
        }
        try {
            const [filename, ...content] = section.trim().split('\n');
            const contentStr = content.join('\n');
            
            const oldStart = contentStr.indexOf('OLD:');
            const newStart = contentStr.indexOf('NEW:');
            
            if (oldStart === -1 || newStart === -1) {
                console.error('Missing OLD: or NEW: markers in section:', section);
                return;
            }
            
            const oldCode = contentStr.slice(oldStart + 4, newStart).trim();
            const newCode = contentStr.slice(newStart + 4).trim();
            
            console.log('Parsed change:', { oldCode, newCode });
            changes.push({ oldCode, newCode });
        } catch (error) {
            console.error('Error parsing section:', error);
        }
    });
    
    return changes;
}

// Add CSS for the comparison popup
const style = document.createElement('style');
style.textContent = `
    .code-comparison-popup {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 90%;
        height: 80%;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 100000;
        display: none;
        flex-direction: column;
    }
    
    .code-comparison-popup.active {
        display: flex !important;
    }
    
    .comparison-header {
        padding: 15px;
        border-bottom: 1px solid #eee;
        display: flex;
        justify-content: space-between;
    }
    
    .comparison-content {
        flex: 1;
        overflow: auto;
        display: flex;
    }
    
    .code-container {
        display: flex;
        width: 100%;
        gap: 20px;
        padding: 20px;
    }
    
    .code-old, .code-new {
        flex: 1;
        overflow: auto;
    }
    
    .code-section {
        margin-bottom: 20px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
        white-space: pre-wrap;
        font-family: monospace;
    }
    
    .code-section h4 {
        margin: 0 0 10px 0;
        color: #333;
    }
    
    .comparison-footer {
        padding: 15px;
        border-top: 1px solid #eee;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .close-comparison {
        cursor: pointer;
        border: none;
        background: none;
        font-size: 20px;
        padding: 5px 10px;
    }
    
    .apply-changes, .reject-changes {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
    }
    
    .apply-changes {
        background: #0084ff;
        color: white;
    }
    
    .reject-changes {
        background: #f44336;
        color: white;
    }
`;

document.head.appendChild(style);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatElements);
} else {
    createChatElements();
}