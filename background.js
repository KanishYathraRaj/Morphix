console.log("Background script loaded!");  
const dummy = setUniqueId();
chrome.storage.local.get(null, (result) => {
  console.log("Entire storage data:", result);
});

setAppliedChanges('appliedChanges');


// setTimeout(() => {
//   console.log("Host name:", host);
// }, 2000);
// setAppliedChanges(host);

// async function hostName(){
  // chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  //     if (tabs.length > 0) {
  //       const activeTab = new URL(tabs[0].url); 
  //       const activeTabURL = activeTab.hostname; 
  //       console.log("Active Tab URL:", activeTabURL);
  //       return activeTabURL
  //     } else {
  //       return "No active tab found!";
  //     }
  // });
// }
function setAppliedChanges(url) {
  chrome.storage.local.get([url], (result) => { 
    console.log(`Value for '${url}':`, result[url]);
    getAppliedChanges(result[url]);
  });
}
function getAppliedChanges(changesJSON) {
    try {
        if (changesJSON) {
            const appliedChanges = JSON.parse(changesJSON);
            appliedChanges.forEach((change, index) => {
                const element = document.getElementById(change.uniqueId);
                element.style.cssText = change.cssText;
                console.log(`Applied successfully for ${change.uniqueId} : `, element.style.cssText);
            });
        } else {
          console.log('No applied changes Found in Local Storage.');
        }
        return "success";
    } catch (error) {
        console.error('Error retrieving or parsing applied changes:', error);
        return "failure";
    }
}
async function setUniqueId(){
    console.log("setUniqueId called.");
    const allElements = document.querySelectorAll('*');
    let uniqueIdCounter = 0;
    allElements.forEach((element) => {
      if (!element.id) {
        element.id = `uid-${uniqueIdCounter++}`;
      }
    });
}





// chrome.tabs.onActivated.addListener((activeInfo) => {
//   chrome.tabs.get(activeInfo.tabId, (tab) => {
//     if (tab && isValidURL(tab.url)) {
//       const activeTaburl = new URL(tab.url);
//       console.log("Active Tab URL:", activeTaburl.hostname);
//       setAppliedChanges(activeTaburl.hostname);
//     }
//   });
// });

// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   if (changeInfo.status === "complete" && isValidURL(tab.url)) {
//     const activeTaburl = new URL(tab.url);
//     console.log("Updated Tab URL:", activeTaburl.hostname);
//     setAppliedChanges(activeTaburl.hostname);
//   }
// });


// function isValidURL(url) {
//   return url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://");
// }



  
