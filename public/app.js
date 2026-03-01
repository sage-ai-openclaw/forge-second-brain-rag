/**
 * Second Brain RAG - Web UI JavaScript
 */

(function() {
  'use strict';

  // API Configuration
  const API_BASE = window.location.origin;
  
  // DOM Elements
  const elements = {
    // Navigation
    navButtons: document.querySelectorAll('.nav-btn'),
    tabContents: document.querySelectorAll('.tab-content'),
    
    // Status
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    
    // Search
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    searchTopK: document.getElementById('search-topk'),
    searchResults: document.getElementById('search-results'),
    
    // Chat
    chatMessages: document.getElementById('chat-messages'),
    chatInput: document.getElementById('chat-input'),
    sendBtn: document.getElementById('send-btn'),
    chatModel: document.getElementById('chat-model'),
    chatTopK: document.getElementById('chat-topk'),
    chatTemp: document.getElementById('chat-temp'),
    tempValue: document.getElementById('temp-value'),
    
    // Loading
    loading: document.getElementById('loading'),
    loadingText: document.getElementById('loading-text'),
  };

  // State
  let isProcessing = false;

  // ============================================
  // Initialization
  // ============================================

  function init() {
    setupEventListeners();
    checkHealth();
    // Check health every 30 seconds
    setInterval(checkHealth, 30000);
  }

  function setupEventListeners() {
    // Tab navigation
    elements.navButtons.forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Search
    elements.searchBtn.addEventListener('click', handleSearch);
    elements.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSearch();
    });

    // Chat
    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    });
    elements.chatTemp.addEventListener('input', (e) => {
      elements.tempValue.textContent = e.target.value;
    });
  }

  // ============================================
  // Tab Navigation
  // ============================================

  function switchTab(tabName) {
    // Update nav buttons
    elements.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab contents
    elements.tabContents.forEach(content => {
      content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
  }

  // ============================================
  // Health Check
  // ============================================

  async function checkHealth() {
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        setStatus('online');
      } else {
        setStatus('offline');
      }
    } catch (error) {
      setStatus('offline');
    }
  }

  function setStatus(status) {
    elements.statusDot.className = 'status-dot';
    
    if (status === 'online') {
      elements.statusDot.classList.add('online');
      elements.statusText.textContent = 'Connected';
    } else if (status === 'offline') {
      elements.statusDot.classList.add('offline');
      elements.statusText.textContent = 'Disconnected';
    } else {
      elements.statusText.textContent = 'Checking...';
    }
  }

  // ============================================
  // Search Functionality
  // ============================================

  async function handleSearch() {
    const query = elements.searchInput.value.trim();
    if (!query || isProcessing) return;

    isProcessing = true;
    showLoading('Searching...');

    try {
      const response = await fetch(`${API_BASE}/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          topK: parseInt(elements.searchTopK.value, 10),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      renderSearchResults(data);
    } catch (error) {
      showError('Search failed', error.message);
    } finally {
      isProcessing = false;
      hideLoading();
    }
  }

  function renderSearchResults(data) {
    const { results, query, totalResults } = data;

    if (results.length === 0) {
      elements.searchResults.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <h3>No results found</h3>
          <p>No documents match your search for "${escapeHtml(query)}". Try a different query or index more documents.</p>
        </div>
      `;
      return;
    }

    let html = `
      <div class="results-header">
        <span class="results-count">
          Found <strong>${totalResults}</strong> result${totalResults !== 1 ? 's' : ''} for "${escapeHtml(query)}"
        </span>
      </div>
    `;

    html += results.map((result, index) => `
      <div class="result-card">
        <div class="result-header">
          <div class="result-file">
            <span class="result-file-icon">📄</span>
            <span class="result-filename">${escapeHtml(result.documentFilename)}</span>
          </div>
          <span class="result-score">${(result.relevanceScore * 100).toFixed(1)}%</span>
        </div>
        <div class="result-path">${escapeHtml(result.documentPath)}</div>
        <div class="result-content">${escapeHtml(result.content)}</div>
      </div>
    `).join('');

    elements.searchResults.innerHTML = html;
  }

  // ============================================
  // Chat Functionality
  // ============================================

  async function handleSendMessage() {
    const query = elements.chatInput.value.trim();
    if (!query || isProcessing) return;

    // Add user message
    addMessage('user', query);
    elements.chatInput.value = '';

    // Show loading in chat
    isProcessing = true;
    const loadingId = addLoadingMessage();

    try {
      const response = await fetch(`${API_BASE}/api/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          topK: parseInt(elements.chatTopK.value, 10),
          model: elements.chatModel.value,
          temperature: parseFloat(elements.chatTemp.value),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      removeLoadingMessage(loadingId);
      renderAssistantMessage(data);
    } catch (error) {
      removeLoadingMessage(loadingId);
      addMessage('assistant', `❌ Error: ${error.message}. Make sure Ollama is running and the API server is accessible.`);
    } finally {
      isProcessing = false;
    }
  }

  function addMessage(role, content) {
    // Remove welcome message if present
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageDiv.innerHTML = `
      <div class="message-content">
        ${formatMessage(content)}
      </div>
      <div class="message-meta">${time}</div>
    `;

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
  }

  function addLoadingMessage() {
    const id = 'loading-' + Date.now();
    const loadingDiv = document.createElement('div');
    loadingDiv.id = id;
    loadingDiv.className = 'message message-assistant';
    loadingDiv.innerHTML = `
      <div class="message-content">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div class="spinner" style="width: 16px; height: 16px; border-width: 2px;"></div>
          <span>Thinking...</span>
        </div>
      </div>
    `;
    elements.chatMessages.appendChild(loadingDiv);
    scrollToBottom();
    return id;
  }

  function removeLoadingMessage(id) {
    const loading = document.getElementById(id);
    if (loading) loading.remove();
  }

  function renderAssistantMessage(data) {
    const { answer, sources, responseTime, tokensUsed } = data;

    // Remove welcome message if present
    const welcome = elements.chatMessages.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message message-assistant';

    // Format sources
    let sourcesHtml = '';
    if (sources && sources.length > 0) {
      sourcesHtml = `
        <div class="message-sources">
          <div class="message-sources-title">📚 Sources</div>
          ${sources.map((source, index) => `
            <div class="source-item">
              <span class="source-number">${index + 1}</span>
              <span class="source-name">${escapeHtml(source.documentFilename)}</span>
              <span class="source-score">${(source.relevanceScore * 100).toFixed(0)}%</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    // Format stats
    let statsHtml = '';
    if (responseTime || tokensUsed) {
      const stats = [];
      if (responseTime) stats.push(`⏱️ ${responseTime}ms`);
      if (tokensUsed?.total) stats.push(`📝 ${tokensUsed.total} tokens`);
      
      if (stats.length > 0) {
        statsHtml = `<div class="message-stats">${stats.join(' • ')}</div>`;
      }
    }

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageDiv.innerHTML = `
      <div class="message-content">
        ${formatMessage(answer)}
        ${sourcesHtml}
        ${statsHtml}
      </div>
      <div class="message-meta">${time}</div>
    `;

    elements.chatMessages.appendChild(messageDiv);
    scrollToBottom();
  }

  // ============================================
  // Utilities
  // ============================================

  function showLoading(text = 'Loading...') {
    elements.loadingText.textContent = text;
    elements.loading.classList.add('active');
  }

  function hideLoading() {
    elements.loading.classList.remove('active');
  }

  function showError(title, message) {
    elements.searchResults.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(message)}</p>
      </div>
    `;
  }

  function scrollToBottom() {
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatMessage(text) {
    if (!text) return '';
    
    // Escape HTML
    let formatted = escapeHtml(text);
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Format code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Format inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Format bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Format italic
    formatted = formatted.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    return formatted;
  }

  // ============================================
  // Start
  // ============================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
