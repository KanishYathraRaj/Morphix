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
                You are a code modification assistant. Given the current webpage code and user request,
                respond ONLY with code changes in this exact format:
                ###CODE_CHANGES_START###
                OLD: <exact old code>
                NEW: <new code>
                ###CODE_CHANGES_END###
                
                Current webpage source:
                ${getPageSource()}

                User request: ${prompt}
                
                Important: 
                1. Only respond with code changes in the exact format above
                2. Make sure OLD code exactly matches existing code in the page
                3. Include complete code blocks that can be found in the page
                4. You can provide multiple OLD/NEW pairs for multiple changes
                5. Do not include any explanations or additional text
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
                
                const codeChanges = changesSection
                    .split('OLD:')
                    .filter(Boolean)
                    .map(change => {
                        const [oldCode, ...newParts] = change.split('NEW:');
                        return {
                            oldCode: oldCode.trim(),
                            newCode: newParts.join('NEW:').trim() // Handle case where NEW: appears in code
                        };
                    });
                
                console.log('Parsed code changes:', codeChanges);
                
                // Apply changes
                applyCodeChanges(codeChanges);
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
        console.log('Starting to apply code changes...');
        let pageSource = getPageSource();
        let changesApplied = false;
        
        oldNewPairs.forEach(({ oldCode, newCode }, index) => {
            // Escape special characters for regex
            const escapedOldCode = oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedOldCode, 'g');
            
            // Only apply change if old code is found
            if (pageSource.includes(oldCode)) {
                console.log(`Found match for change ${index + 1}:`, {
                    old: oldCode.substring(0, 50) + '...',
                    new: newCode.substring(0, 50) + '...'
                });
                pageSource = pageSource.replace(regex, newCode);
                changesApplied = true;
            } else {
                console.warn(`Could not find exact match for change ${index + 1}:`, 
                    oldCode.substring(0, 50) + '...');
            }
        });

        if (changesApplied) {
            console.log('Applying changes to page...');
            
            // Create a temporary container
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = pageSource;
            
            // Function to safely update an element
            const updateElement = (oldElement, newElement) => {
                // Skip if it's a script tag
                if (oldElement.tagName.toLowerCase() === 'script') {
                    return;
                }

                // Update styles
                if (newElement.style) {
                    Object.assign(oldElement.style, newElement.style);
                }

                // Update classes
                if (newElement.className) {
                    oldElement.className = newElement.className;
                }

                // Update other attributes except for event handlers
                Array.from(newElement.attributes).forEach(attr => {
                    if (!attr.name.startsWith('on')) {
                        try {
                            oldElement.setAttribute(attr.name, attr.value);
                        } catch (e) {
                            console.warn('Failed to set attribute:', attr.name, e);
                        }
                    }
                });

                // Only update content for non-form elements and if not focused
                if (!['input', 'select', 'textarea'].includes(oldElement.tagName.toLowerCase()) &&
                    !oldElement.contains(document.activeElement)) {
                    oldElement.innerHTML = newElement.innerHTML;
                }
            };

            // Update <head> content except scripts
            const oldHead = document.head;
            const newHead = tempContainer.querySelector('head');
            if (newHead) {
                Array.from(newHead.children).forEach(newChild => {
                    if (newChild.tagName.toLowerCase() !== 'script') {
                        const oldChild = oldHead.querySelector(`${newChild.tagName}[${newChild.attributes[0]?.name || ''}]`);
                        if (oldChild) {
                            updateElement(oldChild, newChild);
                        }
                    }
                });
            }

            // Update <body> content
            const oldBody = document.body;
            const newBody = tempContainer.querySelector('body');
            if (newBody) {
                // Update body attributes
                updateElement(oldBody, newBody);

                // Update direct children of body
                Array.from(newBody.children).forEach((newChild, index) => {
                    const oldChild = oldBody.children[index];
                    if (oldChild) {
                        updateElement(oldChild, newChild);
                    }
                });
            }

            console.log('Changes applied successfully');
        } else {
            console.warn('No changes were applied - no matching code found');
        }
    } catch (error) {
        console.error('Error applying code changes:', error);
        throw new Error('Failed to apply code changes');
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatElements);
} else {
    createChatElements();
} 