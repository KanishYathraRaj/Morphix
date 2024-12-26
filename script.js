document.getElementById("userInput").addEventListener("keypress", function(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    document.getElementById("sendMessage").click();
  }
});

document.getElementById("sendMessage").addEventListener("click", async function() {
  const userInput = document.getElementById("userInput").value;
  if (userInput==null || userInput.trim() === "") return;

  addMessage(userInput, "user");
  document.getElementById("userInput").value = "";
  addMessage("Processing...", "bot");

  try {
    const customPageSource = createPageSource();

    // const d = await activeTab(domStructure);
    // console.log(d);
    
    // const dummy = await activeTab(setUniqueId);
    
    // console.log("Getting Page Source.......................");
    // const pageSource = await getPageSource();
    // console.log("Page Source...............................", pageSource.length);

    // console.log("Generating Code...........................");
    // const generatedCode = await generateCode(pageSource, userInput.trim());
    // console.log("Generated Code............................", generatedCode);

    
    // console.log("Applying Generated Code...................");
    // await applyGeneratedCode(generatedCode);
    // console.log("Generated Code Applied....................");
    
    document.getElementById("chat-messages").lastElementChild.remove();

    addMessage("Changes applied successfully!", "bot");
    
  } catch (error) {
    document.getElementById("chat-messages").lastElementChild.remove();
    addMessage(`Error: ${error.message}`, "bot");
  }
});

function activeTab(injectedFunction) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        reject(new Error("No active tab found"));
        return;
      }
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: injectedFunction,
      })
      .then(results => {
        if (results && results[0] && results[0].result !== undefined) {
          resolve(results[0].result);
        } else {
          reject(new Error("No results from tab execution"));
        }
      })
      .catch(error => {
        reject(new Error(`Tab execution failed: ${error.message}`));
      });
    });
  });
}

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
              3. Each element will be given a unique identifier
              5. Respond ONLY in this exact format:

              ###CODE_CHANGES_START###
              DESCRIPTION: <brief description of changes>
              
              UNIQUE_ID: <unique identifier for the file(use html element id)>
              MODIFICATION: "<complete modified inlineStyle CSS of that unique element>":
              
              [Repeat UNIQUE_ID/MODIFICATION sections for each modified element file]
              ###CODE_CHANGES_END###

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

      // Parse the changes into an array of objects
      const changes = [...changesSection.matchAll(/UNIQUE_ID:\s*(\S+)[\s\S]*?MODIFICATION:\s*"([\s\S]*?)"/g)].map(
        (match) => ({
          uniqueId: match[1].trim(),
          modification: match[2].trim(),
        })
      );

      if (changes.length === 0) {
        throw new Error("No valid modifications found in the changes section");
      }

      // Apply changes to the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.scripting.executeScript(
          {
            target: { tabId: tabs[0].id },
            func: (changes) => {
              changes.forEach(({ uniqueId, modification }) => {
                const element = document.getElementById(uniqueId);
                if (element) {
                  // Apply the modification as inline styles
                  const stylePairs = modification.split(';').filter(Boolean);
                  stylePairs.forEach((stylePair) => {
                    const [property, value] = stylePair.split(':').map((s) => s.trim());
                    if (property && value) {
                      element.style.setProperty(property, value);
                    }
                  });
                }
              });
            },
            args: [changes],
          },
          (injectionResults) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError.message);
            } else {
              resolve("Styles applied successfully");
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

function setUniqueId(){
  const allElements = document.querySelectorAll('*');
  let uniqueIdCounter = 0;
  allElements.forEach((element) => {
    if (!element.id) {
      element.id = `uid-${uniqueIdCounter++}`;
    }
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

async function domStructure(){
  function traverse(element) {
    console.log(`Tag: ${element.tagName}, ID: ${element.id}`);
    Array.from(element.children).forEach(child => traverse(child));
  }
  traverse(document.body);
  return "success at traverse";
}

function createPageSource() {
  // Query the active tab in the current window
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0].id;

    chrome.scripting.executeScript(
      {
        target: { tabId },
        func: () => {
          // Function to traverse and reconstruct the page source
          function traverseDOM(element) {
            // Handle text nodes
            if (element.nodeType === Node.TEXT_NODE) {
              return element.textContent.trim();
            }
          
            // Handle element nodes
            if (element.nodeType === Node.ELEMENT_NODE) {
              const tagName = element.tagName.toLowerCase();
          
              // Exclude <script> and <style> elements
              if (tagName === "script" || tagName === "style") {
                return "";
              }
          
              // Safely extract attributes
              const attributes = element.attributes
                ? Array.from(element.attributes)
                    .map(attr => `${attr.name}="${attr.value}"`)
                    .join(" ")
                : "";
          
              // Safely extract inline styles
              const style = element.style && element.style.cssText
                ? ` style="${element.style.cssText}"`
                : "";
          
              // Traverse child nodes safely
              const children = element.childNodes
                ? Array.from(element.childNodes)
                    .map(child => traverseDOM(child))
                    .join("")
                : "";
          
              // Construct and return the element's HTML
              return `<${tagName}${attributes ? " " + attributes : ""}${style}>${children}</${tagName}>`;
            }
          
            // Fallback for other node types
            return "";
          }
          

          const htmlContent = traverseDOM(document.body);
          const doctype = document.doctype ? `<!DOCTYPE ${document.doctype.name}>` : "";
          const head = document.head.innerHTML;

          // Full page source
          return `${doctype}<head>${head}</head>${htmlContent}</html>`;
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error(`Error: ${chrome.runtime.lastError.message}`);
        } else if (results && results[0]) {
          console.log("Page Source Length : ", results[0].result.length);
          console.log("Page Source:", results[0].result);
          return results[0].result;
        }
      }
    );
  });
}