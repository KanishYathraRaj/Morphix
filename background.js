console.log("Background script loaded!");  
  
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs.length > 0) {
    const activeTab = new URL(tabs[0].url); 
    const activeTabURL = activeTab.hostname; 
    console.log("Active Tab URL:", activeTabURL);
    // loadChanges(activeTabURL);
  } else {
    console.error("No active tab found!");
  }
});
