

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

async function SaveToDatabase() {
    const text = document.getElementById("userText").value;
    const translation = document.getElementById("translationResult").textContent;
    //const notes = document.getElementById("notes").value.trim();
    console.log(text)
    console.log(translation)

    if (!text || !translation) {
        alert("Text and translation cannot be empty!");
        return;
    }

    try {
        const response = await fetch("/save", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                text: text,
                translation: translation
               
            }),
        });

        const result = await response.json();
        if (result.status === "success") {
            alert("Entry saved successfully!");
        } else {
            alert("Failed to save entry.");
        }
    } catch (error) {
        console.error("Error saving entry:", error);
        alert("An error occurred while saving.");
    }
}


