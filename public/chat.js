// Complete PhytoBot frontend script
// Handles local chat storage, sidebar, edit/delete, memory, and robust image analysis
// Integrated with Phytelix model worker system

// UI elements
const chatListEl = document.getElementById('chatList');
const messagesEl = document.getElementById('messages');
const userInputEl = document.getElementById('user-input');
const sendButtonEl = document.getElementById('send-button');
const newChatBtn = document.getElementById('newChatBtn');
const chatTitleEl = document.getElementById('chatTitle');
const memToggle = document.getElementById('memToggle');
const memoryInput = document.getElementById('memoryInput');
const saveMemBtn = document.getElementById('saveMem');
const renameBtn = document.getElementById('renameBtn');
const deleteChatBtn = document.getElementById('deleteChat');

// Supabase chat state (replaces localStorage)
const CHAT_STATE_TABLE = 'chat_state';

// Phytelix integration constants
const MODEL_WORKER = 'https://phytelix-models.31babajidi.workers.dev';
const TREATMENT_API = 'https://phytelix-ai-model.31babajidi.workers.dev/';

// In-memory state
let chats = []; // {id,title, messages: [{role,content,id}], memory, useMemory}
let activeId = null;
let isProcessing = false;
let isDemoMode = false;
let MODEL_URLS = {};

// Simple toast notification function
function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.8); color: #fff; padding: 10px 20px;
    border-radius: 8px; font-size: 14px; z-index: 9999;
    pointer-events: none; opacity: 0; transition: opacity 0.3s;
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.style.opacity = '1');
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.addEventListener('transitionend', () => toast.remove());
  }, duration);
}

// Utilities
function uid(prefix='id'){return prefix + '_' + Math.random().toString(36).slice(2,9)}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Chat management
async function loadChats(){
  try{
    const sb = await (window.PhytoSupabase && window.PhytoSupabase.initSupabase());
    if (!sb) throw new Error('Supabase not ready');
    const { data: { user } } = await sb.auth.getUser();
    if (!user) { chats = []; activeId = null; return; }
    const { data, error } = await sb.from(CHAT_STATE_TABLE).select('data').eq('user_id', user.id).maybeSingle();
    if (!error && data && data.data) {
      const state = data.data;
      chats = Array.isArray(state.chats) ? state.chats : [];
      activeId = state.activeId || (chats[0] && chats[0].id) || null;
      isDemoMode = Boolean(state.demoMode);
    }
  }catch(e){ console.warn('loadChats', e); }
  if(!chats || !chats.length){
    const id = uid('chat');
    chats = [{ id, title:'New chat', messages:[{ id:uid('m'), role:'assistant', content:"Hello! I'm PhytoBot, your crop disease assistant. You can:\n• Ask questions about plant diseases\n• Upload images for analysis\n• Get treatment recommendations\n\nHow can I help you today?" }], memory:'', useMemory:false }];
    activeId = id;
    await saveChats();
  }
}

async function saveChats(){
  try{
    const sb = await (window.PhytoSupabase && window.PhytoSupabase.initSupabase()); if(!sb) return;
    const { data: { user } } = await sb.auth.getUser(); if(!user) return;
    const state = { chats, activeId, demoMode: isDemoMode };
    await sb.from(CHAT_STATE_TABLE).upsert({ user_id: user.id, data: state, updated_at: new Date().toISOString() });
  }catch(e){ console.warn('saveChats', e); }
  renderChatList();
}

function findActive(){ return chats.find(c=>c.id===activeId) }

function renderChatList(){
  if (!chatListEl) return;
  chatListEl.innerHTML = '';
  chats.forEach(c=>{
    const el = document.createElement('div');
    el.className = 'chat-item'+(c.id===activeId? ' active':'');
    el.textContent = c.title || 'Untitled';
    el.title = c.title || 'Untitled'; // Add full title as tooltip
    el.onclick = ()=>{ activeId = c.id; render(); saveChats(); }
    chatListEl.appendChild(el);
  })
}

function renderMessages(){
  if (!messagesEl) return;
  messagesEl.innerHTML = '';
  const active = findActive();
  if(!active) return;
  if (chatTitleEl) chatTitleEl.textContent = active.title || 'PhytoBot';
  
  active.messages.forEach(m=>{
    const div = document.createElement('div');
    div.className = 'msg ' + (m.role==='user' ? 'user':'assistant');
    div.dataset.mid = m.id;
    
    const meta = document.createElement('div'); 
    meta.className='meta'; 
    meta.textContent = m.role === 'user' ? 'You' : 'PhytoBot';
    
    const text = document.createElement('div'); 
    text.className='text';
    text.style.wordBreak = 'break-word'; // Ensure long words wrap instead of truncating
    text.style.whiteSpace = 'pre-wrap'; // Preserve formatting and allow wrapping
    
    // Support basic markdown-style formatting - don't truncate disease names
    const content = m.content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    text.innerHTML = content;
    
    div.appendChild(meta); 
    div.appendChild(text);
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function render(){ 
  renderChatList(); 
  renderMessages(); 
  renderMemoryUI(); 
  renderDemoModeUI(); 
}

function createNewChat(){
  const id = uid('chat');
  const c = {
    id,
    title:'Chat '+(chats.length+1),
    messages:[{
      id:uid('m'),
      role:'assistant',
      content:"Hello! I'm PhytoBot. Ask me about crop diseases or upload an image for analysis."
    }],
    memory:'', 
    useMemory:false
  };
  chats.unshift(c); 
  activeId = c.id; 
  saveChats(); 
  render();
}

function renameChat(){
  const active = findActive(); if(!active) return;
  const v = prompt('Chat title:', active.title);
  if(v!==null){ active.title = v; saveChats(); render(); }
}

function deleteChat(){
  const idx = chats.findIndex(c=>c.id===activeId); 
  if(idx===-1) return;
  if(!confirm('Delete this chat?')) return;
  chats.splice(idx,1);
  activeId = chats.length ? chats[0].id : null;
  if (!activeId) createNewChat();
  saveChats(); 
  render();
}

// Memory UI
function renderMemoryUI(){
  const active = findActive(); 
  if(!active || !memoryInput || !memToggle) return;
  memoryInput.value = active.memory || '';
  memToggle.textContent = active.useMemory ? 'On' : 'Off';
}

function saveMemory(){
  const active = findActive(); if(!active) return;
  active.memory = memoryInput.value || '';
  saveChats();
  showToast('Memory saved locally for this chat');
}

function toggleMemory(){
  const active = findActive(); if(!active) return;
  active.useMemory = !active.useMemory; 
  saveChats(); 
  renderMemoryUI();
}

// Demo Mode
async function loadDemoMode(){
try{
  await loadChats(); // isDemoMode hydrated from chat_state
  }catch{}
}
 
function renderDemoModeUI(){
const demoToggle = document.getElementById('demoToggle');
  if(demoToggle) demoToggle.textContent = isDemoMode ? 'On' : 'Off';
}
 
async function toggleDemoMode(){
isDemoMode = !isDemoMode;
await saveChats();
renderDemoModeUI();
  showToast(`Demo mode ${isDemoMode ? 'enabled' : 'disabled'}`);
}

// Model URLs loading with better error handling
async function loadModelUrls() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const res = await fetch(`${MODEL_WORKER}/api/model-urls`, {
      signal: controller.signal,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    clearTimeout(timeoutId);
    
    if (res.ok) {
      MODEL_URLS = await res.json();
      console.log('Successfully loaded model URLs from worker');
      return MODEL_URLS;
    } else {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
  } catch (e) {
    console.warn('Failed to load model URLs from worker:', e.message);    
    console.log('Using fallback model URLs');
    return MODEL_URLS;
  }
}

// Usage tracking helpers (via Supabase profiles)
async function checkRemainingAnalyses() {
  try {
    if (window.PhytoIntegrations && window.PhytoIntegrations.getPlanAndRemaining) {
      const info = await window.PhytoIntegrations.getPlanAndRemaining();
      return info ? info.remaining : null;
    }
    return null;
  } catch (e) {
    console.error('checkRemainingAnalyses error', e);
    return null;
  }
}

// Send message flow
async function sendMessage(){
  if (isProcessing) return;
  const text = userInputEl?.value?.trim();
  if (!text) return;
  const active = findActive(); 
  if (!active) return;

  // Add user message
  const userMsg = { id: uid('m'), role: 'user', content: text };
  active.messages.push(userMsg);
  saveChats(); 
  renderMessages(); 
  if (userInputEl) userInputEl.value = '';

  // Prepare payload
  const payloadMessages = [];
  if (active.useMemory && active.memory) {
    payloadMessages.push({ role: 'system', content: active.memory });
  }
  active.messages.forEach(m => payloadMessages.push({ role: m.role, content: m.content }));

  // Create assistant placeholder
  const assistantPlaceholder = { id: uid('m'), role: 'assistant', content: '' };
  active.messages.push(assistantPlaceholder);
  saveChats(); 
  renderMessages();

  isProcessing = true;
  if (sendButtonEl) sendButtonEl.disabled = true;
  if (userInputEl) userInputEl.disabled = true;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: payloadMessages }),
    });

    if (!res.ok) throw new Error(`Network response not ok: ${res.status}`);

    // Handle streaming response
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let responseText = '';

      while (!done) {
        const { value, done: d } = await reader.read();
        done = d;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const jsonData = JSON.parse(line);
              if (jsonData.response) {
                responseText += jsonData.response;
                const ap = active.messages.find(x => x.id === assistantPlaceholder.id);
                if (ap) ap.content = responseText;
                saveChats(); 
                renderMessages();
              }
            } catch (e) {
              responseText += line;
              const ap = active.messages.find(x => x.id === assistantPlaceholder.id);
              if (ap) ap.content = responseText;
              saveChats(); 
              renderMessages();
            }
          }
        }
      }
    } else {
      // Fallback for non-streaming
      const json = await res.json().catch(()=>({}));
      const textResp = json.response || json.text || String(json || '');
      const ap = active.messages.find(x => x.id === assistantPlaceholder.id);
      if (ap) ap.content = textResp;
      saveChats(); 
      renderMessages();
    }
  } catch (err) {
    console.error('sendMessage error', err);
    const ap = active.messages.find(x => x.id === assistantPlaceholder.id);
    if (ap) {
      ap.content = 'Error: Failed to get response from server. Please check your connection and try again.';
    }
    saveChats(); 
    renderMessages();
  } finally {
    isProcessing = false;
    if (sendButtonEl) sendButtonEl.disabled = false;
    if (userInputEl) {
      userInputEl.disabled = false;
      userInputEl.focus();
    }
  }
}

// Image analysis integration
async function handleChatImageUpload(ev){
  const files = ev.target.files;
  if(!files || files.length===0) return;
  
  if (files.length > 4) {
    showToast('You can upload a maximum of 4 images at once.');
    return;
  }

  const active = findActive(); 
  if(!active) return;
  
  const preview = document.getElementById('chat-image-preview');
  const resultEl = document.getElementById('chat-detection-result');
  
  if (preview) preview.innerHTML = '';
  if (resultEl) resultEl.textContent = 'Analyzing images...';

  for(const file of files){
    try{
      const url = URL.createObjectURL(file);
      const img = new Image(); 
      img.src = url;
      img.style.cssText = 'max-width:120px;max-height:120px;border-radius:8px;margin:4px;';
      if (preview) preview.appendChild(img);

      // Convert to base64
      const base64 = await fileToDataUrl(file);

      // Analyze the image
      const detection = await analyzeImageWithPhytelix(base64);

      // Build assistant message content
      let assistantText = buildAnalysisResponse(detection);

      if(isDemoMode) {
        assistantText += '\n\n*Note: Demo mode is enabled - this is a simulated result for testing purposes.*';
      }

      // Add message to chat
      const m = { id: uid('m'), role: 'assistant', content: assistantText };
      active.messages.push(m);
      saveChats(); 
      renderMessages();

      URL.revokeObjectURL(url);
      
      // Decrement usage counter
      await handleUsageDecrement();
      
    }catch(err){
      console.error('Image upload analyze error:', err);
      if (resultEl) resultEl.textContent = 'Error analyzing image';
      
      const active = findActive();
      if(active) {
        const errorMsg = { 
          id: uid('m'), 
          role: 'assistant', 
          content: '**Image Analysis Error**\n\nSorry, I encountered an error while analyzing your image. This might be due to:\n• Network connection issues\n• Server maintenance\n• Unsupported file format\n\nPlease try again later.' 
        };
        active.messages.push(errorMsg);
        saveChats(); 
        renderMessages();
      }
    }
  }
  
  if (resultEl) resultEl.textContent = '';
  showToast('Image analysis complete!');
}

function fileToDataUrl(file){
  return new Promise((res, rej)=>{
    const r = new FileReader(); 
    r.onload = ()=>res(r.result); 
    r.onerror = rej; 
    r.readAsDataURL(file);
  });
}

// Global model cache
let loadedModels = {};
let currentModel = null;

async function loadTeachableMachineModel(modelType) {
  if (loadedModels[modelType]) {
    currentModel = loadedModels[modelType];
    return currentModel;
  }

  const modelUrl = MODEL_URLS[modelType] || MODEL_URLS.autodetect;
  if (!modelUrl) {
    throw new Error(`Model URL not found for: ${modelType}`);
  }

  console.log(`Loading TeachableMachine model: ${modelType} from ${modelUrl}`);
  
  try {
    const modelURL = modelUrl + "model.json";
    const metadataURL = modelUrl + "metadata.json";
    
    // Load TeachableMachine model directly
    const model = await tmImage.load(modelURL, metadataURL);
    loadedModels[modelType] = model;
    currentModel = model;
    
    console.log(`Successfully loaded model: ${modelType}`);
    return model;
  } catch (error) {
    console.error(`Failed to load model ${modelType}:`, error);
    throw new Error(`Failed to load TeachableMachine model: ${error.message}`);
  }
}

async function analyzeImageWithPhytelix(base64Data) {
  // Get selected crop model
  const cropSelect = document.getElementById('crop-model-select');
  const selectedCrop = cropSelect ? cropSelect.value : 'autodetect';
  
  try {
    console.log(`Analyzing image with model: ${selectedCrop}`);
    
    // Load the TeachableMachine model
    const model = await loadTeachableMachineModel(selectedCrop);
    
    // Convert base64 to Image element
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = base64Data;
    });
    
    // Run prediction using TeachableMachine model
    const predictions = await model.predict(img);
    
    // Sort predictions by probability
    const sortedPredictions = predictions.sort((a, b) => b.probability - a.probability);
    const topPrediction = sortedPredictions[0];
    
    console.log('TeachableMachine predictions:', sortedPredictions);
    
    return {
      disease_detected: topPrediction.className,
      confidence: Math.round(topPrediction.probability * 100),
      predictions: sortedPredictions.map(p => ({
        className: p.className,
        probability: Math.round(p.probability * 100)
      })),
      model_used: selectedCrop,
      analysis_timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('TeachableMachine analysis failed:', error);
    return { 
      error: 'TeachableMachine analysis failed: ' + error.message,
      details: error.message
    };
  }
}

function buildAnalysisResponse(detection) {
  let assistantText = '';
  
  if(detection && detection.disease_detected){
    assistantText += `**Image Analysis Results**\n\n`;
    assistantText += `**Detected Disease:** ${detection.disease_detected}\n`;
    if(detection.confidence) assistantText += `**Confidence:** ${detection.confidence}%\n`;
    if(detection.severity) assistantText += `**Severity:** ${detection.severity}\n`;
    if(Array.isArray(detection.symptoms_observed) && detection.symptoms_observed.length){
      assistantText += `**Symptoms Observed:** ${detection.symptoms_observed.join(', ')}\n`;
    }
    if(Array.isArray(detection.affected_crops) && detection.affected_crops.length){
      assistantText += `**Commonly Affects:** ${detection.affected_crops.join(', ')}\n`;
    }
    
    assistantText += '\n**Treatment Recommendations:**\n';
    
    // Get treatment advice asynchronously and update the message
    fetchTreatmentFromModel(detection.disease_detected, detection.affected_crops?.[0] || 'crops')
      .then(treatment => {
        if(treatment && treatment.response) {
          const active = findActive();
          if(active && active.messages.length > 0) {
            const lastMsg = active.messages[active.messages.length - 1];
            if(lastMsg.role === 'assistant' && lastMsg.content.includes('Loading treatment advice...')) {
              lastMsg.content = lastMsg.content.replace('Loading treatment advice...', treatment.response);
              saveChats();
              renderMessages();
            }
          }
        }
      })
      .catch(e => {
        console.warn('Treatment fetch failed:', e);
        const active = findActive();
        if(active && active.messages.length > 0) {
          const lastMsg = active.messages[active.messages.length - 1];
          if(lastMsg.role === 'assistant' && lastMsg.content.includes('Loading treatment advice...')) {
            lastMsg.content = lastMsg.content.replace('Loading treatment advice...', 'Treatment information temporarily unavailable. Please consult with a local agricultural expert.');
            saveChats();
            renderMessages();
          }
        }
      });
    
    assistantText += 'Loading treatment advice...';

  } else if (detection && detection.predictions && Array.isArray(detection.predictions)){
    assistantText += '**Image Analysis Results**\n\n**Possible Conditions:**\n';
    detection.predictions.slice(0, 3).forEach((p, i) => {
      assistantText += `${i+1}. ${p.className} (${Math.round(p.probability*100)}% confidence)\n`;
    });
    assistantText += '\nFor more accurate diagnosis, please ensure the image shows clear symptoms and good lighting.';

  } else if (detection && detection.error) {
    if(detection.suggestion === 'demo_mode') {
      assistantText += '**Analysis Service Unavailable**\n\n';
      assistantText += detection.error + '\n\n';
      assistantText += 'You can enable **Demo Mode** in the settings panel to test the image analysis feature with simulated results.';
    } else {
      assistantText += '**Analysis Failed**\n\n' + detection.error;
    }

  } else {
    assistantText += '**Analysis Incomplete**\n\n';
    assistantText += 'Unable to analyze the image at this time. This could be due to:\n\n';
    assistantText += '• Network connectivity issues\n';
    assistantText += '• Server maintenance\n';
    assistantText += '• Image quality or format issues\n';
    assistantText += '• The image doesn\'t show clear plant disease symptoms\n\n';
    assistantText += 'Please try again with a clear, well-lit photo showing disease symptoms, or enable Demo Mode in settings.';
  }
  
  return assistantText;
}

// REMOVED - No mock data allowed

async function fetchTreatmentFromModel(disease, crop){
  // NO DEMO MODE - Only real treatment data
  
  // Only use the worker endpoint that has proper CORS
  const endpoint = MODEL_WORKER + '/treatment';
  
  try{
    const res = await fetch(endpoint, {
      method: 'POST', 
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ 
        disease: disease,
        crop: crop
      })
    });
    
    if(res.ok) {
      const j = await res.json();
      if(j && (j.response || j.text)) return j;
    } else {
      console.warn('Treatment endpoint returned:', res.status);
    }
  }catch(e){ 
    console.warn('Treatment call failed:', e.message); 
  }
  
  return null;
}

async function handleUsageDecrement() {
  try {
    if (window.PhytoIntegrations && typeof window.PhytoIntegrations.decrementAnalysis === 'function') {
      const result = await window.PhytoIntegrations.decrementAnalysis();
      if (result && result.ok) {
        const el = document.getElementById('analysesLeft');
        if (el && result.remaining !== undefined && result.remaining !== Infinity) el.textContent = String(result.remaining);
        if (result.remaining !== Infinity) {
          if (result.remaining <= 0) showToast('Analysis limit reached. Consider upgrading your account.');
          else if (result.remaining <= 5) showToast(`${result.remaining} analyses remaining.`);
        }
      }
    }
  } catch (e) {
    console.error('Error handling usage decrement:', e);
  }
}

// Event Listeners
function attachEventListeners() {
  if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);
  if (sendButtonEl) sendButtonEl.addEventListener('click', sendMessage);
  
  if (userInputEl) {
    userInputEl.addEventListener('keydown', function(e){ 
      if(e.key === 'Enter' && !e.shiftKey){ 
        e.preventDefault(); 
        sendMessage(); 
      }
    });
  }
  
  if (memToggle) memToggle.addEventListener('click', toggleMemory);
  if (saveMemBtn) saveMemBtn.addEventListener('click', saveMemory);
  if (renameBtn) renameBtn.addEventListener('click', renameChat);
  if (deleteChatBtn) deleteChatBtn.addEventListener('click', deleteChat);

  const demoToggleBtn = document.getElementById('demoToggle');
  if(demoToggleBtn) demoToggleBtn.addEventListener('click', toggleDemoMode);

  const imageUploadChat = document.getElementById('image-upload-chat');
  if(imageUploadChat) imageUploadChat.addEventListener('change', handleChatImageUpload);

  // Profile inputs (Supabase upload + Firebase profile save)
  const profileNameEl = document.getElementById('profileName');
  const profileImageUploadEl = document.getElementById('profileImageUpload');

  if (profileImageUploadEl) {
    profileImageUploadEl.addEventListener('change', async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const file = files[0];
      const name = profileNameEl && profileNameEl.value ? profileNameEl.value.trim() : 'anonymous';
      const userId = name || 'anonymous';

      showToast('Uploading profile image...');

      try {
        if (window.PhytoSupabase && window.PhytoSupabase.uploadProfileImage) {
          const publicUrl = await window.PhytoSupabase.uploadProfileImage(userId, file);
          if (publicUrl) {
            if (window.PhytoIntegrations && window.PhytoIntegrations.saveProfileToSupabase) {
              await window.PhytoIntegrations.saveProfileToSupabase({ username: name, avatarUrl: publicUrl });
              try { await window.PhytoIntegrations.saveProfileToFirebase({ username: name, avatarUrl: publicUrl }); } catch {}
              showToast('Profile saved.');
            } else {
              showToast('Uploaded avatar, but profile save not configured.');
            }
          } else {
            showToast('Failed to upload avatar to Supabase.');
          }
        } else {
          showToast('Supabase not configured. Please add `config.js`.');
        }
      } catch (err) {
        console.error('Profile upload error', err);
        showToast('Failed to upload profile image.');
      }
    });
  }

  if (profileNameEl) {
  profileNameEl.addEventListener('change', async () => {
  const name = profileNameEl.value ? profileNameEl.value.trim() : '';
  if (!name) return;
  try {
    if (window.PhytoIntegrations && window.PhytoIntegrations.saveProfileToSupabase) {
    await window.PhytoIntegrations.saveProfileToSupabase({ username: name });
    try { await window.PhytoIntegrations.saveProfileToFirebase({ username: name }); } catch {}
  showToast('Profile name saved.');
  }
  } catch (err) {
  console.error('Save profile name error', err);
    showToast('Failed to save profile name.');
  }
  });
  }
}

// Initialize application
async function initialize() {
  console.log('PhytoBot initializing...');
  
  try {
    // Load configuration
    loadDemoMode();
    await loadModelUrls();
    
    // Populate crop selector
    populateCropSelector();
    
    // Load chat data
    loadChats();
    
    // Setup UI
    render();
    attachEventListeners();
    
    console.log('PhytoBot ready!');
    showToast('PhytoBot ready for analysis');
    
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('PhytoBot started with limited functionality');
  }
}

// Populate the crop model selector
function populateCropSelector() {
  const cropSelect = document.getElementById('crop-model-select');
  if (!cropSelect) return;
  
  // Clear existing options
  cropSelect.innerHTML = '';
  
  // Add options based on available models
  const cropOptions = [
    { value: 'autodetect', label: 'Auto-detect (All crops)' },
    { value: 'corn', label: 'Corn/Maize' },
    { value: 'tomato', label: 'Tomato' },
    { value: 'cassava', label: 'Cassava' },
    { value: 'cacao', label: 'Cacao/Cocoa' },
    { value: 'guava', label: 'Guava' },
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'orange', label: 'Orange' },
  ];
  
  cropOptions.forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    // Check if this model is available in MODEL_URLS
    if (!MODEL_URLS[option.value] && option.value !== 'autodetect') {
      optionEl.disabled = true;
      optionEl.textContent += ' (unavailable)';
    }
    cropSelect.appendChild(optionEl);
  });
  
  // Set default selection
  cropSelect.value = 'autodetect';
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
