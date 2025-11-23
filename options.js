// Load and display rules on options page
document.addEventListener("DOMContentLoaded", () => {
  const infoDiv = document.getElementById("info");

  chrome.runtime.sendMessage(
    { type: "GET_RULES" },
    (response) => {
      if (chrome.runtime.lastError) {
        infoDiv.textContent = "Error loading rules: " + chrome.runtime.lastError.message;
        console.error("[RedditFilter] Error loading rules:", chrome.runtime.lastError);
      } else if (response.success) {
        // Display rules as formatted JSON
        infoDiv.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word; font-family: monospace; font-size: 12px;">${JSON.stringify(response.rules, null, 2)}</pre>`;
      } else {
        infoDiv.textContent = "Error: Failed to load rules";
      }
    }
  );
});

