console.log("Background script loaded!");  
const dummy = setUniqueId();


setTimeout(() => {
    chrome.storage.local.get(["appliedChanges"], (result) => { 
        console.log("Value for 'AppliedChanges':", result.appliedChanges);
        getAppliedChanges(result.appliedChanges);
    });
}, 2000);

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
          console.log('No applied changes found in localStorage.');
        }
        return "success";
    } catch (error) {
        console.error('Error retrieving or parsing applied changes:', error);
        return "failure";
    }
}

async function setUniqueId(){
    const allElements = document.querySelectorAll('*');
    let uniqueIdCounter = 0;
    allElements.forEach((element) => {
      if (!element.id) {
        element.id = `uid-${uniqueIdCounter++}`;
      }
    });
}
