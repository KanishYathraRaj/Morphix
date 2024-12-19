document.getElementById('getHTML').addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      document.getElementById('htmlContent').textContent = 'No tab found';
      return;
    }

    // Execute script to replace content
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        // Find and replace in text nodes
        function replaceText(node) {
          if (node.nodeType === Node.TEXT_NODE) {
            node.textContent = node.textContent.replace(/Sign In/g, 'SivaNithish');
          } else {
            node.childNodes.forEach(replaceText);
          }
        }

        // Replace in the entire document
        replaceText(document.body);

        // Also replace in attributes like title, alt, etc.
        document.querySelectorAll('*').forEach(element => {
          Array.from(element.attributes).forEach(attr => {
            if (attr.value.includes('Netflix')) {
              element.setAttribute(attr.name, attr.value.replace(/Netflix/g, 'JavaScript'));
            }
          });
        });

        return 'Content replaced successfully!';
      }
    });

    document.getElementById('htmlContent').textContent = results[0].result;
  } catch (error) {
    document.getElementById('htmlContent').textContent = 'Error: ' + error.message;
    console.error('Full error:', error);
  }
}); 