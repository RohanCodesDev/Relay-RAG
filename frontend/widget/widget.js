(function() {
    // Inject Josefin Sans Font
    const font = document.createElement('link');
    font.href = 'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600&display=swap';
    font.rel = 'stylesheet';
    document.head.appendChild(font);

    // Get configuration from script tag
    const currentScript = document.currentScript;
    const tenantId = currentScript.getAttribute('data-tenant-id') || 'demo_tenant';
    const apiUrl = currentScript.getAttribute('data-api-url') || 'http://localhost:8000';
    
    // Generate Session ID
    const sessionId = crypto.randomUUID();

    // Inject CSS
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = 'widget.css'; 
    document.head.appendChild(style);

    // Create Widget Container
    const container = document.createElement('div');
    container.id = 'relay-chat-widget';
    
    // SVG Icons
    const chatIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`;
    const closeIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    const sendIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;

    container.innerHTML = `
        <div id="relay-chat-window">
            <div id="relay-chat-header">
                <span>AI Assistant</span>
                <button id="relay-chat-close" style="background:none;border:none;cursor:pointer;color:inherit">${closeIcon}</button>
            </div>
            <div id="relay-chat-messages"></div>
            <div id="relay-chat-input-container">
                <input type="text" id="relay-chat-input" placeholder="Ask a question..." autocomplete="off" />
                <button id="relay-chat-submit">${sendIcon}</button>
            </div>
        </div>
        <button id="relay-chat-button">
            ${chatIcon}
        </button>
    `;
    document.body.appendChild(container);

    // Elements
    const chatButton = document.getElementById('relay-chat-button');
    const closeButton = document.getElementById('relay-chat-close');
    const chatWindow = document.getElementById('relay-chat-window');
    const messagesContainer = document.getElementById('relay-chat-messages');
    const inputField = document.getElementById('relay-chat-input');
    const submitButton = document.getElementById('relay-chat-submit');

    // Toggle logic
    let isOpen = false;
    const toggleChat = () => {
        isOpen = !isOpen;
        if (isOpen) {
            chatWindow.classList.add('relay-open');
            chatButton.innerHTML = closeIcon;
            inputField.focus();
        } else {
            chatWindow.classList.remove('relay-open');
            chatButton.innerHTML = chatIcon;
        }
    };

    chatButton.addEventListener('click', toggleChat);
    closeButton.addEventListener('click', toggleChat);

    // Add Message to UI
    const appendMessage = (role, content) => {
        const msgDiv = document.createElement('div');
        msgDiv.className = `relay-message ${role}`;
        msgDiv.innerHTML = content.replace(/\n/g, '<br>');
        messagesContainer.appendChild(msgDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        return msgDiv;
    };

    // Handle Submit
    const handleSubmit = async () => {
        const text = inputField.value.trim();
        if (!text) return;

        appendMessage('user', text);
        inputField.value = '';
        inputField.disabled = true;
        submitButton.disabled = true;

        const assistantMsgDiv = appendMessage('assistant', '<div class="typing-indicator" style="opacity:0.5;font-size:12px">Thinking...</div>');
        
        try {
            const response = await fetch(`${apiUrl}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tenant-ID': tenantId
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    message: text
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                assistantMsgDiv.innerHTML = `Error: ${errorData.detail || response.statusText}`;
                return;
            }

            assistantMsgDiv.innerHTML = '';
            
            // Read SSE Stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep the last incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        if (dataStr === '[DONE]') break;
                        
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.text) {
                                // Append text and autoscroll
                                assistantMsgDiv.innerHTML += data.text.replace(/\n/g, '<br>');
                                messagesContainer.scrollTop = messagesContainer.scrollHeight;
                            }
                        } catch (e) {
                            console.error('Error parsing SSE data', e);
                        }
                    }
                }
            }
        } catch (error) {
            assistantMsgDiv.innerHTML = "Failed to connect to the server.";
        } finally {
            inputField.disabled = false;
            submitButton.disabled = false;
            inputField.focus();
        }
    };

    submitButton.addEventListener('click', handleSubmit);
    inputField.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSubmit();
    });
})();
