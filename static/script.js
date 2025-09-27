async function translateText() {
    const input = document.getElementById("userText").value;
    const result = document.getElementById("translationResult");

    if (input.trim() === "") {
        result.textContent = "Please type something!";
        return;
    }

    try {
        const response = await fetch("/translate", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text: input })
        });

        const data = await response.json();
        result.textContent = data.translation;
    } catch (error) {
        console.error("Error:", error);
        result.textContent = "Error during translation";
    }
}

