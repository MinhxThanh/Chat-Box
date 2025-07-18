(() => {
  let selectionDot = null;
  let currentSelectedText = '';

  // Function to create and show the dot
  function showSelectionDot(x, y) {
    if (!selectionDot) {
      selectionDot = document.createElement('div');
      selectionDot.className = 'chatbox-selection-dot';
      selectionDot.title = 'Command + E to open Chat Box'; // Tooltip text
      document.body.appendChild(selectionDot);

      // On click, just hide the dot. The text is already in the chat box.
      selectionDot.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openSidebar' });
        hideSelectionDot();
      });
    }
    selectionDot.style.left = `${x}px`;
    selectionDot.style.top = `${y}px`;
    selectionDot.style.display = 'block';
  }

  // Function to hide the dot
  function hideSelectionDot() {
    if (selectionDot) {
      selectionDot.style.display = 'none';
    }
  }
  
  // Function to send selected text to the sidebar
  function sendTextToSidebar(text) {
    // Only send a message if the text has actually changed to avoid spamming
    if (text !== currentSelectedText) {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ 
          type: 'SET_SELECTED_TEXT', 
          text: text
        }, (response) => {
          if (chrome.runtime.lastError) {
            // This will typically be 'Extension context invalidated.'
            // We can log it or just ignore it to prevent the script from halting.
            console.log('Could not send message to sidebar:', chrome.runtime.lastError.message);
          }
        });
      }
      currentSelectedText = text;
    }
  }

  // Listen for mouse up to detect text selection
  document.addEventListener('mouseup', (event) => {
    // Don't do anything if the click was on our dot
    if (selectionDot && event.target === selectionDot) {
      return;
    }
    
    // A brief delay to ensure the selection is registered
    setTimeout(() => {
      const selection = window.getSelection();
      const selectedText = selection.toString().trim();

      if (selectedText) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // Position the dot at the top-left of the selection
        showSelectionDot(rect.left + window.scrollX, rect.top + window.scrollY);
        sendTextToSidebar(selectedText);
      } else {
        // If nothing is selected, ensure the dot is hidden and the sidebar is cleared
        hideSelectionDot();
        sendTextToSidebar(null);
      }
    }, 10);
  });

  // Hide the dot if the user clicks elsewhere
  document.addEventListener('mousedown', (event) => {
    if (selectionDot && event.target !== selectionDot) {
      hideSelectionDot();
      sendTextToSidebar(null);
    }
  });
})();
