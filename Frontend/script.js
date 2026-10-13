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

        showView("profile");
    } catch (error) {
        showView("auth");
        showMessage($("loginMessage"), "Could not reach the server. Please try again.", "error");
    }
}


function logout() {
    localStorage.removeItem("token");
    newChat(); // don't keep the conversation around for the next person

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

// The server limits history to 20 messages (10 exchanges)
const MAX_HISTORY_MESSAGES = 20;

// The conversation so far: [{ role: "user" | "model", text: "..." }, ...]
// The Gemini API is stateless, so we send this with every message.
let chatHistory = [];
let chatTokensUsed = 0;
let chatBusy = false;


function openChat() {
    showView("chat");
    $("chatInput").focus();
}


function newChat() {
    chatHistory = [];
    chatTokensUsed = 0;
    updateTokenCounter();

    // Remove all messages but keep the welcome screen
    $("chatMessages").querySelectorAll(".msg").forEach((el) => el.remove());
    $("chatEmpty").hidden = false;
    $("chatInput").focus();
}


function updateTokenCounter() {
    $("chatTokens").textContent =
        chatTokensUsed.toLocaleString() + " tokens used in this chat";
}


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

    if (meta) {
        const metaLine = document.createElement("div");
        metaLine.className = "msg-meta";
        metaLine.textContent = meta;
        message.appendChild(metaLine);
    }

    $("chatMessages").appendChild(message);
    $("chatMessages").scrollTop = $("chatMessages").scrollHeight;

    return message;
}


// Nest validation errors come back as an array of messages; others as a string
function errorText(data) {
    if (Array.isArray(data.message)) {
        return data.message.join(" ");
    }
    return data.message || "Something went wrong, please try again.";
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
        const response = await fetch(CHATBOT_URL + "/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: message,
                history: chatHistory.slice(-MAX_HISTORY_MESSAGES)
            })
        });

        const data = await response.json();
        typing.remove();

        if (!response.ok) {
            addMessage("error", errorText(data));
            return;
        }

        // Remember this exchange so the next message has context
        chatHistory.push({ role: "user", text: message });
        chatHistory.push({ role: "model", text: data.reply });

        const seconds = ((performance.now() - startTime) / 1000).toFixed(1);
        const usage = data.usage;

        addMessage(
            "bot",
            data.reply,
            usage.totalTokens + " tokens (in " + usage.inputTokens +
            " · thinking " + usage.thinkingTokens +
            " · out " + usage.outputTokens + ") · " + seconds + "s"
        );

        chatTokensUsed += usage.totalTokens;
        updateTokenCounter();
        $("chatStatus").textContent = "Powered by " + data.model;
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
