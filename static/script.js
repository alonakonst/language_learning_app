const authState = {
    authenticated: false,
    username: null,
};

const practiseState = {
    entries: [],
    aiQuestion: null,
    aiAllowSelection: true,
    aiLoading: false,
    clozeQuestion: null,
    clozeLoading: false,
    mode: "flash_en", // flash_en, flash_da, cloze
    modeSelected: false,
    awaitingNext: false,
};

const addWordState = {
    english: "",
    danish: "",
    isExternalInput: true,
};

const entryModalState = {
    entryId: null,
    entryText: "",
    example: null,
    examples: [],
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

    const normalizedExamples = Array.isArray(entry.examples)
        ? entry.examples
              .map((ex) => ({
                  danish: toDisplayText(ex.danish),
                  english: toDisplayText(ex.english),
              }))
              .filter((ex) => ex.danish || ex.english)
        : [];

    return {
        ...entry,
        text: toDisplayText(entry.text),
        translation: toDisplayText(entry.translation),
        notes: toDisplayText(entry.notes),
        example: normalizedExample,
        examples: normalizedExamples,
        is_external_input: Boolean(entry.is_external_input ?? true),
    };
}

function normalizeEntries(entries = []) {
    return entries
        .map((entry) => normalizeEntryForDisplay(entry))
        .filter((entry) => entry !== null);
}

function isFlashMode(mode) {
    return mode === "flash_en" || mode === "flash_da";
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
    practiseState.aiQuestion = null;
    practiseState.aiAllowSelection = true;
    practiseState.aiLoading = false;
    practiseState.clozeQuestion = null;
    practiseState.clozeLoading = false;
    practiseState.mode = "flash_en";
    practiseState.modeSelected = false;

    const aiEmptyMessage = document.getElementById("practiseAiEmptyMessage");
    const aiBody = document.getElementById("practiseAiBody");
    const aiPrompt = document.getElementById("practiseAiPrompt");
    const aiOptions = document.getElementById("practiseAiOptions");
    const aiFeedback = document.getElementById("practiseAiFeedback");

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
    renderPractisePages();
}

function renderPractisePages() {
    const modePage = document.getElementById("practiseModePage");
    const contentPage = document.getElementById("practiseContentPage");
    const modeLabel = document.getElementById("practiseModeLabel");

    if (modePage) {
        modePage.classList.toggle("is-hidden", practiseState.modeSelected);
    }
    if (contentPage) {
        contentPage.classList.toggle("is-hidden", !practiseState.modeSelected);
    }
    if (modeLabel) {
        modeLabel.textContent = practiseState.modeSelected ? getModeLabel(practiseState.mode) : "";
    }
    const modeButtons = document.querySelectorAll(".practise__mode-card");
    modeButtons.forEach((btn) => {
        const active = practiseState.modeSelected && btn.dataset.mode === practiseState.mode;
        btn.classList.toggle("practise__mode-card--active", active);
    });
}

function setPractiseEntries(rawEntries) {
    const usableEntries = normalizeEntries(rawEntries).filter(
        (entry) => entry && entry.text && entry.translation
    );

    practiseState.entries = usableEntries;

    updateAiPractiseAvailability();
    prepareClozeQuestion();
}

function updateAiPractiseAvailability() {
    const aiEmptyMessage = document.getElementById("practiseAiEmptyMessage");
    const aiBody = document.getElementById("practiseAiBody");
    renderExerciseVisibility();

    if (!aiEmptyMessage || !aiBody) {
        return;
    }

    if (!practiseState.modeSelected) {
        aiEmptyMessage.textContent = "Pick an exercise type to start.";
        aiEmptyMessage.classList.remove("is-hidden");
        aiBody.classList.add("practise__body--hidden");
        practiseState.aiQuestion = null;
        practiseState.clozeQuestion = null;
        practiseState.aiAllowSelection = true;
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

    if (isFlashMode(practiseState.mode)) {
        if (!practiseState.aiQuestion && !practiseState.aiLoading) {
            prepareAiPractiseQuestion();
        }
    } else if (practiseState.mode === "cloze") {
        if (!practiseState.clozeQuestion && !practiseState.clozeLoading) {
            prepareClozeQuestion();
        } else {
            renderClozeQuestion();
        }
    }
}

function renderClozeQuestion() {
    const promptEl = document.getElementById("practiseClozePrompt");
    const hintEl = document.getElementById("practiseClozeHint");
    const showHintButton = document.getElementById("practiseClozeShowHint");
    const inputEl = document.getElementById("practiseClozeInput");
    const feedbackEl = document.getElementById("practiseClozeFeedback");
    const checkButton = document.getElementById("practiseClozeCheck");
    const giveUpButton = document.getElementById("practiseClozeGiveUp");
    hideClozeWordBar();

    if (
        !promptEl ||
        !hintEl ||
        !showHintButton ||
        !inputEl ||
        !feedbackEl ||
        !checkButton ||
        !giveUpButton
    ) {
        return;
    }

    renderExerciseVisibility();

    const question = practiseState.clozeQuestion;
    if (!question) {
        promptEl.textContent = "No sentence available. Add more words.";
        hintEl.textContent = "";
        feedbackEl.textContent = "";
        inputEl.value = "";
        checkButton.setAttribute("disabled", "true");
        showHintButton.setAttribute("disabled", "true");
        giveUpButton.setAttribute("disabled", "true");
        return;
    }

    promptEl.textContent = question.prompt || "Fill in the blank.";
    hintEl.textContent = question.hintEnglish ? `Hint: ${question.hintEnglish}` : "";
    hintEl.classList.add("practise__hint--hidden");
    showHintButton.textContent = "Show hint";
    showHintButton.removeAttribute("disabled");
    giveUpButton.removeAttribute("disabled");
    feedbackEl.textContent = "";
    inputEl.value = "";
    inputEl.removeAttribute("disabled");
    checkButton.removeAttribute("disabled");
    practiseState.awaitingNext = false;
    inputEl.focus();
}

function checkClozeAnswer() {
    const inputEl = document.getElementById("practiseClozeInput");
    const feedbackEl = document.getElementById("practiseClozeFeedback");
    const checkButton = document.getElementById("practiseClozeCheck");
    const giveUpButton = document.getElementById("practiseClozeGiveUp");
    if (!inputEl || !feedbackEl || !practiseState.clozeQuestion) {
        return;
    }

    const userAnswer = toDisplayText(inputEl.value).toLowerCase();
    const expected = toDisplayText(practiseState.clozeQuestion.answer).toLowerCase();

    if (!userAnswer) {
        feedbackEl.textContent = "Type your answer first.";
        feedbackEl.style.color = "#b91c1c";
        return;
    }

    const correct = userAnswer === expected;
    const close =
        !correct &&
        userAnswer.length >= 2 &&
        Math.abs(userAnswer.length - expected.length) <= 2 &&
        levenshteinDistance(userAnswer, expected) <= 2;

    if (correct) {
        feedbackEl.textContent = "Great! That's correct. Tap next exercise.";
        feedbackEl.style.color = "#15803d";
    } else if (close) {
        feedbackEl.textContent = "Not quite, almost there.";
        feedbackEl.style.color = "#d97706";
    } else {
        feedbackEl.textContent = "Not quite. Try again.";
        feedbackEl.style.color = "#b91c1c";
    }

    if (correct) {
        checkButton?.setAttribute("disabled", "true");
        inputEl.setAttribute("disabled", "true");
        giveUpButton?.setAttribute("disabled", "true");
        practiseState.awaitingNext = true;
        renderClozeWordBar();
        renderNextExerciseButton();
    }
    showClozeWordBarOnAttempt();
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) {
        matrix[i][0] = i;
    }
    for (let j = 0; j <= b.length; j += 1) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
}

function revealClozeHint() {
    const hintEl = document.getElementById("practiseClozeHint");
    const showHintButton = document.getElementById("practiseClozeShowHint");
    if (!hintEl || !showHintButton) {
        return;
    }
    hintEl.classList.remove("practise__hint--hidden");
    showHintButton.setAttribute("disabled", "true");
}

function renderNextExerciseButton() {
    let control = document.getElementById("practiseNextExercise");
    const container = document.getElementById("practiseAiBody");
    if (!container) {
        return;
    }
    if (!control) {
        control = document.createElement("button");
        control.id = "practiseNextExercise";
        control.className = "btn btn--primary";
        control.textContent = "Next exercise";
        container.appendChild(control);
        control.addEventListener("click", () => {
            setExerciseMode(practiseState.mode);
            control.remove();
        });
    }
}

function giveUpCloze() {
    const feedbackEl = document.getElementById("practiseClozeFeedback");
    const inputEl = document.getElementById("practiseClozeInput");
    const checkButton = document.getElementById("practiseClozeCheck");
    const giveUpButton = document.getElementById("practiseClozeGiveUp");
    if (!feedbackEl || !inputEl || !practiseState.clozeQuestion) {
        return;
    }

    const correct = practiseState.clozeQuestion.answer || "";
    feedbackEl.textContent = `Answer: ${correct}`;
    feedbackEl.style.color = "#0f172a";
    inputEl.value = correct;
    inputEl.setAttribute("disabled", "true");
    checkButton?.setAttribute("disabled", "true");
    giveUpButton?.setAttribute("disabled", "true");
    practiseState.awaitingNext = true;
    renderClozeWordBar();
    renderNextExerciseButton();
    showClozeWordBarOnAttempt();
}

function hideClozeWordBar() {
    const bar = document.getElementById("practiseClozeWordBar");
    const words = document.getElementById("practiseClozeWords");
    bar?.classList.add("is-hidden");
    if (words) {
        words.innerHTML = "";
    }
}

function getClozeSentence() {
    if (!practiseState.clozeQuestion) {
        return "";
    }
    const prompt = toDisplayText(practiseState.clozeQuestion.prompt);
    const answer = toDisplayText(practiseState.clozeQuestion.answer);
    if (!prompt) {
        return "";
    }
    if (prompt.includes("_____") && answer) {
        return prompt.replace("_____", answer);
    }
    return prompt;
}

function renderClozeWordBar() {
    const bar = document.getElementById("practiseClozeWordBar");
    const wordsContainer = document.getElementById("practiseClozeWords");
    if (!bar || !wordsContainer) {
        return;
    }

    const sentence = getClozeSentence();
    const targetPhrase = toDisplayText(practiseState.clozeQuestion?.answer || "");
    const targetWord = targetPhrase.toLowerCase();
    const targetParts = new Set(
        targetPhrase
            .toLowerCase()
            .match(/[A-Za-zÆØÅæøå]+/g)
            ?.map((part) => part.trim())
            .filter(Boolean) || []
    );
    if (!sentence) {
        hideClozeWordBar();
        return;
    }

    wordsContainer.innerHTML = "";
    const matches = Array.from(sentence.matchAll(/[A-Za-zÆØÅæøå]+/g)).map((match) => ({
        word: match[0],
        start: match.index,
        end: match.index + match[0].length,
    }));

    if (matches.length === 0) {
        hideClozeWordBar();
        return;
    }

    const commonWords = new Set(
        [
            "jeg",
            "du",
            "han",
            "hun",
            "vi",
            "i",
            "de",
            "det",
            "den",
            "der",
            "en",
            "et",
            "og",
            "eller",
            "men",
            "ikke",
            "med",
            "til",
            "for",
            "som",
            "på",
            "af",
            "er",
            "var",
            "bliver",
            "blive",
            "have",
            "har",
            "min",
            "mit",
            "mine",
            "din",
            "dit",
            "dine",
            "sin",
            "sit",
            "sine",
            "vores",
            "jeres",
            "deres",
            "end",
            "at",
            "kan",
            "skal",
            "vil",
            "må",
            "så",
        ].map((w) => w.toLowerCase())
    );

    const tokens = matches.map((m) => {
        const lower = toDisplayText(m.word).toLowerCase();
        return {
            ...m,
            lower,
            isTarget: lower === targetWord,
            isTargetPart: targetParts.has(lower),
            isCommon: commonWords.has(lower),
            used: false,
        };
    });

    const phrases = [];

    tokens.forEach((token, index) => {
        if (token.used || token.isTarget || token.isTargetPart) {
            return;
        }
        if (token.isCommon) {
            return;
        }

        let startIndex = index;
        while (startIndex > 0) {
            const prev = tokens[startIndex - 1];
            const between = sentence.slice(prev.end, tokens[startIndex].start);
            if (prev.used || !prev.isCommon || /\S/.test(between.replace(/\s+/g, ""))) {
                break;
            }
            startIndex -= 1;
        }

        const phraseStart = tokens[startIndex].start;
        const phraseEnd = token.end;
        const phrase = sentence.slice(phraseStart, phraseEnd).trim();
        if (phrase) {
            for (let i = startIndex; i <= index; i += 1) {
                tokens[i].used = true;
            }
            phrases.push(phrase);
        }
    });

    if (phrases.length === 0) {
        hideClozeWordBar();
        return;
    }

    phrases.forEach((text) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practise__word";
        button.textContent = text;
        button.addEventListener("click", () => {
            openAddWordModal({
                danish: text,
                isExternalInput: false,
            });
        });
        wordsContainer.appendChild(button);
    });

    bar.classList.remove("is-hidden");
}

function showClozeWordBarOnAttempt() {
    const wordBar = document.getElementById("practiseClozeWordBar");
    if (!wordBar) {
        return;
    }
    renderClozeWordBar();
}

function renderExerciseVisibility() {
    const flashcards = document.getElementById("practiseFlashcards");
    const cloze = document.getElementById("practiseClozeBlock");
    if (!flashcards || !cloze) {
        return;
    }
    flashcards.classList.toggle("is-hidden", !isFlashMode(practiseState.mode));
    cloze.classList.toggle("is-hidden", practiseState.mode !== "cloze");
}

function setExerciseMode(mode) {
    if (!isFlashMode(mode) && mode !== "cloze") {
        return;
    }
    practiseState.mode = mode;
    practiseState.awaitingNext = false;
    const nextButton = document.getElementById("practiseNextExercise");
    nextButton?.remove();
    renderExerciseVisibility();

    if (isFlashMode(mode)) {
        practiseState.aiQuestion = null;
        practiseState.aiAllowSelection = true;
        prepareAiPractiseQuestion();
    } else {
        practiseState.clozeQuestion = null;
        prepareClozeQuestion();
    }

    const modeButtons = document.querySelectorAll(".practise__mode-card");
    modeButtons.forEach((btn) => {
        btn.classList.toggle("practise__mode-card--active", btn.dataset.mode === practiseState.mode);
    });
    const modeLabel = document.getElementById("practiseModeLabel");
    if (modeLabel) {
        modeLabel.textContent = getModeLabel(practiseState.mode);
    }
}

function enterPractiseMode(mode) {
    if (!isFlashMode(mode) && mode !== "cloze") {
        return;
    }
    practiseState.modeSelected = true;
    setExerciseMode(mode);
    renderPractisePages();
    updateAiPractiseAvailability();
}

function showPractiseModeSelection() {
    practiseState.modeSelected = false;
    practiseState.awaitingNext = false;
    practiseState.aiQuestion = null;
    practiseState.clozeQuestion = null;
    practiseState.aiAllowSelection = true;
    const nextButton = document.getElementById("practiseNextExercise");
    nextButton?.remove();
    renderPractisePages();
    updateAiPractiseAvailability();
}

async function prepareClozeQuestion() {
    if (
        practiseState.entries.length === 0 ||
        practiseState.clozeLoading ||
        !authState.authenticated ||
        practiseState.mode !== "cloze" ||
        !practiseState.modeSelected
    ) {
        renderClozeQuestion();
        return;
    }

    practiseState.clozeLoading = true;
    practiseState.clozeQuestion = null;

    const entries = [...practiseState.entries];
    const target = entries[Math.floor(Math.random() * entries.length)];

    try {
        const response = await fetch("/practise/cloze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_id: target.id }),
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            console.error("Cloze practise error:", data.error);
            return;
        }

        practiseState.clozeQuestion = {
            entryId: target.id,
            prompt: data.prompt || "",
            answer: toDisplayText(data.answer || ""),
            hintEnglish: toDisplayText(data.hint_en || target.text || ""),
        };
        renderClozeQuestion();
    } catch (error) {
        console.error("Error preparing cloze practise:", error);
    } finally {
        practiseState.clozeLoading = false;
        if (!practiseState.clozeQuestion) {
            renderClozeQuestion();
        }
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
        practiseState.entries.length === 0 ||
        practiseState.aiLoading ||
        !authState.authenticated ||
        !isFlashMode(practiseState.mode) ||
        !practiseState.modeSelected
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

        const mappedOptions = (data.options || []).map((option) => ({
            id: option.id,
            label: toDisplayText(option.label),
            translation: toDisplayText(option.metadata?.translation),
            isCorrect: Boolean(option.is_correct),
            metadata: option.metadata || {},
        }));

        if (mappedOptions.length < 4) {
            showAiPractiseError("The AI did not return enough flashcards. Try again.");
            return;
        }

        const questionType = practiseState.mode === "flash_da" ? "da_to_en" : "en_to_da";
        const targetEnglish = toDisplayText(data.target_text || "");
        const targetDanish = toDisplayText(data.prompt || target.translation || "");

        practiseState.aiQuestion = {
            entryId: target.id,
            prompt: questionType === "en_to_da" ? targetEnglish : targetDanish,
            partOfSpeech: toDisplayText(data.part_of_speech || "word"),
            questionType,
            targetEnglish,
            targetDanish,
            options: shuffle(mappedOptions),
        };
        practiseState.awaitingNext = false;
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

    if (!question || !prompt || !options || !feedback) {
        return;
    }

    const partOfSpeech = question.partOfSpeech || "word";
    const posLabel = partOfSpeech;
    const isEnToDa = question.questionType === "en_to_da";

    if (isEnToDa) {
        prompt.textContent = `How is "${question.targetEnglish}" in Danish?`;
    } else {
        prompt.textContent = `What does ${question.targetDanish || question.prompt} mean?`;
    }
    feedback.textContent = "";
    options.innerHTML = "";
    options.classList.toggle("practise__options--disabled", practiseState.awaitingNext);

    question.options.forEach((option) => {
        const wrapper = document.createElement("div");
        wrapper.className = "practise__card-wrapper";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "practise__card";
        button.dataset.optionId = option.id;

        const meta = document.createElement("span");
        meta.className = "practise__card-meta";
        meta.textContent = posLabel;

        const label = document.createElement("span");
        label.className = "practise__card-label";
        const optionLabel = isEnToDa
            ? toDisplayText(option.translation || option.label)
            : toDisplayText(option.label);
        label.textContent = optionLabel || "…";

        button.addEventListener("click", () => handleAiPractiseSelection(option.id, button));
        button.appendChild(meta);
        button.appendChild(label);
        wrapper.appendChild(button);

        const englishValue = toDisplayText(option.label);
        const danishValue = toDisplayText(option.translation || option.metadata?.translation || "");
        const presentedValue = optionLabel;

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "practise__card-add is-hidden";
        addButton.textContent = "+";
        addButton.title = "Add to dictionary";
        addButton.addEventListener("click", (event) => {
            event.stopPropagation();
            if (isEnToDa) {
            openAddWordModal({
                english: "",
                danish: presentedValue,
                isExternalInput: false,
            });
        } else {
            openAddWordModal({
                english: presentedValue,
                danish: "",
                isExternalInput: false,
            });
        }
        });

        wrapper.appendChild(addButton);
        options.appendChild(wrapper);
    });

    renderExerciseVisibility();
    revealDistractorAddButtons();
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
        feedback.textContent = "Nice! That's your word. Tap next exercise.";
        Array.from(options.querySelectorAll(".practise__card")).forEach((card) =>
            card.setAttribute("disabled", "true")
        );
        button.classList.add("practise__card--correct");
        practiseState.awaitingNext = true;
        options.classList.add("practise__options--disabled");
        renderNextExerciseButton();
        revealDistractorAddButtons();
    } else {
        button.classList.add("practise__card--incorrect");
        feedback.textContent = "That's one of the new words. Try again.";
        setTimeout(() => button.classList.remove("practise__card--incorrect"), 900);
    }
}

function revealDistractorAddButtons() {
    const options = document.getElementById("practiseAiOptions");
    if (!options || !practiseState.aiQuestion) {
        return;
    }

    const shouldShow = practiseState.awaitingNext;

    options.querySelectorAll(".practise__card-wrapper").forEach((wrapper) => {
        const card = wrapper.querySelector(".practise__card");
        const addButton = wrapper.querySelector(".practise__card-add");
        if (!card || !addButton) {
            return;
        }
        const option = practiseState.aiQuestion.options.find(
            (opt) => opt.id === card.dataset.optionId
        );
        const showButton = Boolean(option) && shouldShow && !option.isCorrect;
        addButton.classList.toggle("is-hidden", !showButton);
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

function getModeLabel(mode) {
    if (mode === "flash_da") {
        return "Flashcards: Danish prompts";
    }
    if (mode === "cloze") {
        return "Contextual sentences";
    }
    return "Flashcards: English prompts";
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
                is_external_input: true,
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
        updateAiPractiseAvailability();
        renderPractisePages();
    } else {
        if (greeting) {
            greeting.textContent = "";
        }
        logoutButton?.classList.add("link-button--hidden");
        tabBar?.classList.add("tab-bar--hidden");
        clearEntriesList("Sign in to see your saved words.");
        resetPractiseState("Sign in to start practising.");
        switchView("auth");
    }
}

function showEntryDetails(entry) {
    const modal = document.getElementById("entryModal");
    const danishLine = document.getElementById("entryModalDanish");
    const englishLine = document.getElementById("entryModalEnglish");
    const pronounceButton = document.getElementById("entryModalPronounceButton");
    const exampleButton = document.getElementById("entryModalExampleButton");

    if (
        !modal ||
        !danishLine ||
        !englishLine ||
        !exampleButton ||
        !pronounceButton ||
        !entry
    ) {
        return;
    }

    entryModalState.entryId = entry.id;
    entryModalState.entryText = toDisplayText(entry.translation || entry.text);
    entryModalState.example = entry.example || null;
    entryModalState.examples = Array.isArray(entry.examples) ? entry.examples.map((ex) => ({
        danish: toDisplayText(ex.danish),
        english: toDisplayText(ex.english),
    })) : (entry.example ? [entry.example] : []);

    const danishWord = toDisplayText(entry.translation);
    danishLine.innerHTML = danishWord
        ? `🇩🇰 <strong>${escapeHtml(danishWord)}</strong>`
        : "🇩🇰 No Danish text yet";
    englishLine.textContent = toDisplayText(entry.text) || "No English text yet";
    pronounceButton.dataset.entryId = entry.id;
    pronounceButton.classList.toggle("is-hidden", !entry.translation);

    renderEntryExamples(entryModalState.examples);
    exampleButton.removeAttribute("disabled");

    modal.classList.remove("modal--hidden");
}

function renderEntryExamples(examples) {
    const list = document.getElementById("entryModalExamples");
    const exampleButton = document.getElementById("entryModalExampleButton");
    const addButton = document.getElementById("entryModalExampleAddButton");
    if (!list || !exampleButton || !addButton) {
        return;
    }

    list.innerHTML = "";

    const normalized = Array.isArray(examples)
        ? examples
              .map((ex) => ({
                  danish: toDisplayText(ex.danish),
                  english: toDisplayText(ex.english),
              }))
              .filter((ex) => ex.danish || ex.english)
        : [];

    if (normalized.length === 0) {
        list.innerHTML = '<p class="modal__example-empty">No examples yet.</p>';
        exampleButton.classList.remove("is-hidden");
        addButton.classList.add("is-hidden");
        return;
    }

    normalized.forEach((ex, index) => {
        const item = document.createElement("div");
        item.className = "modal__example-item";

        const head = document.createElement("div");
        head.className = "modal__example-head modal__example-actions-row";

        const pronounce = document.createElement("button");
        pronounce.type = "button";
        pronounce.className = "icon-button modal__audio";
        pronounce.textContent = "🔊";
        pronounce.title = "Play pronunciation";
        pronounce.addEventListener("click", () => {
            playPronunciation(entryModalState.entryId, "example", index);
        });
        pronounce.disabled = !ex.danish;
        pronounce.classList.toggle("is-hidden", !ex.danish);

        const danish = document.createElement("p");
        danish.className = "modal__example-text modal__example-text--danish";
        danish.innerHTML = highlightTarget(formatDanishText(ex.danish), entryModalState.entryText);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "modal__trash";
        deleteButton.title = "Delete example";
        deleteButton.textContent = "🗑";
        deleteButton.addEventListener("click", () => deleteEntryExample(index));

        head.appendChild(pronounce);
        head.appendChild(danish);
        head.appendChild(deleteButton);

        const english = document.createElement("p");
        english.className = "modal__example-text modal__example-text--small";
        english.textContent = ex.english || "";

        item.appendChild(head);
        item.appendChild(english);
        list.appendChild(item);
    });

    exampleButton.classList.add("is-hidden");
    addButton.classList.remove("is-hidden");
}

async function showEntryExample(forceRefresh = false, append = false) {
    const exampleButton = document.getElementById("entryModalExampleButton");
    const addButton = document.getElementById("entryModalExampleAddButton");
    const list = document.getElementById("entryModalExamples");
    if (!exampleButton || !addButton || !list || !entryModalState.entryId) {
        return;
    }

    if (!exampleButton.classList.contains("is-hidden")) {
        exampleButton.setAttribute("disabled", "true");
        exampleButton.textContent = "Generating…";
    }
    addButton?.setAttribute("disabled", "true");
    list.innerHTML = '<p class="modal__example-empty">Working on a Danish example…</p>';

    try {
        const params = [];
        if (forceRefresh) {
            params.push("force=1");
        }
        if (append) {
            params.push("append=1");
        }
        const suffix = params.length ? `?${params.join("&")}` : "";
        const response = await fetch(`/entries/${entryModalState.entryId}/example${suffix}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            list.innerHTML = '<p class="modal__example-empty">Please log in again to view examples.</p>';
            return;
        }

        const data = await response.json();
        if (!response.ok) {
            list.innerHTML = `<p class="modal__example-empty">${escapeHtml(
                data.error || "Could not load an example."
            )}</p>`;
            return;
        }

        let examples = (data.examples || []).map((ex) => ({
            danish: toDisplayText(ex.danish),
            english: toDisplayText(ex.english),
        }));
        if ((!examples || examples.length === 0) && data.example) {
            examples = [
                {
                    danish: toDisplayText(data.example.danish),
                    english: toDisplayText(data.example.english),
                },
            ];
        }
        entryModalState.examples = examples;
        entryModalState.example = examples[0] || null;
        renderEntryExamples(entryModalState.examples);
        fetchEntries();
    } catch (error) {
        console.error("Error fetching example:", error);
        list.innerHTML = '<p class="modal__example-empty">Unable to load an example right now.</p>';
    } finally {
        renderEntryExamples(entryModalState.examples);
        exampleButton.removeAttribute("disabled");
        exampleButton.textContent = "Generate example";
        addButton?.removeAttribute("disabled");
    }
}

async function deleteEntryExample(index) {
    if (entryModalState.entryId == null) {
        return;
    }
    const list = document.getElementById("entryModalExamples");
    if (list) {
        list.innerHTML = '<p class="modal__example-empty">Removing…</p>';
    }
    try {
        const response = await fetch(`/entries/${entryModalState.entryId}/examples/${index}`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            return;
        }

        const data = await response.json();
        if (!response.ok || data.status !== "success") {
            throw new Error(data.error || "Failed to delete example.");
        }

        const updated = (data.examples || []).map((ex) => ({
            danish: toDisplayText(ex.danish),
            english: toDisplayText(ex.english),
        }));
        entryModalState.examples = updated;
        renderEntryExamples(updated);
        fetchEntries();
    } catch (error) {
        console.error("Error deleting example:", error);
        if (list) {
            list.innerHTML = '<p class="modal__example-empty">Could not delete example.</p>';
        }
    }
}

async function playPronunciation(entryId, kind = "word", exampleIndex = 0) {
    const button =
        kind === "example"
            ? null
            : document.getElementById("entryModalPronounceButton");

    if (!entryId) {
        return;
    }

    button?.setAttribute("disabled", "true");
    try {
        const params = [];
        if (kind === "example") {
            params.push("kind=example");
            params.push(`index=${exampleIndex}`);
        }
        const suffix = params.length ? `?${params.join("&")}` : "";
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
        button?.removeAttribute("disabled");
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

function openAddWordModal({ english = "", danish = "", isExternalInput = true } = {}) {
    const modal = document.getElementById("addWordModal");
    const englishField = document.getElementById("addWordEnglish");
    const danishField = document.getElementById("addWordDanish");
    const status = document.getElementById("addWordStatus");

    if (!modal || !englishField || !danishField || !status) {
        return;
    }

    addWordState.english = toDisplayText(english);
    addWordState.danish = toDisplayText(danish);
    addWordState.isExternalInput = Boolean(isExternalInput);
    if (addWordState.english && addWordState.danish) {
        addWordState.danish = "";
    }

    englishField.value = addWordState.english;
    danishField.value = addWordState.danish;
    showStatus(status, "");

    modal.classList.remove("modal--hidden");
    englishField.focus();
}

function closeAddWordModal() {
    const modal = document.getElementById("addWordModal");
    const status = document.getElementById("addWordStatus");
    if (!modal || !status) {
        return;
    }
    showStatus(status, "");
    modal.classList.add("modal--hidden");
    addWordState.isExternalInput = true;
}

async function translateAddWord() {
    const englishField = document.getElementById("addWordEnglish");
    const danishField = document.getElementById("addWordDanish");
    const status = document.getElementById("addWordStatus");
    if (!englishField || !danishField || !status) {
        return;
    }

    const englishValue = englishField.value.trim();
    const danishValue = danishField.value.trim();

    let sourceField = englishField;
    let targetField = danishField;
    let direction = "en-da";

    if (danishValue && !englishValue) {
        sourceField = danishField;
        targetField = englishField;
        direction = "da-en";
    } else if (!englishValue && !danishValue) {
        showStatus(status, "Type something to translate.");
        return;
    }

    const text = sourceField.value.trim();

    if (!text) {
        showStatus(status, "Type something to translate.");
        return;
    }

    showStatus(status, "Translating…", false);

    try {
        const response = await fetch("/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ text, direction }),
        });

        const data = await response.json();
        if (!response.ok) {
            showStatus(status, data.error || "Translation failed.");
            return;
        }

        const translation = toDisplayText(data.translation || "");
        targetField.value = translation;
        showStatus(status, "Filled suggestion.", false);
    } catch (error) {
        console.error("Error translating add-word entry:", error);
        showStatus(status, "Unable to translate right now.");
    }
}

async function saveWordFromModal() {
    const englishField = document.getElementById("addWordEnglish");
    const danishField = document.getElementById("addWordDanish");
    const status = document.getElementById("addWordStatus");

    if (!englishField || !danishField || !status) {
        return;
    }

    const englishText = englishField.value.trim();
    const danishText = danishField.value.trim();

    if (!englishText || !danishText) {
        showStatus(status, "Fill in both English and Danish first.");
        return;
    }

    showStatus(status, "Saving…", false);

    try {
        const response = await fetch("/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                english: englishText,
                danish: danishText,
                is_external_input: addWordState.isExternalInput,
            }),
        });

        if (response.status === 401) {
            updateAuthState(false, null);
            showStatus(status, "Please log in again to save this word.");
            return;
        }

        const data = await response.json();
        if (!response.ok || data.status !== "success") {
            showStatus(status, data.error || "Failed to save entry.");
            return;
        }

        showStatus(status, "Saved to your dictionary.", false);
        fetchEntries();
        setTimeout(() => closeAddWordModal(), 500);
    } catch (error) {
        console.error("Error saving practise word:", error);
        showStatus(status, "Unable to save right now.");
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
        setExerciseMode("flash_en");
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
    document.getElementById("entryModalExampleButton")?.addEventListener("click", () =>
        showEntryExample(false, false)
    );
    document.getElementById("entryModalExampleAddButton")?.addEventListener("click", () =>
        showEntryExample(true, true)
    );
    document.getElementById("entryModalPronounceButton")?.addEventListener("click", () => {
        const entryId = Number(
            document.getElementById("entryModalPronounceButton")?.dataset.entryId || 0
        );
        if (entryId) {
            playPronunciation(entryId);
        }
    });
    document.getElementById("practiseClozeCheck")?.addEventListener("click", () => {
        checkClozeAnswer();
    });
    document.getElementById("practiseClozeShowHint")?.addEventListener("click", revealClozeHint);
    document.getElementById("practiseClozeGiveUp")?.addEventListener("click", giveUpCloze);
    document.getElementById("entryModalClose")?.addEventListener("click", hideEntryModal);
    document.getElementById("entryModal")?.addEventListener("click", (event) => {
        if (event.target.id === "entryModal") {
            hideEntryModal();
        }
    });
    document.getElementById("addWordTranslate")?.addEventListener("click", translateAddWord);
    document.getElementById("addWordSave")?.addEventListener("click", saveWordFromModal);
    document.getElementById("addWordCancel")?.addEventListener("click", closeAddWordModal);
    document.getElementById("addWordModal")?.addEventListener("click", (event) => {
        if (event.target.id === "addWordModal") {
            closeAddWordModal();
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

    const practiseModeButtons = document.querySelectorAll(".practise__mode-card");
    practiseModeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            enterPractiseMode(button.dataset.mode);
        });
    });

    document.getElementById("practiseBackButton")?.addEventListener("click", () => {
        showPractiseModeSelection();
    });

    clearEntriesList("Sign in to see your saved words.");
    updateDirectionUI();
    checkAuthStatus();
    resetPractiseState("Sign in to start practising.");
    updateAiPractiseAvailability();
}

document.addEventListener("DOMContentLoaded", initApp);
