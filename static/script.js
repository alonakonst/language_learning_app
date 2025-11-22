const authState = {
    authenticated: false,
    username: null,
};

const practiseState = {
    entries: [],
    currentQuestion: null,
    allowSelection: true,
    mode: "regular",
    aiQuestion: null,
    aiAllowSelection: true,
    aiLoading: false,
};

const entryModalState = {
    entryId: null,
    entryText: "",
    example: null,
};

function toDisplayText(value) {
    return (value ?? "").toString().trim();
}

function formatDanishText(value, fallback = "") {
    const text = toDisplayText(value);
    if (text) {
        return `🇩🇰 ${text}`;
    }
    return fallback ? `🇩🇰 ${fallback}` : "";
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
    const str = (value ?? "").toString();
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function highlightTarget(text, target) {
    const safeText = escapeHtml(text || "");
    const safeTarget = escapeHtml(target || "");
    if (!safeText || !safeTarget) {
        return safeText;
    }
    const regex = new RegExp(`(${escapeRegExp(safeTarget)})`, "i");
    return safeText.replace(regex, "<strong>$1</strong>");
}

function normalizeEntryForDisplay(entry) {
    if (!entry) {
        return null;
    }

    const normalizedExample = entry.example
        ? {
              danish: toDisplayText(entry.example.danish),
              english: toDisplayText(entry.example.english),
          }
        : null;

    return {
        ...entry,
        text: toDisplayText(entry.text),
        translation: toDisplayText(entry.translation),
        notes: toDisplayText(entry.notes),
        example: normalizedExample,
    };
}

function normalizeEntries(entries = []) {
    return entries
        .map((entry) => normalizeEntryForDisplay(entry))
        .filter((entry) => entry !== null);
}

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
    practiseState.aiQuestion = null;
    practiseState.aiAllowSelection = true;
    practiseState.aiLoading = false;

    const emptyMessage = document.getElementById("practiseEmptyMessage");
    const practiseBody = document.getElementById("practiseBody");
    const prompt = document.getElementById("practisePrompt");
    const options = document.getElementById("practiseOptions");
    const feedback = document.getElementById("practiseFeedback");
    const aiEmptyMessage = document.getElementById("practiseAiEmptyMessage");
    const aiBody = document.getElementById("practiseAiBody");
    const aiPrompt = document.getElementById("practiseAiPrompt");
    const aiOptions = document.getElementById("practiseAiOptions");
    const aiFeedback = document.getElementById("practiseAiFeedback");

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

    if (aiEmptyMessage) {
        aiEmptyMessage.textContent = message;
        aiEmptyMessage.classList.remove("is-hidden");
    }
    aiBody?.classList.add("practise__body--hidden");
    if (aiPrompt) {
        aiPrompt.textContent = "…";
    }
    if (aiOptions) {
        aiOptions.innerHTML = "";
    }
    if (aiFeedback) {
        aiFeedback.textContent = "";
    }
}

function setPractiseEntries(rawEntries) {
    const usableEntries = normalizeEntries(rawEntries).filter(
        (entry) => entry && entry.text && entry.translation
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

    updateAiPractiseAvailability();
}

function updateAiPractiseAvailability() {
    const aiEmptyMessage = document.getElementById("practiseAiEmptyMessage");
    const aiBody = document.getElementById("practiseAiBody");

    if (!aiEmptyMessage || !aiBody) {
        return;
    }

    if (practiseState.entries.length === 0) {
        aiEmptyMessage.textContent = "Save at least one entry to unlock AI practise.";
        aiEmptyMessage.classList.remove("is-hidden");
        aiBody.classList.add("practise__body--hidden");
        practiseState.aiQuestion = null;
        practiseState.aiAllowSelection = true;
        return;
    }

    aiEmptyMessage.classList.add("is-hidden");
    aiBody.classList.remove("practise__body--hidden");

    if (
        practiseState.mode === "ai" &&
        !practiseState.aiQuestion &&
        !practiseState.aiLoading
    ) {
        prepareAiPractiseQuestion();
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

    prompt.textContent = `What does ${toDisplayText(question.prompt)} mean?`;
    feedback.textContent = "";
    options.innerHTML = "";

    question.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practise__option";
        button.textContent = toDisplayText(option.label);
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

function setAiPractiseLoading(message = "Asking AI for matching flashcards…") {
    const prompt = document.getElementById("practiseAiPrompt");
    const options = document.getElementById("practiseAiOptions");
    const feedback = document.getElementById("practiseAiFeedback");
    const nextButton = document.getElementById("practiseAiNextButton");

    if (prompt) {
        prompt.textContent = message;
    }
    if (options) {
        options.innerHTML = "";
    }
    if (feedback) {
        feedback.textContent = "";
    }
    nextButton?.setAttribute("disabled", "true");
}

function showAiPractiseError(message) {
    const prompt = document.getElementById("practiseAiPrompt");
    const feedback = document.getElementById("practiseAiFeedback");
    const nextButton = document.getElementById("practiseAiNextButton");

    if (prompt) {
        prompt.textContent = message;
    }
    if (feedback) {
        feedback.textContent = "";
    }
    nextButton?.removeAttribute("disabled");
}

async function prepareAiPractiseQuestion() {
    if (
        practiseState.mode !== "ai" ||
        practiseState.entries.length === 0 ||
        practiseState.aiLoading ||
        !authState.authenticated
    ) {
        return;
    }

    practiseState.aiLoading = true;
    practiseState.aiQuestion = null;
    setAiPractiseLoading();

    const entries = [...practiseState.entries];
    const target = entries[Math.floor(Math.random() * entries.length)];

    try {
        const response = await fetch("/practise/ai", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ entry_id: target.id }),
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            showAiPractiseError(data.error || "AI practise is unavailable right now.");
            return;
        }

        if (practiseState.mode !== "ai") {
            return;
        }

        const mappedOptions = (data.options || []).map((option) => ({
            id: option.id,
            label: toDisplayText(option.label),
            isCorrect: Boolean(option.is_correct),
            metadata: option.metadata || {},
        }));

        if (mappedOptions.length < 4) {
            showAiPractiseError("The AI did not return enough flashcards. Try again.");
            return;
        }

        practiseState.aiQuestion = {
            entryId: target.id,
            prompt: toDisplayText(data.prompt || target.translation || ""),
            partOfSpeech: toDisplayText(data.part_of_speech || "word"),
            options: shuffle(mappedOptions),
        };
        practiseState.aiAllowSelection = true;
        renderAiPractiseQuestion();
    } catch (error) {
        console.error("Error preparing AI practise:", error);
        showAiPractiseError("Unable to contact the AI practise service.");
    } finally {
        practiseState.aiLoading = false;
    }
}

function renderAiPractiseQuestion() {
    const question = practiseState.aiQuestion;
    const prompt = document.getElementById("practiseAiPrompt");
    const options = document.getElementById("practiseAiOptions");
    const feedback = document.getElementById("practiseAiFeedback");
    const nextButton = document.getElementById("practiseAiNextButton");

    if (practiseState.mode !== "ai" || !question || !prompt || !options || !feedback) {
        return;
    }

    const partOfSpeech = question.partOfSpeech || "word";
    const posLabel = partOfSpeech;

    prompt.textContent = `Pick the ${partOfSpeech} that matches "${question.prompt}".`;
    feedback.textContent = "";
    options.innerHTML = "";

    question.options.forEach((option) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practise__card";

        const meta = document.createElement("span");
        meta.className = "practise__card-meta";
        meta.textContent = posLabel;

        const label = document.createElement("span");
        label.className = "practise__card-label";
        label.textContent = toDisplayText(option.label);

        button.addEventListener("click", () => handleAiPractiseSelection(option.id, button));
        button.appendChild(meta);
        button.appendChild(label);
        options.appendChild(button);
    });

    nextButton?.removeAttribute("disabled");
}

function handleAiPractiseSelection(optionId, button) {
    if (!practiseState.aiQuestion || !practiseState.aiAllowSelection) {
        return;
    }

    const feedback = document.getElementById("practiseAiFeedback");
    const options = document.getElementById("practiseAiOptions");
    if (!feedback || !options) {
        return;
    }

    const chosen = practiseState.aiQuestion.options.find((opt) => opt.id === optionId);
    if (!chosen) {
        return;
    }

    if (chosen.isCorrect) {
        practiseState.aiAllowSelection = false;
        feedback.textContent = "Nice! That's your word. Loading the next flashcards…";
        Array.from(options.children).forEach((child) => child.setAttribute("disabled", "true"));
        button.classList.add("practise__card--correct");
        setTimeout(() => {
            Array.from(options.children).forEach((child) => child.removeAttribute("disabled"));
            prepareAiPractiseQuestion();
        }, 1100);
    } else {
        button.classList.add("practise__card--incorrect");
        feedback.textContent = "That's one of the new words. Try again.";
        setTimeout(() => button.classList.remove("practise__card--incorrect"), 900);
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
    } else if (mode === "ai") {
        updateAiPractiseAvailability();
        if (
            practiseState.entries.length > 0 &&
            !practiseState.aiQuestion &&
            !practiseState.aiLoading
        ) {
            prepareAiPractiseQuestion();
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
        const normalizedTranslation = toDisplayText(data.translation || "");
        if (result) {
            result.textContent = normalizedTranslation;
        }
        if (targetField) {
            targetField.value = normalizedTranslation;
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
    const normalizedEntries = normalizeEntries(entries);
    setPractiseEntries(normalizedEntries);
    if (!list) {
        return;
    }

    if (!normalizedEntries || normalizedEntries.length === 0) {
        list.innerHTML = "<li>No entries saved yet.</li>";
        return;
    }

    list.innerHTML = "";
    normalizedEntries.forEach((entry) => {
        const item = document.createElement("li");
        item.classList.add("entry-item");

        const text = document.createElement("span");
        text.classList.add("entry-item__text");
        text.textContent = `${entry.text} → ${entry.translation || "?"}`;

        const actions = document.createElement("div");
        actions.classList.add("entry-item__actions");

        const viewButton = document.createElement("button");
        viewButton.type = "button";
        viewButton.classList.add("entry-item__view");
        viewButton.textContent = "View";
        viewButton.addEventListener("click", () => showEntryDetails(entry));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.classList.add("entry-item__delete");
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", () => deleteEntry(entry.id));

        actions.appendChild(viewButton);
        actions.appendChild(deleteButton);

        item.appendChild(text);
        item.appendChild(actions);
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

function showEntryDetails(entry) {
    const modal = document.getElementById("entryModal");
    const danishLine = document.getElementById("entryModalDanish");
    const englishLine = document.getElementById("entryModalEnglish");
    const exampleDanish = document.getElementById("entryModalExampleDanish");
    const exampleEnglish = document.getElementById("entryModalExampleEnglish");
    const exampleButton = document.getElementById("entryModalExampleButton");
    const pronounceButton = document.getElementById("entryModalPronounceButton");
    const examplePronounceButton = document.getElementById("entryModalExamplePronounceButton");

    if (
        !modal ||
        !danishLine ||
        !englishLine ||
        !exampleDanish ||
        !exampleEnglish ||
        !exampleButton ||
        !pronounceButton ||
        !examplePronounceButton ||
        !entry
    ) {
        return;
    }

    entryModalState.entryId = entry.id;
    entryModalState.entryText = toDisplayText(entry.translation || entry.text);
    entryModalState.example = entry.example || null;

    const danishWord = toDisplayText(entry.translation);
    danishLine.innerHTML = danishWord
        ? `🇩🇰 <strong>${escapeHtml(danishWord)}</strong>`
        : "🇩🇰 No Danish text yet";
    englishLine.textContent = toDisplayText(entry.text) || "No English text yet";
    pronounceButton.dataset.entryId = entry.id;
    pronounceButton.classList.toggle("is-hidden", !entry.translation);
    examplePronounceButton.dataset.entryId = entry.id;

    renderEntryExample(entryModalState.example);
    exampleButton.removeAttribute("disabled");
    renderEntryExample(entryModalState.example);

    modal.classList.remove("modal--hidden");
}

function renderEntryExample(example) {
    const exampleDanish = document.getElementById("entryModalExampleDanish");
    const exampleEnglish = document.getElementById("entryModalExampleEnglish");
    const exampleButton = document.getElementById("entryModalExampleButton");
    const examplePronounceButton = document.getElementById("entryModalExamplePronounceButton");

    if (!exampleDanish || !exampleEnglish || !exampleButton || !examplePronounceButton) {
        return;
    }

    if (example && (example.danish || example.english)) {
        exampleDanish.innerHTML = highlightTarget(
            formatDanishText(example.danish),
            entryModalState.entryText
        );
        exampleEnglish.textContent = example.english || "";
        exampleButton.classList.add("is-hidden");
        examplePronounceButton.classList.toggle("is-hidden", !example.danish);
    } else {
        exampleDanish.textContent = formatDanishText("", "No example yet.");
        exampleEnglish.textContent = "";
        exampleButton.textContent = "Generate example";
        exampleButton.classList.remove("is-hidden");
        examplePronounceButton.classList.add("is-hidden");
    }
}

async function showEntryExample() {
    const exampleDanish = document.getElementById("entryModalExampleDanish");
    const exampleEnglish = document.getElementById("entryModalExampleEnglish");
    const exampleButton = document.getElementById("entryModalExampleButton");
    if (!exampleDanish || !exampleEnglish || !exampleButton || !entryModalState.entryId) {
        return;
    }

    exampleButton.setAttribute("disabled", "true");
    exampleButton.textContent = "Generating…";
    exampleDanish.textContent = "Working on a Danish example…";
    exampleEnglish.textContent = "";

    try {
        const response = await fetch(`/entries/${entryModalState.entryId}/example`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            exampleDanish.textContent = "Please log in again to view examples.";
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            exampleDanish.textContent = data.error || "Could not load an example.";
            return;
        }

        const example = data.example || {};
        entryModalState.example = {
            danish: toDisplayText(example.danish),
            english: toDisplayText(example.english),
        };
        renderEntryExample(entryModalState.example);
        fetchEntries();
    } catch (error) {
        console.error("Error fetching example:", error);
        exampleDanish.textContent = "Unable to load an example right now.";
    } finally {
        renderEntryExample(entryModalState.example);
        exampleButton.removeAttribute("disabled");
    }
}

async function playPronunciation(entryId, kind = "word") {
    const button =
        kind === "example"
            ? document.getElementById("entryModalExamplePronounceButton")
            : document.getElementById("entryModalPronounceButton");

    if (!entryId || !button) {
        return;
    }

    button.setAttribute("disabled", "true");
    try {
        const suffix = kind === "example" ? "?kind=example" : "";
        const response = await fetch(`/entries/${entryId}/pronunciation${suffix}`);

        if (response.status === 401) {
            updateAuthState(false, null);
            return;
        }

        if (!response.ok) {
            console.error("Pronunciation fetch failed");
            return;
        }

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play().catch((err) => console.error("Audio playback failed", err));
    } catch (error) {
        console.error("Error playing pronunciation:", error);
    } finally {
        button.removeAttribute("disabled");
    }
}

function hideEntryModal() {
    const modal = document.getElementById("entryModal");
    if (modal) {
        modal.classList.add("modal--hidden");
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
    document.getElementById("entryModalExampleButton")?.addEventListener("click", showEntryExample);
    document.getElementById("entryModalPronounceButton")?.addEventListener("click", () => {
        const entryId = Number(
            document.getElementById("entryModalPronounceButton")?.dataset.entryId || 0
        );
        if (entryId) {
            playPronunciation(entryId);
        }
    });
    document
        .getElementById("entryModalExamplePronounceButton")
        ?.addEventListener("click", () => {
            const entryId = Number(
                document.getElementById("entryModalExamplePronounceButton")?.dataset.entryId || 0
            );
            if (entryId) {
                playPronunciation(entryId, "example");
            }
        });
    document.getElementById("entryModalClose")?.addEventListener("click", hideEntryModal);
    document.getElementById("entryModal")?.addEventListener("click", (event) => {
        if (event.target.id === "entryModal") {
            hideEntryModal();
        }
    });
    document.getElementById("translationDirection")?.addEventListener("change", () => {
        clearEntryInputs();
        updateDirectionUI();
    });
    document
        .getElementById("practiseAiNextButton")
        ?.addEventListener("click", () => prepareAiPractiseQuestion());

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
