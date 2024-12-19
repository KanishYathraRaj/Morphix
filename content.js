const API_KEY = 'AIzaSyDtRxzdQ1RLZNH2KSMtsNWP8ZKyIrtDBUo';

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
}

async function generateResponse(prompt, chatMemory) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const conversationHistory = chatMemory.getConversationContext();
        
        const fullPrompt = `
            You are a helpful assistant that answers questions about a webpage.
            
            Previous conversation:
            ${conversationHistory}

            Webpage Context (reference this for page-specific information):
            ${chatMemory.pageContext}

            Current User Question: ${prompt}

            Instructions: 
            1. Use the conversation history for context
            2. Reference the webpage content when needed
            3. Provide direct and concise answers
        `;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: fullPrompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1024
                }
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();
        
        if (data?.candidates?.[0]?.content?.parts?.[0]) {
            return data.candidates[0].content.parts[0].text;
        } else {
            throw new Error('Unexpected API response structure');
        }
    } catch (error) {
        console.error('Error:', error);
        if (error.name === 'AbortError') {
            return 'Sorry, the request took too long. Please try again.';
        }
        return `Sorry, I encountered an error: ${error.message}`;
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

        // Initialize page context if not done yet
        if (!chatMemory.pageContext) {
            chatMemory.initializeContext(getPageContent());
        }

        // Add user message to memory and display
        chatMemory.addMessage('User', message);
        chatContent.innerHTML += `
            <div class="user-message message">${message}</div>
        `;

        chatInput.value = '';
        chatContent.scrollTop = chatContent.scrollHeight;

        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'bot-message message';
        typingIndicator.textContent = 'Typing...';
        chatContent.appendChild(typingIndicator);

        try {
            const response = await generateResponse(message, chatMemory);
            chatMemory.addMessage('Assistant', response);
            
            chatContent.removeChild(typingIndicator);
            chatContent.innerHTML += `
                <div class="bot-message message">${response}</div>
            `;
        } catch (error) {
            chatContent.removeChild(typingIndicator);
            chatContent.innerHTML += `
                <div class="bot-message message">Sorry, I encountered an error. Please try again.</div>
            `;
        }

        chatContent.scrollTop = chatContent.scrollHeight;
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatElements);
} else {
    createChatElements();
} 