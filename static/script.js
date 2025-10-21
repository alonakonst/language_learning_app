const authState = {
    authenticated: false,
    username: null,
};

const practiseState = {
    entries: [],
    currentQuestion: null,
    allowSelection: true,
    mode: "regular",
};

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function resetPractiseState(message = "Sign in to start practising.") {
    practiseState.entries = [];
    practiseState.currentQuestion = null;
    practiseState.allowSelection = true;

    const emptyMessage = document.getElementById("practiseEmptyMessage");
    const practiseBody = document.getElementById("practiseBody");
    const prompt = document.getElementById("practisePrompt");
    const options = document.getElementById("practiseOptions");
    const feedback = document.getElementById("practiseFeedback");

    emptyMessage?.classList.remove("is-hidden");
    if (emptyMessage) {
        emptyMessage.textContent = message;
    }
    practiseBody?.classList.add("practise__body--hidden");
    if (prompt) {
        prompt.textContent = "…";
    }
    if (options) {
        options.innerHTML = "";
    }
    if (feedback) {
        feedback.textContent = "";
    }
}

function setPractiseEntries(rawEntries) {
    const usableEntries = (rawEntries || []).filter(
        (entry) => entry && (entry.text || "").trim() && (entry.translation || "").trim()
    );

    practiseState.entries = usableEntries;
    practiseState.currentQuestion = null;
    practiseState.allowSelection = true;

    const emptyMessage = document.getElementById("practiseEmptyMessage");
    const practiseBody = document.getElementById("practiseBody");

    if (!emptyMessage || !practiseBody) {
        return;
    }

    if (usableEntries.length < 4) {
        emptyMessage.textContent =
            usableEntries.length === 0
                ? "Save some words in your dictionary to start practising."
                : "Add at least four saved words to start practising.";
        emptyMessage.classList.remove("is-hidden");
        practiseBody.classList.add("practise__body--hidden");
        return;
    }

    emptyMessage.classList.add("is-hidden");
    practiseBody.classList.remove("practise__body--hidden");
    if (practiseState.mode === "regular") {
        preparePractiseQuestion();
    }
}

function preparePractiseQuestion() {
    if (practiseState.mode !== "regular" || practiseState.entries.length < 4) {
        return;
    }

    const entries = [...practiseState.entries];
    const correct = entries[Math.floor(Math.random() * entries.length)];
    const distractors = shuffle(entries.filter((entry) => entry.id !== correct.id)).slice(0, 3);
    const options = shuffle([correct, ...distractors]).map((entry) => ({
        id: entry.id,
        label: entry.text,
    }));

    practiseState.currentQuestion = {
        prompt: correct.translation,
        correctId: correct.id,
        options,
    };
    practiseState.allowSelection = true;
    renderPractiseQuestion();
}

function renderPractiseQuestion() {
    const question = practiseState.currentQuestion;
    const prompt = document.getElementById("practisePrompt");
    const options = document.getElementById("practiseOptions");
    const feedback = document.getElementById("practiseFeedback");

    if (practiseState.mode !== "regular" || !question || !prompt || !options || !feedback) {
        return;
    }

    prompt.textContent = `What does ${question.prompt} mean?`;
    feedback.textContent = "";
    options.innerHTML = "";

    question.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practise__option";
        button.textContent = option.label;
        button.addEventListener("click", () => handlePractiseSelection(option.id, button));
        options.appendChild(button);
    });
}

function handlePractiseSelection(optionId, button) {
    if (!practiseState.currentQuestion || !practiseState.allowSelection) {
        return;
    }

    const feedback = document.getElementById("practiseFeedback");
    const options = document.getElementById("practiseOptions");
    if (!feedback || !options) {
        return;
    }

    if (optionId === practiseState.currentQuestion.correctId) {
        practiseState.allowSelection = false;
        feedback.textContent = "Correct! Here's the next one…";
        Array.from(options.children).forEach((child) => child.setAttribute("disabled", "true"));
        button.classList.add("practise__option--correct");
        setTimeout(() => {
            Array.from(options.children).forEach((child) => child.removeAttribute("disabled"));
            preparePractiseQuestion();
        }, 900);
    } else {
        button.classList.add("practise__option--incorrect");
        feedback.textContent = "Not quite. Try again.";
        setTimeout(() => button.classList.remove("practise__option--incorrect"), 800);
    }
}

function setPractiseMode(mode) {
    if (mode !== "regular" && mode !== "ai") {
        return;
    }

    const previousMode = practiseState.mode;
    practiseState.mode = mode;

    document.querySelectorAll(".practise__mode-button").forEach((button) => {
        button.classList.toggle(
            "practise__mode-button--active",
            button.dataset.mode === mode
        );
    });

    const regularSection = document.getElementById("practiseRegularSection");
    const aiSection = document.getElementById("practiseAiSection");

    regularSection?.classList.toggle("practise__section--hidden", mode !== "regular");
    aiSection?.classList.toggle("practise__section--hidden", mode !== "ai");

    if (mode === "regular") {
        if (practiseState.entries.length >= 4) {
            if (practiseState.currentQuestion && previousMode === "regular") {
                renderPractiseQuestion();
            } else {
                preparePractiseQuestion();
            }
        }
    }
}

function initPractiseModeToggle() {
    document.querySelectorAll(".practise__mode-button").forEach((button) => {
        button.addEventListener("click", () => {
            const mode = button.dataset.mode;
            if (mode) {
                setPractiseMode(mode);
            }
        });
    });
}

function showStatus(element, message, isError = true) {
    if (!element) {
        return;
    }
    element.textContent = message || "";
    element.style.color = isError ? "#ef4444" : "#16a34a";
}

function clearEntriesList(message = "No entries saved yet.") {
    const list = document.getElementById("entriesList");
    if (!list) {
        return;
    }
    list.innerHTML = `<li>${message}</li>`;
}

function getDirection() {
    return document.getElementById("translationDirection")?.value ?? "en-da";
}

function getFieldsByDirection() {
    const englishField = document.getElementById("englishInput");
    const danishField = document.getElementById("danishInput");
    const direction = getDirection();

    return {
        direction,
        englishField,
        danishField,
        sourceField: direction === "en-da" ? englishField : danishField,
        targetField: direction === "en-da" ? danishField : englishField,
    };
}

function updateDirectionUI() {
    const { direction, englishField, danishField } = getFieldsByDirection();
    const englishLabel = document.getElementById("englishLabel");
    const danishLabel = document.getElementById("danishLabel");

    if (direction === "da-en") {
        if (englishLabel) {
            englishLabel.textContent = "English (translation)";
        }
        if (danishLabel) {
            danishLabel.textContent = "Danish (source)";
        }
        englishField?.setAttribute("placeholder", "Translated English words");
        danishField?.setAttribute("placeholder", "Write a phrase in Danish");
    } else {
        if (englishLabel) {
            englishLabel.textContent = "English (source)";
        }
        if (danishLabel) {
            danishLabel.textContent = "Danish (translation)";
        }
        englishField?.setAttribute("placeholder", "Write a phrase in English");
        danishField?.setAttribute("placeholder", "Add your Danish translation");
    }
}

async function translateText() {
    const { direction, sourceField, targetField } = getFieldsByDirection();
    const input = (sourceField?.value ?? "").trim();
    const result = document.getElementById("translationResult");

    if (input === "") {
        if (result) {
            result.textContent = "Please type something!";
        }
        return;
    }

    try {
        const response = await fetch("/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: input, direction }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Translation failed");
        }
        if (result) {
            result.textContent = data.translation;
        }
        if (targetField) {
            targetField.value = data.translation || "";
        }
    } catch (error) {
        console.error("Error:", error);
        if (result) {
            result.textContent = "Error during translation";
        }
    }
}

function clearEntryInputs() {
    const englishField = document.getElementById("englishInput");
    const danishField = document.getElementById("danishInput");
    const translationResult = document.getElementById("translationResult");

    if (englishField) {
        englishField.value = "";
    }
    if (danishField) {
        danishField.value = "";
    }
    if (translationResult) {
        translationResult.textContent = "...";
    }
}

async function SaveToDatabase() {
    const { englishField, danishField } = getFieldsByDirection();
    const englishText = (englishField?.value ?? "").trim();
    const danishText = (danishField?.value ?? "").trim();

    if (!englishText || !danishText) {
        alert("Please enter both English and Danish texts before saving.");
        return;
    }

    try {
        const response = await fetch("/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                english: englishText,
                danish: danishText,
            }),
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            showStatus(document.getElementById("loginStatus"), "Please log in to save entries.");
            return;
        }

        const result = await response.json();
        if (!response.ok) {
            alert(result.error || "Failed to save entry.");
            return;
        }

        if (result.status === "success") {
            fetchEntries();
            clearEntryInputs();
        } else {
            alert(result.error || "Failed to save entry.");
        }
    } catch (error) {
        console.error("Error saving entry:", error);
        alert("An error occurred while saving.");
    }
}

async function fetchEntries() {
    const list = document.getElementById("entriesList");
    if (!list || !authState.authenticated) {
        return;
    }

    try {
        const response = await fetch("/entries");

        if (response.status === 401) {
            updateAuthState(false, null);
            return;
        }

        const data = await response.json();
        renderEntries(data.entries);
    } catch (error) {
        console.error("Error fetching entries:", error);
        list.innerHTML = "<li>Failed to load entries.</li>";
    }
}

function renderEntries(entries) {
    const list = document.getElementById("entriesList");
    setPractiseEntries(entries);
    if (!list) {
        return;
    }

    if (!entries || entries.length === 0) {
        list.innerHTML = "<li>No entries saved yet.</li>";
        return;
    }

    list.innerHTML = "";
    entries.forEach((entry) => {
        const item = document.createElement("li");
        item.classList.add("entry-item");

        const text = document.createElement("span");
        text.classList.add("entry-item__text");
        text.textContent = `${entry.text} → ${entry.translation || "?"}`;

        const button = document.createElement("button");
        button.type = "button";
        button.classList.add("entry-item__delete");
        button.textContent = "Delete";
        button.addEventListener("click", () => deleteEntry(entry.id));

        item.appendChild(text);
        item.appendChild(button);
        list.appendChild(item);
    });
}

function switchView(view) {
    if (!authState.authenticated && view !== "auth") {
        view = "auth";
    }

    const pages = document.querySelectorAll(".page");
    const tabs = document.querySelectorAll(".tab");

    pages.forEach((page) => {
        const isActive = page.id === `${view}View`;
        page.classList.toggle("page--active", isActive);
    });

    tabs.forEach((tab) => {
        const isActive = tab.dataset.view === view && authState.authenticated;
        tab.classList.toggle("tab--active", isActive);
    });
}

function updateAuthState(authenticated, username) {
    authState.authenticated = Boolean(authenticated);
    authState.username = authenticated ? username : null;

    const greeting = document.getElementById("userGreeting");
    const logoutButton = document.getElementById("logoutButton");
    const tabBar = document.getElementById("tabBar");

    if (authState.authenticated) {
        if (greeting) {
            greeting.textContent = `Hello, ${authState.username}`;
        }
        logoutButton?.classList.remove("link-button--hidden");
        tabBar?.classList.remove("tab-bar--hidden");
        switchView("dictionary");
        fetchEntries();
    } else {
        if (greeting) {
            greeting.textContent = "";
        }
        logoutButton?.classList.add("link-button--hidden");
        tabBar?.classList.add("tab-bar--hidden");
        clearEntriesList("Sign in to see your saved words.");
        resetPractiseState("Sign in to start practising.");
        setPractiseMode("regular");
        switchView("auth");
    }
}

async function loginUser() {
    const username = document.getElementById("loginUsername")?.value.trim() ?? "";
    const password = document.getElementById("loginPassword")?.value.trim() ?? "";
    const status = document.getElementById("loginStatus");

    showStatus(status, "");

    if (!username || !password) {
        showStatus(status, "Please enter username and password.");
        return;
    }

    try {
        const response = await fetch("/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (!response.ok) {
            showStatus(status, data.error || "Login failed.");
            return;
        }

        showStatus(status, "Welcome back!", false);
        const passwordField = document.getElementById("loginPassword");
        if (passwordField) {
            passwordField.value = "";
        }
        updateAuthState(true, data.username);
    } catch (error) {
        console.error("Error logging in:", error);
        showStatus(status, "Unable to log in right now.");
    }
}

async function registerUser() {
    const username = document.getElementById("registerUsername")?.value.trim() ?? "";
    const password = document.getElementById("registerPassword")?.value.trim() ?? "";
    const status = document.getElementById("registerStatus");

    showStatus(status, "");

    if (!username || !password) {
        showStatus(status, "Choose a username and password.");
        return;
    }

    try {
        const response = await fetch("/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const data = await response.json();
        if (!response.ok) {
            showStatus(status, data.error || "Registration failed.");
            return;
        }

        showStatus(status, "Account created! You're in.", false);
        const passwordField = document.getElementById("registerPassword");
        if (passwordField) {
            passwordField.value = "";
        }
        updateAuthState(true, data.username);
    } catch (error) {
        console.error("Error registering:", error);
        showStatus(status, "Unable to register right now.");
    }
}

async function logoutUser() {
    try {
        const response = await fetch("/logout", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.status !== 200 && response.status !== 401) {
            console.warn("Logout responded with", response.status);
        }
    } catch (error) {
        console.error("Error logging out:", error);
    } finally {
        updateAuthState(false, null);
        showStatus(document.getElementById("loginStatus"), "");
        showStatus(document.getElementById("registerStatus"), "");
    }
}

async function deleteEntry(entryId) {
    if (!confirm("Delete this entry?")) {
        return;
    }

    try {
        const response = await fetch(`/entries/${entryId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            showStatus(document.getElementById("loginStatus"), "Session expired. Please log in again.");
            return;
        }

        const data = await response.json();
        if (!response.ok || data.status !== "success") {
            alert(data.error || "Failed to delete entry.");
            return;
        }

        fetchEntries();
    } catch (error) {
        console.error("Error deleting entry:", error);
        alert("Unable to delete entry right now.");
    }
}

async function checkAuthStatus() {
    try {
        const response = await fetch("/auth/status");
        const data = await response.json();
        updateAuthState(Boolean(data.authenticated), data.username || null);
    } catch (error) {
        console.error("Error checking auth:", error);
        updateAuthState(false, null);
    }
}

function initApp() {
    document.getElementById("translateButton")?.addEventListener("click", translateText);
    document.getElementById("saveButton")?.addEventListener("click", SaveToDatabase);
    document.getElementById("loginButton")?.addEventListener("click", loginUser);
    document.getElementById("registerButton")?.addEventListener("click", registerUser);
    document.getElementById("logoutButton")?.addEventListener("click", logoutUser);
    document.getElementById("translationDirection")?.addEventListener("change", () => {
        clearEntryInputs();
        updateDirectionUI();
    });

    const tabs = document.querySelectorAll(".tab");
    tabs.forEach((tab) => {
        tab.addEventListener("click", () => switchView(tab.dataset.view));
    });

    initPractiseModeToggle();
    clearEntriesList("Sign in to see your saved words.");
    updateDirectionUI();
    checkAuthStatus();
    resetPractiseState("Sign in to start practising.");
    setPractiseMode("regular");
}

document.addEventListener("DOMContentLoaded", initApp);
