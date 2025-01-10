console.log("Content Script loaded!");



function getAppliedChanges(url) {

  const changesJSON = localStorage.getItem(url);

  return new Promise((resolve, reject) => {
  // Query the active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;

      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: (changesJSON) => {
            try {
              if (changesJSON) {
                const appliedChanges = JSON.parse(changesJSON);
    
                appliedChanges.forEach((change, index) => {
                  const element = document.getElementById(change.uniqueId);
                  element.style.cssText = change.cssText;
                  console.log(`Applied successfully for ${change.uniqueId} : `, element.style.cssText);
                });

              } else {
                console.log('No applied changes found in localStorage.');
              }
              return "success";
            } catch (error) {
              console.error('Error retrieving or parsing applied changes:', error);
              return "failure";
            }
          
          },
          args: [changesJSON],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error(`Error: ${chrome.runtime.lastError.message}`);
            reject(chrome.runtime.lastError.message);
          } else if (results && results[0]) {
            console.log("Applied changes", results[0].result);
            resolve(results[0].result);
          }
        }
      );
      
    });
  });
}

function activeTabloaded()
{
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) {
        reject(new Error("No active tab found"));
        return;
      }
      
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => document.readyState === "complete",
      })
      .then(results => {
        if (results && results[0] && results[0].result !== undefined) {

          if(results[0].result != "true"){
            console.log("Active Document ready state:", results[0].result);
          }
          resolve(results[0].result != "true" ? true : false);
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

async function loadChanges (url) {
  try {
    const activeTabLoaded = await activeTabloaded();
    
    if (activeTabLoaded === true) {
      console.log("Active page fullly loaded : " , activeTabLoaded );
      await activeTab(setUniqueId);
      console.log("setUniqueId completed.");
      getAppliedChanges(url);
    }
  } catch (error) {
    console.error("Error during initialization:", error);
  }
}

function getActiveTabURL() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        const activeTab = new URL(tabs[0].url); 
        const activeTabURL = activeTab.hostname; 
        console.log("Active Tab URL:", activeTabURL);
        resolve(activeTabURL);
      } else {
        reject(new Error("No active tab found!"));
      }
    });
  });
}









