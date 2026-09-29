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

// Only one card is visible at a time: "auth", "profile" or "guest"
function showView(name) {
    $("authView").hidden = name !== "auth";
    $("profileView").hidden = name !== "profile";
    $("guestView").hidden = name !== "guest";
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

// On page load: if a token is saved from a previous visit, try to restore the session
loadProfile();
