(() => {
  let selectionDot = null;
  let quickPanel = null;
  let currentSelectedText = "";
  let availableModels = {};
  let selectedModel = null;
  let selectedLanguage = "English";
  let aiChatSettings = null;
  let conversationHistory = []; // Track conversation messages
  let responseTabs = []; // Track response tabs
  let activeTabIndex = 0; // Current active tab
  let currentStreamController = null; // Track current AI stream for cancellation

  // Language options for translation
  const languages = [
    "English",
    "Spanish",
    "Mandarin Chinese",
    "Hindi",
    "French",
    "Arabic",
    "Bengali",
    "Russian",
    "Portuguese",
    "Indonesian",
    "German",
    "Japanese",
    "Swahili",
    "Korean",
    "Italian",
    "Turkish",
    "Dutch",
    "Polish",
    "Thai",
    "Vietnamese",
  ];
  // 1. Configuration for navigation buttons
  const navButtonsConfig = [
    {
      action: "summarize",
      title: "Summarize",
      icon: "assets/action-icons/summarize.svg",
    },
    {
      action: "explain",
      title: "Explain",
      icon: "assets/action-icons/explain.svg",
    },
    {
      action: "translate",
      title: "Translate",
      icon: "assets/action-icons/translate.svg",
    },
    {
      action: "rewrite",
      title: "Rewrite", 
      icon: "assets/action-icons/rewrite.svg",
    },
    {
      action: "grammar",
      title: "Fix Grammar",
      icon: "assets/action-icons/grammar.svg",
    },
  ];

  // Function to create and show the dot
  function showSelectionDot(x, y, options = {}) {
    const { isInput = false } = options;

    if (!selectionDot) {
      selectionDot = document.createElement("div");
      selectionDot.className = "chatbox-selection-dot";
      selectionDot.title = "Cmd + E to open Chat Box"; // Tooltip text

      // Create the main button icon
      selectionDot.innerHTML = `
        <button id="chatbox-button-icon" class="chatbox-button-icon">
          <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="100%" height="100%" viewBox="0,0,256,256" preserveAspectRatio="xMidYMid meet">
            <g fill="#ffffff" fill-rule="nonzero" stroke="none" stroke-width="1" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="10" stroke-dasharray="" stroke-dashoffset="0" font-family="none" font-weight="none" font-size="none" text-anchor="none" style="mix-blend-mode: normal">
              <g transform="scale(5.12,5.12)">
                <path d="M49.726,25.312l-18,-19c-0.003,-0.003 -0.007,-0.004 -0.01,-0.007c-0.074,-0.076 -0.165,-0.133 -0.26,-0.182c-0.022,-0.011 -0.038,-0.031 -0.061,-0.041c-0.074,-0.032 -0.158,-0.038 -0.24,-0.051c-0.05,-0.008 -0.095,-0.031 -0.146,-0.031c-0.001,0 -0.003,0.001 -0.005,0.001c-0.001,0 -0.003,-0.001 -0.004,-0.001h-11.852c-0.026,0 -0.048,0.013 -0.074,0.015c-0.025,-0.002 -0.048,-0.015 -0.074,-0.015c-0.002,0 -0.005,0 -0.007,0c-0.272,0.002 -0.532,0.114 -0.719,0.312l-17.98,18.98c-0.001,0.001 -0.001,0.001 -0.002,0.002l-0.017,0.018c-0.038,0.041 -0.056,0.091 -0.086,0.136c-0.039,0.058 -0.085,0.11 -0.112,0.176c-0.098,0.241 -0.098,0.51 0,0.751c0.027,0.066 0.073,0.118 0.112,0.176c0.03,0.045 0.048,0.095 0.086,0.136l0.017,0.018c0.001,0.001 0.001,0.001 0.002,0.002l17.98,18.979c0.188,0.2 0.451,0.354 0.726,0.312c0.026,0 0.049,-0.013 0.074,-0.015c0.026,0.004 0.048,0.017 0.074,0.017h11.632c0.039,0 0.072,-0.018 0.11,-0.022c0.038,0.004 0.072,0.022 0.11,0.022c0.002,0 0.005,0 0.007,0c0.272,-0.002 0.532,-0.114 0.719,-0.312l18,-19c0.366,-0.386 0.366,-0.99 0,-1.376zM46.675,25h-8.725l-11.575,-11.869l4.611,-4.69zM36.023,25.888c-0.003,0.029 -0.016,0.054 -0.017,0.083l-11.033,11.412l-11.172,-11.462l11.172,-11.364zM28.615,8l-3.636,3.698l-3.607,-3.698zM19.011,8.443l4.565,4.682l-11.674,11.875h-8.577zM19.008,43.554l-15.683,-16.554h8.675c0.018,0 0.032,-0.009 0.05,-0.01l11.532,11.832zM21.358,44l3.621,-3.745l3.65,3.745zM30.99,43.557l-4.621,-4.741l11.424,-11.816h8.882z"></path>
              </g>
            </g>
          </svg>
        </button>
      `;

      // Create the navigation container
      const navContainer = document.createElement("div");
      navContainer.className = "chatbox-selection-nav";
      selectionDot.appendChild(navContainer);
      document.body.appendChild(selectionDot);

      // 2. Dynamically create and add navigation buttons
      navButtonsConfig.forEach(({ action, title, icon }) => {
        const button = document.createElement("div");
        button.className = "chatbox-nav-button";
        button.dataset.action = action;
        button.title = title;

        const img = document.createElement("img");
        img.src = chrome.runtime.getURL(icon);
        // Hard constrain to avoid host page CSS overrides
        img.width = 20;
        img.height = 20;
        img.style.width = '20px';
        img.style.height = '20px';
        img.style.maxWidth = 'none';
        img.style.objectFit = 'contain';
        button.appendChild(img);

        navContainer.appendChild(button);
      });

      // Add event listeners for navigation buttons
      const navButtons = selectionDot.querySelectorAll(".chatbox-nav-button");
      navButtons.forEach((button) => {
        button.addEventListener("click", (e) => {
          e.stopPropagation();
          const action = button.getAttribute("data-action");
          handleNavAction(action);
        });
      });

      // On click of the main icon, open sidebar
      // selectionDot.addEventListener("click", (e) => {
      //   // Only open sidebar if NOT clicking on nav buttons
      //   if (!e.target.closest(".chatbox-nav-button")) {
      //     chrome.runtime.sendMessage({ action: "openSidebar" });
      //     hideSelectionDot();
      //   }
      // });
    }

    let finalX = x - 10;
    let finalY = y - 44; // Default 'top-left'

    // For inputs, if the default top position is too close to the edge of the viewport,
    // move the dot to appear below the selection instead.
    if (isInput) {
      const yRelativeToViewport = y - window.scrollY;
      // If the top of the selection is less than the height of the dot, it risks being clipped.
      if (yRelativeToViewport < 52) {
        finalY = y + 32; // place it 12px below the input's top line
      }
    }

    selectionDot.style.left = `${finalX}px`;
    selectionDot.style.top = `${finalY}px`;
    selectionDot.style.display = "block";

    // Adjust nav position based on viewport bounds (avoid clipping at top)
    adjustSelectionNavPosition();
  }

  // Ensure the action nav stays inside the viewport
  function adjustSelectionNavPosition() {
    if (!selectionDot) return;
    const nav = selectionDot.querySelector(".chatbox-selection-nav");
    if (!nav) return;

    const rect = selectionDot.getBoundingClientRect();
    // Approx nav height including padding/shadow
    const approxNavHeight = 56;
    if (rect.top < approxNavHeight + 8) {
      nav.classList.add("nav-below");
    } else {
      nav.classList.remove("nav-below");
    }

    // Horizontal adjustment to prevent clipping on the left edge
    // const navWidth = nav.offsetWidth; // This is unreliable as nav is hidden initially
    const approxNavWidth = 180; // ~5 buttons * 32px width + gaps + padding
    const dotCenter = rect.left + rect.width / 2;
    const viewportWidth = window.innerWidth;

    // Reset horizontal alignment first
    nav.classList.remove("nav-align-left", "nav-align-right");

    if (dotCenter < approxNavWidth / 2) {
      // Too close to the left edge, align left
      nav.classList.add("nav-align-left");
    } else if (dotCenter + approxNavWidth / 2 > viewportWidth - 8) {
      // Too close to the right edge (with 8px margin), align right
      nav.classList.add("nav-align-right");
    }
  }

  // Function to create and show the quick panel
  function showQuickPanel(action, selectedText) {
    // Check extension context before proceeding
    if (!isExtensionContextValid()) {
      console.error('Extension context invalidated during showQuickPanel');
      return;
    }

    // Reset conversation history and tabs for new action
    conversationHistory = [];
    currentSelectedText = selectedText;
    responseTabs = [{ id: 0, label: 'Initial', content: '', timestamp: Date.now() }];
    activeTabIndex = 0;

    if (!quickPanel) {
      if (selectedText && selectedText.trim().length > 0) {
        quickPanel = document.createElement("div");
        quickPanel.className = "chatbox-base-quick-panel";
        document.body.appendChild(quickPanel);
      }
    }

    // Set panel content
    quickPanel.innerHTML = `
      <div class="quick-panel-header">
        <span>${action.charAt(0).toUpperCase() + action.slice(1)}</span>

        <div class="quick-panel-header-right">
        ${action === 'translate' ? `
         <div class="language-selector-container ${action === 'translate' ? 'active' : ''}">
          <label class="language-selector-label">Target Language:</label>
          <div class="language-selector">
            <button class="language-selector-button" type="button">
              <span class="selected-language">${selectedLanguage}</span>
              <svg class="language-dropdown-arrow" fill="currentColor" width="12" height="12" viewBox="0 0 12 12">
                <path fill-rule="evenodd" d="M1.167 3.655a.47.47 0 0 1 .663-.004l3.84 3.8c.183.182.477.182.66 0l3.84-3.8a.469.469 0 1 1 .66.667l-3.84 3.8a1.406 1.406 0 0 1-1.98 0l-3.84-3.8a.47.47 0 0 1-.003-.663" clip-rule="evenodd"></path>
              </svg>
            </button>
            <div class="language-dropdown-menu">
              ${languages.map(lang => `
                <div class="language-option ${lang === selectedLanguage ? 'selected' : ''}" data-language="${lang}">
                  ${lang}
                </div>
              `).join('')}
            </div>
          </div>
        </div>
        ` : ''}
        <button class="quick-panel-close">&times;</button>
      </div>
      </div>
      <div class="quick-panel-content">
        <div class="selected-text-display">
          <div class="wrapper">
            <div class="content">${selectedText}</div>
          </div>
          <div class="collapse-btn">
            <span class="arrow-icon">
              <svg fill="currentColor" width="12" height="12" viewBox="0 0 12 12">
                <path fill-rule="evenodd" d="M1.167 3.655a.47.47 0 0 1 .663-.004l3.84 3.8c.183.182.477.182.66 0l3.84-3.8a.469.469 0 1 1 .66.667l-3.84 3.8a1.406 1.406 0 0 1-1.98 0l-3.84-3.8a.47.47 0 0 1-.003-.663" clip-rule="evenodd"></path>
              </svg>
            </span>
          </div>
        </div>
        <div class="response-tabs-container">
          <div class="response-tabs-header">
            <div class="response-tabs"></div>
            <div class="tab-navigation">
              <button class="tab-nav-btn" id="prev-tab" title="Previous response" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="15,18 9,12 15,6"></polyline>
                </svg>
              </button>
              <button class="tab-nav-btn" id="next-tab" title="Next response" disabled>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="9,18 15,12 9,6"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="response-tabs-content">
            <div class="tab-content active" data-tab="0">
              <div class="action-result">
               
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="quick-panel-footer">
          <div class="quick-panel-toolbar">
           <div class="continue-chat-section">            
             <span class="chat-input-text" title="What would you like to know?">What would you like to know?</span>
             <div class="enter-icon">
               <svg width="10" height="10" fill="none" viewBox="0 0 17 16">
                 <path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 2.625a.625.625 0 0 0-1.25 0v5.938c0 .345-.28.624-.625.624H4.134l2.495-2.495a.625.625 0 0 0-.883-.884L3.067 8.487a1.875 1.875 0 0 0 0 2.651l2.679 2.679a.625.625 0 1 0 .883-.884l-2.495-2.495h8.491c1.036 0 1.875-.84 1.875-1.876V2.625Z" fill="currentColor"/>
               </svg>
             </div>
           </div>

           <div class="continue-chat-input">
             <input type="text" placeholder="What would you like to know?" />
             <div class="continue-input-actions">
               <button class="input-action-btn" title="Send" data-action="send">
                 <svg width="10" height="10" fill="none" viewBox="0 0 17 16">
                   <path fill-rule="evenodd" clip-rule="evenodd" d="M14.5 2.625a.625.625 0 0 0-1.25 0v5.938c0 .345-.28.624-.625.624H4.134l2.495-2.495a.625.625 0 0 0-.883-.884L3.067 8.487a1.875 1.875 0 0 0 0 2.651l2.679 2.679a.625.625 0 1 0 .883-.884l-2.495-2.495h8.491c1.036 0 1.875-.84 1.875-1.876V2.625Z" fill="currentColor"/>
                 </svg>
               </button>
               <button class="input-action-btn" title="Cancel" data-action="cancel">
                 <svg width="10" height="10" fill="none" viewBox="0 0 16 16">
                   <path fill-rule="evenodd" clip-rule="evenodd" d="M12.6569 3.34315C12.2663 2.95262 11.6332 2.95262 11.2426 3.34315L8 6.58579L4.75736 3.34315C4.36683 2.95262 3.73367 2.95262 3.34314 3.34315C2.95262 3.73367 2.95262 4.36683 3.34314 4.75736L6.58579 8L3.34314 11.2426C2.95262 11.6332 2.95262 12.2663 3.34314 12.6569C3.73367 13.0474 4.36683 13.0474 4.75736 12.6569L8 9.41421L11.2426 12.6569C11.6332 13.0474 12.2663 13.0474 12.6569 12.6569C13.0474 12.2663 13.0474 11.6332 12.6569 11.2426L9.41421 8L12.6569 4.75736C13.0474 4.36683 13.0474 3.73367 12.6569 3.34315Z" fill="currentColor"/>
                 </svg>
               </button>
             </div>
           </div>
         
           
           <div class="divider"></div>
           
           <div class="toolbar-actions">
            <button class="icon-btn" title="Copy">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M6.125 2C5.089 2 4.25 2.84 4.25 3.875v.375h-.375C2.839 4.25 2 5.09 2 6.125v6C2 13.161 2.84 14 3.875 14h6c1.036 0 1.875-.84 1.875-1.875v-.375h.375c1.036 0 1.875-.84 1.875-1.875v-6C14 2.839 13.16 2 12.125 2h-6Zm5.625 8.5h.375c.345 0 .625-.28.625-.625v-6a.625.625 0 0 0-.625-.625h-6a.625.625 0 0 0-.625.625v.375h4.375c1.036 0 1.875.84 1.875 1.875V10.5Zm-8.5-4.375c0-.345.28-.625.625-.625h6c.345 0 .625.28.625.625v6c0 .345-.28.625-.625.625h-6a.625.625 0 0 1-.625-.625v-6Z" fill="currentColor"/>
              </svg>
            </button>
            
            <button class="icon-btn" title="Regenerate">
              <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M13.688 2.313a.625.625 0 0 0-.626.624v1.5h-1.5a.625.625 0 1 0 0 1.25h2.126c.345 0 .624-.28.624-.625V2.938a.625.625 0 0 0-.624-.624Z" fill="currentColor"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M13.738 4.686a6.625 6.625 0 1 0 .807 4.348.625.625 0 0 0-1.235-.193A5.377 5.377 0 0 1 2.625 8a5.375 5.375 0 0 1 10.031-2.688.625.625 0 1 0 1.082-.626Z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          
          <div class="model-dropdown" data-dropdown="model">
              <span class="model-dropdown-text">Default Model</span>
              <svg class="dropdown-arrow" width="10" height="10" fill="none" viewBox="0 0 16 16">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M5.248 14.444a.625.625 0 0 1-.005-.884l5.068-5.12a.625.625 0 0 0 0-.88L5.243 2.44a.625.625 0 1 1 .889-.88l5.067 5.121c.723.73.723 1.907 0 2.638l-5.067 5.12a.625.625 0 0 1-.884.005Z" fill="currentColor"/>
              </svg>
              <div class="model-dropdown-menu">
                <div class="model-dropdown-header">
                  <div class="model-dropdown-title">Select AI Model</div>
                  <input type="text" class="model-search-input" placeholder="Search models..." />
                </div>
                <div class="model-dropdown-content">
                  <div class="no-models-message">Loading models...</div>
                </div>
              </div>
            </div>
        </div>
      </div>
      <div class="quick-panel-resize-handle"></div>
    `;

    // Add close functionality
    const closeBtn = quickPanel.querySelector(".quick-panel-close");
    closeBtn.addEventListener("click", () => {
      // Cancel any ongoing AI stream
      if (currentStreamController) {
        currentStreamController.abort();
        currentStreamController = null;
      }
      hideQuickPanel();
    });

    // Add resize functionality
    setupPanelResize();

    // Add click to show input functionality
    const chatInputText = quickPanel.querySelector(".chat-input-text");
    const continueChat = quickPanel.querySelector(".continue-chat-section");
    const continueChatInput = quickPanel.querySelector(".continue-chat-input");
    const toolbarActions = quickPanel.querySelector(".toolbar-actions");
    const inputField = quickPanel.querySelector(".continue-chat-input input");
    const sendBtn = quickPanel.querySelector(
      '.input-action-btn[data-action="send"]'
    );
    const cancelBtn = quickPanel.querySelector(
      '.input-action-btn[data-action="cancel"]'
    );

    function showChatInput() {
      continueChat.style.display = "none";
      continueChatInput.classList.add("active");
      toolbarActions.classList.add("hidden");
      inputField.focus();
    }

    function hideChatInput() {
      continueChat.style.display = "flex";
      continueChatInput.classList.remove("active");
      toolbarActions.classList.remove("hidden");
      inputField.value = "";
    }

    continueChat.addEventListener("click", showChatInput);

    // Handle input actions
    sendBtn.addEventListener("click", async () => {
      const inputValue = inputField.value.trim();
      if (inputValue) {
        await sendChatMessage(inputValue);
      }
      hideChatInput();
    });

    cancelBtn.addEventListener("click", hideChatInput);

    // Handle Enter key in input
    inputField.addEventListener("keydown", async (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const inputValue = inputField.value.trim();
        if (inputValue) {
          await sendChatMessage(inputValue);
        }
        hideChatInput();
      } else if (e.key === "Escape") {
        hideChatInput();
      }
    });

    // Add functionality to toolbar buttons
    const copyBtn = quickPanel.querySelector('.icon-btn[title="Copy"]');
    copyBtn.addEventListener("click", async () => {
      try {
        // Get the active tab's content
        const activeTab = responseTabs[activeTabIndex];
        if (activeTab && activeTab.content) {
          // Extract text content from the markdown HTML
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = activeTab.content;
          const resultText = tempDiv.textContent || tempDiv.innerText || '';
          
          await navigator.clipboard.writeText(resultText);
          
          // Show visual feedback
          const originalHTML = copyBtn.innerHTML;
          copyBtn.innerHTML = `
            <svg width="16" height="16" fill="none" viewBox="0 0 16 16">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M13.78 3.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 8.28a.75.75 0 0 1 1.06-1.06L6 10.44l6.72-6.72a.75.75 0 0 1 1.06 0Z" fill="currentColor"/>
            </svg>
          `;
          copyBtn.style.color = '#10b981';
          
          setTimeout(() => {
            copyBtn.innerHTML = originalHTML;
            copyBtn.style.color = '';
          }, 2000);
        }
      } catch (err) {
        console.error('Failed to copy text:', err);
      }
    });

    const regenerateBtn = quickPanel.querySelector(
      '.icon-btn[title="Regenerate"]'
    );
    regenerateBtn.addEventListener("click", async () => {
      // Regenerate the AI response
      await processAIAction(action, selectedText);
    });

    // Initialize model dropdown
    loadAvailableModels();
    setupModelDropdown();

    // Add click to expand/collapse selected text functionality
    const selectedTextDisplay = quickPanel.querySelector(
      ".selected-text-display"
    );
    const textContent = selectedTextDisplay.querySelector(".content");
    const collapseBtn = selectedTextDisplay.querySelector(".collapse-btn");
    const arrowIcon = selectedTextDisplay.querySelector(".arrow-icon");

    collapseBtn.addEventListener("click", () => {
      if (textContent.classList.contains("expanded")) {
        textContent.classList.remove("expanded");
        arrowIcon.classList.remove("rotated");
      } else {
        textContent.classList.add("expanded");
        arrowIcon.classList.add("rotated");
      }
    });

    // Setup language selector functionality (only for translate action)
    if (action === 'translate') {
      setupLanguageSelector();
    }

    // Setup tab functionality
    setupTabNavigation();

    const replaceBtn = quickPanel.querySelector(".replace-btn");
    if (replaceBtn) {
      replaceBtn.addEventListener("click", () => {
        // Add replace functionality here
        console.log("Replace clicked");
      });
    }

    // Add drag functionality
    const header = quickPanel.querySelector(".quick-panel-header");
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      const rect = quickPanel.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;

      // Remove transform and use absolute positioning
      quickPanel.style.transform = "none";
      quickPanel.style.left = startLeft + "px";
      quickPanel.style.top = startTop + "px";

      header.style.cursor = "grabbing";
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      quickPanel.style.left = startLeft + deltaX + "px";
      quickPanel.style.top = startTop + deltaY + "px";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = "grab";
      }
    });

    // Show the panel
    quickPanel.style.display = "flex";
  }

  // Function to hide the quick panel
  function hideQuickPanel() {
    if (quickPanel) {
      quickPanel.style.display = "none";
      // Close any open dropdowns
      const modelDropdown = quickPanel.querySelector(".model-dropdown-menu");
      if (modelDropdown) {
        modelDropdown.classList.remove("open");
      }
    }
  }

  // Function to setup panel resize functionality
  function setupPanelResize() {
    const resizeHandle = quickPanel.querySelector('.quick-panel-resize-handle');
    if (!resizeHandle) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    const minHeight = 379;
    const maxHeight = 512;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = parseInt(document.defaultView.getComputedStyle(quickPanel).height, 10);
      
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = 'none'; // Prevent text selection during resize
      
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!isResizing) return;
      
      const deltaY = e.clientY - startY;
      const newHeight = startHeight + deltaY;
      
      // Constrain height within min/max bounds
      const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      quickPanel.style.height = constrainedHeight + 'px';
    }

    function onMouseUp() {
      if (isResizing) {
        isResizing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.userSelect = ''; // Restore text selection
      }
    }
  }

  // Function to load available models from settings
  function loadAvailableModels() {
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
        if (settings && settings.providers) {
          const modelsMap = {};
          settings.providers.forEach((provider) => {
            if (
              provider.apiKey &&
              provider.models &&
              provider.models.length > 0
            ) {
              modelsMap[provider.name] = provider.models;
            }
          });
          availableModels = modelsMap;
          selectedModel = settings.selectedModel || null;
          updateModelDropdown();
        }
      });
    }
  }

  // Function to update model dropdown content
  function updateModelDropdown() {
    if (!quickPanel) return;

    const modelDropdownText = quickPanel.querySelector(".model-dropdown-text");
    const modelDropdownContent = quickPanel.querySelector(
      ".model-dropdown-content"
    );

    if (!modelDropdownText || !modelDropdownContent) return;

    // Update selected model display
    if (selectedModel) {
      modelDropdownText.textContent = selectedModel;
    } else {
      modelDropdownText.textContent = "Default Model";
    }

    // Build models list
    let modelsHtml = "";

    if (Object.keys(availableModels).length === 0) {
      modelsHtml =
        '<div class="no-models-message">No models available.<br>Please configure models in settings.</div>';
    } else {
      Object.keys(availableModels).forEach((providerName) => {
        const models = availableModels[providerName];
        if (models && models.length > 0) {
          modelsHtml += `<div class="model-provider-group">`;
          modelsHtml += `<div class="model-provider-header">[${providerName}]</div>`;
          models.forEach((model) => {
            const isSelected = model === selectedModel;
            modelsHtml += `
              <div class="model-option ${
                isSelected ? "selected" : ""
              }" data-model="${model}">
                <span class="model-option-indicator"></span>
                ${model}
              </div>
            `;
          });
          modelsHtml += `</div>`;
        }
      });
    }

    modelDropdownContent.innerHTML = modelsHtml;

    // Add click handlers for model options
    const modelOptions = modelDropdownContent.querySelectorAll(".model-option");
    modelOptions.forEach((option) => {
      option.addEventListener("click", (e) => {
        e.stopPropagation();
        const model = option.getAttribute("data-model");
        selectModel(model);
      });
    });
  }

  // Function to setup model dropdown interactions
  function setupModelDropdown() {
    if (!quickPanel) return;

    const modelDropdown = quickPanel.querySelector(
      '.model-dropdown[data-dropdown="model"]'
    );
    const modelDropdownMenu = quickPanel.querySelector(".model-dropdown-menu");
    const modelSearchInput = quickPanel.querySelector(".model-search-input");

    if (!modelDropdown || !modelDropdownMenu || !modelSearchInput) return;

    // Toggle dropdown
    modelDropdown.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = modelDropdownMenu.classList.contains("open");

      // Close all dropdowns first
      document.querySelectorAll(".model-dropdown-menu.open").forEach((menu) => {
        menu.classList.remove("open");
      });

      if (!isOpen) {
        modelDropdownMenu.classList.add("open");
        modelSearchInput.focus();
      }
    });

    // Handle search input
    modelSearchInput.addEventListener("input", (e) => {
      const searchTerm = e.target.value.toLowerCase();
      filterModels(searchTerm);
    });

    // Prevent search input clicks from closing dropdown
    modelSearchInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!modelDropdown.contains(e.target)) {
        modelDropdownMenu.classList.remove("open");
        modelSearchInput.value = "";
        filterModels(""); // Reset filter
      }
    });
  }

  // Function to filter models based on search
  function filterModels(searchTerm) {
    if (!quickPanel) return;

    const modelOptions = quickPanel.querySelectorAll(".model-option");
    const providerGroups = quickPanel.querySelectorAll(".model-provider-group");

    modelOptions.forEach((option) => {
      const modelName = option.getAttribute("data-model").toLowerCase();
      const matches = modelName.includes(searchTerm);
      option.style.display = matches ? "flex" : "none";
    });

    // Hide provider groups that have no visible models
    providerGroups.forEach((group) => {
      const visibleModels = group.querySelectorAll(
        '.model-option[style*="flex"]'
      );
      const allModels = group.querySelectorAll(".model-option");
      const hasVisibleModels =
        visibleModels.length > 0 || (searchTerm === "" && allModels.length > 0);
      group.style.display = hasVisibleModels ? "block" : "none";
    });
  }

  // Function to select a model
  function selectModel(model) {
    selectedModel = model;

    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: 'getSettings' }, (settings) => {
        const cfg = settings || {};
        cfg.selectedModel = model;

        if (cfg.providers && Array.isArray(cfg.providers)) {
          cfg.providers.forEach(p => { p.selectedProvider = false; });
          const modelOwner = cfg.providers.find(p => Array.isArray(p.models) && p.models.includes(model));
          if (modelOwner) modelOwner.selectedProvider = true;
        }

        chrome.runtime.sendMessage({ action: 'setSettings', payload: cfg }, () => {});
      });
    }

    updateModelDropdown();

    const modelDropdownMenu = quickPanel.querySelector(".model-dropdown-menu");
    if (modelDropdownMenu) {
      modelDropdownMenu.classList.remove("open");
      const searchInput = quickPanel.querySelector(".model-search-input");
      if (searchInput) {
        searchInput.value = "";
        filterModels("");
      }
    }
  }

  // Function to handle navigation button actions
  async function handleNavAction(action) {
    try {
      const selectedText = window.getSelection().toString().trim();

      // Show the quick panel
      showQuickPanel(action, selectedText);

      // Hide the selection dot
      hideSelectionDot();

      // Call AI API
      await processAIAction(action, selectedText);
    } catch (error) {
      console.error('Error in handleNavAction:', error);
      // If there's an error showing the panel, at least try to show an alert
      if (error.message.includes('Extension context invalidated')) {
        alert('Extension was reloaded. Please refresh the page to continue using the extension.');
      }
    }
  }

  // Function to process AI action
  async function processAIAction(action, selectedText) {
    try {
      // Show loading state
      updateActionResult(`Processing ${action}...`, true);

      // Wait for language to be loaded if translate action
      if (action === 'translate') {
        await loadLanguagePreference();
      }

      // Initialize conversation history for new actions
      if (conversationHistory.length === 0) {
        // Get the initial system prompt
        let prompt;
        let inputs = {};

        switch (action) {
          case 'summarize':
          case 'summary':
            inputs.textSummary = selectedText;
            break;
          case 'explain':
            inputs.content = selectedText;
            break;
          case 'rewrite':
            inputs.textContent = selectedText;
            break;
          case 'translate':
            inputs.languageName = selectedLanguage;
            inputs.text = selectedText;
            break;
          case 'grammar':
            inputs.selectedText = selectedText;
            break;
        default:
          throw new Error(`Unknown action: ${action}`);
        }

        prompt = formatPrompt(action, inputs);
        conversationHistory = [{ role: 'user', content: prompt }];
      }

      // Call AI API (streaming will handle display updates)
      await callAI(action, selectedText, conversationHistory);

    } catch (error) {
      // Display error
      updateActionResult(error.message || 'Failed to process request', false, true);
    }
  }

  // Function to send chat message
  async function sendChatMessage(userMessage) {
    try {
      // Create new tab for this message
      const newTabId = createNewTab('Message');

      // Show loading state
      updateActionResult(`Processing your message...`, true);

      // Add user message to conversation history
      conversationHistory.push({ role: 'user', content: userMessage });

      // Get current action from the panel header
      const actionHeader = quickPanel.querySelector('.quick-panel-header span');
      const currentAction = actionHeader.textContent.toLowerCase();

      // Call AI API with conversation history
      await callAI(currentAction, currentSelectedText, conversationHistory);

    } catch (error) {
      // Display error
      updateActionResult(error.message || 'Failed to process message', false, true);
    }
  }

  // Function to hide the dot
  function hideSelectionDot() {
    if (selectionDot) {
      selectionDot.style.display = "none";
    }
  }

  // Function to send selected text to the sidebar
  function sendTextToSidebar(text) {
    // Only send a message if the text has actually changed to avoid spamming
    if (text !== currentSelectedText) {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: "SET_SELECTED_TEXT",
            text: text,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              // This will typically be 'Extension context invalidated.'
              // We can log it or just ignore it to prevent the script from halting.
              console.log(
                "Could not send message to sidebar:",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      }
      currentSelectedText = text;
    }
  }

  // Listen for mouse up to detect text selection
  document.addEventListener("mouseup", (event) => {
    // Don't do anything if the click was on our dot
    if (selectionDot && selectionDot.contains(event.target)) {
      return;
    }

    // A brief delay to ensure the selection is registered
    setTimeout(async () => {
      let selectedText = '';
      let rect = null;

      // Check if the target is an input or textarea element
      const target = event.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        // Handle input/textarea selection
        const start = target.selectionStart;
        const end = target.selectionEnd;
        
        if (start !== end && start !== null && end !== null) {
          selectedText = target.value.substring(start, end).trim();
          if (selectedText && selectedText.length > 0) {
            // Get the bounding rect of the input element
            const inputRect = target.getBoundingClientRect();
            rect = {
              left: inputRect.left,
              top: inputRect.top
            };
          }
        }
      } else {
        // Handle regular text selection
        const selection = window.getSelection();
        selectedText = selection.toString().trim();

        if (selectedText && selectedText.length > 0) {
          const range = selection.getRangeAt(0);
          rect = range.getBoundingClientRect();
        }
      }

      if (selectedText && selectedText.length > 0 && rect) {
        // Respect Quick Actions settings (enabled + blocklist)
        const allowed = await shouldShowQuickActions();
        if (!allowed) {
          hideSelectionDot();
          sendTextToSidebar(null);
          return;
        }

        const isInput =
          target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
        // Position the dot at the top-left of the selection
        showSelectionDot(rect.left + window.scrollX, rect.top + window.scrollY, {
          isInput,
        });
        sendTextToSidebar(selectedText);
      } else {
        // If nothing is selected, ensure the dot is hidden and the sidebar is cleared
        hideSelectionDot();
        sendTextToSidebar(null);
      }
    }, 10);
  });

  // Listen for select events on input and textarea elements
  document.addEventListener("select", (event) => {
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      // Don't do anything if the click was on our dot
      if (selectionDot && selectionDot.contains(target)) {
        return;
      }

      setTimeout(async () => {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        
        if (start !== end && start !== null && end !== null) {
          const selectedText = target.value.substring(start, end).trim();
          if (selectedText && selectedText.length > 0) {
            // Respect Quick Actions settings (enabled + blocklist)
            const allowed = await shouldShowQuickActions();
            if (!allowed) {
              hideSelectionDot();
              sendTextToSidebar(null);
              return;
            }

            // Get the bounding rect of the input element
            const inputRect = target.getBoundingClientRect();
            const rect = {
              left: inputRect.left,
              top: inputRect.top
            };
            showSelectionDot(rect.left + window.scrollX, rect.top + window.scrollY, {
              isInput: true,
            });
            sendTextToSidebar(selectedText);
          } else {
            hideSelectionDot();
            sendTextToSidebar(null);
          }
        }
      }, 10);
    }
  });

  // Determine if Quick Actions should show on this page
  async function shouldShowQuickActions() {
    try {
      const result = await new Promise((resolve) => {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return resolve({});
        chrome.runtime.sendMessage({ action: 'getSettings' }, (cfg) => resolve({ aiChatSettings: cfg || {} }));
      });

      const cfg = result.aiChatSettings || {};
      const enabled = typeof cfg.quickActionsEnabled === 'boolean' ? cfg.quickActionsEnabled : true;
      if (!enabled) return false;

      const blocklist = Array.isArray(cfg.quickActionsBlocklist) ? cfg.quickActionsBlocklist : [];
      if (blocklist.length === 0) return true;

      const url = window.location.href.toLowerCase();
      const host = window.location.hostname.toLowerCase();

      for (const entry of blocklist) {
        if (!entry) continue;
        const e = String(entry).trim().toLowerCase();
        if (!e) continue;
        if (e.startsWith('http://') || e.startsWith('https://')) {
          if (url.includes(e)) return false;
        } else {
          if (host.includes(e)) return false;
        }
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  // Language preference functions
  async function loadLanguagePreference() {
    try {
      if (!isExtensionContextValid()) {
        selectedLanguage = "English";
        return;
      }
      
      const result = await new Promise((resolve, reject) => {
        chrome.storage.local.get(["selectedLanguage"], (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
      selectedLanguage = result.selectedLanguage || "English";
    } catch (error) {
      console.log("Using default language:", error);
      selectedLanguage = "English";
    }
  }

  async function saveLanguagePreference(language) {
    try {
      if (!isExtensionContextValid()) {
        selectedLanguage = language; // At least update the local variable
        return;
      }
      
      selectedLanguage = language;
      await new Promise((resolve, reject) => {
        chrome.storage.local.set({ selectedLanguage: language }, (result) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(result);
          }
        });
      });
    } catch (error) {
      console.log("Error saving language preference:", error);
      selectedLanguage = language; // At least update the local variable
    }
  }

  function setupLanguageSelector() {
    const languageSelector = quickPanel?.querySelector(".language-selector");
    if (!languageSelector) return;

    const languageButton = languageSelector.querySelector(
      ".language-selector-button"
    );
    const languageDropdown = languageSelector.querySelector(
      ".language-dropdown-menu"
    );
    const dropdownArrow = languageSelector.querySelector(
      ".language-dropdown-arrow"
    );
    const selectedLanguageSpan =
      languageSelector.querySelector(".selected-language");

    // Additional null checks
    if (!languageButton || !languageDropdown || !dropdownArrow || !selectedLanguageSpan) {
      console.log('Language selector elements not found');
      return;
    }

    // Toggle dropdown
    languageButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = languageDropdown.classList.contains("open");

      if (isOpen) {
        languageDropdown.classList.remove("open");
        languageButton.classList.remove("open");
        dropdownArrow.classList.remove("rotated");
      } else {
        languageDropdown.classList.add("open");
        languageButton.classList.add("open");
        dropdownArrow.classList.add("rotated");
      }
    });

    // Handle language selection
    languageDropdown.addEventListener("click", async (e) => {
      const languageOption = e.target.closest(".language-option");
      if (!languageOption) return;

      const newLanguage = languageOption.dataset.language;

      // Update UI
      selectedLanguageSpan.textContent = newLanguage;

      // Remove previous selection
      languageDropdown
        .querySelectorAll(".language-option")
        .forEach((option) => {
          option.classList.remove("selected");
        });

      // Add selection to clicked option
      languageOption.classList.add("selected");

      // Save preference
      await saveLanguagePreference(newLanguage);

      // Close dropdown
      languageDropdown.classList.remove("open");
      languageButton.classList.remove("open");
      dropdownArrow.classList.remove("rotated");
    });

    // Close dropdown when clicking outside
    document.addEventListener("click", (e) => {
      if (!languageSelector.contains(e.target)) {
        languageDropdown.classList.remove("open");
        languageButton.classList.remove("open");
        dropdownArrow.classList.remove("rotated");
      }
    });
  }

  // Check if extension context is valid
  function isExtensionContextValid() {
    try {
      return chrome.runtime && chrome.runtime.id;
    } catch (error) {
      return false;
    }
  }

  // System prompts embedded directly (avoiding module loading issues)
  const SYSTEM_PROMPTS = {
    summary: {
      name: "Summary",
      inputs: ["Text summary"],
      prompt: `You are a highly skilled AI assistant tasked with summarizing text.

Here is the text to summarize:
"""
{{textSummary}}
"""
Summarize the main content, theme, and purpose of the text in 2-3 concise sentences. Focus on the core message and intent without including unnecessary details.
Use a clear, neutral, and professional tone. Ensure the output is engaging and easy to read, tailored to someone who wants a quick yet comprehensive overview of the text.
Output only the summary, no other text.
`
    },

    explain: {
      name: "Explain",
      inputs: ["Content"],
      prompt: `
Please explain the following text in simple terms:

"{{content}}"

Your explanation should be easy to understand and clear, suitable for someone with no prior knowledge of the topic.
Output only the explanation, no other text.
`
    },

    rewrite: {
      name: "Rewrite", 
      inputs: ["Text content"],
      prompt: `#CONTEXT:
You are an editor improving the flow and readability of the content.
#GOAL:
Rewrite the text below to make it concise, engaging, and easy to follow.
#CONTENT:
{{textContent}}
#OUTPUT:
A polished version of the content that is well-structured and reader-friendly. Output only the rewritten text, no other text.`
    },

    translate: {
      name: "Translate",
      inputs: ["Language Name", "Text"],
      prompt: `Translate the text provided below into the specified target language.

Your output must be only the translated text. Do not include explanations, greetings, or any additional conversational text.

Target Language: {{languageName}}

Text to Translate:
{{text}}`
    },

    grammar: {
      name: "Fix Grammar",
      inputs: ["Selected Text"],
      prompt: `You are a multilingual expert editor, proficient in grammar, spelling, punctuation, and style for numerous languages.

Your task is to first identify the language of the following text. Then, correct the text in its original language. You must fix all grammatical errors, spelling mistakes, and punctuation issues. You should also improve sentence structure and word choice to enhance clarity and readability, while preserving the original meaning and tone.

The corrected text must be in the same language as the input text.

Do not provide explanations, comments, or identify the language in your response. Your output must be only the corrected text.

Here is the text to correct:
"""
{{selectedText}}
"""`
    }
  };

  // Format prompt function
  function formatPrompt(action, inputs) {
    // Map action names to SYSTEM_PROMPTS keys
    const actionMapping = {
      'summarize': 'summary',
      'summary': 'summary',
      'explain': 'explain',
      'rewrite': 'rewrite',
      'translate': 'translate',
      'grammar': 'grammar'
    };
    
    const promptKey = actionMapping[action.toLowerCase()];
    const promptConfig = SYSTEM_PROMPTS[promptKey];
    if (!promptConfig) {
      throw new Error(`Unknown action: ${action}`);
    }

    let formattedPrompt = promptConfig.prompt;
    
    // Replace placeholders with actual values
    Object.entries(inputs).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      formattedPrompt = formattedPrompt.replace(new RegExp(placeholder, 'g'), value);
    });

    return formattedPrompt;
  }

  // API call function to send action to AI
  async function callAI(action, selectedText, conversationHistory = null) {
    try {
      if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated. Please refresh the page.');
      }

      const result = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getSettings' }, (cfg) => {
          if (!cfg) reject(new Error('AI settings not configured'));
          else resolve({ aiChatSettings: cfg, selectedModel });
        });
      });

      aiChatSettings = result.aiChatSettings;
      const currentSelectedModel = result.selectedModel || selectedModel;

      if (!aiChatSettings || !currentSelectedModel) {
        throw new Error('AI settings or model not configured');
      }

      // Find the provider that owns the selected model
      let selectedProvider = aiChatSettings.providers.find(p => p.selectedProvider);
      
      // If the selected provider doesn't have the current model, find the provider that does
      if (selectedProvider && (!selectedProvider.models || !selectedProvider.models.includes(currentSelectedModel))) {
        console.log(`Model ${currentSelectedModel} not found in selected provider ${selectedProvider.name}, searching for correct provider...`);
        selectedProvider = aiChatSettings.providers.find(provider => 
          provider.models && Array.isArray(provider.models) && 
          provider.models.includes(currentSelectedModel)
        );
        if (selectedProvider) {
          console.log(`Found correct provider: ${selectedProvider.name} for model: ${currentSelectedModel}`);
        }
      }
      
      if (!selectedProvider) {
        throw new Error(`No provider found for model: ${currentSelectedModel}`);
      }

      // Prepare the prompt based on the action
      let prompt;
      let inputs = {};

      switch (action) {
        case 'summarize':
        case 'summary':
          inputs.textSummary = selectedText;
          break;
        case 'explain':
          inputs.content = selectedText;
          break;
        case 'rewrite':
          inputs.textContent = selectedText;
          break;
        case 'translate':
          inputs.languageName = selectedLanguage;
          inputs.text = selectedText;
          break;
        case 'grammar':
          inputs.selectedText = selectedText;
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      // Prepare messages for API
      let messages;
      if (conversationHistory && conversationHistory.length > 0) {
        // Use conversation history for follow-up messages
        messages = conversationHistory;
      } else {
        // Use single prompt for initial request
        prompt = formatPrompt(action, inputs);
        messages = [{ role: 'user', content: prompt }];
      }

      // Prepare API request with streaming
      const apiPayload = {
        model: currentSelectedModel,
        messages: messages,
        temperature: 0.3,
        max_tokens: 2000,
        stream: true
      };

      // Create abort controller for stream cancellation
      currentStreamController = new AbortController();
      
      // Make streaming API call
      const response = await fetch(selectedProvider.endpoint + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${selectedProvider.apiKey}`
        },
        body: JSON.stringify(apiPayload),
        signal: currentStreamController.signal
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      // Clear the action result and start streaming
      updateActionResult('', false, false);

      while (true) {
        // Check if stream was cancelled
        if (currentStreamController && currentStreamController.signal.aborted) {
          break;
        }
        
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return fullResponse;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              
              if (content) {
                fullResponse += content;
                // Update display with accumulated response
                updateActionResult(fullResponse, false, false);
              }
            } catch (error) {
              // Skip invalid JSON chunks
              continue;
            }
          }
        }
      }

      // Add AI response to conversation history
      if (conversationHistory && conversationHistory.length > 0) {
        conversationHistory.push({ role: 'assistant', content: fullResponse });
      }

      // Clean up stream controller after successful completion
      currentStreamController = null;
      return fullResponse;

    } catch (error) {
      // Clean up stream controller on error
      currentStreamController = null;
      
      // Handle abort error specifically
      if (error.name === 'AbortError') {
        console.log('AI stream cancelled by user');
        updateActionResult('AI response cancelled', false, false);
        return '';
      }
      
      console.error('AI API call error:', error);
      throw error;
    }
  }

  // Function to render markdown content
  function renderMarkdown(markdown) {
    if (!markdown) return '';

    // Add CSS styles for the markdown content if not already added
    if (!document.getElementById('quick-panel-markdown-styles')) {
      const markdownStyles = `
        .quick-panel-markdown { color: #e4e4e7; font-size: 14px; line-height: 1.6; }
        .quick-panel-markdown h1 { font-size: 1.3rem; font-weight: bold; margin: 1rem 0 0.6rem; color: white; }
        .quick-panel-markdown h2 { font-size: 1.15rem; font-weight: bold; margin: 0.8rem 0 0.5rem; color: white; }
        .quick-panel-markdown h3 { font-size: 1.05rem; font-weight: bold; margin: 0.7rem 0 0.4rem; color: white; }
        .quick-panel-markdown p { margin: 0.5rem 0; }
        .quick-panel-markdown ul { padding-left: 1.2rem; margin: 0.5rem 0; list-style-type: disc; }
        .quick-panel-markdown ol { padding-left: 1.2rem; margin: 0.5rem 0; list-style-type: decimal; }
        .quick-panel-markdown li { margin: 0.3rem 0; padding-left: 1.2rem; }
        .quick-panel-markdown li::marker { color: #737373; }
        .quick-panel-markdown code { background-color: rgba(255, 255, 255, 0.1); padding: 0.1rem 0.3rem; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.85em; }
        .quick-panel-markdown strong { font-weight: bold; color: white; }
        .quick-panel-markdown em { font-style: italic; }
        .quick-panel-markdown a { color: #3b82f6; text-decoration: underline; }
        .quick-panel-markdown a:hover { text-decoration: none; }
        .quick-panel-markdown blockquote { border-left: 3px solid #3b82f6; padding: 0.4rem 0 0.4rem 0.8rem; margin: 0.6rem 0; color: rgba(255, 255, 255, 0.7); background-color: rgba(59, 130, 246, 0.05); }
        .quick-panel-markdown-code-block { position: relative; margin: 0.8rem 0; overflow: hidden; background-color: rgba(255, 255, 255, 0.05); border-radius: 4px; padding: 0.8rem; }
        .quick-panel-markdown table { border-collapse: collapse; width: 100%; margin: 0.8rem 0; }
        .quick-panel-markdown th { background-color: rgba(255, 255, 255, 0.1); padding: 0.4rem; text-align: left; font-weight: bold; font-size: 0.9em; }
        .quick-panel-markdown td { padding: 0.4rem; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 0.9em; }
        .quick-panel-markdown tr:nth-child(even) { background-color: rgba(255, 255, 255, 0.05); }
        .quick-panel-markdown-hr { border: 0; height: 1px; background: rgba(255, 255, 255, 0.2); margin: 1rem 0; }
        .ai-thinking-container { margin: 0.8rem 0; border: 1px solid #3b4351; border-radius: 6px; overflow: hidden; }
        .ai-thinking-header { display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.8rem; background-color: #353940; cursor: pointer; }
        .ai-thinking-title { display: flex; align-items: center; font-size: 0.75rem; font-weight: 600; color: #e4e4e7; }
        .ai-thinking-title svg { margin-right: 0.4rem; }
        .ai-thinking-content { padding: 0.8rem; font-size: 0.9rem; background-color: #1e1e1e; color: #a1a1aa; display: none; border-top: 1px solid #262626; }
        .ai-thinking-content.show { display: block; }
      `;

      const styleEl = document.createElement('style');
      styleEl.id = 'quick-panel-markdown-styles';
      styleEl.textContent = markdownStyles;
      document.head.appendChild(styleEl);
    }

    // Process thinking blocks first
    let hasThinkingContent = false;
    let thinkingContent = '';
    let mainContent = markdown;

    // Check for <think></think> tags
    const thinkingMatch = markdown.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkingMatch) {
      hasThinkingContent = true;
      thinkingContent = thinkingMatch[1].trim();
      // Remove the thinking block from the main content
      mainContent = markdown.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    }

    // Process the markdown content
    const processMarkdownContent = (content) => {
      return content
        // Code blocks without language
        .replace(/```([\s\S]*?)```/g, (match, code) => {
          const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
          return `<div class="quick-panel-markdown-code-block">
            <div>${escapedCode}</div>
          </div>`;
        })
        // Tables
        .replace(/\|([^\n]*?)\|\n\|\s*:?-+:?\s*\|[^\n]*?\n([\s\S]*?)(?=\n\n|$)/g, (match, header, body) => {
          const headerCells = header.split('|').map(cell => cell.trim()).filter(Boolean);
          const headerRow = headerCells.map(cell => `<th>${cell}</th>`).join('');

          const rows = body.split('\n')
            .filter(row => row.trim() && row.includes('|'))
            .map(row => {
              const cells = row.split('|').map(cell => cell.trim()).filter(Boolean);
              return `<tr>${cells.map(cell => `<td>${cell}</td>`).join('')}</tr>`;
            }).join('');

          return `<table>
            <thead><tr>${headerRow}</tr></thead>
            <tbody>${rows}</tbody>
          </table>`;
        })
        // Horizontal rule
        .replace(/^---+$/gm, '<hr class="quick-panel-markdown-hr">')
        // Headers
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        // Blockquotes
        .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Inline code
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Lists - unordered
        .replace(/^\* (.*$)/gm, '<li>$1</li>')
        .replace(/^- (.*$)/gm, '<li>$1</li>')
        // Lists - ordered
        .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>')
        // Fix lists
        .replace(/<\/li><br><li>/g, '</li><li>')
        .replace(/<br><li>/g, '<ul><li>')
        .replace(/<\/li><br>/g, '</li></ul>')
        .replace(/<\/li>(?!<\/ul>)/g, '</li></ul>')
        .replace(/<ul><\/ul>/g, '');
    };

    let processedContent = processMarkdownContent(mainContent);
    
    // Wrap in paragraphs if not already wrapped
    if (!processedContent.includes('<p>') && !processedContent.includes('<h1>') && !processedContent.includes('<h2>') && !processedContent.includes('<h3>') && !processedContent.includes('<ul>') && !processedContent.includes('<ol>')) {
      processedContent = `<p>${processedContent}</p>`;
    }

    let result = `<div class="quick-panel-markdown">${processedContent}</div>`;

    // Add thinking content if present
    if (hasThinkingContent) {
      const processedThinking = processMarkdownContent(thinkingContent);
      result = `
        <div class="ai-thinking-container">
          <div class="ai-thinking-header" onclick="this.nextElementSibling.classList.toggle('show')">
            <div class="ai-thinking-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <circle cx="12" cy="12" r="10"/>
              </svg>
              AI Thinking Process
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6,9 12,15 18,9"/>
            </svg>
          </div>
          <div class="ai-thinking-content quick-panel-markdown">
            ${processedThinking}
          </div>
        </div>
        ${result}
      `;
    }

    return result;
  }

  // Function to create new tab
  function createNewTab(label = 'Response') {
    const newTabId = responseTabs.length;
    const newTab = {
      id: newTabId,
      label: `${label} ${newTabId + 1}`,
      content: '',
      timestamp: Date.now()
    };
    
    responseTabs.push(newTab);
    activeTabIndex = newTabId;
    
    // Create tab content container
    const tabsContent = quickPanel.querySelector('.response-tabs-content');
    const newTabContent = document.createElement('div');
    newTabContent.className = 'tab-content';
    newTabContent.dataset.tab = newTabId;
    newTabContent.innerHTML = '<div class="action-result"></div>';
    tabsContent.appendChild(newTabContent);
    
    renderTabs();
    switchToTab(newTabId);
    
    return newTabId;
  }

  // Function to render tabs
  function renderTabs() {
    const tabsContainer = quickPanel.querySelector('.response-tabs');
    const tabsHeader = quickPanel.querySelector('.response-tabs-header');
    if (!tabsContainer || !tabsHeader) return;
    
    // Show/hide tabs header based on number of tabs
    if (responseTabs.length > 1) {
      tabsHeader.classList.add('show');
    } else {
      tabsHeader.classList.remove('show');
    }
    
    tabsContainer.innerHTML = '';
    
    responseTabs.forEach((tab, index) => {
      const tabElement = document.createElement('div');
      tabElement.className = `response-tab ${index === activeTabIndex ? 'active' : ''}`;
      tabElement.dataset.tabId = tab.id;
      
      tabElement.innerHTML = `
        <span class="tab-label">${tab.label}</span>
        ${responseTabs.length > 1 ? `<span class="tab-close" data-tab-id="${tab.id}">×</span>` : ''}
      `;
      
      // Add click handler for tab
      tabElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
          switchToTab(tab.id);
        }
      });
      
      // Add close handler
      const closeBtn = tabElement.querySelector('.tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(tab.id);
        });
      }
      
      tabsContainer.appendChild(tabElement);
    });
    
    updateTabNavigation();
  }

  // Function to switch to tab
  function switchToTab(tabId) {
    activeTabIndex = responseTabs.findIndex(tab => tab.id === tabId);
    
    // Update tab visual state
    quickPanel.querySelectorAll('.response-tab').forEach(tab => {
      tab.classList.toggle('active', parseInt(tab.dataset.tabId) === tabId);
    });
    
    // Update content visibility
    quickPanel.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', parseInt(content.dataset.tab) === tabId);
    });
    
    updateTabNavigation();
  }

  // Function to close tab
  function closeTab(tabId) {
    if (responseTabs.length <= 1) return; // Don't close last tab
    
    const tabIndex = responseTabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;
    
    // Remove tab data
    responseTabs.splice(tabIndex, 1);
    
    // Remove tab content
    const tabContent = quickPanel.querySelector(`[data-tab="${tabId}"]`);
    if (tabContent) {
      tabContent.remove();
    }
    
    // Adjust active tab if necessary
    if (activeTabIndex >= tabIndex) {
      activeTabIndex = Math.max(0, activeTabIndex - 1);
    }
    
    renderTabs();
    
    // Switch to valid tab
    if (responseTabs.length > 0) {
      switchToTab(responseTabs[activeTabIndex].id);
    }
  }

  // Function to setup tab navigation
  function setupTabNavigation() {
    const prevBtn = quickPanel.querySelector('#prev-tab');
    const nextBtn = quickPanel.querySelector('#next-tab');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (activeTabIndex > 0) {
          switchToTab(responseTabs[activeTabIndex - 1].id);
        }
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (activeTabIndex < responseTabs.length - 1) {
          switchToTab(responseTabs[activeTabIndex + 1].id);
        }
      });
    }
    
    renderTabs();
  }

  // Function to update tab navigation buttons
  function updateTabNavigation() {
    const prevBtn = quickPanel.querySelector('#prev-tab');
    const nextBtn = quickPanel.querySelector('#next-tab');
    
    if (prevBtn) {
      prevBtn.disabled = activeTabIndex <= 0;
    }
    
    if (nextBtn) {
      nextBtn.disabled = activeTabIndex >= responseTabs.length - 1;
    }
  }

  // Function to update action result display
  function updateActionResult(content, isLoading = false, isError = false) {
    const activeTab = responseTabs[activeTabIndex];
    if (!activeTab) return;
    
    const actionResult = quickPanel?.querySelector(`.tab-content[data-tab="${activeTab.id}"] .action-result`);
    if (!actionResult) return;

    if (isLoading) {
      actionResult.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; color: #ccc;">
          <div style="width: 16px; height: 16px; border: 2px solid #8060F0; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          ${content}
        </div>
      `;
    } else if (isError) {
      actionResult.innerHTML = `
        <div style="color: #ff6b6b; font-size: 14px;">
          <strong>Error:</strong> ${content}
        </div>
      `;
    } else {
      // Render content as markdown and store in tab
      activeTab.content = content;
      actionResult.innerHTML = renderMarkdown(content);
    }
  }

  // Load language preference on script initialization
  loadLanguagePreference();

  // Hide the dot if the user clicks elsewhere
  document.addEventListener("mousedown", (event) => {
    if (selectionDot && !selectionDot.contains(event.target)) {
      hideSelectionDot();
      sendTextToSidebar(null);
    }
  });
  
  // Extract meaningful content from the current page (non-YouTube pages)
  function extractPageContent() {
    const contentSelectors = [
      'article', 'main', '.content', '#content',
      '.post', '.article', '.entry-content',
      '[role="main"]', '.main-content'
    ];

    let mainContent = '';

    // Try to find main content containers first
    for (const selector of contentSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements && elements.length > 0) {
        elements.forEach(el => {
          mainContent += el.innerText + '\n\n';
        });
        break;
      }
    }

    // If no content found using selectors, extract from body with filtering
    if (!mainContent.trim()) {
      const textNodes = [];
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: function(node) {
            if (node.parentElement) {
              const style = window.getComputedStyle(node.parentElement);
              const isHidden = style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0';
              const isScript = node.parentElement.tagName === 'SCRIPT' || node.parentElement.tagName === 'STYLE';
              if (isHidden || isScript) return NodeFilter.FILTER_REJECT;
              if (node.textContent.trim().length > 20) return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      let node;
      while (node = walker.nextNode()) {
        textNodes.push(node.textContent.trim());
      }
      mainContent = textNodes.join('\n\n');
    }

    // Clean up the content
    mainContent = mainContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    const maxLength = 15000;
    if (mainContent.length > maxLength) {
      mainContent = mainContent.substring(0, maxLength) +
        '\n\n[Content truncated due to length. Extracted first ' + maxLength + ' characters]';
    }

    return mainContent || document.body.innerText.substring(0, maxLength);
  }

  // Respond to getPageContent for non-YouTube pages
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message && message.action === 'getPageContent') {
          const isYouTube = window.location.hostname.includes('youtube.com') &&
            window.location.pathname.includes('/watch') &&
            window.location.href.includes('v=');
          if (isYouTube) {
            // Let the YouTube-specific content script handle it
            return;
          }
          const pageContent = extractPageContent();
          sendResponse({
            title: document.title,
            url: window.location.href,
            content: pageContent
          });
          return true;
        }
      } catch (e) {
        try {
          sendResponse({ title: document.title, url: window.location.href, error: 'Failed to extract page content: ' + (e && e.message ? e.message : String(e)) });
        } catch (_) {}
      }
    });
  }
})();
