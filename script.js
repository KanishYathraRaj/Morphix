document.getElementById("sendMessage").addEventListener("click", async function() {
  const userInput = document.getElementById("userInput").value;
  if (userInput==null && userInput.trim() === "") return;

  addMessage(userInput, "user");
  document.getElementById("userInput").value = "";

  try {
    activeTab(getStyles)
    .then((styles) => {
      console.log(styles);

    })
    .catch((error) => {
      console.error("Error:", error);
    });

    // const pageSource = await getPageSource();
    // const generatedCode = await generateCode(pageSource, userInput.trim());
    // await applyGeneratedCode(generatedCode);
    // addMessage(pageSource, "bot");
    // addMessage(generatedCode, "bot");
  } catch (error) {
    addMessage(`Error: ${error}`, "bot");
  }

});

async function generateCode(pageSource, prompt) {
  const API_KEY = 'AIzaSyDtRxzdQ1RLZNH2KSMtsNWP8ZKyIrtDBUo';
  const RATE_LIMIT_DELAY = 1000; // 1 second between requests
  let lastRequestTime = 0;

  const MAX_RETRIES = 3;
  let retries = 0;

  while (retries < MAX_RETRIES) {
      try {
          console.log(`Attempt ${retries + 1} of ${MAX_RETRIES}`);

          if (retries > 0) {
              const backoffDelay = RATE_LIMIT_DELAY * Math.pow(2, retries);
              console.log(`Retry backoff: waiting ${backoffDelay}ms`);
              await new Promise(resolve => setTimeout(resolve, backoffDelay));
          }

          // Regular rate limiting
          const now = Date.now();
          const timeSinceLastRequest = now - lastRequestTime;
          if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
              const waitTime = RATE_LIMIT_DELAY - timeSinceLastRequest;
              console.log(`Rate limit: waiting ${waitTime}ms`);
              await new Promise(resolve => 
                  setTimeout(resolve, waitTime)
              );
          }
          lastRequestTime = Date.now();

          console.log('Making API request...', {
              timestamp: new Date().toISOString(),
              prompt: prompt.substring(0, 50) + '...'
          });

          const fullPrompt = `
              You are a code modification expert. I will provide you with the current webpage code and a user's modification request.
              Your task is to:

              1. Analyze the entire codebase thoroughly
              2. Provide COMPLETE code changes that can be directly implemented
              3. Ensure the changes are syntactically correct and maintain functionality
              4. Include ALL necessary code including imports and dependencies
              5. Respond ONLY in this exact format:

              ###CODE_CHANGES_START###
              DESCRIPTION: <brief description of changes>
              
              FILE: <filename>
              OLD:
              <complete section of old code to be replaced>
              NEW:
              <complete section of new code that will replace it>
              
              [Repeat FILE/OLD/NEW sections for each file if multiple files need changes]
              ###CODE_CHANGES_END###

              Please ALSO be sure to provide the entire old code snippet EXACTLY in the OLD section
              so that it can be matched and replaced easily.

              Current webpage source:
              ${pageSource}

              User modification request: ${prompt}
          `;

          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                  contents: [{
                      parts: [{
                          text: fullPrompt
                      }]
                  }]
              })
          });

          if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          const data = await response.json();
          console.log('API response received:', data);

          return data.candidates[0].content.parts[0].text;

      } catch (error) {
          console.error('Error in API request:', {
              error: error.message,
              retry: retries + 1,
              maxRetries: MAX_RETRIES
          });
          
          retries++;
          if (retries === MAX_RETRIES || !error.message.includes('429')) {
              throw error;
          }
      }
  }
}

async function applyGeneratedCode(generatedCode) {
  return new Promise((resolve, reject) => {
    try {
      // Extract code changes between markers
      const changesMatch = generatedCode.match(/###CODE_CHANGES_START###([\s\S]*?)###CODE_CHANGES_END###/);
      if (!changesMatch) {
        throw new Error("No valid code changes found");
      }

      const changesSection = changesMatch[1].trim();
      const changes = changesSection
        .split('OLD:')
        .filter(Boolean)
        .map(change => {
          const [oldCode, ...newParts] = change.split('NEW:');
          return {
            oldCode: oldCode.trim(),
            newCode: newParts.join('NEW:').trim()
          };
        });

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            func: (changes) => {
              changes.forEach(({ oldCode, newCode }) => {
                const escapedOldCode = oldCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedOldCode, 'g');
                
                // Find elements containing the old code
                const walker = document.createTreeWalker(
                  document.body,
                  NodeFilter.SHOW_TEXT,
                  null,
                  false
                );

                const nodesToUpdate = [];
                let node;
                while (node = walker.nextNode()) {
                  if (node.textContent.includes(oldCode)) {
                    nodesToUpdate.push(node);
                  }
                }

                // Apply changes only to matching elements
                nodesToUpdate.forEach(node => {
                  node.textContent = node.textContent.replace(regex, newCode);
                });
              });
            },
            args: [changes]
          },
          (injectionResults) => {
            if (injectionResults) {
              resolve();
            } else {
              reject("Failed to apply generated code");
            }
          }
        );
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getPageSource() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: () => document.documentElement.outerHTML
        },
        (injectionResults) => {
          if (injectionResults && injectionResults[0] && injectionResults[0].result) {
            resolve(injectionResults[0].result);
          } else {
            reject("Failed to get page source");
          }
        }
      );
    });
  });
}

function addMessage(message, sender) {
  const messageContainer = document.createElement("div");
  messageContainer.classList.add("message", sender);
  const messageBubble = document.createElement("div");
  messageBubble.classList.add("bubble");
  messageBubble.textContent = message;
  messageContainer.appendChild(messageBubble);
  document.getElementById("chat-messages").appendChild(messageContainer);
}

function activeTab(functionName) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          func: functionName
        },
        (injectionResults) => {
          if (injectionResults && injectionResults[0] && injectionResults[0].result) {
            resolve(injectionResults[0].result); // Return the styles
          } else {
            reject("Failed to get styles");
          }
        }
      );
    });
  });
}

function getStyles() {
  const allElements = document.querySelectorAll('*');
  const inlineStyles = [];

  allElements.forEach((element) => {
    if (element.style.cssText) {
      inlineStyles.push({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: [...element.classList],
        styles: element.style.cssText
      });
    }
  });

  return inlineStyles;
}

function applyStyles(updatedStyles) {
  updatedStyles.forEach((styleData) => {
    const selector = `${styleData.tag}${styleData.id ? `#${styleData.id}` : ''}${styleData.classes.length ? '.' + styleData.classes.join('.') : ''}`;
    const element = document.querySelector(selector);
    if (element) {
      element.style.cssText = styleData.styles;
    }
  });
}

