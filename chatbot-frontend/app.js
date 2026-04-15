/**
* Mastercard Documentation Explorer
* Integrates with MCP Bridge API to display documentation and provide copilot assistance
*/

// Configuration

const API_BASE = window.__API_BASE__ || 'http://localhost:5055';
const VECTOR_SEARCH_BASE = window.__VECTOR_SEARCH_BASE__ || 'http://localhost:8000';
const DEFAULT_SERVICE = 'mastercard-documentation';
const REQUEST_TIMEOUT = 900000; // 15 seconds


// State Management
const state = {
currentService: DEFAULT_SERVICE,
currentSection: null,
sections: [],
apiOperations: [],
allApiOperations: [], // Store unfiltered list
selectedSectionIndex: -1,
allDocumentation: [], // Store all pre-loaded documentation content
isPreloaded: false, // Track if all documentation has been pre-loaded
serviceDocumentation: [], // Store service-specific pre-loaded content
preloadedService: null, // Track which service is pre-loaded
vectorSearchAvailable: false, // Track if vector search service is available
vectorSearchIndexed: false, // Track if documents are 'indexed in vector
usingVectorSearch: false // Track if currently using vector search
};


//Utility Functions

/**
* Makes a fetch request with timeout and error handling
*
* @param {string} url - The URL to fetch
* @param {number} timeout – Timeout in milliseconds
* @returns {Promise<any>} Parsed JSON response
*/
async function fetchWithTimeout(url, timeout = REQUEST_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
            'Accept': 'application/json'
            }
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const data = await response.json();
        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError'){
            throw new Error('Request timed out');
        }
        throw error;
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`; 
    toast.setAttribute('rolè', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive': 'polite');
    toast.textContent = message;

    container.appendChild(toast);

    /// Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); 
    }, 5000);

    // Make dismissible with click 
    toast.addEventListener('click', () => { 
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); 
    });
}


async function checkHealth() {
    const indicator = document.getElementById('health-indicator');
    const text = document.getElementById('health-text');
    console.log('Checking health....')

    try {
        indicator.className = 'status-indicator status-checking';
        text.textContent = 'Checking...';

        const response = await fetchWithTimeout(`${API_BASE}/healthz`, 5000);
        
        indicator.className = 'status-indicator status-healthy';
        text.textContent = 'API Ready';
                    console.log('Checking health success')
        showToast('API is ready', 'success');
        return true;
    } catch (error) {
            console.log('Checking health failed')
        indicator.className = 'status-indicator status-error';
        text.textContent = 'API Offline';
        showToast(`API check failed: ${error.message}`, 'error');
        return false;
    }
}

async function loadSections(serviceId) {
    const loadingEl = document.getElementById('sections-loading');
    const errorEl = document.getElementById('sections-error');
    const listEl = document.getElementById('sections-list');
    console.log('loadSections....')
    console.log(`${serviceId}`)

    try {
        // Show loading state
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        listEl.innerHTML = '';
        const url = `${API_BASE}/api/mcp/docs-overview?serviceId=${encodeURIComponent(serviceId)}`;
        console.log(`URL - ${url}`)
        const data = await fetchWithTimeout(url);
        if(!data || !Array.isArray(data.sections)) {
            throw new Error('Invalid response format: expected sections array');
        }
        state.sections = data.sections;
        state.currentService = serviceId;
        state.selectedSectionIndex = -1;

        // Update chat help text to guide user
        const chatHelpText = document.getElementById('chat-help-text');
        if (chatHelpText && data.sections.length > 0) {
            chatHelpText.textContent = ' Select a section from the list to start chatting ';
            chatHelpText.style.color = '#0066cc';
            chatHelpText.style.fontWeight = '600';
        }

        // Render sections list
        renderSectionsList(data.sections);
        showToast(`Loaded ${data.sections.length} sections`,'success');
    } catch (error) {
        console.error('Error loading sections:', error);
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.classList.remove('hidden');
        showToast(`Failed to load sections: ${error.message}`, 'error');
    } finally {
        loadingEl.classList.add('hidden');
    }
}

function renderSectionsList(sections) {
    const listEl = document.getElementById('sections-list');
    listEl.innerHTML = '';

    if (sections.length === 0) {
        listEl.innerHTML = '<li class="empty-message">No sections available</li>';
        return;
    }

    sections.forEach((section, index) => {
        const li = document.createElement('li');
        li.className = 'section-item';
        li.setAttribute('role', 'option');
        li.setAttribute('tabindex', '0');
        li.setAttribute('data-section-id', section.id); 989
        li.setAttribute('data-index', index);

        const title = document.createElement('span');
        title.className = 'section-title';
        title.textContent = section.title || section.id;

        li.appendChild(title);

        // Click handler
        li.addEventListener('click', () =>{
            selectSection(index);
        });

        // Keyboard handler
        li.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                selectSection(index);
            }
        });

        listEl.appendChild(li);
    });
}

function selectSection(index) {
    if (index < 0 || index >= state.sections.length) return;

    const section = state.sections[index];
    state.currentSection = section;
    state.selectedSectionIndex = index;

    // Update UI selection
    const items = document.querySelectorAll('.section-item');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
        if (i === index) {
        item.setAttribute('aria-selected', 'true');
        } else {
        item.removeAttribute('aria-selected');
        }
    });

    // Enable chat input (replaced old ask-btn with chat interface)
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = 'Ask a question about this section...';
        console.log('Chat input enabled for section:', section.title || section.id);
    

    // Trigger input event to update send button state if text exists
    const inputEvent = new Event('input', { bubbles: true });
        chatInput.dispatchEvent(inputEvent);
    }

    const chatHelpText = document.getElementById('chat-help-text');
    if (chatHelpText) {
        chatHelpText.textContent = 'Type your question and press Enter';
        chatHelpText.style.color = ' #999';
        chatHelpText.style.fontWeight = 'normal'
    }

    console.log('/ Section selected:', {
        service: state.currentService,
        section: section.id,
        hasSection: !!state.currentSection
    });

    // Load section content
    loadSectionContent(state.currentService, section.id);
}

async function loadSectionContent(serviceId, sectionId) { 
    const emptyEl = document.getElementById('viewer-empty');
    const loadingEl = document.getElementById('viewer-loading');
    const errorEl = document.getElementById('viewer-error');
    const contentEl = document.getElementById('viewer-content');
    const titleEl = document.getElementById('viewer-title');

    try {

        // Show loading state
        emptyEl.classList.add('hidden');
        loadingEl.classList.remove('hidden');
        errorEl.classList.add('hidden');
        contentEl.classList.add('hidden');

        const url = `${API_BASE}/api/mcp/docs-section?serviceId=${encodeURIComponent(serviceId)}&sectionId=${encodeURIComponent(sectionId)}`; 
        const data = await fetchWithTimeout(url);

        if (!data || !data.body) {
            throw new Error('Invalid response: missing content body');
        }
        // Update title
        const section = state.sections.find(s => s.id === sectionId); 
        titleEl.textContent = section ? section.title : 'Documentation';

        // Update source link
        const sourceLink = document.getElementById('source-link');
        const copyLinkBtn = document.getElementById('cорy-link-btn'); 
            if (data.sectionLink) {
                sourceLink.href = data.sectionLink; 
                sourceLink.classList.remove('hidden');
                copyLinkBtn.classList.remove('hidden');

                // Update copy button handler
                copyLinkBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(data.sectionLink);
                    const originalText = copyLinkBtn.textContent; 
                    copyLinkBtn.textContent = 'Copied!'; 
                setTimeout(() => {
                    copyLinkBtn.textContent = originalText;
                }, 2000);
                    showToast('Link copied to clipboard', 'success');
                } catch (error) {
                    showToast('Failed to copy link', 'error');
                } 
                };
            } else {
                sourceLink.classList.add('hidden');
                copyLinkBtn.classList.add('hidden');
            }
        // Store raw content
        document.getElementById('raw-markdown').textContent = data.body;
        
        // Render content
        const renderedEl = document.getElementById('content-rendered');
        if (data.contentType === 'markdown') {
            renderedEl.innerHTML = renderMarkdown(data.body); 
            applySyntaxHighlighting(renderedEl);
            addCopyButtonsToCodeBlocks(renderedEl);

            // Show code button if there are code blocks
            const codeBlocks = extractCodeBlocks(data.body); 
            const showCodeBtn = document.getElementById('show-code-btn');
        if (codeBlocks.length > 0) {
            showCodeBtn.style.display = 'block'; 
            showCodeBtn.title = `${codeBlocks.length} code block${codeBlocks.length > 1 ? 's' : ''} found` ;
        } else {
            showCodeBtn.style.display = 'none';
        }
        } else {
        // Plain text
            renderedEl.innerHTML = `<pre>${DOMPurify.sanitize(data.body)}</pre>`; 
            document.getElementById('show-code-btn').style.display = 'none';
        }
        // Show content
        contentEl.classList.remove('hidden');

    } catch (error) {
        console.error('Error loading section content:', error); 
        errorEl.textContent = `Error loading content: ${error.message}`; 
        errorEl.classList.remove('hidden');
        showToast(`Failed to load section: ${error.message}`, 'error'); 
    } finally {
        loadingEl.classList.add('hidden');
    }
}

    function extractCodeBlocks(markdown) {
    if (!markdown) return [];

    const codeBlockPattern = /```(\W+)?\n([\s\S]*?)```/g;
    const blocks = [];
    let match;

    while ((match = codeBlockPattern.exec(markdown)) != null) {
    blocks.push({
    language: match[1] || 'text',
    code: match[2].trim()
    });
    }
    return blocks;
}


function setupServiceDropdown() {
    const searchInput = document.getElementById('service-search');
    const dropdown = document.getElementById('service-dropdown');
    const selectedDiv = document.getElementById('service-selected');
    let isDropdownOpen = false;
    let availableServices = [];
    let selectedService = null;

    // Load services on focus
    searchInput.addEventListener('focus', async () => {
    if (availableServices.length === 0) {
        searchInput.placeholder = 'Loading services...';
        availableServices = await fetchAvailableServices();
        searchInput.placeholder = `Search ${availableServices.length} services..`
    }
    renderServiceDropdown(searchInput.value);
    isDropdownOpen = true;
    });

    // Filter as user types
    searchInput.addEventListener('input', (e) => {
        if (isDropdownOpen) {
        renderServiceDropdown(e.target.value);
        }
    });

    // Close dropdown when clicking outside

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !dropdown.contains(e.target)){
            dropdown.classList.add('hidden');
            isDropdownOpen = false;
        }
    });


    function renderServiceDropdown(query) {
        dropdown.innerHTML = '';

        // Filter services
        let filteredServices = availableServices;
        if (query.trim()) {
            const lowerQuery = query.toLowerCase();
            filteredServices = availableServices.filter(serviceId => {
            const displayName = formatServiceName(serviceId);
            return serviceId.toLowerCase().includes(lowerQuery) ||
            displayName.toLowerCase().includes (lowerQuery);
        });
        }

        dropdown.classList.remove('hidden');

            if (filteredServices.length === 0) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'dropdown-empty';
                emptyDiv.innerHTML = `
                <strong>No services found</strong>
                <p>Try a different search term.</p>
                <p style="font-size: 0.85em; margin-top: 8px;">
                    <strong>${availableServices.length}</strong> total services available
                </p>
                `;
                dropdown.appendChild(emptyDiv);
            } else {
            // Add header
            const header = document.createElement('div');
            header.style.padding = '8px 12px';
            header.style.fontSize = '0.85em';
            header.style.color = '#666';
            header.style.borderBottom = '1px solid #e0e0e0';
            header.style.fontWeight = '600';
            header.style.background = '#f8f9fa';

            if (query.trim()) {
                header.textContent = '${filteredServices.length} of ${availableServices.length} services';
            } else {
                header.textContent = `All ${filteredServices.length} Services (click to select)`;
            }
            dropdown.appendChild(header);


            // Render service items
            filteredServices.forEach(serviceId => {
                const item = document.createElement('div');
                item.className = 'dropdown-item';
                if (selectedService === serviceId) {
                    item.classList.add('selected');
                }

                const displayName = formatServiceName(serviceId);
                item.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="font-weight: 600; color: 口#333;">${displayName}</span>
                    <span style="font-size: 0.85em; color: #666;">${serviceId}</span>
                </div>
                `;
                item.addEventListener('click', () => {
                    selectService(serviceId);
                    dropdown.classList.add('hidden');
                    isDropdownOpen = false;
                });

                dropdown.appendChild(item);
            });

            // Add custom option at the end
            const customItem = document.createElement('div');
            customItem.className = 'dropdown-item';
            customItem.style.borderTop = '2px solid #e0e0e0';
            customItem.style.fontStyle = 'italic'; 
            customItem.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="font-weight 600; color: #666;"> Custom Service </span>
                <span style="font-size: 85em; color: ■#999;">Enter a custom service ID</span>
            </div>
            `;
            customItem.addEventListener('click', () => {
                selectService('custom');
                dropdown.classList.add('hidden');
                isDropdownOpen = false; 
            });
            dropdown.appendChild(customItem);
        }
    }


    function selectService(serviceId) {
        selectedService = serviceId;

        if (serviceId === 'custom') {
            searchInput.value = 'Custom Service';
            selectedDiv.innerHTML = `
            <div style="padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; margin-top:
            <strong> Custom Service Mode</strong>
            <p style="margin: 4px 0 0 0; font-size: 0.9em; color: #666;">Enter service ID in the field below</p>
            </div>
            `;
            selectedDiv.classList.remove('hidden');
            document.getElementById('custom-service-group').style.display = 'block';
            state.currentService = null;
        } else {
            const displayName = formatServiceName(serviceId);
            searchInput.value = displayName;
            selectedDiv.innerHTML = `

            <div style="padding: 8px 12px; background: #d4edda; border: 1px solid #28a745; border-radius: 6px; margin-top: 8px;">
            <strong>/ Selected:</strong> ${displayName}
            <div style="font-size: 0.85em; color: #666; margin-top: 2px;">${serviceId}</div>
            <div style="font-size: 0.75em; color: #28a745; margin-top: 4px;"> Loading documentation...</div>
            </div>
            `;
            selectedDiv.classList.remove('hidden');
            document.getElementById('custom-service-group').style.display = 'none';
            state.currentService = serviceId;
            // AUTO-LOAD: Automatically load service documentation for q&A
            console.log(`Auto-loading documentation for: $(serviceId}`);
            setTimeout(() => {
                preloadServiceDocumentation(serviceId);
            }, 100);
        }

        // Reset section selection
        state.currentSection = null;
        state.selectedSectionIndex = -1;
    }

    function formatServiceName(serviceId) {
        return serviceId
        .split('-')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
}
    
function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
    const sectionsList = document.getElementById('sections-list');

    // Navigation within sections list
    if (sectionsList.contains (document.activeElement)) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();

            const items = Array.from(document.queryBelectorAll('.section=item'));
            const currentIndex = items.indexOf(document.activeElement);

            let nextIndex;
            if (e.key === 'ArrowDown') {
                nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            } else {
                nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            }

            if (items[nextIndex]) {
                items[nextIndex].focus();
            }
        }
    }
    // Global shorteuts
    // Escape to clear search/inputs
    if (e.key === 'Escape') {
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
            activeElement.blur();
        }
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('service-select').focus();
    }

    });
}

async function populateServiceDropdown() {
    console.log('[DEBUG] populateServiceDropdown() called');
    const serviceSelect = document.getElementById('service-select');

    if (!serviceSelect) {
        console.error('X [DEBUG] service-select element not found!');
        return;
    }

    try {
        console. log(' [DEBUG] Calling fetchAvailableServices()...');
        const services = await fetchAvailableServices();

        console.log(` [DEBUG] Received ${services.length} services:`, services.slice(0, 5), '...');

        if (services.length === 0) {
            console.warn('A [DEBUG] No services returned, keeping default dropdown');
            return;
        }

        // Store current selection if any
        const currentValue = serviceSelect.value;
        console.log('[DEBUG] Current selection: ${currentValue}');

        // Clear existing options
        console. log(' [DEBUG] Clearing dropdown options...');
        serviceSelect.innerHTML = '';

        // Add all services as options
        console.log(' [DEBUG] Adding service options...');
        let addedCount = 0;
        services.forEach(serviceId => {
            const option = document.createElement('option');
            option.value = serviceId;
            // Format the display name (capitalize and replace hyphens with spaces)
            const displayName = serviceId
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
            option.textContent = displayName;
            serviceSelect.appendChild(option);
            addedCount++;
        });
        console.log(' [DEBUG] Added ${addedCount} service options');

        // Add custom option at the end
        const customOption = document.createElement('option');
        customOption.value = 'custom';
        customOption.textContent = 'Custom (enter below)';
        serviceSelect.appendChild(customOption);
        console.log(' [DEBUG] Added custom option');

        // Restore previous selection or set first service as default
        if (currentValue && services.includes(currentValue)) {
            serviceSelect.value = currentValue
            console.log( `[DEBUG] Restored selection: ${currentValue}`);
        } else if (services.length > 0) {
            serviceSelect.value = services [0];
            console.log(`[DEBUG) Set default to: ${services[0]}`)
        }
            
        console.log(` [DEBUG] Dropdown now has ${serviceSelect.options.length} options`);
        console.log(` Loaded ${services.length} services into dropdown`);
        showToast(`Loaded ${services.length} services`, 'success');
    } catch (error) {
        console.error(' [DEBUG] Error in populateServiceDropdown:', error);
        console.error(' [DEBUG] Error stack:', error.stack);
        showToast('Failed to load services. Using default list.', 'error');
        // Keep existing hardcoded options as fallback
        // (no action needed, HTML already has them)
    }
}

async function preloadServiceDocumentation(serviceId) {
    const statusEl = document.getElementById('service-preload-status');
    const progressEl = document.getElementById('service-preload-progress');
    const preloadBtn = document.getElementById('preload-service-btn');

    try {
        preloadBtn.disabled = true;
        console.log(' Starting service preload for:', serviceId);

        statusEl.textContent = `Fetching sections for ${serviceId}...`;
        progressEl.classList.remove('hidden');

        // Get sections for this service
        const overviewUrl = `${API_BASE}/api/mcp/docs-overview?serviceId=${encodeURIComponent(serviceId)}`;
        console.log(' Starting service preload with URL:', overviewUrl);

        const overviewData = await fetchWithTimeout(overviewUrl);

        if (!overviewData || !Array.isArray(overviewData.sections)) {
        throw new Error('Invalid response format: expected sections array');
        }

        const totalSections = overviewData.sections.length;

        if (totalSections === 0) {
            throw new Error(`No sections found for service: ${serviceId}`);
        }

        console.log(` Found ${totalSections} sections to preload`);

        statusEl.textContent = `Loading 0/${totalSections} sections...`;
        state.serviceDocumentation = [];
        let loadedSections = 0;

        // Load content for each section
        for (const section of overviewData.sections) {
            try {
                const contentUrl = `${API_BASE}/api/mcp/docs-section?serviceId=${encodeURIComponent(serviceId)}&sectionId=${encodeURIComponent(section.id)}`;
                const contentData = await fetchWithTimeout(contentUrl);

                if (contentData && contentData.body) {
                    state.serviceDocumentation.push({
                        serviceId,
                        sectionId: section.id,
                        title: section.title || section.id,
                        link: contentData.sectionLink || section.link,
                        content: contentData.body
                    });

                    loadedSections++
                    statusEl.textContent = `Loading ${loadedSections}/${totalSections} sections...`;
                    console.log('Service documentation', state.serviceDocumentation)
                } 
            } catch (error) {
                console.warn(`Failed to load section ${section.id}:`, error);
                loadedSections++;
            }
        }

        state.preloadedService = serviceId;

        console.log(`Preloaded ${state.serviceDocumentation.length} sections`);

        // Index in vector search if available
        if (state.vectorSearchAvailable) {
            statusEl.textContent = ` Indexing ${state.serviceDocumentation. length} sections in vector search...`;
            const indexed = await indexInVectorSearch(state.serviceDocumentation, true);
            if (indexed) {
                statusEl.textContent = ` Loaded and indexed ${state.serviceDocumentation.length} sections from ${serviceId}`;
                showToast(`${state.serviceDocumentation.length} sections indexed with semantic search!`, 'success');
            } else {
                statusEl.textContent = `Loaded ${state.serviceDocumentation.length} sections from ${serviceId}`;
                showToast(`Successfully pre-loaded ${state.serviceDocumentation.length} sections from ${serviceId}`, 'success');
            } 
        } else {
            statusEl.textContent = ` Loaded ${state.serviceDocumentation.length} sections from ${serviceId}`;
            showToast(`Pre-loaded ${state.serviceDocumentation.length} sections - You can now ask questions across all sections!`, 'success');
        }

        // Enable chat interface (replaced ask-btn with chat UI)
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const chatHelpText = document.getElementById('chat-help-text');

        if (chatInput) {
            chatInput.disabled = false;
            chatInput.placeholder = `Ask about ${serviceId}...`;
            console.log(' Chat enabled for preloaded service');
        }

        if (sendBtn) {
            sendBtn.disabled = false;
        }

        if (chatHelpText){
            chatHelpText.textContent = ` Chat enabled for ${serviceId} (${state.serviceDocumentation.length} sections loaded)`;
            chatHelpText.style.color = '#22c55e';
            chatHelpText.style.fontWeight = '600';
        }

        // Keep progress visible as a persistent badge showing preload is active
        // Don't hide it - it serves as an indicator that service is preloaded
        statusEl.style.color = '#22c55e';
        statusEl.style.fontWeight = '900';

    } catch (error) {
        console.error('Error pre-loading service documentation:', error);
        statusEl.textContent = `Error: ${error.message}`;
        showToast(`Failed to pre-load service documentation: ${error.message}`, 'error');
    } finally {
        preloadBtn.disabled = false;
    }
}


async function fetchAvailableServices() {
    console.log('[DEBUG] fetchAvailableServices() called');
    try {
        const url = `${API_BASE}/api/mcp/services`;
        console.log('[DEBUG] Fetching from: ${url}');

        const data = await fetchWithTimeout(url);
        console.log(' [DEBUG] Raw response:', data);

        if (!data) {
            console.error('X [DEBUG] Response is null or undefined');
            throw new Error('Null response from services API');
        }
        if (!data.services) {
            console.error('X [DEBUG] Response missing "services" property');
            console.error(' [DEBUG] Response keys:', Object.keys(data));
            throw new Error('Invalid response format: missing services property');
        }

        if(!Array.isArray(data.services)) {-
            console.error('X [DEBUG] services is not an array, type:', typeof data.services);
            throw new Error('Invalid response format: services is not an array');
        }

        if (data.services.length === 0) {
            console.warn('A [DEBUG] API returned 0 services, using fallback');
            throw new Error('No services available from API');
        }

        console.log(`[DEBUG] Successfully fetched ${data.services.length} services from MCP`);
        console.log(' Fetched', data.services.length, 'serviçes from MCP');
        return data.services;
    } catch (error) {
        console.error('[DEBUG] Error in fetchAvailableServices:', error);
        console.error('[DEBUG] Error type:', error.name);
        console.error('[DEBUG] Error message:', error.message);
        console.log('A Using fallback hardcoded services');
        // Fallback to original hardcoded services if fetch fails
        return [
        'mastercom',
        'mastercard-send-person-to-person',
        'loyalty',
        'locations'
        ];
    }
}

async function handleAskQuestion(question) {

    console.log('Question:', question);

    // If all services are pre-loaded, search across everything
    if (state.isPreloaded && state.allDocumentation.length > 0) {
    console.log('If all services are pre-loaded, search across everything');
    return handleAskQuestionGlobal(question, state.allDocumentation, 'all services');
    }
    // If a specific service is pre-loaded, search within that service
    if (state.preloadedService && state.serviceDocumentation.length > 0) {
    console.log('If all services are pre-loaded, search within that service');
    return handleAskQuestionGlobal(question, state.serviceDocumentation, state.preloadedService);
    // Otherwise, require a selected section
    }
    if (!state.currentSection) {
    console.log('Please select a documentation section first, or use pre-load options');
    showToast('Please select a documentation section first, or use pre-load options','error');
    return;
    }
    try {
        // Add user message to chat
        addChatMessage('user', question);

        // Show typing indicator
        showTypingIndicator();

        console.log('Fetching answer to the question.....')
        // Fetch the current section content
        const url = `${API_BASE}/api/mcp/docs-section?serviceId=${encodeURIComponent(state.currentService)}&sectionId=${encodeURIComponent(state.currentSection.id)}`;
        const data = await fetchWithTimeout(url);
        console.log('Data received.....')
        if (!data || !data.body) {
        throw new Error('Could not fetch section content');
        }


        const context = [{
            title: state.currentSection.title || state.currentSection.id,
            link: data.sectionLink || '#',
            content: data.body.substring(0, 3000)
        }];
        const aiAnswer = await callAIService(question, context);

        console.log('Generated AI answer:', aiAnswer);
        console.log('Answer AI length:', aiAnswer.length);

        // Debug: Log raw markdown content
        console.log('[DEBUG] Raw markdown length:', data.body?.length);
        console.log('[DEBUG] First 1000 chars of markdown:', data.body?.substring(0, 1000));

        
        // Generate answer using ennanced Copilot-like generation
        const answer = generateCopilotAnswer(question, data.body);

        //console.log('Generated answer:', answer);
        //console.log('Answer length:', answer.length);
        
        //Prepare Sources for chat
        const sources = [{
        title: state.currentSection.title || state.currentSection.id,
        link: data.sectionLink || '#'
        }];
        console.log('Sources', sources);

        // Generate follow-up questions
        const questionType = detectQuestionType(question);
        const keywordData = extractEnhancedKeywords(question);
        const followUps = generateFollowUpQuestions(question, questionType, keywordData.original);
        console.log('Question Type', questionType);
        console.log('Keyword data', keywordData);

        // Hide typing indicator and show answer
        hideTypingIndicator();
        addChatMessage('assistant', answer, sources, followUps);
        console.log(' Answer added to chat');
    } catch (error) {
        console.error('Error generating answer:', error);
        hideTypingIndicator();
        addChatMessage('assistant', `Error: ${error.message}`);
        showToast(`Failed to generate answer: ${error.message}`, 'error');
    }
}

async function handleAskQuestionGlobal(question, documentationPool, scope) {
    try {
        // Add user message to chat
        addChatMessage('user', question);
        // Show typing indicator
        showTypingIndicator();

        // Extract keywords and detect question type once for the entire function
        const questionType = detectQuestionType(question);
        const keywordData = extractEnhancedKeywords(question);

        // Try vector search first if available
        if (state.usingVectorSearch && state.vectorSearchIndexed) {
            console.log(' Using vector search for contextual understanding...');
            const vectorResults = await vectorSearch(question, 8, 0.25);

            if (vectorResults && vectorResults.length > 0) {
            console.log(`Vector search found ${vectorResults.length} results`);

            // Extract sentences from top results
            const allSentences = [];
            const citationMap = new Map();

            vectorResults.forEach((result, idx) => {
            // Extract sentences from content (preserve URLs during splitting)
            const cleanedContent = result.content 
            .replace(/\{#[^}]+\}/g, '')  // Remove anchor IDs like {#gateway-error-codes}
            .replace(/\n+/g,'')
            .replace(/#{1,6}\s/g, '') 
            .replace(/\*\*(.+?) \*\*/g, '$1')
            .replace(/\*(.+?)\*/g, '$1') 
            .replace(/`(.+?)`/g, '$1');

            // Protect URLs from being split on periods 
            const urlMap = new Map();
            let urlCounter = 0;
            let protectedContent = cleanedContent.replace(/https?:\/\/[^\s\)]+/g, (url) => {
            const placeholder = `__URL_${urlCounter}__`; 
            urlMap.set(placeholder, url); 
            urlCounter++;
            return placeholder;
            });

            const sentences = protectedContent
            .split(/[.!?]+/)
            .map(s => s.trim())
            .filter(s => s.length > 20 && s.length < 300)
            .map(s => {
            // Restore URLs
            let restored = s;
            urlMap.forEach((url, placeholder) => {
                restored = restored.replace(placeholder, url);
            });
            // Convert markdown links
            return restored.replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)');
            });

            // Take top sentences based on vector score
            const topSentences = sentences.slice(0, Math.max(3, Math.floor(6 / vectorResults.length)));
            allSentences.push(...topSentences);

            // Add citation
            const citationKey = result.metadata.serviceId + '::' + result.title;
            if (!citationMap.has(citationKey)) {
            citationMap.set(citationKey, {
            title: result.title,
            link: result.metadata.link,
            serviceId: result.metadata.serviceId,
            score: result.score
            });
            }
            });

            if (allSentences. length > 0) {
            // Format answer with Copilot-like introduction
            let introduction= '';

            switch (questionType) {
            case 'how-to':
            introduction = "Here's how you can achieve that:\n\n";
            break;
            case 'definition':
            introduction = "Let me explain:\n\n";
            break;
            case 'example':
            introduction = "Here are relevant examples:\n\n";
            break;
            case 'why':
            introduction = "The reason is:\n\n";
            break;
            case 'list':
            introduction = "Here are the options:\n\n";
            break;
            case 'troubleshooting':
            introduction = "Here's how to fix this:\n\n";
            break;
            default:
            introduction = "Based on the documentation:\n\n";
            }

            const answerText = allSentences.slice(0, 6).join('. ') + '.';

            // Include code examples if appropriate
            let codeExamples = '';
            const shouldIncludeCode = questionType === 'example' ||
            questionType === 'how-to' ||
            /\b(code|example|sample|snippet|demo|curl|request|implementation)\b/i.test(question);

            if (shouldIncludeCode) {
            // Extract code blocks from top vector search results
            const allCodeBlocks = [];
            vectorResults.slice(0, 3).forEach(result => {
            const blocks = extractCodeBlocks(result.content);
            blocks.forEach(block => {
            allCodeBlocks.push(block);
            });
            });

            if (allCodeBlocks.length > 0) {
            const relevantCodes = findRelevantCodeBlocks(
            question,
            allCodeBlocks,
            vectorResults[0]?.content || '',
            keywordData.original
            );

            if (relevantCodes.length > 0) {
            codeExamples = '\n\n**Code Example' + (relevantCodes.length > 1 ? 's' : '') + ':**\n\n';
            relevantCodes.forEach(block => {
            codeExamples += '```' + block.language + '\n' + block.code + '\n```\n\n';
            });
            }
            }
            }

            const fullAnswer = introduction + answerText + codeExamples;

            // Prepare sources from citations
            const sources = Array.from(citationMap.values())
            .sort((a, b) => b.score - a.score)
            .map(citation => ({
                title: `${citation.title} (${citation.serviceId})`,
                link: citation.link,
                badge: `${(citation.score * 100).toFixed(0)}% match`
            }));

            // Generate follow-up questions
            const followUps = generateFollowUpQuestions(question, questionType, keywordData.original);

            const aiAnswer = await callAIService(question, [fullAnswer]);
            // Hide typing and show answer
            hideTypingIndicator();
            addChatMessage('assistant', aiAnswer, sources, followUps);
            return; // Success with vector search
            }
            }
            console. log(' Vector search returned no results, falling back to TF-IDF...');
        }

        // Fallback to TF-IDF search
        console.log('Using TF-IDF search...');

        // Check if we have keywords (already extracted at function start)
        if (keywordData.original.length == 0) {
        hideTypingIndicator();
        addChatMessage('assistant', 'Please ask a more specific question with key terms I can search for in the documentation.');
        return;
        }

        // Calculate IDF across all documents for semantic similarity
        const allDocContents = documentationPool.map(doc => doc.content);
        const idf = calculateIDF(allDocContents);
        const questionVector = createTFIDFVector(question, idf);

        // Advanced document scoring with semantic understanding
        const scoredDocs = documentationPool.map(doc => {
        const lowerContent = doc.content.toLowerCase();
        const lowerTitle = doc.title.toLowerCase();
        const contentLength = doc.content.split(/\s+/).length;

        // 1. TF-IDF Semantic Similarity
        const docVector = createTFIDFVector(doc.content, idf);
        const semanticScore = cosineSimilarity(questionVector, docVector);

        // 2. Keyword matching with stemming and synonyms
        let keywordScore = 0;
        let matchedKeywords = 0;

        keywordData.original.forEach(keyword => {
        const contentMatches = (lowerContent.match(new RegExp(keyword, 'g')) || []).length;
        const titleMatches = (lowerTitle.match(new RegExp(keyword, 'g')) || []).length;

        if (contentMatches > 0) matchedKeywords++;

        keywordScore += contentMatches * 2;
        keywordScore += titleMatches * 15;

        });
        // 3. Expanded terms (synonyms) - lower weight
        keywordData.expanded.forEach(term => {
        const matches = (lowerContent.match(new RegExp(term, 'g')) || []).length;
        keywordScore += matches * 0.5;
        });

        // 4. Phrase matches (strong signal)
        keywordData.phrases.forEach(phrase => {
        const phraseMatches = (lowerContent.match(new RegExp(phrase, 'g')) || []).length;
        const titlePhraseMatches = (lowerTitle.match(new RegExp(phrase, 'g')) || []).length;
        keywordScore += phraseMatches * 10;
        keywordScore += titlePhraseMatches * 30;
        });

        // 5. Keyword density
        const density = matchedKeywords / keywordData.original.length;
        const densityBonus = density * 12;

        // 6. Multiple keyword bonus
        const multiKeywordBonus = matchedKeywords > 1 ? matchedKeywords * 6 : 0;

        // 7. Content length normalization
        const lengthNorm = contentLength > 0 ? (1 + (1000 / contentLength) * 0.1) : 1;

        // Combined hybrid score (semantic + keyword-based)
        const finalScore = (
        (semanticScore * 100) + // TF-IDF semantic similarity (high weight)
        (keywordScore) + // Keyword matches
        (densityBonus) + // Keyword density
        (multiKeywordBonus) // Multiple keywords
        ) * lengthNorm;

        return {
        ...doc,
        score: finalScore,
        semanticScore,
        matchedKeywords
        };
        });

        // Get top 5 most relevant documents
        const topDocs = scoredDocs
        .filter(doc => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

        if (topDocs.length === 0) {
        hideTypingIndicator(); 
        addChatMessage('assistant', "I couldn't find any relevant information across all documentation. Try different keywords or more specific terms.");
        return;
        }

        // Generate answer from top documents with semantic scoring
        const allRelevantSentences = [];
        const citationMap = new Map();

        // Calculate IDF for sentences across top docs
        const allSentencesForIDF = [];
        topDocs.forEach(doc => {
        // Protect URLs from period-based splitting
        const urlMap = new Map();
        let urlCounter = 0;
        let protectedContent = doc.content.replace(/https?:\/\/[^\s\)]+/g, (url) => {
        const placeholder = `__URL_${urlCounter}__`;
        urlMap.set(placeholder, url);
        urlCounter++;
        return placeholder;
        });

        const sentences = protectedContent
        .replace(/\n+/g, ' ')
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1')
        .split(/[.!?]+/)
        .map(s => {
        // Restore URLs
        let restored = s;
        urlMap.forEach((url, placeholder) => {
            restored = restored.replace(placeholder, url);
        });
        // Convert markdown links
        return restored.replace(/\[(.+?)\]\{(.+?)\)/g, '$1 ($2)');
        })
        .map(s => s.trim())
        .filter(s => s.length > 20);
        allSentencesForIDF.push(...sentences);
        });

        const sentenceIDF = calculateIDF(allSentencesForIDF);
        const questionSentenceVector = createTFIDFVector(question, sentenceIDF);

        topDocs.forEach((doc, docIndex) =>{
        const cleanedContent = doc.content
        .replace(/\{#[^}]+\}/g, '')
        .replace(/\n+/g,' ')
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1') 
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1');

        // Protect URLs from being split on periods
        const urlMap = new Map();
        let urlCounter = 0;
        // Remove anchor IDs like {#gateway-error-codes}
        let protectedContent = cleanedContent.replace(/https?:\/\/[^\s\)]+/g, (url) => {
        const placeholder = ` __URL_${urlCounter}__`;
        urlMap.set(placeholder, url);
        urlCounter++;
        return placeholder;
        });

        const sentences = protectedContent
        .split(/[.!?]+/)
        .map(s => s.trim())
        .filter(s => s.length > 20)
        .map(s => {
        // Restore URLS
        let restored = s;
        urlMap.forEach((url, placeholder) => {
        restored = restored.replace(placeholder, url);
        });

        // Convert markdown links
        return restored.replace(/\[(.+?)\]\((.+?)\)/g, '$1 ($2)');
        });

        // Score sentences with semantic understanding
        const scoredSentences = sentences.map((sentence, sentenceIndex) => {
        const lowerSentence = sentence.toLowerCase();
        const wordCount = sentence.split(/\s+/).length;

        // 1. Semantic similarity with TF-IDF
        const sentenceVector = createTFIDFVector(sentence, sentenceIDF);
        const semanticScore = cosineSimilarity(questionSentenceVector, sentenceVector);

        // 2. Keyword matches
        let keywordScore = 0;
        let matchCount = 0;

        keywordData.original.forEach(kw => {
        if (lowerSentence.includes(kw)) {
        matchCount++;
        const occurrences = (lowerSentence.match(new RegExp(kw, 'g')) || []).length;
        keywordScore += occurrences * 3;
        }
        });

        // Expanded terms
        keywordData.expanded.forEach(term => {
        if (lowerSentence.includes(term)) {
        keywordScore += 1;
        }
        });

        // 3. Phrase matches
        let phraseScore = 0;
        keywordData.phrases.forEach(phrase => {
        if (lowerSentence.includes(phrase)) {
        phraseScore += 18;
        }
        });

        // 4. Keyword proximity and density
        let proximityScore = matchCount > 1 ? matchCount * 5 : 0;
        const density = matchCount / keywordData.original.length;
        const densityScore = density * 8;

        // 5. Length optimization
        let lengthMultiplier = 1;
        if (wordCount >= 15 && wordCount <= 80) {
        lengthMultiplier = 1.5; 
        } else if (wordCount < 10 || wordCount > 120) {
        lengthMultiplier = 0.5;
        }

        // 6. Position and document rank bonuses
        const positionBonus = 1 + (1 - (sentenceIndex / sentences.length)) * 0.3;
        const docBonus = 1 + (1 - (docIndex / topDocs.length)) * 0.4;

        // Combined score (semantic + keyword)
        const combinedScore = (
        (semanticScore * 25) + // TF-IDF semantic similarity
        (keywordScore) + // Keyword matches
        (phraseScore) + // Phrase matches
        (proximityScore) + // Keyword proximity
        (densityScore) // Keyword density
        ) * lengthMultiplier * positionBonus * docBonus;
        return {
        sentence,
        score: combinedScore,
        semanticScore,
        matchCount,
        doc,
        sentenceIndex
        };
        });

        // Get top 3 sentences from this document
        const topFromDoc = scoredSentences
        .filter(item => item.semanticScore > 0.05 || item.matchCount > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

        allRelevantSentences.push(...topFromDoc);

        if (topFromDoc.length > 0) {
        citationMap.set(doc.serviceId + '::' + doc.title, {
        title: doc.title,
        link: doc.link,
        serviceId: doc.serviceId,
        relevance: doc.score
        });
        }
        });

        if (allRelevantSentences.length === 0) {
        hideTypingIndicator();
        addChatMessage('assistant', "I couldn't extract relevant information from the documentation. Try rephrasing your question.");
        return;
        }

        // Sort and deduplicate sentences
        const sortedSentences = allRelevantSentences.sort((a, b) => b.score - a.score);
        const uniqueSentences = [];
        const seenSentences = new Set();

        for (const item of sortedSentences) {
        const key = item.sentence.substring(0, 50).toLowerCase();
        if (!seenSentences.has(key) && uniqueSentences.length < 6) {
        uniqueSentences.push(item);
        seenSentences.add(key);
        }
        }

        // Format answer with Copilot-like introduction
        let introduction = '';

        switch (questionType) {
        case 'how-to':
        introduction = "Based on the documentation, here's how to do that:\n\n";
        break;
        case 'definition':
        introduction = "Let me explain what this is:\n\n";
        break;
        case 'example':
        introduction = "Here are some examples from the documentation:\n\n";
        break;
        case 'why':
        introduction = "Here's the reasoning:\n\n";
        break;
        case 'list':
        introduction = "Here's what's available:\n\n";
        break;
        case 'comparison':
        introduction = "Here's how they compare:\n\n";
        break;
        case 'troubleshooting':
        introduction = "To resolve this:\n\n";
        break;
        default:
        introduction = "Based on the documentation:\n\n";
        }

        const answerText = uniqueSentences
        .map(item => item.sentence.trim())
        .join('. ') + '.';

        // Include code examples if question asks for code/examples
        let codeExamples = '';
        const shouldIncludeCode = questionType === 'example' ||
                                    questionType === 'how-to' ||
                                    /\b(code|example|sample|snippet|demo|curl|request|implementation)\b/i.test(question);

        if (shouldIncludeCode) {
            // Extract code blocks from top documents
            const allCodeBlocks = [];
            topDocs.slice(0, 5).forEach(doc => {
            const blocks = extractCodeBlocks(doc.content);
            blocks.forEach(block => {
            allCodeBlocks.push({
            block,
            doc,
            sourceMarkdown: doc.content
            });
            });
            });

            if (allCodeBlocks.length > 0) {
            const relevantCodes = findRelevantCodeBlocks(
            question,
            allCodeBlocks.map(item => item.block),
            allCodeBlocks[0]?.sourceMarkdown || '',
            keywordData.original
            );

            if (relevantCodes.length > 0) {
            codeExamples = '\n\n**Code Example' + (relevantCodes.length > 1 ? 's' : '') + ':**\n\n';
            relevantCodes.forEach (block => {
            codeExamples += '```' + block.language + '\n' + block.code + '\n```\n\n';
            });
            }
            }
        }

        // Add helpful tip
        const sourcesCount = citationMap.size;
        const tip = `\n\n This answer was synthesized from ${sourcesCount} documentation ${sourcesCount > 1 ? 'sources' : 'source' } across ${scope}.`;

        const fullAnswer = introduction + answerText + codeExamples + tip;

        // Prepare sources sorted by relevance
        const sources = Array.from(citationMap.values())
        .sort((a, b) => b.relevance - a.relevance)
        .map(citation => ({
            title: `${citation.title} (${citation.serviceId})`,
            link: citation.link
        }));

        // Generate follow-up questions (using variables from function start)
        const followUps = generateFollowUpQuestions (question, questionType, keywordData.original);

        const aiAnswer = await callAIService(question, [fullAnswer]);
        // Hide typing and show answer
        hideTypingIndicator();
        addChatMessage('assistant', aiAnswer, sources, followUps);

    } catch (error) {
        console.error('Error generating global answer:', error);
        hideTypingIndicator();
        addChatMessage('assistant', `% Error: ${error.message}`);
        showToast(`Failed to generate answer: ${error.message}`, 'error');
    }
}

function findRelevantCodeBlocks(question, codeBlocks, markdown, keywords) {
    if (codeBlocks.length === 0) return [];

    // If only 1-2 blocks, return them all
    if (codeBlocks. length <= 2) return codeBlocks;

    const lowerQuestion = question.toLowerCase();

    // Score each code block based on relevance
    const scoredBlocks = codeBlocks.map((block, index) => {
    let score = 0;
    const lowerCode = block.code.toLowerCase();
    // Find context around this code block in the markdown
    const codePattern = new RegExp('```\\w*\\n' + block.code.substring(0, 50).replace(/[.*+?^${}() |[\]\\]/g, '\\$&'));
    const match = markdown.match(codePattern);
    let context = '';
    if (match) {
        const startIndex = markdown.index0f(match[0]);
        const contextStart = Math.max(0, startIndex - 200);
        const contextEnd = Math.min(markdown.length, startIndex + block.code.length + 200);
        context = markdown.substring(contextStart, contextEnd).toLowerCase();
    }

    // Score based on keyword matches in code
    keywords.forEach(keyword => {
        if (lowerCode.includes (keyword)) score += 3;
        if (context.includes (keyword)) score += 2;
    });

    // Bonus for specific patterns
    if (lowerQuestion.includes ('curl') && block.language === 'sh') score += 5;
    if (lowerQuestion.includes('javascript') && block.language === 'javascript') score += 5;
    if (lowerQuestion.includes('python') && block.language === 'python') score += 5;
    if (lowerQuestion.includes('java') && block. language === 'java') score += 5;
    if (lowerQuestion.includes('json') && block.language === 'json') score += 5;

    // Prefer certain languages for API questions
    if (/\b(api|endpoint|request|call)\b/i.test(lowerQuestion)) {
    if (block. language === 'sh' || block.language === 'bash') score += 3;
    if (block.language = 'json') score += 2;
    }
    // Position bonus (earlier blocks are often more important)
    score += (codeBlocks.length - index) * 0.5;

    // Length consideration (prefer substantial but not overwhelming examples)
    const lines = block.code.split('\n').length;
    if (lines >= 5 && lines <= 30) score += 2;
    if (lines > 50) score -= 1; // Penalize very long blocks
    return { block, score, index };
    });

    // Sort by score and return top 2
    return scoredBlocks
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index) // Maintain original order
    .map(item => item.block);
}

function generateFollowUpQuestions(question, questionType, keywords = []) {
    const followUps = [];
    const mainKeyword = keywords.length > 0 ? keywords[0] : 'this';

    // Generate follow-ups based on question type 
    switch (questionType) {
    case 'definition':
    followUps.push(`How do I use ${mainKeyword}?`); 
    followUps.push(`Show me examples of ${mainKeyword}`);
    followUps.push(`What are the benefits of ${mainKeyword}?`);
    break;

    case 'how-to':
    followUps.push(`What are common errors with ${mainKeyword}?`);
    followUps.push(`Show me a complete example`);
    followUps.push(`What are best practices for ${mainKeyword}?`);
    break;

    case 'example':
    followUps.push(`How do I customize ${mainKeyword}?`);
    followUps.push(`What parameters are available?`);
    followUps.push(`What are common use cases?`);
    break;

    case 'why':
    followUps.push(`How does ${mainKeyword} work?`);
    followUps.push(`When should I use ${mainKeyword}?`);
    followUps.push(`What are alternatives to ${mainKeyword}?`);
    break;

    case 'list':
    followUps.push(`Tell me more about ${mainKeyword}`);
    followUps.push(`How do I choose the right ${mainKeyword}?`);
    followUps.push(`Show me examples`);
    break;

    case 'troubleshooting':
    followUps.push(`How do I prevent this error?`);
    followUps.push(`What causes ${mainKeyword}?`);
    followUps.push(`Show me the correct way to implement this`);
    break;

    case 'comparison':
    followUps.push(`Which one should I use?`);
    followUps.push(`Show me examples of both`);
    followUps.push(`What are the trade-offs?`);
    break;

    default:
    // General follow-ups
    followUps.push(`Tell me more about ${mainKeyword}`);
    followUps.push(`Show me code examples`);
    followUps.push(`What are best practices?`);
    }
    // Return up to 3 follow-ups
    return followUps.slice(0, 3);
}
/** 
Handles clicking a follow-up suggestion
* @param {string} suggestion - The suggested question text
*/
function handleFollowUpClick(suggestion) {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    if (chatInput) {
    chatInput.value = suggestion;
    chatInput.focus();

    // Auto-resize the input
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    // Enable send button
    if (sendBtn) {
    sendBtn.disabled = false;
    }
    // Scroll input into view
    chatInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

async function handleAskQuestionGlobalVersion1(question, documentationPool, scope) {
    console.log('Entering into handleAskQuestionGlobal....')
    try {

        addChatMessage('user', question);
        showTypingIndicator();

        const questionType = detectQuestionType(question);
        // Extract enhanced keywords with stemming and synonyms
        const keywordData = extractEnhancedKeywords(question);

        if (keywordData.original.length === 0) {
            hideTypingIndicator();
        addChatMessage('assistant', "Please ask a more specific question with key terms I can search for in the documentation");
            // answerContent.innerHTML = '<p>Please ask a more specific question with key terms I can search for in the documentation.</p>';
            console.log('Please ask a more specifc question with key terms I can search for in the documentation');
        return;
        }

        // Calculate IDF across all documents for semantic similarity
        const allDocContents = documentationPool.map(doc => doc.content);
        const idf = calculateIDF(allDocContents);
        const questionVector = createTFIDFVector(question, idf);

        // Advanced document scoring with semantic understanding
        const scoredDocs = documentationPool.map(doc => {
        const lowerContent = doc.content.toLowerCase();
        const lowerTitle = doc.title.toLowerCase();
        const contentLength = doc.content.split(/\s+/).length;

        // 1. TF-IDF Semantic Similarity
        const docVector = createTFIDFVector(doc.content, idf);
        const semanticScore = cosineSimilarity(questionVector, docVector);

        // 2. Keyword matching with stemming and synonyms
        let keywordScore = 0;
        let matchedKeywords = 0;

        keywordData.original.forEach(keyword => {
            const contentMatches = (lowerContent.match(new RegExp(keyword, 'g')) || []).length;
            const titleMatches = (lowerTitle.match(new RegExp(keyword, 'g')) || []).length;
            if (contentMatches > 0) matchedKeywords++;
            keywordScore += contentMatches * 2;
            keywordScore += titleMatches * 15;
        });

        // 3. Expanded terms (synonyms) - lower weight
        keywordData.expanded. forEach(term => {
            const matches = (lowerContent.match(new RegExp(term, 'g')) || []).length;
            keywordScore += matches * 0.5;
        });

        // 4. Phrase matches (strong signal)
        keywordData.phrases.forEach(phrase => {
            const phraseMatches = (lowerContent.match(new RegExp(phrase, 'g')) || []).length;
            const titlePhraseMatches = (lowerTitle.match(new RegExp(phrase, 'g')) || []).length;
            keywordScore += phraseMatches * 10;
            keywordScore += titlePhraseMatches * 30;
        });

        // 5. Keyword density
        const density = matchedKeywords / keywordData.original.length;
        const densityBonus = density * 12;

        // 6. Multiple keyword bonus
        const multiKeywordBonus = matchedKeywords > 1 ? matchedKeywords * 6 : 0;

        // 7. Content length normalization
        const lengthNorm = contentLength > 0 ? (1 + (1000 / contentLength) * 0.1) : 1;

        // Combined hybrid score (semantic + keyword-based)
        const finalScore = (
        (semanticScore * 100) +             // TF-IDF semantic similarity (high weight)
        (keywordScore) +                    // Keyword matches
        (densityBonus) +                    // Keyword density
        (multiKeywordBonus)                 // Multiple keywords
        ) * lengthNorm;

        return {
        ...doc,
        score: finalScore,
        semanticScore,
        matchedKeywords
        };
        });

        // Get top 3 most relevant documents
        const topDocs = scoredDocs
        .filter(doc => doc.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 1);

        if (topDocs.length === 0) {
            hideTypingIndicator();
            addChatMessage('assistant', `No relevant documentation found in ${scope}`);
            console.log('I couldn\'t find any relevent information across all documentation.');
            return;
        }

        console.log('Top docs', topDocs);

        const context = topDocs.map(item => ({
            title: item.title,
            content: item.content.substring(0, 2000) //Limit content length
        }));

        console.log(`sending ${context.length} docs to AI Service....`);

        //const answer = await callAIService(question, context);

          // Generate answer using ennanced Copilot-like generation
        const answer = generateCopilotAnswer(question, item.content);

        //console.log('Generated answer:', answer);
        //console.log('Answer length:', answer.length);

        // Prepare source
        const sources = topDocs.map( item => ({
            title: `${item.title} (${item.serviceId})`,
            link: item.link
        }));

        console.log('Answer:', answer);
        console.log('Source:', sources);

        //Show answer
        hideTypingIndicator();
        addChatMessage('assistant', answer, sources);
    } catch (error) {
        console.error('Error generating global answer:', error);
        //answerContent.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        hideTypingIndicator();
        addChatMessage('assistant', `Error: ${error.message}`);
        console.log('Error message', error.message);
        showToast(`Failed to generate answer: ${error.message}`, 'error');
    }
}

function addChatMessage(role, content, sources = [], followUps = []) {
console. log(` Adding ${role} message:`, content?.substring(0, 100));

const chatMessages = document.getElementById('chat-messages');

if (!chatMessages){
console.error('chat-messages element not found!');
return null;
}

// Remove welcome message if present
const welcome = chatMessages.querySelector('.chat-welcome');
if (welcome) {
welcome.remove();
console.log('Removed welcome message');
}
// Create message element
const messageEl = document.createElement('div');
messageEl.className = `chat-message ${role}`;

// Avatar
const avatar = document.createElement('div');
avatar.className = `chat-avatar ${role}`;
avatar.textContent = role === 'user' ? '🧑‍💼' : '🧁';
// Bubble
const bubble = document.createElement('div');
bubble.className = 'chat-bubble';

// Content - render markdown for assistant, plain text for user.
const bubbleContent = document.createElement('div');
bubbleContent.className = 'chat-bubble-content';

// Handle empty content
if (!content || content.trim().length === 0) {
    console.warn('Empty content received for chat message');
    content = role === 'assistant' ? 'No response generated.' : '';
}

if (role === 'assistant') {
try {
// Check if marked is available
if (typeof marked ==='undefined') {
console.error('marked.js not loaded!');
bubbleContent.innerHTML = `<p>${DOMPurify.sanitize(content)}</p>`;
} else {
// Render markdown with marked.js and sanitize
console.log(' Rendering markdown, length:', content.length);
// Clean anchor IDs before rendering
const cleanedContent = content.replace(/\{#[^}]+\}/g, '');
const rawHtml = marked.parse(cleanedContent);
console. log(' Parsed HTML length:', rawHtml?.length);
bubbleContent.innerHTML = DOMPurify.sanitize(rawHtml, {
ADD_ATTR: ['target', 'rel', 'class'],
ALLOWED_TAGS: ['p', 'br','strong', 'em', 'code', 'pre!', 'a', 'ul', 'ol', 'li',
'h1', 'h2','h3', 'h4', 'h5', 'h6', 'blockquote', 'div', 'span', 'table',
'thead', 'tbody', 'tr', 'th', 'td', 'hr']
});
console. log(' Sanitized and set innerHTML');
}
} catch (error) {
console.error('Error rendering markdown:', error);
// Fallback: show as plain text wrapped in paragraph
bubbleContent.innerHTML = `<p>${DOMPurify.sanitize(content)}</p>`;
}
} else {
// User messages – simple text with basic HTML escaping
bubbleContent.textContent = content;
}

bubble.appendChild(bubbleContent);

// Add sources if assistant message
if (role === 'assistant' && sources.length > 0) {
const sourcesEl = document.createElement('div');
sourcesEl.className = 'chat-sources';

const sourcesTitle = document.createElement('div');
sourcesTitle.className = 'chat-sources-title';
sourcesTitle.textContent = ' Sources:';
sourcesEl.appendChild(sourcesTitle);

sources.forEach(source => {
const link = document.createElement('a');
link.className = 'chat-source-link';
link.href = source.link || '#';
link.target = '_blank';
link.rel= 'noopener noreferrer';
link.textContent = source.title;
sourcesEl.appendChild(link);
});

bubble.appendChild(sourcesEl);
}

// Add follow-up suggestions if assistant message
if (role == 'assistant' && followUps.length > 0) {
const followUpsEl = document.createElement('div');
followUpsEl.className = 'chat-followups';

const followUpsTitle = document.createElement('div');
followUpsTitle.className = 'chat-followups-title';
followUpsTitle.textContent = 'Related questions:';
followUpsEl.appendChild(followUpsTitle);

const chipsContainer = document.createElement('div');
chipsContainer.className = 'chat-followups-chips';

followUps.forEach(suggestion => {
    const chip = document.createElement('button');
    chip.className = 'chat-followup-chip';
    chip.textContent = suggestion;
    chip.onclick = () => handleFollowUpClick(suggestion);
    chipsContainer.appendChild(chip);
});

followUpsEl.appendChild(chipsContainer);
bubble.appendChild(followUpsEl);
}

// Assemble message
messageEl.appendChild(avatar);
messageEl.appendChild(bubble);

chatMessages.appendChild(messageEl);
console.log(` ${role} message appended to chat, total messages:`, chatMessages.children.length);

// Apply syntax highlighting and add copy buttons
if (role == 'assistant') {
applySyntaxHighlighting(bubble);
addCopyButtonsToCodeBlocks (bubble);
}

//-Auto-scroll to bóttom
chatMessages.scrollTop = chatMessages.scrollHeight;
console.log(' Auto-scrolled to bottom');

return messageEl;
}
/* ===============================
* Shows typing indicator
=================================*/

function showTypingIndicator() {
document.getElementById('typing-indicator').classList.remove('hidden');
const chatMessages = document.getElementById('chat-messages');
chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
* Hides typing indicator */
function hideTypingIndicator() {
document.getElementById('typing-indicator').classList.add('hidden');
}

function addCopyButtonsToCodeBlocks(container) {
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((codeBlock) => {
    const pre = codeBlock.parentElement;
    if (pre.querySelector('.copy-btn')) return; // Already has button

    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy'
    button.title = 'Copy code to clipboard';

    button.addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(codeBlockestextContent);
    button.textContent = 'Copied!';
    setTimeout(() =>{
    button.textContent = 'Copy';
    }, 2000);
    } catch (error) {
    showToast('Failed to copy code', 'error');
    }
    });
    pre.style.position = 'relative';
    pre.appendChild(button);
    });
}
function applySyntaxHighlighting(container) {
    if (!window.hljs) return;

    const codeBlocks = container.querySelectorAll('pre code:not(hljs)');
    codeBlocks.forEach((block) => {
        hljs.highlightElement(block);
    });
}




/*==========================
* Clears all chat messages
============================*/
function clearChat() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = `
    <div class="chat-welcome">
    <div class="welcome-icon"></div>
    <h4>Hi! I'm your Documentation Assistant</h4>
    <p>Ask me anything about the documentation. I can help®you:</p>
    <ul>
    <li Find specific information</li>
    <li> Explain concepts</li>
    <li> Show code examples</li>
    <li> Provide relevant sources</li>
    </ul>
    <p class="help-text">Select a section or pre-load documentation above to get started</p>
    </div>
    `;
}

function createTFIDFVector(text, idf) {
    const tf = calculateTF(text);
    const tfidf = new Map();

    for (const [term, tfScore] of tf.entries()) {
    const idfScore = idf.get(term) || 0;
    tfidf.set(term, tfScore * idfScore);
    }
    return tfidf;
}
/** 
* Calculate cosine similarity between two TF-IDF vectors
* @param {Map<string, number>} vec1 - First vector
* @param {Map<string, number>} vec2 - Second vector
* @returns {number} Cosine similarity (0–1)
*/

function cosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    // Get all unique terms
    const allTerms = new Set([...vec1.keys(), ...vec2.keys()]);
    for (const term of allTerms) {
    const v1 = vec1.get(term) || 0;
    const v2 = vec2.get(term) || 0;

    dotProduct += v1 * v2;
    mag1 += v1 * v1;
    mag2 += v2 * v2;
    }

    if (mag1 === 0 || mag2 === 0) return 0;
    return dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2)); 
}


function calculateTF(text) {
    const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

    const tf = new Map();
    const total = words.length;

    words.forEach(word => {
    const stemmed = stemWord(word);
    tf.set(stemmed, (tf.get(stemmed) || 0) + 1);
    });

    // Normalize by document length
    for (const [term, freq] of tf.entries()) {
    tf.set(term, freq / total);
    return tf;
    }
}

function calculateIDF(documents) {
    const docCount = documents.length;
    const termDocCount = new Map();

    documents.forEach(doc => {
    const terms = new Set(
    doc.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .map(w => stemWord(w))
    );

    terms.forEach(term => {
    termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
    });
    });

    const idf = new Map();
    for (const [term, count] of termDocCount.entries()) {
    idf.set(term, Math. log(docCount / count));
    }
    return idf;
}

/**
* Simple word stemmer based on Porter Stemmer algorithm
* Reduces words to their root form for better matching
* @param {string} word - Word to stem
* @returns {string} Stemmed word
*/
function stemWord(word) {
    word = word.toLowerCase().trim();
    // Step 1: Remove common suffixes
    const suffixes = [
        ['ational', 'ate'],['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
        ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'],
        ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation','ate'],
        ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
        ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
        ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
        ['ical', 'ic'], ['ful', ''], ['ness', ''], ['ing', ''], ['ed', ''],
        ['ment', ''], ['ent', ''], ['ance', ''], ['ence', ''], ['able', ''],
        ['ible', ''], ['ant', ''], ['ement', ''], ['ism', ''], ['ate', ''],
        ['iti', ''], ['ous', ''], ['ive', ''], ['ize', ''], ['s', '']
    ];

    for (const [suffix, replacement] of suffixes) {
        if (word.endsWith(suffix) && word.length > suffix.length + 2) {
            return word.slice(0, -suffix.length) + replacement;
        }
    }
    return word;
}

function generateCopilotAnswer(question, markdown) {
    const questionType = detectQuestionType(question);
    const keywordData = extractEnhancedKeywords(question);

    if (keywordData.original.length === 0) {
    return "I'd be happy to help! Could you provide more specific details about what you're loking for";
    }
    // Extract relevant information
    const relevantInfo = answerFromMarkdown(question, markdown);

    if (relevantInfo.includes ("couldn't find") || relevantInfo.includes ("Please ask")) {
    return relevantInfo;
    }

    // Enhanced processing based on question tyре
    const codeBlocks = extractCodeBlocks(markdown);
    const hasCode = codeBlocks.length > 0;

    // Generate natural introduction based on question type
    let introduction = '';

    switch (questionType) {
        case 'how-to':
        introduction = "Here's how you can do that:\n\n";
        break;
        case 'definition':
        introduction = "Let me explain:\n\n";
        break;
        case 'example':
        if (hasCode) {
        introduction = "Here's an example:\n\n";
        } else {
        introduction = "Based on the documentation:\n\n";
        }
        break;
        case 'why':
        introduction = "Here's why:\n\n";
        break;
        case 'when':
        introduction = "Regarding timing:\n\n"; 
        break;
        case 'where':
        introduction = "Here's where you'll find it:\n\n";
        break; 
        case 'list':
        introduction = "Here are the available options:\n\n"; 
        break;
        case 'comparison':
        introduction = "Here's the comparison:\n\n"; 
        break;
        case 'troubleshooting':
        introduction = "To resolve this issue:\n\n"; 
        break;
        default:
        introduction = "";
    }

    
    // Include code examples in chat when appropriate 
    let codeExamples = '';
    const shouldIncludeCode = questionType === 'example' || 
                            questionType === 'how-to' || 
                            /\b(code|example|sample|snippet|demo|curl|request|implementation)\b/i.test(question);

    if (hasCode && shouldIncludeCode) {
    // Find most relevant code blocks (up to 2)
    const relevantCodeBlocks = findRelevantCodeBlocks(question, codeBlocks, markdown, keywordData.original);

    if (relevantCodeBlocks.length > 0) {
    codeExamples = '\n\n**Code Example' + (relevantCodeBlocks.length > 1 ? 's' : '') + ':**\n\n';
    relevantCodeBlocks.forEach((block, index) => {
        codeExamples += '```' + block.language + '\n' + block.code + '\n```\n\n';
    });

    // Add tip if there are more code blocks available
    if (codeBlocks.length > relevantCodeBlocks.length) {
    codeExamples += `*Note: ${codeBlocks.length - relevantCodeBlocks.length} more code example${codeBlocks.length - relevantCodeBlocks.length > 1 ? 's' : ''} available. Click the decumentation section to view all.*\n`;
    }
    }
    }
        // Combine natural response
    return introduction + relevantInfo + codeExamples;
}

function detectQuestionType(question) {
    const lower = question.toLowerCase();

    if (/\b(how do i|how to |how can |how should|steps to)\b/.test(lower)) {
    return 'how-to';
    }
    if (/\b(what is|what are|what's|define|definition of|explain)\b/.test(lower)) {
    return 'definition';
    }
    if (/\b(why |reason|purpose|benefit)\b/.test(lower)) {
    return 'why';
    }
    if (/\b(when|timing|schedule)\b/.test(lower)) {
    return 'when';
    }
    if (/\b(where|location |endpoint|url)\b/.test(lower)) {
    return 'where';
    }
    if (/\b(example|sample|demo|show me|code)\b/.test(lower)) {
    return 'example';
    }
    if (/\b(list|all|available|options)\b/.test(lower)) {
    return 'list';
    }
    if (/\b(compare|difference|vs|versus)\b/.test(lower)) {
    return 'comparison';
    }
    if (/\b(error|issue problem|troubleshoot|fix)\b/.test(lower))
    {
    return 'troubleshooting';
    }
    return 'general';
}

function extractEnhancedKeywords(question) {
    const stopWords = new Set([
    'what', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'the', 'a', 'an',
    'how', 'does', 'do', 'did', 'doing', 'can', 'could', 'should', 'would',
    'will', 'shall', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it',
    'we', 'they', 'them', 'their', 'this', 'that', 'these', 'those',
    'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'about',
    'as', 'into', 'like', 'through', 'after', 'over', 'between', 'out',
    'against', 'during', 'without', 'before', 'under', 'around', 'among',
    'and', 'or', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'which'
    ]);

    const questionLower = question.toLowerCase();
    const words = questionLower.split(/\s+/).filter(word => word.length > 2);
    const keywords = words.filter(word => !stopWords.has(word));

    // Extract phrases (2–3 word combinations)
    const phrases = [];
    for (let i = 0; i < words.length - 1; i++) {
    if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
    phrases.push(`${words[i]} ${words[i + 1]}`);
    }
    if (i < words.length - 2 && !stopWords.has(words[i]) && !stopWords.has(words[i + 2])) {
    phrases.push(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
    }
    }

    // Expand keywords with synonyms
    const expandedTerms = new Set();
    keywords.forEach(keyword =>{
    const related = expandWithSynonyms(keyword);
    related.forEach(term => expandedTerms.add(term));
    });
    return {
    original: keywords,
    stemmed: keywords.map(w => stemWord(w)),
    phrases,
    expanded: Array.from(expandedTerms)
    };
}

function expandWithSynonyms(word) {
    const stemmed = stemWord(word);
    const synonyms = SYNONYM_MAP[stemmed] || SYNONYM_MAP[word] || [];
    return [word, stemmed, ...synonyms];
}

const SYNONYM_MAP = {
    // Authentication & Security
    'authentication': ['login', 'signin', 'auth', 'credential', 'authorize', 'authorization'],
    'login': ['authentication', 'signin', 'auth', 'credential'],
    'token': ['key', 'credential', 'auth', 'bearer', 'jwt'],
    'credential': ['authentication', 'login', 'token', 'key', 'password'],
    'security': ['protection', 'secure', 'safety', 'encryption'],
    // API & Technical
    'api': ['endpoint', 'interface', 'service', 'rest', 'resource'],
    'endpoint': ['api', 'url', 'route', 'path', 'resource'],
    'request': ['call', 'query', 'invoke', 'http'],
    'response': ['result', 'output', 'reply', 'return'],
    'method': ['function', 'operation', 'action', 'verb'],
    // Payment & Transaction
    'payment': ['transacțion', 'charge', 'purchase', 'billing', 'pay'],
    'transaction': ['payment', 'transfer', 'operation', 'exchange'],
    'charge': ['payment', 'fee', 'cost', 'billing'],
    'refund': ['return', 'reversal', 'chargeback', 'reimbursement'],
    'purchase': ['payment', 'transaction', 'buy', 'order'],
    // Error Handling
    'error': ['failure', 'exception', 'issue', 'problem', 'fault'],
    'failure': ['error', 'exception', 'issue', 'problem'],
    'exception': ['error', 'failure', 'fault'],
    'invalid': ['incorrect', 'wrong', 'bad', 'malformed'],
    // Status & State
    'status': ['state', 'condition', 'situation'],
    'active': ['enabled', 'live', 'running', 'operational'],
    'inactive': ['disabled', 'stopped', 'suspended'],
    'pending': ['processing', 'waiting', 'queued'],
    // Data & Format
    'data': ['information', 'content', 'payload', 'body'],
    'format': ['structure', 'layout', 'schema', 'type'],
    'json': ['format', 'structure', 'data', 'object'],
    'xml': ['format', 'structure', 'data'],
    // Common Actions
    'create': ['make', 'add', 'generate', 'new', 'post'],
    'update': ['modify', 'change', 'edit', 'patch', 'put'],
    'delete': ['remove', 'destroy', 'cancel'],
    'retrieve': ['get', 'fetch', 'obtain', 'read', 'query'],
    'send': ['transmit', 'submit', 'post', 'transfer'],
    'receive': ['get', 'obtain', 'accept']
};

function answerFromMarkdown(question, markdown) {
    // Extract enhanced keywords with stemming and synonyms
    const keywordData = extractEnhancedKeywords(question);

    if (keywordData.original.length === 0) {
    return "Please ask a more specific question with key terms I can search for in the documentation.";
    }

    // Clean markdown but protect URLs from being split
    const cleanedContent = markdown
    .replace(/\{#[^}]+\}/g, '') // Remove anchor IDs like {#gateway-error-codes}
    .replace(/\n+/g, ' ')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$l')
    .replace(/`(.+?)`/g, '$1');

    console.log(' [DEBUG] Cleaned content (first 500):', cleanedContent.substring(0, 500));

    // Protect URLs by replacing periods with a placeholder
    const urlMap = new Map();
    let urlCounter = 0;
    let protectedContent = cleanedContent.replace(/https?:\/\/[^\s\)]+/g, (url) => {
    const placeholder = `__URL_${urlCounter}__`;
    urlMap.set(placeholder, url);
    urlCounter++;
    return placeholder;
    });

    console.log(' [DEBUG) Protected', urlCounter, 'URLs from splitting');

    // Now split into sentences (URLs are safe from period-based splitting) 
    const sentences = protectedContent
    .split(/[.!?]+/)
    .map(s => s.trim( ))
    .filter(s => s.length > 20)
    .map(s => {
    // Restore URLS
    let restored = s;
    urlMap.forEach((url, placeholder) => {
        restored = restored.replace(placeholder, url);
    });
    // Convert markdown links
    return restored.replace(/\[(.+?) \J\( (,+?)\)/g, '$1 ($2)');
    });

    console.log('\ [DEBUG] Extracted', sentences.length, 'sentences')
    console.log('\ [DEBUG] First sentence:', sentences[0]);
    if (sentences.length === 0) {
    return "The current section doesn't contain enough readable content. Please select a more relevant section.";
    }
}




async function callAIService(question, context = [], conversationHistory = []) {
    try {
        console.log(`Calling AI service with ${context.length} context documents`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

        const response = await fetch(`${API_BASE}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question,
                context,
                conversationHistory
            }),
            signal: controller.signal
        });

        console.log(`Received response`);

        clearTimeout(timeoutId);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log('API Chat Response - ', data.answer.length);
        return data.answer;
    } catch(error) {
        console.error('AI Service error', error);
        throw error;
    }
}


async function preloadAllDocumentation() {
    const statusEl = document.getElementById('preload-status');
    const progressEl = document.getElementById('preload-progress');
    const preloadBtn = document.getElementById('preload-all-btn');

    try { 
        preloadBtn.disabled = true;
        statusEl.textContent = 'Fetching available services...';
        progressEl.classList.remove('hidden');

        // Fetch all available services dynamically
        const services = await fetchAvailableServices();

        if (services.length === 0) {
        throw new Error('No services available');
        }

        console.log(`Loading documentation for ${services.length} services:`, services);

        state.allDocumentation = [];
        let totalSections = 0;
        let loadedSections = 0;

        //First, get section count
        statusEl.textContent = 'Counting sections across all services...';
        for (const serviceId of services) {
            try {
                const url = `${API_BASE}/api/mcp/docs-overview?serviceId=${encodeURIComponent(serviceId)}`;
                const data = await fetchWithTimeout(url);
                if (data && Array.isArray(data.sections)) {
                totalSections += data.sections.length;
            }
            } catch (error) {
                console.warn(`Failed to load sections for ${serviceId}:`, error);
            }
        }


        if (totalSections === 0) {
            throw new Error('No sections found across any services');
        }

        statusEl.textContent = `Loading 0/${totalSections} sections from ${services.length} services...`;

        // Now load all content
        for (const serviceId of services) {
            try {
                const overviewUrl = `${API_BASE}/api/mcp/docs-overview?serviceId=${encodeURIComponent(serviceId)}`; 
                const overviewData = await fetchWithTimeout(overviewUrl);

                if (!overviewData || !Array.isArray(overviewData.sections)) {
                continue;
                }

                // Load content for each section
            for (const section of overviewData.sections) {
                try {
                    const contentUrl = `${API_BASE}/api/mcp/docs-section?serviceId=$(encodeURIComponent(serviceId)}&sectionId=${encodeURIComponent(section.id)}`; 
                    const contentData = await fetchWithTimeout(contentUrl);

                    if (contentData && contentData.body) {
                    console.log('section title', section.title);
                    console.log('section id', section.id);
                    state.allDocumentation.push({
                    serviceId,
                    sectionId: section.id,
                    title: section.title || section.id,
                    link: contentData.sectionLink || section.link,
                    content: contentData.body
                    });
                    }


                    loadedSections++
                    statusEl.textContent = `Loading ${loadedSections}/${totalSections} sections from ${services.length} services...`;
                    console.log('Final all documentation information', state.allDocumentation);

                } catch (error) {
                console.warn(`Failed to load section ${section.id} for ${serviceId}:`, error);
                loadedSections++
                }
                }
                } catch (error) {
                    console.error(`Failed to process service ${serviceId}:`, error);
                }

            }

        try {
            console.log('Ready to load all documentation in local storage', state.allDocumentation);
            console.log('Converted to string format', JSON.stringify(state.allDocumentation));

            localStorage.setItem('allDocumentation', JSON.stringify(state.allDocumentation));
            localStorage.setItem('isPreloaded', 'true');
        } catch (e) {
            console.warn('Could not cache documentation', e)
        }


        state.isPreloaded = true;

        // Index in vector search if available
        if (state.vectorSearchAvailable) {
        statusEl.textContent = `Indexing ${state.allDocumentation. length} sections in vector search...`;
        const indexed = await indexInVectorSearch(state.allDocumentation, true);
        if (indexed) {
        statusEl.textContent = `Loaded and indexed ${state.allDocumentation.length} sections across ${services.length} services`;
        showToast(` ${state.allDocumentation.length} sections indexed with semantic search!`, 'success');
        } else {
        statusEl.textContent = ` Loaded ${state.allDocumentation.length} sections across ${services.length} services`;
        showToast(`Successfully pre-loaded ${state.allDocumentation.length} documentation sections from ${services.length} services`, 'success');
        }
        } else {
        statusEl.textContent = `/ Loaded ${state.allDocumentation.length} sections across ${services.length} services`;
        showToast(`Successfully pre-loaded ${state.allDocumentation.length} documentation sections from ${services.length} services`, 'success');
        }

        // Enable chat interface for global search
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        const chatHelpText = document.getElementById('chat-help-text');

        if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = 'Ask across all documentation...';
        }
        if (sendBtn) {
        sendBtn.disabled = false;
        }
        if (chatHelpText) {
        chatHelpText.textContent = `Chat enabled for all docs (${state.allDocumentation.length} sections from ${services.length} services)`;
        }

        // Hide progress after 3 seconds
        setTimeout(() => {
        progressEl.classList.add('hidden');
        }, 3000);

    } catch (error) {
        console.error('Error pre-loading documentation:', error);
        statusEl.textContent = `Error: ${error.message}`;
        showToast(`Failed to pre-load documentation: $(error.message}`, 'error');
        } finally {
        preloadBtn.disabled = false;
    }
}

async function checkVectorSearchAvailability() {
    try {
    const response = await fetch(`${VECTOR_SEARCH_BASE}/health`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
    const data = await response.json();
    state.vectorSearchAvailable = data.status === 'healthy';
    console.log(' Vector Search Service:', state.vectorSearchAvailable ? 'Available' : 'Unavailable');
    if (state.vectorSearchAvailable) {
    showToast(' Enhanced search with BM25 ranking available!', 'success');
    }
    return state.vectorSearchAvailable;
    }
    } catch (error) {
    state.vectorSearchAvailable = false;
    console.log(' Vector Search Service not available, using fallback TF-IDF');
    }
    return false;
}

async function indexInVectorSearch(documents, clearExisting = false) {
    if (!state.vectorSearchAvailable || documents.length === 0) {
    return false;
    }
    try {
    console.log(` Indexing ${documents.length} documents in vector search...`);

    const response = await fetch(`${VECTOR_SEARCH_BASE}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
    documents: documents.map(doc => ({
    id: doc.sectionId || doc.id,
    title: doc.title,
    content: doc.content,
    metadata: {
    serviceId: doc.serviceId,
    sectionId: doc.sectionId,
    link: doc.link
    }
    })),
    clear_existing: clearExisting
    })
    });
    if (response.ok) {
    const result = await response.json();
    console.log(` Indexed ${result.indexed} documents (total: ${result.total})`);
    state.vectorSearchIndexed = true;
    state.usingVectorSearch = true;
    return true;
    } else {
    console.error(' Vector search indexing failed:', response.statusText);
    }
    } catch (error){
    console.error(' Vector search indexing error:', error);
    }
    return false;
}

async function vectorSearch(query, topK = 5, threshold = 0.25) {
    if (!state.vectorSearchAvailable) {
    return null;
    }

    try {
    const response = await fetch(`${VECTOR_SEARCH_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
    query: query,
    top_k: topK,
    threshod: threshold
    })
    });
    if (response.ok) {
    const results = await response.json();
    console.log(` Vector search found ${results.length} results`);
    return results;
    }
    } catch (error) {
    console.error(' Vector search error:', error);
    }
    return null;
}



/**
*Initializes the application
*/
async function init() {
    console.log( '========');
    console. log(' Initializing Mastercard Documentation Explorer');
    console. log( '====');
    console.log('API Base:', API_BASE);
    console.log('Document ready state:', document.readyState);


    try {
     
        console.log('Checking preloaded cache.....')
        const cacheDocs = localStorage.getItem('allDocumentation');
        const isPreloaded = localStorage.getItem('isPreloaded') === 'true';
        if (cacheDocs && isPreloaded) {
            console.log('Cache data available.....');
            console.log('Cache docs', cacheDocs);
            const chatInput = document.getElementById('chat-input');
            const sendBtn = document.getElementById('send-btn');
            state.allDocumentation = JSON.parse(cacheDocs);
            state.isPreloaded = true
            sendBtn.disabled = false; 
            chatInput.disabled = false;
            chatInput.placeholder = 'Ask a question about any documentation.....';
               console.log('init :: Checking isPreloaded', state.isPreloaded);
        console.log('init :: Checking allDocumentation', state.allDocumentation);
        console.log('init :: Checking state.allDocumentation.length', state.allDocumentation.length);
            showToast('Loaded documentation from local cache', 'success');
        } else {
            console.log('Cache data missing')
        }
    } catch (e) {
        console.warn('Could not load cache documentation', e);
        localStorage.removeItem('allDocumentation');
        
    }
    // Setup searchable service dropdown
    setupServiceDropdown();

    // Note: clear-answer-btn and show-code-btn removed in chat UI redesign
    // Chat has its own clear-chat-btn and code is displayed inline

    // Load sections button
    document.getElementById('load-sections-btn').addEventListener('click', () => {
        let serviceId = state.currentService;

        // If custom is selected, use the custom input value
        if (!serviceId) {
            const customInput = document.getElementById('custom-service-input');
            serviceId = customInput.value.trim();
            if (!serviceId) {
            showToast('Please select a service or enter a custom service ID', 'error');
            return;
            }
        }
        loadSections(serviceId);
    });

    // Health check button
    document.getElementById('health-check-btn').addEventListener('click', checkHealth);

    // Chat interface
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');

    const handleSend = async () => {
    const question = chatInput.value.trim();
    if (!question) {
        showToast('Please enter a message', 'error');
        return;
    }

    // Debug: Log current state
    console.log(' State check:', {
        isPreloaded: state.isPreloaded,
        preloadedService: state.preloadedService,
        currentSection: state.currentSection,
        currentService: state.currentService,
        hasServiceDocs: state.serviceDocumentation?.length || 0,
        hasAllDocs: state.allDocumentation?.length || 0
    });

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // // Disable input while processing
    sendBtn.disabled = true; 
    chatInput.disabled = true;

    document.getElementById('clear-doc-cache-btn').addEventListener('click', () => {
        localStorage.removeItem('allDocumentation');
        localStorage.removeItem('isPreloaded');
        showToast('Documentation cache cleared', 'info');
    });

    try {
        console.log('Checking isPreloaded', state.isPreloaded);
        console.log('Checking allDocumentation', state.allDocumentation);
        console.log('Checking state.allDocumentation.length', state.allDocumentation.length);
        console.log('Checking state.preloadedService', state.preloadedService)
        console.log('Checking state.serviceDocumentation', state.serviceDocumentation)
        console.log('Checking state.serviceDocumentation.length', state.serviceDocumentation.length)

        // Handle based on context (functions will add user message and typing indicator)
        if (state.isPreloaded && state.allDocumentation && state.allDocumentation.length > 0) {
        console.log(' Using preloaded all documentation');
        await handleAskQuestionGlobal(question, state.allDocumentation, 'all services');
        } else if (state.preloadedService && state.serviceDocumentation && state.serviceDocumentation.length > 0) {
        console.log(' Using preloaded service documentation');
        await handleAskQuestionGlobal(question, state.serviceDocumentation, state.preloadedService);
        } else if (state.currentSection && state.currentService) {
        console.log(' Using selected section:', state.currentSection.id);
        await handleAskQuestion(question);
        } else {
        // No context available
        console.warn(' No context available!');
        addChatMessage('user', question);
        showTypingIndicator();
        setTimeout(() => {
        hideTypingIndicator();
        addChatMessage('assistant',
        'Please select a documentation section or pre-load documentation first to start chatting.');
        }, 500);
        }
    } catch (error) {
        console.error('Send error:', error);
        hideTypingIndicator();
        addChatMessage('assistant',
        'Sorry, I encountered an error: ${error.message}');
        showToast('Error: ${error.message}', 'error');
    } finally {
        // Re-enable input
        sendBtn.disabled = false;
        chatInput.disabled = false;
        chatInput.focus();
    }
    };

    sendBtn.addEventListener('click', handleSend);

    // Auto-resize textarea and enable/disable send button
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';

        // Enable send button only if there's text and a context is selected
        const hasText = chatInput.value.trim().length > 0;
        const hasContext = state.currentSection || state.preloadedService || state.isPreloaded;
        const shouldEnable = hasText && hasContext;

        sendBtn.disabled = !shouldEnable;

        // Log state changes for debugging
        if (hasText && !hasContext){
        console.log('A Has text but no context. State:', {
        currentSection: !!state.currentSection,
        preloadedService: !!state.preloadedService,
        isPreloaded: state.isPreloaded
        });
        }
    });

    // Allow Enter to send (Shift+Enter for new line)
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!sendBtn.disabled) {
        handleSend();
        }
        }
    });

    // Clear chat button
    document.getElementById('clear-chat-btn').addEventListener('click', () => {
        if (confirm('Clear conversation history?')) {
        clearChat();
        showToast('Chat cleared', 'info');
        }
    });

    // Pre-load service documentation button
    document.getElementById('preload-service-btn').addEventListener('click', () => {
        let serviceId = state.currentService;
        console.log(' Preload service button clicked. Current service:', serviceId);

        // If no service selected, use the custom input value
        if (!serviceId) {
            const customInput = document.getElementById('custom-service-input');
            serviceId = customInput.value.trim();
            if (!serviceId) {
                showToast('Please select a service first from the dropdown above', 'error');
                return;
            }
        }

        // Confirm before preloading
        const confirmMsg = `This will load all sections for ${serviceId}. Continue?`;
        if (!confirm(confirmMsg)) {
        return;
        }
        preloadServiceDocumentation(serviceId);
    });

    // Pre-load all documentation button
    document.getElementById('preload-all-btn').addEventListener('click', preloadAllDocumentation);

    // Setup searchable dropdown for API operations 
    //setupApiOperationsDropdown();

    // Toggle raw markdown view
    // document.getElementById('toggle-raw-btn').addEventListener('click', () => {
    //     const rawEl = document.getElementById('content-raw');
    //     const renderedEl = document.getElementById('content-rendered');
    //     const btn = document.getElementById('toggle-raw-btn');

    //     if (rawEl.classList.contains('hidden')) {
    //     rawEl.classList.remove('hidden');
    //     renderedEl.classList.add('hidden');
    //     btn.textContent = 'Show Rendered';
    //     } else {
    //     rawEl.classList.add('hidden');
    //     renderedEl.classList.remove('hidden');
    //     btn.textContent = 'Show Raw';
    //     }
    // });

    // Setup keyboard navigation
    setupKeyboardNavigation();

    // Initial health check
    checkHealth();

    // Check vector search service availability
    checkVectorSearchAvailability();

    console. log('Application initialized');
}
    // Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}