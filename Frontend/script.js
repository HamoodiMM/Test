// ---------- Small helpers ----------

// Shorter way to grab an element by id
function $(id) {
    return document.getElementById(id);
}

// Show a short colored status message ("success" or "error")
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


// ---------- Talking to the API ----------

// The error we show when the server can't be reached at all (no HTTP response).
// Same shape as the API's own errors, so one function can display both.
function networkError() {
    return {
        statusCode: 0,
        error: "Network Error",
        code: "NETWORK_ERROR",
        message: "Could not reach the server",
        hint: "Check that the server is running (npm run start:dev) and try again.",
        retryable: true
    };
}

// One function for every request to our NestJS API.
// Returns { ok, status, data }. `data` is the JSON body: the result, or a detailed error:
//   { statusCode, error, code, message, hint, retryable, details }
async function api(path, options) {
    const opts = options || {};
    const headers = { "Content-Type": "application/json" };

    if (opts.auth) {
        headers["Authorization"] = "Bearer " + localStorage.getItem("token");
    }

    let response;
    try {
        response = await fetch(path, {
            method: opts.method || "GET",
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined,
            signal: opts.signal // lets the chat's Stop button cancel the request
        });
    } catch (error) {
        if (error.name === "AbortError") {
            throw error; // the user pressed Stop: let the caller handle it
        }
        return { ok: false, status: 0, data: networkError() };
    }

    // 204 No Content (after a delete) has no body to read
    let data = null;
    if (response.status !== 204) {
        try {
            data = await response.json();
        } catch (error) {
            data = { statusCode: response.status, error: response.statusText, code: "BAD_RESPONSE", message: "The server sent an unexpected response", retryable: true };
        }
    }

    return { ok: response.ok, status: response.status, data: data };
}


// ---------- Displaying errors in detail ----------

// Turn an API error's `details` into readable "label: value" pairs
const DETAIL_LABELS = {
    model: "AI model",
    retryAfterSeconds: "Retry after",
    timeoutSeconds: "Timeout",
    elapsedMs: "Waited",
    providerStatus: "Google status",
    providerStatusCode: "Google HTTP code",
    quota: "Quota",
    limit: "Limit",
    limitBytes: "Max size",
    received: "Received",
    email: "Email",
    expiredAt: "Expired at",
    blockReason: "Block reason",
    finishReason: "Finish reason",
    reason: "Reason"
};

function formatSeconds(seconds) {
    if (seconds >= 3600) {
        return Math.floor(seconds / 3600) + " h " + Math.round((seconds % 3600) / 60) + " min";
    }
    if (seconds >= 60) {
        return Math.round(seconds / 60) + " min";
    }
    return seconds + " s";
}

function formatDetail(key, value) {
    if (key === "retryAfterSeconds") return formatSeconds(value);
    if (key === "timeoutSeconds") return value < 1 ? Math.round(value * 1000) + " ms" : formatSeconds(value);
    if (key === "elapsedMs") return (value / 1000).toFixed(1) + " s";
    if (key === "limitBytes") return Math.round(value / 1024) + " KB";
    if (key === "expiredAt") return new Date(value).toLocaleTimeString();
    return String(value);
}

// Build the inside of an error box (used by the forms AND the chat):
//   title line, list of problems, hint, details, and "503 Service Unavailable · AI_OVERLOADED"
function buildErrorContent(data) {
    const fragment = document.createDocumentFragment();
    const details = data.details || {};

    const title = document.createElement("strong");
    title.className = "error-title";
    title.textContent = Array.isArray(details.problems) ? "Please fix the following:" : data.message;
    fragment.appendChild(title);

    // Validation errors: one line per problem
    if (Array.isArray(details.problems)) {
        const list = document.createElement("ul");
        list.className = "error-problems";
        details.problems.forEach((problem) => {
            const item = document.createElement("li");
            item.textContent = problem;
            list.appendChild(item);
        });
        fragment.appendChild(list);
    }

    if (data.hint) {
        const hint = document.createElement("div");
        hint.className = "error-hint";
        hint.textContent = data.hint;
        fragment.appendChild(hint);
    }

    // Extra facts, e.g. "AI model: gemini-3-flash-preview · Retry after: 10 s"
    const facts = Object.keys(details)
        .filter((key) => key !== "problems" && details[key] !== undefined && details[key] !== null && DETAIL_LABELS[key])
        .map((key) => DETAIL_LABELS[key] + ": " + formatDetail(key, details[key]));

    if (facts.length > 0) {
        const factLine = document.createElement("div");
        factLine.className = "error-details";
        factLine.textContent = facts.join(" · ");
        fragment.appendChild(factLine);
    }

    // The technical identity of the error, small and muted
    const meta = document.createElement("div");
    meta.className = "error-meta";
    meta.textContent = (data.statusCode ? data.statusCode + " " : "") + (data.error || "Error") + (data.code ? " · " + data.code : "");
    fragment.appendChild(meta);

    return fragment;
}

// Show a detailed API error inside a form's message area
function showApiError(element, data) {
    element.textContent = "";
    element.className = "message error detailed";
    element.appendChild(buildErrorContent(data || networkError()));
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

    const result = await api("/register", {
        method: "POST",
        body: {
            username: $("registerUsername").value,
            email: email,
            password: $("registerPassword").value
        }
    });

    setLoading(button, false);

    if (!result.ok) {
        showApiError(message, result.data);
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

    const result = await api("/login", {
        method: "POST",
        body: {
            email: $("loginEmail").value,
            password: $("loginPassword").value
        }
    });

    setLoading(button, false);

    if (!result.ok) {
        showApiError(message, result.data);
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
    if (!localStorage.getItem("token")) {
        showView("auth");
        return;
    }

    const result = await api("/profile", { auth: true });

    if (!result.ok) {
        // Token invalid/expired, or server down: back to the login screen with the reason
        if (result.status === 401 || result.status === 404) {
            localStorage.removeItem("token");
        }
        showView("auth");
        showTab("login");
        showApiError($("loginMessage"), result.data);
        return;
    }

    const user = result.data.user;
    $("profileName").textContent = user.username;
    $("profileEmail").textContent = user.email;
    $("profileAvatar").textContent = user.username.charAt(0).toUpperCase();
    currentUsername = user.username;

    showView("profile");
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
    clearMessage($("requestServerError"));
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
    clearMessage($("requestServerError"));
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

    const result = await api("/requests", { method: "POST", body: { message: message, phone: phone } });

    setLoading(button, false);

    if (!result.ok) {
        showApiError($("requestServerError"), result.data);
        return;
    }

    // Swap the form for the thank-you message
    $("guestFormContainer").hidden = true;
    $("requestSuccess").hidden = false;
}


// ---------- AI chat ----------

// The chat currently on screen (null = a new chat that isn't saved yet).
// Conversations are stored in MongoDB by the API, so they survive
// "New chat", page reloads and server restarts.
let currentConversationId = null;
let currentUsername = "";
let currentModel = "Gemini";

// While a reply is being generated: lets the Stop button cancel the request
let chatAbortController = null;


function endSession(data) {
    localStorage.removeItem("token");
    resetChat();
    showView("auth");
    showTab("login");
    showApiError($("loginMessage"), data);
}


// Every chat request needs the token. A 401 means the session ended: go back to login.
async function chatApi(path, options) {
    const result = await api(path, Object.assign({ auth: true }, options));

    if (result.status === 401) {
        endSession(result.data);
    }
    return result;
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
    stopGenerating();
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
    const result = await chatApi("/conversations");
    const empty = $("conversationEmpty");

    if (!result.ok) {
        empty.hidden = false;
        empty.textContent = result.data.message + ". " + (result.data.hint || "");
        return;
    }

    const list = $("conversationList");
    list.innerHTML = "";
    empty.textContent = "No saved chats yet.";
    empty.hidden = result.data.length > 0;

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
}


function highlightActiveConversation() {
    document.querySelectorAll(".conversation-item").forEach((item) => {
        item.classList.toggle("active", item.dataset.id === currentConversationId);
    });
}


async function openConversation(id) {
    const result = await chatApi("/conversations/" + id);

    if (!result.ok) {
        addErrorMessage(result.data);
        return;
    }

    resetChat();
    currentConversationId = id;
    $("chatTitle").textContent = result.data.title;

    result.data.messages.forEach((message) => {
        if (message.role === "user") {
            addMessage("user", message.text);
        } else {
            addMessage(
                "bot",
                message.text,
                message.tokens + " tokens · ≈ " + formatCost(message.costUsd) + (message.model ? " · " + message.model : "")
            );
        }
    });

    updateChatFooter(result.data.totalTokens, result.data.totalCostUsd);
    highlightActiveConversation();
    $("chatView").classList.remove("sidebar-open");
}


async function deleteConversation(id) {
    if (!confirm("Delete this chat? This cannot be undone.")) {
        return;
    }

    const result = await chatApi("/conversations/" + id, { method: "DELETE" });

    if (!result.ok) {
        addErrorMessage(result.data);
        return;
    }

    if (id === currentConversationId) {
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


function scrollChatToBottom() {
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}


// Add a message bubble to the chat. type: "user" | "bot" | "info"
function addMessage(type, text, meta) {
    $("chatEmpty").hidden = true;

    const message = document.createElement("div");
    message.className = "msg " + type;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (type === "bot") {
        bubble.innerHTML = formatReply(text); // safe: formatReply escapes first
    } else {
        bubble.textContent = text; // user text is shown exactly as typed
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
    scrollChatToBottom();
    return message;
}


// A detailed error bubble. If retrying makes sense, it gets a "Try again" button.
function addErrorMessage(data, retryText) {
    $("chatEmpty").hidden = true;

    const message = document.createElement("div");
    message.className = "msg error";

    const bubble = document.createElement("div");
    bubble.className = "bubble error-card";
    bubble.appendChild(buildErrorContent(data || networkError()));

    if (data && data.retryable && retryText) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "retry-button";
        retry.textContent = "↻ Try again";
        retry.addEventListener("click", () => {
            message.remove();
            sendChatMessage(retryText, { isRetry: true });
        });
        bubble.appendChild(retry);
    }

    message.appendChild(bubble);
    $("chatMessages").appendChild(message);
    scrollChatToBottom();
    return message;
}


// ----- "Generating..." awareness -----

// What the status line says, depending on how long we've been waiting
function generatingText(seconds) {
    if (seconds < 3) return "Sending your message to " + currentModel + "...";
    if (seconds < 8) return "The AI is thinking and writing a reply...";
    if (seconds < 14) return "Still working: longer answers take more time...";
    return "This is taking longer than usual. Google may be busy; you can press Stop.";
}

// Shows the animated "typing" bubble with a status line and a live timer.
// Returns a function that removes it again.
function showGenerating() {
    const message = document.createElement("div");
    message.className = "msg bot typing";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    const status = document.createElement("div");
    status.className = "typing-status";

    bubble.append(dots, status);
    message.appendChild(bubble);
    $("chatMessages").appendChild(message);
    scrollChatToBottom();

    const startedAt = Date.now();
    const update = () => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        status.textContent = generatingText(seconds) + "  " + seconds + "s";
    };
    update();
    const timer = setInterval(update, 500);

    // Header + send button switch into "generating" mode
    $("chatStatus").textContent = "● Generating a response...";
    $("chatStatus").classList.add("generating");
    $("chatSendButton").classList.add("stop");
    $("chatSendButton").textContent = "■";
    $("chatSendButton").setAttribute("aria-label", "Stop generating");

    return () => {
        clearInterval(timer);
        message.remove();
        $("chatStatus").textContent = "Powered by " + currentModel;
        $("chatStatus").classList.remove("generating");
        $("chatSendButton").classList.remove("stop");
        $("chatSendButton").textContent = "➤";
        $("chatSendButton").setAttribute("aria-label", "Send");
    };
}

// ----- Model fallback notices -----

// The main model that was unavailable during the previous reply (null = we were on the main model)
let unavailablePrimaryModel = null;

// A small banner in the chat, e.g. "⚠ Model capacity reached ..." (type: "warning" or "success")
function addNotice(type, title, text) {
    const message = document.createElement("div");
    message.className = "msg notice " + type;

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    const strong = document.createElement("strong");
    strong.textContent = title;
    bubble.appendChild(strong);
    bubble.appendChild(document.createTextNode(" " + text));

    message.appendChild(bubble);
    $("chatMessages").appendChild(message);
    scrollChatToBottom();
}

// The server tells us in `data.fallback` when a backup model answered.
// We announce the switch once, and announce again when the main model is back.
function showModelSwitchNotice(data) {
    if (data.fallback) {
        let text = data.fallback.message;

        if (data.fallback.primaryAvailableAgainAt) {
            const backAt = new Date(data.fallback.primaryAvailableAgainAt);
            text += " " + data.fallback.from + " will be used again automatically after " +
                backAt.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) + ".";
        }

        // Only show it when something changed, not on every message while on the backup
        if (unavailablePrimaryModel !== data.fallback.from + "→" + data.fallback.to) {
            addNotice("warning", "⚠ Model capacity reached.", text);
        }
        unavailablePrimaryModel = data.fallback.from + "→" + data.fallback.to;
        return;
    }

    // No fallback this time: if the previous reply used a backup, the main model is back
    if (unavailablePrimaryModel) {
        addNotice("success", "✓ Back to the main model.", data.primaryModel + " is available again, so it's answering again.");
        unavailablePrimaryModel = null;
    }
}


// The Stop button: cancel the request we're waiting for
function stopGenerating() {
    if (chatAbortController) {
        chatAbortController.abort();
    }
}


async function sendChatMessage(text, options) {
    const message = text.trim();
    const isRetry = options && options.isRetry;

    if (!message || chatAbortController) {
        return; // empty, or a reply is already being generated
    }

    $("chatInput").value = "";
    resizeChatInput();

    if (!isRetry) {
        addMessage("user", message);
    }

    chatAbortController = new AbortController();
    const hideGenerating = showGenerating();
    const startTime = performance.now();

    try {
        // The server loads this conversation's history from MongoDB and saves the new
        // exchange, so we only send the new message and which chat it belongs to.
        const result = await chatApi("/chat", {
            method: "POST",
            body: {
                message: message,
                conversationId: currentConversationId || undefined
            },
            signal: chatAbortController.signal
        });

        hideGenerating();

        if (!result.ok) {
            if (result.status !== 401) {
                addErrorMessage(result.data, message);
            }
            return;
        }

        const data = result.data;
        const usage = data.usage;
        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);

        // Tell the user when the server switched models, and when it switched back
        showModelSwitchNotice(data);

        currentModel = data.model;
        addMessage(
            "bot",
            data.reply,
            usage.totalTokens + " tokens (in " + usage.inputTokens +
            " · thinking " + usage.thinkingTokens +
            " · out " + usage.outputTokens + ") · ≈ " + formatCost(usage.costUsd) +
            " · " + seconds + "s · " + data.model
        );

        currentConversationId = data.conversationId;
        $("chatTitle").textContent = data.title;
        $("chatStatus").textContent = "Powered by " + data.model + (data.fallback ? " (backup model)" : "");
        updateChatFooter(data.conversationTotals.tokens, data.conversationTotals.costUsd);

        // Refresh the sidebar: a new chat appears, an existing one moves to the top
        await loadConversations();
    } catch (error) {
        hideGenerating();

        if (error.name === "AbortError") {
            addMessage(
                "info",
                "You stopped waiting for this answer. The server may still finish it and save it to this chat; reopen the chat from the sidebar to check."
            );
        } else {
            addErrorMessage(networkError(), message);
        }
    } finally {
        chatAbortController = null;
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

// The send button doubles as a Stop button while a reply is being generated
$("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();

    if (chatAbortController) {
        stopGenerating();
    } else {
        sendChatMessage($("chatInput").value);
    }
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
