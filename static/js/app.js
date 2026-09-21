/**
 * AskMeAnything (AMA) - Frontend Controller
 * Features:
 * - Soft 3D Calm UI with unique 3D logo
 * - Voice Dictation via Web Speech API with live audio waves
 * - Image & Document upload with live preview
 * - Markdown parsing with tailored Skill Booster styling
 * - Text-to-Speech audio dictation playback
 * - Groq API Key management
 */

document.addEventListener('DOMContentLoaded', () => {
    // Lucide Icons initialization
    if (window.lucide) {
        lucide.createIcons();
    }

    // DOM Elements
    const chatViewport = document.getElementById('chatViewport');
    const messagesContainer = document.getElementById('messagesContainer');
    const welcomeCard = document.getElementById('welcomeCard');
    const userQueryInput = document.getElementById('userQueryInput');
    const btnSend = document.getElementById('btnSend');
    const btnClearChat = document.getElementById('btnClearChat');
    const scrollBottomBtn = document.getElementById('scrollBottomBtn');

    // Dictation Elements
    const btnToggleDictation = document.getElementById('btnToggleDictation');
    const dictationPill = document.getElementById('dictationPill');
    const dictationStatusText = document.getElementById('dictationStatusText');
    const btnStopDictation = document.getElementById('btnStopDictation');

    // Upload Elements
    const fileInput = document.getElementById('fileInput');
    const btnAttachFile = document.getElementById('btnAttachFile');
    const attachmentPill = document.getElementById('attachmentPill');
    const attachmentName = document.getElementById('attachmentName');
    const attachmentSize = document.getElementById('attachmentSize');
    const attachmentThumbnail = document.getElementById('attachmentThumbnail');
    const attachmentGenericIcon = document.getElementById('attachmentGenericIcon');
    const btnRemoveAttachment = document.getElementById('btnRemoveAttachment');
    const dropzoneOverlay = document.getElementById('dropzoneOverlay');

    // Key & Status Elements
    const apiNoticeBanner = document.getElementById('apiNoticeBanner');
    const btnOpenKeyModal = document.getElementById('btnOpenKeyModal');
    const btnSettings = document.getElementById('btnSettings');
    const keyStatusDot = document.getElementById('keyStatusDot');
    const settingsModal = document.getElementById('settingsModal');
    const btnCloseModal = document.getElementById('btnCloseModal');
    const btnCancelModal = document.getElementById('btnCancelModal');
    const btnSaveApiKey = document.getElementById('btnSaveApiKey');
    const groqApiKeyInput = document.getElementById('groqApiKeyInput');
    const btnToggleKeyEye = document.getElementById('btnToggleKeyEye');
    const eyeIcon = document.getElementById('eyeIcon');
    const modalKeyStatus = document.getElementById('modalKeyStatus');

    // State Variables
    let currentAttachment = null;
    let isProcessing = false;
    let recognition = null;
    let isDictating = false;
    let ttsSpeaking = false;

    // Check API Status on load
    checkApiStatus();

    // Setup Dictation
    initSpeechRecognition();

    // -------------------------------------------------------------
    // Auto-resize textarea
    // -------------------------------------------------------------
    userQueryInput.addEventListener('input', () => {
        userQueryInput.style.height = 'auto';
        userQueryInput.style.height = Math.min(userQueryInput.scrollHeight, 120) + 'px';
    });

    userQueryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    btnSend.addEventListener('click', sendMessage);

    // -------------------------------------------------------------
    // Starter Cards (Hero Section)
    // -------------------------------------------------------------
    document.querySelectorAll('.starter-card-3d').forEach(btn => {
        btn.addEventListener('click', () => {
            const query = btn.getAttribute('data-query');
            userQueryInput.value = query;
            sendMessage();
        });
    });

    // -------------------------------------------------------------
    // Clear Chat
    // -------------------------------------------------------------
    btnClearChat.addEventListener('click', () => {
        if (confirm('Clear the conversation?')) {
            messagesContainer.innerHTML = '';
            if (welcomeCard) {
                welcomeCard.style.display = 'block';
                messagesContainer.appendChild(welcomeCard);
            }
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
        }
    });

    // -------------------------------------------------------------
    // Scroll handling
    // -------------------------------------------------------------
    chatViewport.addEventListener('scroll', () => {
        const atBottom = chatViewport.scrollHeight - chatViewport.scrollTop <= chatViewport.clientHeight + 80;
        if (atBottom) {
            scrollBottomBtn.classList.remove('visible');
        } else {
            scrollBottomBtn.classList.add('visible');
        }
    });

    scrollBottomBtn.addEventListener('click', () => {
        chatViewport.scrollTo({
            top: chatViewport.scrollHeight,
            behavior: 'smooth'
        });
    });

    // -------------------------------------------------------------
    // File & Image Upload Handling
    // -------------------------------------------------------------
    btnAttachFile.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
            handleSelectedFile(e.target.files[0]);
        }
    });

    btnRemoveAttachment.addEventListener('click', () => {
        clearAttachment();
    });

    function handleSelectedFile(file) {
        currentAttachment = file;
        attachmentName.textContent = file.name;
        attachmentSize.textContent = formatBytes(file.size);

        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                attachmentThumbnail.src = e.target.result;
                attachmentThumbnail.style.display = 'block';
                attachmentGenericIcon.style.display = 'none';
            };
            reader.readAsDataURL(file);
        } else {
            attachmentThumbnail.style.display = 'none';
            attachmentGenericIcon.style.display = 'block';
            if (window.lucide) {
                lucide.createIcons();
            }
        }

        attachmentPill.style.display = 'flex';
        userQueryInput.focus();
    }

    function clearAttachment() {
        currentAttachment = null;
        fileInput.value = '';
        attachmentPill.style.display = 'none';
        attachmentThumbnail.src = '';
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Drag & Drop
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzoneOverlay.style.display = 'flex';
    });

    dropzoneOverlay.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null || e.relatedTarget === document.body) {
            dropzoneOverlay.style.display = 'none';
        }
    });

    dropzoneOverlay.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzoneOverlay.style.display = 'none';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleSelectedFile(e.dataTransfer.files[0]);
        }
    });

    // -------------------------------------------------------------
    // Voice Dictation (Speech to Text)
    // -------------------------------------------------------------
    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            btnToggleDictation.title = "Voice dictation not supported in this browser";
            btnToggleDictation.style.opacity = '0.5';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isDictating = true;
            btnToggleDictation.classList.add('active');
            dictationPill.style.display = 'flex';
            dictationStatusText.textContent = "Listening to your voice... Speak now";
        };

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    dictationStatusText.textContent = `Hearing: "${event.results[i][0].transcript}"`;
                }
            }
            if (finalTranscript) {
                const currentText = userQueryInput.value;
                userQueryInput.value = currentText ? `${currentText.trim()} ${finalTranscript.trim()}` : finalTranscript.trim();
                userQueryInput.style.height = 'auto';
                userQueryInput.style.height = Math.min(userQueryInput.scrollHeight, 120) + 'px';
                dictationStatusText.textContent = "Voice captured. Keep speaking or send.";
            }
        };

        recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            dictationStatusText.textContent = `Mic status: ${event.error}`;
            setTimeout(stopDictation, 2500);
        };

        recognition.onend = () => {
            if (isDictating) {
                stopDictation();
            }
        };

        btnToggleDictation.addEventListener('click', toggleDictation);
        btnStopDictation.addEventListener('click', stopDictation);
    }

    function toggleDictation() {
        if (!recognition) {
            alert('Voice dictation is not supported on this browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        if (isDictating) {
            stopDictation();
        } else {
            startDictation();
        }
    }

    function startDictation() {
        try {
            recognition.start();
        } catch (e) {
            console.error(e);
        }
    }

    function stopDictation() {
        isDictating = false;
        btnToggleDictation.classList.remove('active');
        dictationPill.style.display = 'none';
        try {
            recognition.stop();
        } catch (e) {}
    }

    // -------------------------------------------------------------
    // Send Message Flow
    // -------------------------------------------------------------
    async function sendMessage() {
        if (isProcessing) return;

        const messageText = userQueryInput.value.trim();
        const attachedFile = currentAttachment;

        if (!messageText && !attachedFile) {
            userQueryInput.focus();
            return;
        }

        // Stop dictation if active
        if (isDictating) {
            stopDictation();
        }

        // Hide welcome hero if active
        if (welcomeCard && welcomeCard.parentNode) {
            welcomeCard.style.display = 'none';
        }

        // Append User Message to Chat
        appendUserMessage(messageText, attachedFile);

        // Clear input field & attachment
        userQueryInput.value = '';
        userQueryInput.style.height = 'auto';
        clearAttachment();

        // Show typing indicator
        const typingIndicator = appendTypingIndicator();
        scrollToBottom();

        isProcessing = true;
        btnSend.disabled = true;

        const formData = new FormData();
        if (messageText) formData.append('message', messageText);
        if (attachedFile) formData.append('file', attachedFile);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();
            typingIndicator.remove();

            if (!response.ok) {
                const errMsg = data.error || 'Failed to connect to AMA.';
                const guide = data.guide ? `<br><br><em>${data.guide}</em>` : '';
                appendBotMessage(`⚠️ **Notice**: ${errMsg}${guide}`, true);
                if (data.error && data.error.includes("GROQ_API_KEY")) {
                    openKeyModal();
                }
            } else {
                appendBotMessage(data.response);
            }
        } catch (error) {
            typingIndicator.remove();
            appendBotMessage(`⚠️ **Network Error**: Unable to reach AMA backend. Please ensure the Flask server is active.`, true);
        } finally {
            isProcessing = false;
            btnSend.disabled = false;
            scrollToBottom();
            userQueryInput.focus();
        }
    }

    // -------------------------------------------------------------
    // Append User Message
    // -------------------------------------------------------------
    function appendUserMessage(text, file) {
        const row = document.createElement('div');
        row.className = 'message-row user';

        let uploadBadgeHtml = '';
        if (file) {
            const isImg = file.type.startsWith('image/');
            const iconOrThumb = isImg 
                ? `<img src="${URL.createObjectURL(file)}" alt="upload" />` 
                : `<i data-lucide="file-text"></i>`;
            uploadBadgeHtml = `
                <div class="user-upload-badge">
                    ${iconOrThumb}
                    <span>${escapeHtml(file.name)}</span>
                </div>
            `;
        }

        row.innerHTML = `
            <div class="message-avatar user">You</div>
            <div class="message-bubble-wrapper">
                <div class="message-bubble user">
                    ${uploadBadgeHtml}
                    ${text ? `<div class="user-text">${escapeHtml(text)}</div>` : ''}
                </div>
            </div>
        `;

        messagesContainer.appendChild(row);
        if (window.lucide) lucide.createIcons();
    }

    // -------------------------------------------------------------
    // Append Typing Indicator
    // -------------------------------------------------------------
    function appendTypingIndicator() {
        const row = document.createElement('div');
        row.className = 'message-row bot';
        row.id = 'typingIndicatorRow';
        row.innerHTML = `
            <div class="message-avatar bot">
                <img src="/static/img/ama_logo.png" alt="AMA" />
            </div>
            <div class="message-bubble-wrapper">
                <div class="typing-bubble">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        messagesContainer.appendChild(row);
        return row;
    }

    // -------------------------------------------------------------
    // Append Bot Message (with Unique Logo, Skill Booster & TTS)
    // -------------------------------------------------------------
    function appendBotMessage(markdownContent, isError = false) {
        const row = document.createElement('div');
        row.className = 'message-row bot';

        // Parse Skill Booster section
        const processedHtml = parseResponseWithSkillBooster(markdownContent);

        row.innerHTML = `
            <div class="message-avatar bot">
                <img src="/static/img/ama_logo.png" alt="AMA" />
            </div>
            <div class="message-bubble-wrapper">
                <div class="message-bubble bot ${isError ? 'error-state' : ''}">
                    ${processedHtml}
                </div>
                ${!isError ? `
                <div class="message-actions">
                    <button class="msg-action-btn btn-tts" title="Listen to response (Text to Speech)">
                        <i data-lucide="volume-2"></i>
                        <span>Listen</span>
                    </button>
                    <button class="msg-action-btn btn-copy" title="Copy text to clipboard">
                        <i data-lucide="copy"></i>
                        <span>Copy</span>
                    </button>
                </div>
                ` : ''}
            </div>
        `;

        messagesContainer.appendChild(row);

        // Setup TTS and Copy for this message
        const btnTts = row.querySelector('.btn-tts');
        const btnCopy = row.querySelector('.btn-copy');

        if (btnTts) {
            btnTts.addEventListener('click', () => {
                toggleTts(markdownContent, btnTts);
            });
        }

        if (btnCopy) {
            btnCopy.addEventListener('click', () => {
                navigator.clipboard.writeText(markdownContent).then(() => {
                    const span = btnCopy.querySelector('span');
                    const originalText = span.textContent;
                    span.textContent = 'Copied!';
                    setTimeout(() => span.textContent = originalText, 1800);
                });
            });
        }

        if (window.lucide) lucide.createIcons();
    }

    // -------------------------------------------------------------
    // Skill Booster Parsing
    // Extracts "### 💡 Skill Booster Tips" and renders inside signature card
    // -------------------------------------------------------------
    function parseResponseWithSkillBooster(rawMarkdown) {
        const skillPattern = /(?:###\s*(?:💡\s*)?(?:Skill Booster(?: Tips)?|Skill Upgrade|Tips to Improve Skills|Skill Tips)[\s\S]*)/i;
        const match = rawMarkdown.match(skillPattern);

        if (match) {
            const mainContent = rawMarkdown.substring(0, match.index).trim();
            const skillSection = match[0].trim();

            const mainHtml = marked.parse(mainContent);
            const cleanedSkillText = skillSection.replace(/###\s*(?:💡\s*)?(?:Skill Booster(?: Tips)?|Skill Upgrade|Tips to Improve Skills|Skill Tips)/i, '').trim();
            const skillListHtml = marked.parse(cleanedSkillText);

            return `
                <div class="main-response-text">${mainHtml}</div>
                <div class="skill-booster-card">
                    <div class="skill-booster-header">
                        <i data-lucide="sparkles"></i>
                        <span>Skill Booster Tips</span>
                    </div>
                    <div class="skill-booster-body">
                        ${skillListHtml}
                    </div>
                </div>
            `;
        }

        return marked.parse(rawMarkdown);
    }

    // -------------------------------------------------------------
    // Text to Speech
    // -------------------------------------------------------------
    function toggleTts(text, buttonEl) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis is not supported in this browser.');
            return;
        }

        if (ttsSpeaking) {
            window.speechSynthesis.cancel();
            ttsSpeaking = false;
            buttonEl.querySelector('span').textContent = 'Listen';
            buttonEl.querySelector('i').setAttribute('data-lucide', 'volume-2');
            if (window.lucide) lucide.createIcons();
            return;
        }

        const plainText = text.replace(/[*#`_~>\[\]]/g, '').trim();
        const utterance = new SpeechSynthesisUtterance(plainText);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            ttsSpeaking = true;
            buttonEl.querySelector('span').textContent = 'Stop';
            buttonEl.querySelector('i').setAttribute('data-lucide', 'volume-x');
            if (window.lucide) lucide.createIcons();
        };

        utterance.onend = utterance.onerror = () => {
            ttsSpeaking = false;
            buttonEl.querySelector('span').textContent = 'Listen';
            buttonEl.querySelector('i').setAttribute('data-lucide', 'volume-2');
            if (window.lucide) lucide.createIcons();
        };

        window.speechSynthesis.speak(utterance);
    }

    // -------------------------------------------------------------
    // API Status & Modal Handling
    // -------------------------------------------------------------
    async function checkApiStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            if (data.configured) {
                keyStatusDot.classList.remove('warning');
                apiNoticeBanner.style.display = 'none';
                modalKeyStatus.innerHTML = `✅ Groq API Key is active (<code>${data.masked_key}</code>)`;
                modalKeyStatus.style.background = '#dcfce7';
                modalKeyStatus.style.color = '#15803d';
            } else {
                keyStatusDot.classList.add('warning');
                apiNoticeBanner.style.display = 'flex';
                modalKeyStatus.innerHTML = `⚠️ No active Groq API Key found in <code>.env</code>`;
                modalKeyStatus.style.background = '#fef3c7';
                modalKeyStatus.style.color = '#92400e';
            }
        } catch (e) {
            console.error('Failed to check API status', e);
        }
    }

    btnSettings.addEventListener('click', openKeyModal);
    btnOpenKeyModal.addEventListener('click', openKeyModal);
    btnCloseModal.addEventListener('click', closeKeyModal);
    btnCancelModal.addEventListener('click', closeKeyModal);

    function openKeyModal() {
        settingsModal.style.display = 'flex';
        groqApiKeyInput.focus();
    }

    function closeKeyModal() {
        settingsModal.style.display = 'none';
        groqApiKeyInput.value = '';
    }

    btnToggleKeyEye.addEventListener('click', () => {
        if (groqApiKeyInput.type === 'password') {
            groqApiKeyInput.type = 'text';
            eyeIcon.setAttribute('data-lucide', 'eye-off');
        } else {
            groqApiKeyInput.type = 'password';
            eyeIcon.setAttribute('data-lucide', 'eye');
        }
        if (window.lucide) lucide.createIcons();
    });

    btnSaveApiKey.addEventListener('click', async () => {
        const key = groqApiKeyInput.value.trim();
        if (!key) {
            alert('Please enter a valid Groq API Key.');
            return;
        }

        btnSaveApiKey.textContent = 'Saving...';
        btnSaveApiKey.disabled = true;

        try {
            const res = await fetch('/api/save_key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groq_api_key: key })
            });
            const data = await res.json();

            if (res.ok) {
                alert('Groq API Key saved successfully to .env!');
                closeKeyModal();
                checkApiStatus();
            } else {
                alert('Error saving key: ' + (data.error || 'Unknown error'));
            }
        } catch (err) {
            alert('Network error while saving key.');
        } finally {
            btnSaveApiKey.textContent = 'Save Key to .env';
            btnSaveApiKey.disabled = false;
        }
    });

    function scrollToBottom() {
        chatViewport.scrollTop = chatViewport.scrollHeight;
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
