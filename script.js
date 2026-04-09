/**
 * AI Smart Assistant - Final Production-Ready Logic
 * Includes: Intelligent Intent Detection, Persistent History, Model Fallbacks
 */

// --- CONFIGURATION ---
const HF_TOKEN = import.meta.env.VITE_HF_TOKEN;

const TEXT_API_URL = "https://router.huggingface.co/v1/chat/completions";
const TEXT_MODEL = "Qwen/Qwen3-Coder-Next:novita";
const HF_IMAGE_MODELS = [
    "black-forest-labs/FLUX.1-schnell" 
];
const IMAGE_PROVIDER = "hf-inference"; // Free provider

// --- STATE ---
let currentMode = "text"; 
let isGenerating = false;
let messageHistory = []; 

// --- DOM ELEMENTS ---
const chatHistory = document.getElementById("chat-history");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const modeToggle = document.getElementById("mode-toggle");
const modeLabel = document.getElementById("mode-label");
const textIcon = document.getElementById("text-icon");
const imageIcon = document.getElementById("image-icon");
const typingIndicator = document.getElementById("typing-indicator");
const clearChatBtn = document.getElementById("clear-chat");

// --- INTELLIGENCE ---

/**
 * Detect if the user's message implies they want an image
 */
function detectImageIntent(text) {
    const keywords = ["image", "picture", "photo", "draw", "generate", "show me", "create a picture", "pic of"];
    const lowerText = text.toLowerCase();
    return keywords.some(key => lowerText.includes(key));
}

// --- PERSISTENCE ---

function saveToStorage() {
    try {
        localStorage.setItem("ai_chat_history", JSON.stringify(messageHistory));
    } catch (e) {
        console.warn("LocalStorage full, pruning history...");
        if (messageHistory.length > 0) {
            messageHistory.shift(); 
            saveToStorage();
        }
    }
}

function loadFromStorage() {
    const saved = localStorage.getItem("ai_chat_history");
    if (saved) {
        try {
            messageHistory = JSON.parse(saved);
            chatHistory.innerHTML = ""; 
            messageHistory.forEach(msg => appendToUI(msg, false));
        } catch (e) {
            console.error("Failed to load history:", e);
            localStorage.removeItem("ai_chat_history");
        }
    }
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// --- UTILS ---

function getTimestamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function toggleMode() {
    currentMode = currentMode === "text" ? "image" : "text";
    updateModeUI();
}

function updateModeUI() {
    modeLabel.textContent = currentMode === "text" ? "Text Mode" : "Image Mode";
    textIcon.classList.toggle("hidden", currentMode === "image");
    imageIcon.classList.toggle("hidden", currentMode === "text");
    modeToggle.classList.toggle("active", currentMode === "image");
    userInput.placeholder = currentMode === "text" ? "Type your message..." : "Describe the image you want to generate...";
    userInput.focus();
}

function appendToUI(msgObj, shouldSave = true) {
    const { role, content, isImage, error, timestamp, originalPrompt } = msgObj;
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;
    const avatar = role === "user" ? "ME" : "AI";
    
    let contentHtml = "";
    if (error) {
        contentHtml = `
            <div class="error-container">
                <p style="color: #ef4444; font-weight: bold;">⚠️ ${content}</p>
                ${content.includes("Brave") ? `
                    <div style="margin-top: 10px; font-size: 0.8rem; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
                        <strong>How to fix:</strong><br>
                        1. Look at the address bar above.<br>
                        2. Click the <strong>Lion Icon (Brave Shields)</strong>.<br>
                        3. Toggle <strong>Shields DOWN</strong> for this site.
                    </div>
                ` : ""}
            </div>
        `;
    } else if (isImage) {
        contentHtml = `
            <img src="${content}" class="message-image" alt="Generated Image" onclick="window.open(this.src)">
            <div class="image-actions">
                <button class="action-btn" onclick="downloadImage('${content}')">Download</button>
                <button class="action-btn" onclick="regenerateImage('${originalPrompt}')">Regenerate</button>
            </div>
        `;
    } else {
        const formattedContent = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        contentHtml = `<p>${formattedContent}</p>`;
    }

    messageDiv.innerHTML = `
        <div class="${role === 'user' ? 'avatar' : 'bot-avatar'}">${avatar}</div>
        <div class="message-bubble">
            ${role === 'bot' && !isImage && !error ? `<button class="copy-btn" title="Copy Text" onclick="copyText(this)">Copy</button>` : ''}
            ${contentHtml}
            <span class="timestamp">${timestamp || getTimestamp()}</span>
        </div>
    `;
    
    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (shouldSave) {
        messageHistory.push({ ...msgObj, timestamp: timestamp || getTimestamp() });
        saveToStorage();
    }
}

function setLoading(loading, type = "text") {
    isGenerating = loading;
    sendBtn.disabled = loading;
    if (loading) {
        typingIndicator.classList.remove("hidden");
        typingIndicator.innerHTML = `<span></span><span></span><span></span> <small style="margin-left:8px; color:var(--text-muted)">Assistant is ${type === "text" ? "thinking" : "generating image"}...</small>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } else {
        typingIndicator.classList.add("hidden");
    }
}

// --- API FUNCTIONS ---

async function callAI(text) {
    try {
        const response = await fetch(TEXT_API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: TEXT_MODEL,
                messages: [{ role: "user", content: text }]
            })
        });
        
        const data = await response.json();
        if (response.ok) {
            return data.choices[0].message.content;
        }
        throw new Error(data.error?.message || data.error || "API Error");
    } catch (e) {
        throw new Error(e.message);
    }
}

async function generateImage(prompt) {
    let lastError = "";
    for (const model of HF_IMAGE_MODELS) {
        try {
            // Using the standard hf-inference path for free usage
            const url = `https://router.huggingface.co/hf-inference/models/${model}`;
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${HF_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ 
                    inputs: prompt 
                })
            });

            if (response.ok) {
                const blob = await response.blob();
                return await blobToBase64(blob);
            }
            
            const err = await response.json();
            lastError = err.error || err.message || "Model busy";
        } catch (e) { 
            lastError = (e.message === "Failed to fetch") 
                ? "Connectivity blocked or API unavailable. Please check your internet." 
                : e.message; 
        }
    }
    throw new Error(lastError);
}

// --- ACTIONS ---

async function sendMessage(overrideText = null) {
    const text = overrideText || userInput.value.trim();
    if (!text || isGenerating) return;

    if (!overrideText) userInput.value = "";
    
    // Auto-Mode Detection Logic
    let activeMode = currentMode;
    if (detectImageIntent(text) && currentMode === "text") {
        activeMode = "image";
        currentMode = "image";
        updateModeUI();
    }

    appendToUI({ role: "user", content: text });
    setLoading(true, activeMode);

    try {
        if (activeMode === "text") {
            const res = await callAI(text);
            appendToUI({ role: "bot", content: res });
        } else {
            const imgData = await generateImage(text);
            appendToUI({ role: "bot", content: imgData, isImage: true, originalPrompt: text });
        }
    } catch (e) {
        appendToUI({ role: "bot", content: e.message, error: true });
    } finally {
        setLoading(false);
    }
}

window.downloadImage = (dataUrl) => {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `ai-generated-${Date.now()}.png`;
    link.click();
};

window.regenerateImage = (prompt) => {
    sendMessage(prompt);
};

window.copyText = (btn) => {
    const text = btn.parentElement.querySelector('p').innerText;
    navigator.clipboard.writeText(text).then(() => {
        btn.innerText = "Copied!";
        setTimeout(() => btn.innerText = "Copy", 2000);
    });
};

// --- LISTENERS ---

sendBtn.addEventListener("click", () => sendMessage());
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") sendMessage(); });
modeToggle.addEventListener("click", toggleMode);

clearChatBtn.addEventListener("click", () => {
    if (confirm("Clear all chat history permanently?")) {
        messageHistory = [];
        localStorage.removeItem("ai_chat_history");
        chatHistory.innerHTML = `
            <div class="message bot">
                <div class="bot-avatar">AI</div>
                <div class="message-bubble"><p>History cleared.</p></div>
            </div>
        `;
    }
});

document.addEventListener("DOMContentLoaded", () => { 
    loadFromStorage(); 
    userInput.focus(); 
    console.log("Assistant Ready 🚀");
});
