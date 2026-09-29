async function register() {
    const username = document.getElementById("registerUsername").value;
    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;

    const response = await fetch("/register", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: username,
            email: email,
            password: password
        })
    });

    const data = await response.json();

    document.getElementById("registerMessage").textContent = data.message;
}


async function login() {
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    const response = await fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: email,
            password: password
        })
    });

    const data = await response.json();

    if (response.ok) {
        // Keep the token so later requests can prove who we are
        localStorage.setItem("token", data.token);
    }

    document.getElementById("loginMessage").textContent = data.message;
}


async function loadProfile() {
    const profileMessage = document.getElementById("profileMessage");
    const token = localStorage.getItem("token");

    if (!token) {
        profileMessage.textContent = "You are not logged in.";
        return;
    }

    const response = await fetch("/profile", {
        headers: {
            "Authorization": "Bearer " + token
        }
    });

    const data = await response.json();

    if (!response.ok) {
        profileMessage.textContent = data.message;
        return;
    }

    profileMessage.textContent =
        "Logged in as " + data.user.username + " (" + data.user.email + ")";
}


function logout() {
    localStorage.removeItem("token");
    document.getElementById("profileMessage").textContent = "Logged out.";
}

function showRequestForm() {
    document.getElementById("mainContainer").style.display = "none";

    const requestScreen = document.getElementById("requestScreen");

    requestScreen.style.display = "flex";
}


function backToLogin() {
    document.getElementById("requestScreen").style.display = "none";

    document.getElementById("mainContainer").style.display = "block";
}


async function submitRequest() {

    const message =
        document.getElementById("requestMessage").value.trim();

    const phone =
        document.getElementById("requestPhone").value.trim();

    const requestError =
        document.getElementById("requestError");

    const phoneError =
        document.getElementById("phoneError");

    requestError.textContent = "";
    phoneError.textContent = "";


    // Validate request

    if (message.length < 10) {
        requestError.textContent =
            "Please describe your request using at least 10 characters.";

        return;
    }


    // Validate Egyptian phone number

    const phoneRegex = /^(01)[0125][0-9]{8}$/;

    if (!phoneRegex.test(phone)) {
        phoneError.textContent =
            "Please enter a valid Egyptian phone number.";

        return;
    }


    // Send request to backend

    const response = await fetch("/requests", {
        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            message: message,
            phone: phone
        })
    });


    const data = await response.json();


    if (!response.ok) {
        requestError.textContent = data.message;
        return;
    }


    // Hide the form

    document.querySelector(".request-box").innerHTML = `
        <h1>Thank You!</h1>

        <p class="success-text">
            Your request has been received.
        </p>

        <p class="success-text">
            Someone will be in contact with you shortly.
        </p>
    `;
}