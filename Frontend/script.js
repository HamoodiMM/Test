// ---------- Small helpers ----------

// Shorter way to grab an element by id
function $(id) {
    return document.getElementById(id);
}

// Show a colored status message ("success" or "error")
function showMessage(element, text, type) {
    element.textContent = text;
    element.className = "message " + type;
}

function clearMessage(element) {
    element.textContent = "";
    element.className = "message";
}

// Disable a button and change its label while a request is in progress
function setLoading(button, isLoading, loadingText) {
    if (isLoading) {
        button.dataset.label = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.label;
        button.disabled = false;
    }
}

// Send JSON to the API and return { ok, data }. Network failures become a friendly error.
async function sendJson(url, body) {
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        return { ok: response.ok, data: data };
    } catch (error) {
        return { ok: false, data: { message: "Could not reach the server. Please try again." } };
    }
}


// ---------- Views ----------

// Only one card is visible at a time: "auth", "profile", "guest" or "chat"
function showView(name) {
    $("authView").hidden = name !== "auth";
    $("profileView").hidden = name !== "profile";
    $("guestView").hidden = name !== "guest";
    $("chatView").hidden = name !== "chat";

    // The chat needs more room than the small forms
    document.querySelector(".page").classList.toggle("wide", name === "chat");
}

// Switch between the "Log in" and "Create account" tabs
function showTab(name) {
    const isLogin = name === "login";

    $("loginTab").classList.toggle("active", isLogin);
    $("registerTab").classList.toggle("active", !isLogin);

    $("loginForm").hidden = !isLogin;
    $("registerForm").hidden = isLogin;
}


// ---------- Register ----------

async function register(event) {
    event.preventDefault(); // stop the browser from reloading the page on form submit

    const message = $("registerMessage");
    const button = $("registerButton");

    const email = $("registerEmail").value;

    setLoading(button, true, "Creating account...");

    const result = await sendJson("/register", {
        username: $("registerUsername").value,
        email: email,
        password: $("registerPassword").value
    });

    setLoading(button, false);

    if (!result.ok) {
        showMessage(message, result.data.message, "error");
        return;
    }

    // Success: move to the login tab with the email already filled in
    $("registerForm").reset();
    clearMessage(message);

    showTab("login");
    $("loginEmail").value = email.trim().toLowerCase();
    $("loginPassword").focus();
    showMessage($("loginMessage"), "Account created! You can log in now.", "success");
}


// ---------- Login ----------

async function login(event) {
    event.preventDefault();

    const message = $("loginMessage");
    const button = $("loginButton");

    setLoading(button, true, "Logging in...");

    const result = await sendJson("/login", {
        email: $("loginEmail").value,
        password: $("loginPassword").value
    });

    setLoading(button, false);

    if (!result.ok) {
        showMessage(message, result.data.message, "error");
        return;
    }

    // Keep the token so later requests can prove who we are
    localStorage.setItem("token", result.data.token);

    $("loginForm").reset();
    clearMessage(message);

    await loadProfile();
}


// ---------- Profile ----------

async function loadProfile() {
    const token = localStorage.getItem("token");

    if (!token) {
        showView("auth");
        return;
    }

    try {
        const response = await fetch("/profile", {
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // Token is invalid or expired: forget it and ask the user to log in again
            localStorage.removeItem("token");
            showView("auth");
            showTab("login");
            showMessage($("loginMessage"), data.message, "error");
            return;
        }

        $("profileName").textContent = data.user.username;
        $("profileEmail").textContent = data.user.email;
        $("profileAvatar").textContent = data.user.username.charAt(0).toUpperCase();
        currentUsername = data.user.username;

        showView("profile");
    } catch (error) {
        showView("auth");
        showMessage($("loginMessage"), "Could not reach the server. Please try again.", "error");
    }
}


function logout() {
    localStorage.removeItem("token");
    resetChat(); // don't leave the conversation on screen for the next person

    showView("auth");
    showTab("login");
    showMessage($("loginMessage"), "You have been logged out.", "success");
}


// ---------- Guest request ----------

function showRequestForm() {
    showView("guest");
    $("requestMessage").focus();
}


function backToLogin() {
    // Reset the guest view so it's fresh next time
    $("requestForm").reset();
    $("requestError").textContent = "";
    $("phoneError").textContent = "";
    $("requestMessage").classList.remove("invalid");
    $("requestPhone").classList.remove("invalid");
    $("guestFormContainer").hidden = false;
    $("requestSuccess").hidden = true;

    showView("auth");
}


async function submitRequest(event) {
    event.preventDefault();

    const messageInput = $("requestMessage");
    const phoneInput = $("requestPhone");
    const requestError = $("requestError");
    const phoneError = $("phoneError");

    const message = messageInput.value.trim();
    const phone = phoneInput.value.trim();

    requestError.textContent = "";
    phoneError.textContent = "";
    messageInput.classList.remove("invalid");
    phoneInput.classList.remove("invalid");


    // Quick checks in the browser for instant feedback.
    // The server validates again, because anyone can call the API directly.

    if (message.length < 10) {
        requestError.textContent = "Please describe your request using at least 10 characters.";
        messageInput.classList.add("invalid");
        return;
    }

    const phoneRegex = /^01[0125][0-9]{8}$/;

    if (!phoneRegex.test(phone)) {
        phoneError.textContent = "Please enter a valid Egyptian phone number (e.g. 01012345678).";
        phoneInput.classList.add("invalid");
        return;
    }


    // Send request to backend

    const button = $("submitRequestButton");
    setLoading(button, true, "Submitting...");

    const result = await sendJson("/requests", { message: message, phone: phone });

    setLoading(button, false);

    if (!result.ok) {
        requestError.textContent = result.data.message;
        return;
    }

    // Swap the form for the thank-you message
    $("guestFormContainer").hidden = true;
    $("requestSuccess").hidden = false;
}


// ---------- AI chat (talks to the NestJS chatbot API) ----------

// A different origin than this page (port 3001 vs 3000), so CORS applies
const CHATBOT_URL = "http://localhost:3001";

// The chat currently on screen (null = a new chat that isn't saved yet).
// Conversations are stored in MongoDB by the chatbot API, so they survive
// "New chat", page reloads and server restarts.
let currentConversationId = null;
let currentUsername = "";
let chatBusy = false;


// fetch() to the chatbot API, always sending our JWT.
// The chatbot verifies the same token the Express app issued at login.
async function chatbotRequest(path, options) {
    const response = await fetch(CHATBOT_URL + path, {
        method: (options && options.method) || "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined
    });

    // 204 No Content (after a delete) has no body to read
    const data = response.status === 204 ? null : await response.json();

    // Token missing, invalid or expired: send the user back to the login screen
    if (response.status === 401) {
        endSession(errorText(data));
    }

    return { ok: response.ok, status: response.status, data: data };
}


function endSession(message) {
    localStorage.removeItem("token");
    resetChat();
    showView("auth");
    showTab("login");
    showMessage($("loginMessage"), message || "Please log in again.", "error");
}


// Tokens → dollars. Tiny amounts need more decimals to be visible.
function formatCost(usd) {
    if (!usd) {
        return "$0";
    }
    return "$" + (usd < 0.01 ? usd.toFixed(5) : usd.toFixed(4));
}


function updateChatFooter(tokens, costUsd) {
    if (!currentConversationId) {
        $("chatTokens").textContent = "New chat";
        return;
    }

    $("chatTokens").textContent =
        tokens.toLocaleString() + " tokens · ≈ " + formatCost(costUsd) +
        " at paid-tier prices (free tier: $0)";
}


async function openChat() {
    showView("chat");
    $("chatGreeting").textContent = currentUsername
        ? "How can I help, " + currentUsername + "?"
        : "How can I help?";
    $("chatInput").focus();
    await loadConversations();
}


// Clear the screen for a new, unsaved chat (saved chats stay in the sidebar)
function resetChat() {
    currentConversationId = null;

    $("chatMessages").querySelectorAll(".msg").forEach((el) => el.remove());
    $("chatEmpty").hidden = false;
    $("chatTitle").textContent = "AI Assistant";
    updateChatFooter(0, 0);
    highlightActiveConversation();
}


function newChat() {
    resetChat();
    $("chatView").classList.remove("sidebar-open");
    $("chatInput").focus();
}


// ----- Sidebar: list, open and delete saved conversations -----

async function loadConversations() {
    try {
        const result = await chatbotRequest("/conversations");

        if (!result.ok) {
            return;
        }

        const list = $("conversationList");
        list.innerHTML = "";
        $("conversationEmpty").textContent = "No saved chats yet.";
        $("conversationEmpty").hidden = result.data.length > 0;

        result.data.forEach((conversation) => {
            const item = document.createElement("li");
            item.className = "conversation-item";
            item.dataset.id = conversation.id;

            const openButton = document.createElement("button");
            openButton.type = "button";
            openButton.className = "conversation-open";

            const title = document.createElement("span");
            title.textContent = conversation.title; // textContent: titles are user input

            const details = document.createElement("small");
            const questions = conversation.messageCount / 2; // each exchange = question + answer
            details.textContent =
                questions + (questions === 1 ? " message" : " messages") + " · " +
                new Date(conversation.updatedAt).toLocaleDateString();

            openButton.append(title, details);
            openButton.addEventListener("click", () => openConversation(conversation.id));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "conversation-delete";
            deleteButton.textContent = "✕";
            deleteButton.setAttribute("aria-label", "Delete chat");
            deleteButton.addEventListener("click", () => deleteConversation(conversation.id));

            item.append(openButton, deleteButton);
            list.appendChild(item);
        });

        highlightActiveConversation();
    } catch (error) {
        $("conversationEmpty").hidden = false;
        $("conversationEmpty").textContent = "Could not load chats. Is the chatbot server running?";
    }
}


function highlightActiveConversation() {
    document.querySelectorAll(".conversation-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.id === currentConversationId);
    });
}


async function openConversation(id) {
    try {
        const result = await chatbotRequest("/conversations/" + id);

        if (!result.ok) {
            addMessage("error", errorText(result.data));
            return;
        }

        resetChat();
        currentConversationId = id;
        $("chatTitle").textContent = result.data.title;

        result.data.messages.forEach((message) => {
            if (message.role === "user") {
                addMessage("user", message.text);
            } else {
                addMessage("bot", message.text, message.tokens + " tokens · ≈ " + formatCost(message.costUsd));
            }
        });

        updateChatFooter(result.data.totalTokens, result.data.totalCostUsd);
        highlightActiveConversation();
        $("chatView").classList.remove("sidebar-open");
    } catch (error) {
        addMessage("error", "Could not load this chat. Is the chatbot server running?");
    }
}


async function deleteConversation(id) {
    if (!confirm("Delete this chat? This cannot be undone.")) {
        return;
    }

    const result = await chatbotRequest("/conversations/" + id, { method: "DELETE" });

    if (result.ok && id === currentConversationId) {
        resetChat();
    }

    await loadConversations();
}


// ----- Messages -----

// Make text safe to put inside HTML: "<script>" becomes harmless text
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


// Light Markdown support for AI replies: ```code blocks```, `code`, **bold**, lists.
// The text is escaped FIRST, so the only HTML that ends up on the page is the tags we add.
function formatReply(text) {
    return text
        .split("```")
        .map((part, index) => {
            // Odd parts are inside ``` ... ``` (a code block)
            if (index % 2 === 1) {
                const code = part.replace(/^[\w-]*\n/, ""); // drop the language name line
                return "<pre><code>" + escapeHtml(code.trim()) + "</code></pre>";
            }

            return escapeHtml(part)
                .replace(/`([^`\n]+)`/g, "<code>$1</code>")
                .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
                .replace(/^#{1,6} (.+)$/gm, "<strong>$1</strong>")
                .replace(/^\s*[*-] (.+)$/gm, "• $1")
                .replace(/\n/g, "<br>");
        })
        .join("");
}


// Add a message bubble to the chat. type: "user" | "bot" | "error" | "typing"
function addMessage(type, text, meta) {
    $("chatEmpty").hidden = true;

    const message = document.createElement("div");
    message.className = "msg " + (type === "typing" ? "bot typing" : type);

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (type === "typing") {
        bubble.innerHTML = "<span></span><span></span><span></span>";
    } else if (type === "bot") {
        bubble.innerHTML = formatReply(text); // safe: formatReply escapes first
    } else {
        bubble.textContent = text; // user text and errors are shown exactly as typed
    }

    message.appendChild(bubble);

    if (type === "bot" || meta) {
        const actions = document.createElement("div");
        actions.className = "msg-meta msg-actions";

        if (meta) {
            const metaText = document.createElement("span");
            metaText.textContent = meta;
            actions.appendChild(metaText);
        }

        // Copy the AI's answer to the clipboard
        if (type === "bot") {
            const copyButton = document.createElement("button");
            copyButton.type = "button";
            copyButton.className = "copy-button";
            copyButton.textContent = "Copy";
            copyButton.addEventListener("click", async () => {
                await navigator.clipboard.writeText(text);
                copyButton.textContent = "Copied!";
                setTimeout(() => (copyButton.textContent = "Copy"), 1500);
            });
            actions.appendChild(copyButton);
        }

        message.appendChild(actions);
    }

    $("chatMessages").appendChild(message);
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;

    return message;
}


// Nest validation errors come back as an array of messages; others as a string
function errorText(data) {
    if (data && Array.isArray(data.message)) {
        return data.message.join(" ");
    }
    return (data && data.message) || "Something went wrong, please try again.";
}


async function sendChatMessage(text) {
    const message = text.trim();

    if (!message || chatBusy) {
        return;
    }

    chatBusy = true;
    $("chatSendButton").disabled = true;
    $("chatInput").value = "";
    resizeChatInput();

    addMessage("user", message);
    const typing = addMessage("typing");
    const startTime = performance.now();

    try {
        // The server loads this conversation's history from MongoDB and saves the new
        // exchange, so we only send the new message and which chat it belongs to.
        const result = await chatbotRequest("/chat", {
            method: "POST",
            body: {
                message: message,
                conversationId: currentConversationId || undefined
            }
        });

        typing.remove();

        if (!result.ok) {
            addMessage("error", errorText(result.data));
            return;
        }

        const data = result.data;
        const usage = data.usage;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);

        addMessage(
            "bot",
            data.reply,
            usage.totalTokens + " tokens (in " + usage.inputTokens +
            " · thinking " + usage.thinkingTokens +
            " · out " + usage.outputTokens + ") · ≈ " + formatCost(usage.costUsd) +
            " · " + seconds + "s"
        );

        currentConversationId = data.conversationId;
        $("chatTitle").textContent = data.title;
        $("chatStatus").textContent = "Powered by " + data.model;
        updateChatFooter(data.conversationTotals.tokens, data.conversationTotals.costUsd);

        // Refresh the sidebar: a new chat appears, an existing one moves to the top
        await loadConversations();
    } catch (error) {
        typing.remove();
        addMessage("error", "Could not reach the AI assistant. Is the chatbot server running on port 3001?");
    } finally {
        chatBusy = false;
        $("chatSendButton").disabled = false;
        $("chatInput").focus();
    }
}


// Grow the textarea with its content (up to the CSS max-height)
function resizeChatInput() {
    const input = $("chatInput");

    // Empty box: go back to the default CSS height (measuring an empty box can be wrong)
    if (!input.value) {
        input.style.height = "";
        return;
    }

    input.style.height = "auto";
    input.style.height = (input.scrollHeight + 2) + "px"; // +2 for the top/bottom border
}


// ---------- Wire up events ----------
// (Inline onclick="..." attributes are blocked by the Content Security Policy that Helmet sets.)

$("loginTab").addEventListener("click", () => showTab("login"));
$("registerTab").addEventListener("click", () => showTab("register"));

$("loginForm").addEventListener("submit", login);
$("registerForm").addEventListener("submit", register);
$("requestForm").addEventListener("submit", submitRequest);

$("skipButton").addEventListener("click", showRequestForm);
$("backButton").addEventListener("click", backToLogin);
$("logoutButton").addEventListener("click", logout);

$("openChatButton").addEventListener("click", openChat);
$("chatBackButton").addEventListener("click", () => showView("profile"));
$("newChatButton").addEventListener("click", newChat);
$("sidebarToggle").addEventListener("click", () => $("chatView").classList.toggle("sidebar-open"));

$("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    sendChatMessage($("chatInput").value);
});

// Enter sends, Shift+Enter adds a new line
$("chatInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendChatMessage($("chatInput").value);
    }
});

$("chatInput").addEventListener("input", resizeChatInput);

// Clicking a suggestion sends it as a message
document.querySelectorAll(".suggestion").forEach((button) => {
    button.addEventListener("click", () => sendChatMessage(button.textContent));
});

// On page load: if a token is saved from a previous visit, try to restore the session
loadProfile();
