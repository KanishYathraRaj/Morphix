const API_KEY = 'AIzaSyDtRxzdQ1RLZNH2KSMtsNWP8ZKyIrtDBUo';
const RATE_LIMIT_DELAY = 1000; 
let lastRequestTime = 0;

function getPageContent() {
    const title = document.title;
    const mainContent = document.body.innerText;
    return `
        Page Title: ${title}
        URL: ${window.location.href}
        Content: ${mainContent}
    `;
}

async function generateResponse(prompt) {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
        const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    lastRequestTime = Date.now();

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
    return data.candidates[0].content.parts[0].text;
}

function createChatElements() {
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

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        try {
            const response = await generateResponse(message);
            
            if (response.includes('###CODE_CHANGES_START###')) {
                const changesSection = response
                    .split('###CODE_CHANGES_START###')[1]
                    .split('###CODE_CHANGES_END###')[0]
                    .trim();
                
                const codeChanges = changesSection
                    .split('OLD:')
                    .filter(Boolean)
                    .map(change => {
                        const [oldCode, ...newParts] = change.split('NEW:');
                        return {
                            oldCode: oldCode.trim(),
                            newCode: newParts.join('NEW:').trim()
                        };
                    });
                
                applyCodeChanges(codeChanges);
            }
        } catch (error) {
            console.error('Error:', error);
        }

        chatInput.value = '';
    }

    chatIcon.addEventListener('click', () => {
        modal.classList.toggle('active');
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
    return document.documentElement.outerHTML;
}

function applyCodeChanges(oldNewPairs) {
    try {
        let pageSource = getPageSource();
        
        oldNewPairs.forEach(({ oldCode, newCode }) => {
            const escapedOldCode = oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escapedOldCode, 'g');
            pageSource = pageSource.replace(regex, newCode);
        });

        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = pageSource;

        const oldBody = document.body;
        const newBody = tempContainer.querySelector('body');
        if (newBody) {
            updateElement(oldBody, newBody);
        }
    } catch (error) {
        console.error('Error applying code changes:', error);
    }
}

function updateElement(oldElement, newElement) {
    if (newElement.style) {
        Object.assign(oldElement.style, newElement.style);
    }

    if (newElement.className) {
        oldElement.className = newElement.className;
    }

    Array.from(newElement.attributes).forEach(attr => {
        if (!attr.name.startsWith('on')) {
            try {
                oldElement.setAttribute(attr.name, attr.value);
            } catch (e) {
                console.warn('Failed to set attribute:', attr.name, e);
            }
        }
    });

    if (!['input', 'select', 'textarea'].includes(oldElement.tagName.toLowerCase()) &&
        !oldElement.contains(document.activeElement)) {
        oldElement.innerHTML = newElement.innerHTML;
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatElements);
} else {
    createChatElements();
}
