const app = document.querySelector('#app');
const scrollFadeTimers = new WeakMap();
document.addEventListener('scroll', (event) => {
  const scroller = event.target === document ? document.documentElement : event.target;
  if (!(scroller instanceof Element)) return;
  scroller.classList.add('scrollbar-visible');
  window.clearTimeout(scrollFadeTimers.get(scroller));
  scrollFadeTimers.set(scroller, window.setTimeout(() => scroller.classList.remove('scrollbar-visible'), 850));
}, true);
const initialParams = new URLSearchParams(location.search);
const forceOnboarding = initialParams.get('onboarding') === '1';
const startOnboarding = forceOnboarding || !localStorage.getItem('twinName');
const retrievalDebugEnabled = initialParams.get('retrieval-debug') === '1';
if (forceOnboarding) {
  history.replaceState(null, '', location.pathname);
  localStorage.removeItem('twinName');
  localStorage.removeItem('echoPersona');
  localStorage.removeItem('echoOnboardingComplete');
}
const sections = [
  { id: 'Guidance', label: 'Καθοδήγηση' },
  { id: 'Add', label: 'Προσθήκη' },
  { id: 'Profile', label: 'Προφίλ' },
  { id: 'Graph', label: 'Γράφος' },
];
const twinName = 'Echo';
const guidanceSessionId = (() => {
  let id = localStorage.getItem('echoGuidanceSessionId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('echoGuidanceSessionId', id);
  }
  return id;
})();
const guidanceStartedStorageKey = `echoGuidanceStarted:${guidanceSessionId}`;
const state = {
  step: startOnboarding ? 'intro' : 'main',
  name: startOnboarding ? '' : (localStorage.getItem('twinName') || ''),
  introIndex: 0,
  introLocked: true,
  onboardingIndex: 0,
  onboardingAnswers: [],
  onboardingFacts: [],
  onboardingProgressFrom: null,
  onboardingCvError: '',
  section: localStorage.getItem('echoLastSection') === 'Connection' ? 'Add' : (localStorage.getItem('echoLastSection') || 'Add'),
  showFirstFilePrompt: false,
  // Νέο κλειδί ώστε να εμφανιστεί η ενημερωμένη περιήγηση και σε υπάρχοντες δοκιμαστικούς χρήστες.
  tour: localStorage.getItem('twinTourCompleteV3') ? null : 'Add',
};

const onboardingQuestions = [
  { category: 'preferences', key: 'risk_tolerance', title: 'Μια νέα ευκαιρία μπορεί να πάει χαμένη, αλλά αν πετύχει να αλλάξει πολλά για σένα. Τι κάνεις;', choices: [['Αφοσιώνομαι πλήρως, αξίζει το ρίσκο.', 'high_risk'], ['Τη δοκιμάζω σε μικρή κλίμακα πρώτα.', 'calculated_risk'], ['Επιλέγω κάτι πιο σίγουρο.', 'low_risk']] },
  { category: 'work', key: 'work_role', title: 'Το σύστημα καταρρέει λίγο πριν την παράδοση. Πού εστιάζεις;', choices: [['Κόβω λειτουργίες και παραδίδω εγκαίρως.', 'deadline_delivery'], ['Λύνω τη βασική αιτία, ακόμη κι αν καθυστερήσουμε.', 'root_cause'], ['Διαπραγματεύομαι νέο σχέδιο με τους εμπλεκόμενους.', 'stakeholder_plan']] },
  { category: 'goals', key: 'primary_goal', title: 'Τι θα επέλεγες για τα επόμενα τρία χρόνια;', choices: [['Περισσότερα χρήματα και υψηλή θέση.', 'income_status'], ['Ελευθερία χρόνου, με μέτριο εισόδημα.', 'time_freedom'], ['Δημιουργία με αντίκτυπο και μεγάλο ρίσκο.', 'impact_risk']] },
  { category: 'values', key: 'ethics_value', title: 'Ένας φίλος στη δουλειά έκανε ένα λάθος που μπορεί να κοστίσει στην ομάδα ένα σημαντικό project. Αν το παραδεχτεί, ίσως χάσει τη δουλειά του. Τι κάνεις;', choices: [['Τον βοηθώ να το διορθώσει πριν το μάθει κάποιος.', 'fix_silently'], ['Του ζητώ να το παραδεχτεί ο ίδιος.', 'ask_own_up'], ['Ενημερώνω αμέσως τον προϊστάμενο.', 'tell_manager']] },
  { category: 'preferences', key: 'thinking_style', title: 'Τα δεδομένα λένε «προχώρα», αλλά το ένστικτό σου διαφωνεί. Τι κάνεις;', choices: [['Ακολουθώ τα δεδομένα.', 'analytical'], ['Ψάχνω τι μπορεί να λείπει.', 'investigate'], ['Εμπιστεύομαι την εμπειρία μου.', 'intuitive']] },
];

const profileCategoryLabels = { work: 'Εργασία', skills: 'Δεξιότητες', experience: 'Εμπειρία', education: 'Εκπαίδευση', interests: 'Ενδιαφέροντα', values: 'Αξίες', preferences: 'Προτιμήσεις', goals: 'Στόχοι' };

const tourCopy = {
  Add: 'Πρόσθεσε αρχεία .txt ή PDF. Το κείμενο χωρίζεται σε τμήματα και γίνεται αναζήτησιμο μέσω embeddings.',
  Profile: 'Εδώ θα βλέπεις όσα έχει μάθει ο Echo για τις αξίες, τον τρόπο επικοινωνίας και τις προτιμήσεις σου.',
  Graph: 'Εδώ θα εμφανίζονται οι άνθρωποι και οι σχέσεις τους που εντοπίζονται στα δεδομένα σου. Οι νέες συνδέσεις θα χρειάζονται τη δική σου επιβεβαίωση.',
};

// Ελέγχει αν ο χρήστης έχει ήδη δει το ενημερωτικό pop-up μιας ενότητας.
function hasSeenSectionPopup(section) {
  return localStorage.getItem(`twinPopupSeen_${section}`) === 'true';
}

// Αποθηκεύει ότι το pop-up της ενότητας εμφανίστηκε ήδη.
function markSectionPopupSeen(section) {
  localStorage.setItem(`twinPopupSeen_${section}`, 'true');
}

// Εμφανίζει τα αρχεία που επέστρεψε το backend και επιτρέπει την αφαίρεσή τους.
function renderUploadedFiles(files, selector = '#uploaded-files') {
  const list = document.querySelector(selector);
  if (!list) return;
  const newestFirst = [...files].sort((left, right) => {
    const byDate = new Date(right.added_at || 0).getTime() - new Date(left.added_at || 0).getTime();
    return Number.isNaN(byDate) || byDate === 0 ? left.name.localeCompare(right.name) : byDate;
  });
  const showAll = list.dataset.showAll === 'true';
  const visibleFiles = showAll ? newestFirst : newestFirst.slice(0, 3);
  list.dataset.fileCount = String(newestFirst.length);
  list.innerHTML = newestFirst.length
    ? `${visibleFiles.map((file) => `
        ${(() => {
          const checked = file.analysis_status === 'complete';
          const proposalCount = Number(file.analyzed_profile_proposals || 0) + Number(file.analyzed_relationship_proposals || 0) + Number(file.analyzed_person_profile_proposals || 0);
          const checkedAt = file.checked_at ? new Date(file.checked_at).toLocaleString('el-GR') : '';
          return `<article class="uploaded-file ${checked ? 'file-analysis-complete' : ''}">
          <div class="uploaded-file-heading">
            <a class="uploaded-file-name" href="/api/files/${encodeURIComponent(file.name)}/preview" target="_blank" rel="noopener">${escapeHtml(file.name)}</a>
            <button class="remove-file" type="button" data-remove-file="${escapeHtml(file.name)}">Αφαίρεση</button>
          </div>
          <small>${file.status === 'embedded' ? 'Έτοιμο για αναζήτηση' : 'Αποθηκεύτηκε, αλλά δεν ολοκληρώθηκαν τα embeddings'} · ${Math.round(file.size / 1024)} KB · ${file.profile_suggestions + file.relationship_suggestions ? `${file.profile_suggestions + file.relationship_suggestions} προτάσεις για έλεγχο στο Προφίλ/Γράφο` : 'Δεν έχουν εξαχθεί προτάσεις'}</small>
          ${checked ? `<small class="file-analysis-status">Έλεγχος ολοκληρώθηκε ${checkedAt ? `στις ${escapeHtml(checkedAt)}` : ''} · ${proposalCount} προτάσεις · ${Number(file.analyzed_relationship_proposals || 0)} σχέσεις</small>` : ''}
          ${file.analysis_status === 'failed' ? `<small class="file-analysis-error">Η προηγούμενη εξαγωγή απέτυχε και μπορείς να δοκιμάσεις ξανά. ${escapeHtml(file.analysis_error || '')}</small>` : ''}
          ${file.error ? `<p class="file-processing-error">${escapeHtml(file.error)}</p>` : ''}
          ${file.status !== 'embedded' ? `<button class="retry-embedding" type="button" data-retry-embedding="${escapeHtml(file.name)}">Επανάληψη embeddings</button>` : ''}
          ${checked ? `<button class="button-secondary extract-document" type="button" data-reviewed-file="${escapeHtml(file.name)}">Έχει ελεγχθεί · δες αποτέλεσμα</button>` : `<button class="button-secondary extract-document" type="button" data-extract-file="${escapeHtml(file.name)}">Εξαγωγή προτάσεων για έλεγχο</button>`}
        </article>`;
        })()}`).join('')}${newestFirst.length > 3 ? `<button class="text-button show-more-files" type="button">${showAll ? 'Εμφάνιση λιγότερων' : `Δείξε τα υπόλοιπα (${newestFirst.length - 3})`}</button>` : ''}`
    : `<p class="empty-files">${selector === '#connection-files' ? 'Δεν υπάρχουν ακόμη αρχεία συνδέσεων. Επίλεξε έναν φάκελο παραπάνω.' : 'Δεν έχεις προσθέσει ακόμη αρχεία. Τα αρχεία του φακέλου Συνδέσεις εμφανίζονται στον Γράφο.'}</p>`;

  list.querySelectorAll('[data-remove-file]').forEach((button) => {
    button.addEventListener('click', () => removeUploadedFile(button.dataset.removeFile));
  });
  list.querySelectorAll('[data-retry-embedding]').forEach((button) => button.addEventListener('click', () => retryFileEmbeddings(button.dataset.retryEmbedding, button)));
  list.querySelectorAll('[data-extract-file]').forEach((button) => button.addEventListener('click', () => extractDocumentSuggestions(button.dataset.extractFile, button)));
  list.querySelectorAll('[data-reviewed-file]').forEach((button) => button.addEventListener('click', () => showFileAnalysisResult(newestFirst.find((file) => file.name === button.dataset.reviewedFile))));
  list.querySelector('.show-more-files')?.addEventListener('click', () => {
    list.dataset.showAll = showAll ? 'false' : 'true';
    renderUploadedFiles(newestFirst, selector);
  });
}

function showFileAnalysisResult(file) {
  if (!file) return;
  const checkedAt = file.checked_at ? new Date(file.checked_at).toLocaleString('el-GR') : '—';
  const relationships = Number(file.analyzed_relationship_proposals || 0);
  const proposals = Number(file.analyzed_profile_proposals || 0) + relationships + Number(file.analyzed_person_profile_proposals || 0);
  showUploadPopup('warning', `Το αρχείο «${file.name}» έχει ήδη ελεγχθεί επιτυχώς (${checkedAt}). Βρέθηκαν ${proposals} προτάσεις, από τις οποίες ${relationships} σχέσεις για τον Γράφο. Δεν θα γίνει δεύτερη εξαγωγή.`);
}

async function extractDocumentSuggestions(fileName, button) {
  button.disabled = true;
  button.textContent = 'Αναζήτηση προτάσεων…';
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}/extract`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.detail || 'Δεν αναλύθηκε το αρχείο.');
      error.status = response.status;
      throw error;
    }
    const total = result.profile_proposals.length + result.relationship_proposals.length + (result.person_profile_proposals?.length || 0);
    const relationshipCount = result.relationship_proposals.length;
    showUploadPopup(total ? 'success' : 'warning', total
      ? `Ο έλεγχος του «${fileName}» ολοκληρώθηκε. Βρέθηκαν ${total} προτάσεις και ${relationshipCount} σχέσεις για τον Γράφο. ${relationshipCount ? 'Ο Γράφος ενημερώθηκε.' : 'Δεν προέκυψαν σχέσεις, γι’ αυτό ο Γράφος δεν άλλαξε.'}`
      : `Ο έλεγχος του «${fileName}» ολοκληρώθηκε χωρίς νέες προτάσεις. Ο Γράφος δεν αλλάζει όταν δεν προκύπτουν σχέσεις.`);
    await refreshUploadedFiles();
    if (document.querySelector('#connection-files')) {
      await refreshConnectionFiles();
      await loadGraphSection();
    } else if (document.querySelector('#add-profile-content')) await loadAddProfileContent();
  } catch (error) {
    showUploadPopup(error.status === 409 ? 'warning' : 'error', error.message || 'Δεν αναλύθηκε το αρχείο.');
    await refreshUploadedFiles();
    if (document.querySelector('#connection-files')) await refreshConnectionFiles();
  } finally {
    button.disabled = false;
  }
}

async function retryFileEmbeddings(fileName, button) {
  button.disabled = true;
  button.textContent = 'Δημιουργία embeddings…';
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}/embed`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ολοκληρώθηκαν τα embeddings.');
    await refreshUploadedFiles();
    if (document.querySelector('#add-profile-content')) await loadAddProfileContent();
    showUploadPopup('success', `Το ${fileName} είναι έτοιμο για αναζήτηση.`);
  } catch (error) { showUploadPopup('error', error.message || 'Δεν ολοκληρώθηκαν τα embeddings.'); }
  finally { button.disabled = false; button.textContent = 'Επανάληψη embeddings'; }
}

// Ζητά από το backend τη λίστα αρχείων και ενημερώνει την οθόνη.
async function refreshUploadedFiles() {
  const list = document.querySelector('#uploaded-files');
  if (!list) return false;
  if (location.protocol === 'file:') {
    list.innerHTML = '<p class="backend-unavailable">Άνοιξε την εφαρμογή από <a href="http://127.0.0.1:8000">http://127.0.0.1:8000</a> για σύνδεση με το backend.</p>';
    return false;
  }

  try {
    const response = await fetch('/api/files');
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ήταν δυνατή η φόρτωση των αρχείων.');
    const files = result.files.filter((file) => !/^connections-/i.test(file.name));
    renderUploadedFiles(files);
    const extractAllButton = document.querySelector('#extract-all-files');
    if (extractAllButton) extractAllButton.disabled = files.length === 0;
    return true;
  } catch {
    list.innerHTML = '<p class="backend-unavailable">Δεν υπάρχει σύνδεση με το backend. Άφησε ανοιχτό το Terminal όπου τρέχει το `uvicorn` και άνοιξε ξανά την εφαρμογή από <a href="http://127.0.0.1:8000">http://127.0.0.1:8000</a>.</p>';
    return false;
  }
}

async function refreshConnectionFiles() {
  if (!document.querySelector('#connection-files')) return false;
  try {
    const response = await fetch('/api/files');
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν φορτώθηκαν τα αρχεία συνδέσεων.');
    const files = result.files.filter((file) => /^connections-/i.test(file.name));
    renderUploadedFiles(files, '#connection-files');
    const extractAllButton = document.querySelector('#extract-all-connection-files');
    if (extractAllButton) extractAllButton.disabled = files.length === 0;
    return true;
  } catch {
    const list = document.querySelector('#connection-files');
    if (list) list.innerHTML = '<p class="backend-unavailable">Δεν φορτώθηκαν τα αρχεία συνδέσεων.</p>';
    return false;
  }
}

async function extractAllFileSuggestions(connectionsOnly, button, status) {
  if (!button || button.disabled) return;
  const originalLabel = 'Εξαγωγή προτάσεων για έλεγχο όλων';
  button.disabled = true;
  button.textContent = 'Προετοιμασία…';
  status.textContent = 'Φόρτωση αρχείων…';
  let files = [];
  let proposalCount = 0;
  let relationshipCount = 0;
  let skippedCount = 0;
  const errors = [];
  try {
    const listResponse = await fetch('/api/files');
    const listResult = await listResponse.json();
    if (!listResponse.ok) throw new Error(listResult.detail || 'Δεν φορτώθηκαν τα αρχεία.');
    const allFiles = listResult.files.filter((file) => /^connections-/i.test(file.name) === connectionsOnly)
      .sort((left, right) => new Date(right.added_at || 0) - new Date(left.added_at || 0));
    skippedCount = allFiles.filter((file) => file.analysis_status === 'complete').length;
    files = allFiles.filter((file) => file.analysis_status !== 'complete');
    if (!allFiles.length) {
      status.textContent = 'Δεν υπάρχουν αρχεία προς επεξεργασία.';
      showUploadPopup('warning', 'Δεν υπάρχουν αρχεία προς επεξεργασία.');
      return;
    }
    if (!files.length) {
      status.textContent = `Όλα τα ${allFiles.length} αρχεία έχουν ήδη ελεγχθεί επιτυχώς.`;
      showUploadPopup('warning', `Όλα τα ${allFiles.length} αρχεία έχουν ήδη ελεγχθεί επιτυχώς. Δεν έγινε νέα εξαγωγή.`);
      return;
    }
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      button.textContent = `Εξαγωγή ${index + 1}/${files.length}…`;
      status.textContent = `Εξαγωγή προτάσεων ${index + 1} από ${files.length} · ${file.name}`;
      try {
        const response = await fetch(`/api/files/${encodeURIComponent(file.name)}/extract`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(result.detail || 'Δεν αναλύθηκε το αρχείο.');
          error.status = response.status;
          throw error;
        }
        proposalCount += (result.profile_proposals?.length || 0) + (result.relationship_proposals?.length || 0) + (result.person_profile_proposals?.length || 0);
        relationshipCount += result.relationship_proposals?.length || 0;
      } catch (error) {
        errors.push(`${file.name}: ${error.message || 'Δεν αναλύθηκε.'}`);
      }
    }
    const completedCount = files.length - errors.length;
    status.textContent = `Ολοκληρώθηκε για ${completedCount} από ${files.length} νέα αρχεία. Βρέθηκαν ${proposalCount} προτάσεις και ${relationshipCount} σχέσεις.${skippedCount ? ` Παραλείφθηκαν ${skippedCount} ήδη ελεγμένα.` : ''}${errors.length ? ` Σφάλματα: ${errors.join(' · ')}` : ''}`;
    await refreshUploadedFiles();
    if (connectionsOnly) {
      await refreshConnectionFiles();
      await loadGraphSection();
    } else if (document.querySelector('#add-profile-content')) await loadAddProfileContent();
    showUploadPopup(errors.length ? 'warning' : proposalCount ? 'success' : 'warning', errors.length
      ? `Ο έλεγχος ολοκληρώθηκε για ${completedCount} από ${files.length} νέα αρχεία. Βρέθηκαν ${relationshipCount} σχέσεις για τον Γράφο. ${errors.length} αρχεία χρειάζονται νέα προσπάθεια. ${errors.map((entry) => entry.split(': ').slice(1).join(': ')).join(' · ')}`
      : `Ο έλεγχος ολοκληρώθηκε για ${completedCount} νέα αρχεία. Βρέθηκαν ${proposalCount} προτάσεις, από τις οποίες ${relationshipCount} σχέσεις για τον Γράφο. ${relationshipCount ? 'Ο Γράφος ανανεώθηκε.' : 'Δεν βρέθηκαν σχέσεις, επομένως ο Γράφος παραμένει ίδιος.'}${skippedCount ? ` ${skippedCount} ήδη ελεγμένα αρχεία παραλείφθηκαν.` : ''}`);
  } catch (error) {
    status.textContent = error.message || 'Δεν ολοκληρώθηκε η εξαγωγή προτάσεων.';
    showUploadPopup('error', error.message || 'Δεν ολοκληρώθηκε η εξαγωγή προτάσεων.');
  } finally {
    button.disabled = files.length === 0;
    button.textContent = originalLabel;
  }
}

// Μετατρέπει σφάλματα σύνδεσης σε οδηγία για την εκκίνηση του backend.
function getApiErrorMessage(error) {
  if (error instanceof TypeError) {
    return 'Δεν μπορώ να συνδεθώ με το backend. Έλεγξε ότι το uvicorn τρέχει και άνοιξε την εφαρμογή από http://127.0.0.1:8000.';
  }
  return error.message || 'Δεν ήταν δυνατή η επικοινωνία με το backend.';
}

function uploadWithProgress(formData, onProgress = () => {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files');
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    });
    xhr.addEventListener('load', () => {
      let result;
      try { result = JSON.parse(xhr.responseText); }
      catch { reject(new Error('Ο server επέστρεψε μη έγκυρη απάντηση.')); return; }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(result.detail || 'Δεν αποθηκεύτηκαν τα αρχεία.');
        error.status = xhr.status;
        reject(error);
        return;
      }
      resolve(result);
    });
    xhr.addEventListener('error', () => reject(new TypeError('Δεν μπορώ να συνδεθώ με το backend.')));
    xhr.addEventListener('abort', () => reject(new Error('Η μεταφόρτωση ακυρώθηκε.')));
    xhr.send(formData);
  });
}

// Διαγράφει ένα αποθηκευμένο αρχείο μέσω του backend.
async function removeUploadedFile(fileName) {
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ήταν δυνατή η αφαίρεση του αρχείου.');
    await refreshUploadedFiles();
    if (document.querySelector('#connection-files')) await refreshConnectionFiles();
    if (document.querySelector('#add-profile-content')) await loadAddProfileContent();
    showUploadPopup('success', 'Το αρχείο αφαιρέθηκε.');
  } catch (error) {
    showUploadPopup('error', getApiErrorMessage(error));
  }
}

// Εμφανίζει pop-up αποτελέσματος και, αν λείπει αρχείο, δείχνει το πεδίο επιλογής.
function showUploadPopup(type, message, pointToPicker = false) {
  document.querySelector('#upload-popup')?.remove();
  const pickerControl = document.querySelector('#file-picker-control');
  pickerControl?.classList.remove('is-highlighted');

  if (pointToPicker && pickerControl) {
    pickerControl.classList.add('is-highlighted');
    pickerControl.insertAdjacentHTML('beforeend', `
      <aside class="upload-popup picker-tip ${type}" id="upload-popup" role="alertdialog" aria-label="Επίλεξε αρχείο">
        <p>${escapeHtml(message)}</p>
        <button class="upload-popup-close" type="button">Εντάξει</button>
      </aside>`);
  } else {
    app.insertAdjacentHTML('beforeend', `
      <div class="upload-popup-backdrop" id="upload-popup">
        <aside class="upload-popup ${type}" role="alertdialog" aria-modal="true" aria-label="Αποτέλεσμα προσθήκης">
          <span class="upload-popup-icon" aria-hidden="true">${type === 'success' ? '✓' : '!'}</span>
          <p>${escapeHtml(message)}</p>
          <button class="upload-popup-close" type="button">Κλείσιμο</button>
        </aside>
      </div>`);
  }

  document.querySelector('.upload-popup-close').addEventListener('click', () => {
    document.querySelector('#upload-popup')?.remove();
    pickerControl?.classList.remove('is-highlighted');
  });
}

// Στέλνει τα επιλεγμένα .txt στο backend και εμφανίζει το αποτέλεσμα σε pop-up.
async function addSelectedTextFiles() {
  const picker = document.querySelector('#text-files');
  const button = document.querySelector('#add-files');
  const selectedFiles = [...(picker?.files || [])];

  if (!selectedFiles.length) {
    showUploadPopup('warning', 'Για να προσθέσεις αρχείο, επίλεξε ένα αρχείο .txt ή PDF.', true);
    return;
  }

  button.disabled = true;
  button.textContent = 'Αποστολή…';
  const originalLabel = button.textContent;

  try {
    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));
    const result = await uploadWithProgress(formData);

    picker.value = '';
    await refreshUploadedFiles();
    await loadAddProfileContent();
    const addedCount = result.added.length;
    const failedCount = result.embedding_errors?.length || 0;
    const successMessage = failedCount
      ? `Αποθηκεύτηκαν ${addedCount} αρχεία, αλλά τα embeddings απέτυχαν για ${failedCount}. Το αρχείο παραμένει στη λίστα και μπορείς να δοκιμάσεις ξανά αργότερα.`
      : addedCount === 1 ? 'Το αρχείο αποθηκεύτηκε και είναι έτοιμο για αναζήτηση.' : `Αποθηκεύτηκαν ${addedCount} αρχεία και είναι έτοιμα για αναζήτηση.`;
    showUploadPopup(failedCount ? 'warning' : 'success', successMessage);
  } catch (error) {
    showUploadPopup(error.type || (error.status === 409 ? 'warning' : 'error'), getApiErrorMessage(error));
  } finally {
    button.disabled = false;
    button.textContent = originalLabel === 'Αποστολή…' ? 'Επεξεργασία αρχείων' : 'Προσθήκη αρχείων';
  }
}

function showModeSwitchConfirmation(mode, onConfirm) {
  document.querySelector('#mode-confirmation')?.remove();
  const isLocal = mode === 'ollama';
  document.body.insertAdjacentHTML('beforeend', `
    <div class="mode-confirmation-backdrop" id="mode-confirmation">
      <section class="mode-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mode-confirm-title">
        <span class="mode-confirmation-label">ΕΠΙΒΕΒΑΙΩΣΗ ΑΛΛΑΓΗΣ</span>
        <h2 id="mode-confirm-title">Να αλλάξει η λειτουργία σε ${isLocal ? 'Τοπικά με Ollama' : 'Cloud με OpenAI'};</h2>
        <p>Θα δημιουργηθούν ξανά τα embeddings για <strong>όλα</strong> τα αρχεία σου με το νέο μοντέλο. Τα παλιά embeddings θα αντικατασταθούν μόνο αν ολοκληρωθεί επιτυχώς η επεξεργασία. Τα αρχικά αρχεία δεν διαγράφονται.</p>
        <p>${isLocal ? 'Το κείμενο θα επεξεργαστεί τοπικά. Χρειάζεται ενεργό Ollama και τα μοντέλα κατεβασμένα.' : 'Τα αποσπάσματα κειμένου θα σταλούν στο OpenAI API και μπορεί να υπάρξει χρέωση.'}</p>
        <div class="mode-confirmation-actions"><button type="button" class="mode-cancel">Άκυρο</button><button type="button" class="mode-confirm">Ναι, προχώρησε</button></div>
      </section>
    </div>`);
  const modal = document.querySelector('#mode-confirmation');
  const confirmButton = modal.querySelector('.mode-confirm');
  let remaining = 3;
  confirmButton.disabled = true;
  confirmButton.textContent = `Διάβασε πριν συνεχίσεις (${remaining})`;
  const countdown = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(countdown);
      confirmButton.disabled = false;
      confirmButton.textContent = 'Ναι, προχώρησε';
    } else confirmButton.textContent = `Διάβασε πριν συνεχίσεις (${remaining})`;
  }, 1000);
  const close = () => { clearInterval(countdown); modal.remove(); };
  modal.querySelector('.mode-cancel').addEventListener('click', close);
  confirmButton.addEventListener('click', () => { if (confirmButton.disabled) return; close(); onConfirm(); });
  modal.addEventListener('click', (event) => { if (event.target === modal) close(); });
}

function renderWelcome() {
  const slides = [
    '<div class="intro-stack"><h1 class="intro-title intro-rise">Καλώς ήρθες στο <span class="echo-word">Echo,</span></h1><h2 class="intro-subtitle intro-from-bottom">τον ψηφιακό σου εαυτό</h2></div>',
    '<h1 class="intro-statement intro-reveal">Ο <span class="echo-word">Echo</span> είναι ο προσωπικός σου AI εκπρόσωπος. Μαθαίνει από εσένα, σε βοηθά να οργανώνεις τις εμπειρίες σου, να παίρνεις συμβουλές και να δικτυώνεσαι.</h1>',
    '<h1 class="intro-statement intro-reveal">Πριν συνεχίσεις, ο Echo θα ήθελε να σε γνωρίσει <span class="echo-word">καλύτερα…</span></h1>',
    '<h1 class="intro-statement intro-reveal">Εσύ κρατάς τον <span class="echo-word">έλεγχο</span>: βλέπεις τις πηγές, διορθώνεις το προφίλ και εγκρίνεις όσα ο Echo προτείνει.</h1>',
  ];
  app.innerHTML = `<section class="intro-screen" role="button" tabindex="0" aria-label="Συνέχεια στην παρουσίαση"><div class="intro-content" aria-live="polite">${slides[state.introIndex]}</div><p class="intro-prompt">Κάνε κλικ οπουδήποτε για να συνεχίσεις</p></section>`;
  const screen = document.querySelector('.intro-screen');
  const advance = () => {
    if (state.introLocked) return;
    state.introLocked = true;
    const goNext = () => {
      if (state.introIndex < slides.length - 1) {
        state.introIndex += 1;
        renderWelcome();
      } else { state.step = 'name'; render(); }
    };
    if (state.introIndex >= 1) {
      document.querySelector('.intro-content').classList.add('intro-exit');
      setTimeout(goNext, 560);
    } else goNext();
  };
  screen.addEventListener('click', advance);
  screen.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); advance(); } });
  if (state.introIndex === 1) {
    const copy = 'Ο Echo είναι ο προσωπικός σου AI εκπρόσωπος. Μαθαίνει από εσένα, σε βοηθά να οργανώνεις τις εμπειρίες σου, να παίρνεις συμβουλές και να δικτυώνεσαι.';
    const heading = document.querySelector('.intro-statement');
    heading.innerHTML = '<span class="intro-typewriter"><span id="intro-typed-copy"></span></span>';
    const output = document.querySelector('#intro-typed-copy');
    let position = 0;
    const typeTimer = setInterval(() => {
      position += 1;
      output.innerHTML = escapeHtml(copy.slice(0, position)).replace('Echo', '<span class="echo-word">Echo</span>');
      if (position >= copy.length) {
        clearInterval(typeTimer);
        setTimeout(() => { state.introLocked = false; }, 500);
      }
    }, 32);
  } else setTimeout(() => { state.introLocked = false; }, state.introIndex === 0 ? 2500 : 1500);
}

function renderNameStep() {
  app.innerHTML = `
    <section class="name-step">
      <div class="name-card">
        <h1 id="name-greeting">Ας γνωριστούμε</h1>
        <p class="subheading">Πώς θέλεις να σε αποκαλώ;</p>
        <form id="name-form">
          <input id="preferred-name" name="name" autocomplete="given-name" maxlength="48" placeholder="Όνομα χρήστη" aria-describedby="name-error name-note" aria-invalid="false">
          <p id="name-error" class="name-error" aria-live="polite"></p>
          <p id="name-note" class="onboarding-reassurance">Το όνομα χρήστη θα μπορείς να το αλλάξεις αργότερα.</p>
          <button class="button-primary" type="submit">Επόμενο <span aria-hidden="true">→</span></button>
        </form>
      </div>
    </section>`;
  document.querySelector('#name-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.name = new FormData(event.currentTarget).get('name').trim();
    if (!state.name) {
      const input = document.querySelector('#preferred-name');
      input.setAttribute('aria-invalid', 'true');
      document.querySelector('#name-error').textContent = 'Το πεδίο είναι υποχρεωτικό.';
      input.classList.remove('name-invalid-shake');
      void input.offsetWidth;
      input.classList.add('name-invalid-shake');
      input.focus();
      return;
    }
    const button = document.querySelector('#name-form button');
    button.disabled = true;
    try {
      const response = await fetch('/api/profile/identity', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: state.name }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Δεν αποθηκεύτηκε το όνομα.');
      localStorage.setItem('twinName', state.name);
      state.onboardingIndex = 0;
      state.onboardingAnswers = [];
      state.onboardingFacts = [];
      state.step = startOnboarding ? 'onboarding' : 'main';
      if (!startOnboarding) {
        state.section = 'Profile';
        localStorage.setItem('echoLastSection', 'Profile');
      }
      render();
    } catch (error) {
      const message = document.querySelector('#name-error');
      if (message) message.textContent = error.message || 'Δεν αποθηκεύτηκε το όνομα.';
      button.disabled = false;
    }
  });
  document.querySelector('#preferred-name').addEventListener('input', () => {
    document.querySelector('#preferred-name').setAttribute('aria-invalid', 'false');
    document.querySelector('#name-error').textContent = '';
  });
}

function onboardingFactsForCurrentStep(form) {
  const question = onboardingQuestions[state.onboardingIndex];
  const selected = form.querySelector('[name="onboarding-choice"]:checked');
  const additions = selected ? [{ category: question.category, value: selected.dataset.label, key: question.key, code: selected.value }] : [];
  state.onboardingFacts = [...state.onboardingFacts.filter((fact) => fact.key !== question.key), ...additions];
  state.onboardingAnswers[state.onboardingIndex] = selected?.value || '';
}

async function saveOnboardingFacts(status) {
  if (!state.onboardingFacts.length) return;
  const response = await fetch('/api/profile/items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, source_type: 'onboarding', items: state.onboardingFacts }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Δεν αποθηκεύτηκαν οι απαντήσεις.');
}

function buildArchetypeLabel(persona) {
  const role = { deadline_delivery: 'Προσανατολισμός στην παράδοση', root_cause: 'Εστίαση στη ριζική λύση', stakeholder_plan: 'Συντονισμός με εμπλεκόμενους' }[persona.work_role];
  const risk = { high_risk: 'τολμηρή στάση', calculated_risk: 'υπολογισμένο ρίσκο', low_risk: 'προσεκτικές κινήσεις' }[persona.risk_tolerance];
  const thinking = { analytical: 'αναλυτική σκέψη', investigate: 'διερευνητική σκέψη', intuitive: 'διαίσθηση και εμπειρία' }[persona.thinking_style];
  return [role, risk, thinking].filter(Boolean).join(' · ');
}

function updateOnboardingProgress(completedQuestions) {
  const progress = document.querySelector('.onboarding-progress');
  const value = Math.max(0, Math.min(completedQuestions, onboardingQuestions.length));
  progress.setAttribute('aria-valuenow', String(value));
  progress.querySelector('span').style.width = `${(value / onboardingQuestions.length) * 100}%`;
}

function renderOnboarding() {
  const index = state.onboardingIndex;
  const question = onboardingQuestions[index];
  const saved = state.onboardingAnswers[index] || '';
  const progressFrom = state.onboardingProgressFrom ?? index;
  state.onboardingProgressFrom = null;
  app.innerHTML = `
    <section class="welcome onboarding-screen">
      <div class="welcome-card onboarding-card">
        <div class="onboarding-step-count">${index + 1}/${onboardingQuestions.length}</div>
        <h1>Ας γνωριστούμε, ${escapeHtml(state.name)}</h1>
        <p class="onboarding-reassurance">Οι απαντήσεις σου δεν είναι μόνιμες· μπορείς να τις αλλάξεις ή να τις διαγράψεις στη συνέχεια.</p>
        <div class="onboarding-progress" role="progressbar" aria-label="Πρόοδος ερωτήσεων" aria-valuemin="0" aria-valuemax="${onboardingQuestions.length}" aria-valuenow="${index}"><span style="width:${(progressFrom / onboardingQuestions.length) * 100}%"></span></div>
        <form id="onboarding-form">
          <h2>${escapeHtml(question.title)}</h2>
          <div class="onboarding-options">${question.choices.map(([choice, code]) => `<label class="onboarding-option"><input type="radio" name="onboarding-choice" value="${code}" data-label="${escapeHtml(choice)}" ${saved === code ? 'checked' : ''}><span>${escapeHtml(choice)}</span></label>`).join('')}</div>
          <p id="onboarding-error" class="form-error" aria-live="polite"></p>
          <div class="onboarding-actions">
            ${index > 0 ? '<button class="button-secondary" id="onboarding-back" type="button">Πίσω</button>' : ''}
            <button class="button-primary" id="onboarding-next" type="submit" ${saved ? '' : 'disabled'}>${index === onboardingQuestions.length - 1 ? 'Επόμενο' : 'Επόμενο'}</button>
          </div>
        </form>
      </div>
    </section>`;

  if (progressFrom !== index) {
    const progressFill = document.querySelector('.onboarding-progress span');
    void progressFill.offsetWidth;
    requestAnimationFrame(() => { progressFill.style.width = `${(index / onboardingQuestions.length) * 100}%`; });
  }

  document.querySelector('#onboarding-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    onboardingFactsForCurrentStep(event.currentTarget);
    const form = event.currentTarget;
    const controls = [...form.querySelectorAll('input, button')];
    controls.forEach((control) => { control.disabled = true; });
    if (state.onboardingIndex < onboardingQuestions.length - 1) {
      state.onboardingProgressFrom = state.onboardingIndex;
      state.onboardingIndex += 1;
      render();
    }
    else {
      state.onboardingFacts = state.onboardingFacts.filter((fact) => fact.key !== 'archetype_label');
      const persona = Object.fromEntries(state.onboardingFacts.filter((fact) => fact.key).map((fact) => [fact.key, fact.code]));
      persona.archetype_label = buildArchetypeLabel(persona);
      state.onboardingFacts.push({ category: 'preferences', key: 'archetype_label', code: persona.archetype_label, value: `Αρχέτυπο: ${persona.archetype_label}` });
      try {
        updateOnboardingProgress(onboardingQuestions.length);
        localStorage.setItem('echoPersona', JSON.stringify(persona));
        state.step = 'onboarding-summary';
        render();
      } catch (error) {
        updateOnboardingProgress(onboardingQuestions.length - 1);
        document.querySelector('#onboarding-error').textContent = error.message || 'Δεν αποθηκεύτηκε το προφίλ.';
        controls.forEach((control) => { control.disabled = false; });
      }
    }
  });
  document.querySelectorAll('[name="onboarding-choice"]').forEach((radio) => radio.addEventListener('change', () => {
    document.querySelector('#onboarding-next').disabled = false;
    state.onboardingAnswers[index] = radio.value;
  }));
  document.querySelector('#onboarding-form').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.target.name !== 'onboarding-choice') return;
    event.preventDefault();
    const next = document.querySelector('#onboarding-next');
    if (!next.disabled) document.querySelector('#onboarding-form').requestSubmit();
  });
  document.querySelector('#onboarding-back')?.addEventListener('click', async (event) => {
    state.onboardingProgressFrom = state.onboardingIndex;
    state.onboardingIndex -= 1;
    render();
  });
}

function renderOnboardingSummary() {
  app.innerHTML = `
    <section class="welcome onboarding-screen">
      <div class="welcome-card onboarding-card onboarding-summary">
        <div class="eyebrow">Έλεγξε το αρχικό προφίλ</div>
        <h1>Αυτά θα γνωρίζει ο Echo</h1>
        <p class="description">Διόρθωσε τα στοιχεία ή αφαίρεσε όσα δεν θέλεις να κρατήσεις. Θα επιβεβαιωθούν μόνο όταν πατήσεις αποθήκευση.</p>
        <div class="summary-facts">${state.onboardingFacts.length ? state.onboardingFacts.map((fact, index) => `<article class="summary-fact"><small>${escapeHtml(profileCategoryLabels[fact.category] || fact.category)}</small><input data-summary-value="${index}" value="${escapeHtml(fact.value)}" maxlength="500"><button type="button" class="remove-file" data-summary-remove="${index}">Αφαίρεση</button></article>`).join('') : '<p class="empty-files">Δεν επέλεξες στοιχεία. Μπορείς να συνεχίσεις και να συμπληρώσεις το προφίλ αργότερα.</p>'}</div>
        <p id="summary-error" class="form-error" aria-live="polite"></p>
        <div class="onboarding-actions"><button class="button-secondary" id="summary-back" type="button">Πίσω</button><button class="button-primary" id="summary-confirm" type="button">Επιβεβαίωση και συνέχεια</button></div>
        <button class="text-button" id="summary-later" type="button">Θα το συμπληρώσω αργότερα</button>
      </div>
    </section>`;
  document.querySelectorAll('[data-summary-value]').forEach((input) => input.addEventListener('input', () => { state.onboardingFacts[Number(input.dataset.summaryValue)].value = input.value; }));
  document.querySelectorAll('[data-summary-remove]').forEach((button) => button.addEventListener('click', () => { state.onboardingFacts.splice(Number(button.dataset.summaryRemove), 1); render(); }));
  document.querySelector('#summary-back').addEventListener('click', () => { state.step = 'onboarding'; state.onboardingIndex = onboardingQuestions.length - 1; render(); });
  document.querySelector('#summary-confirm').addEventListener('click', async () => {
    state.onboardingFacts = state.onboardingFacts.map((fact) => ({ ...fact, value: fact.value.trim() })).filter((fact) => fact.value);
    const button = document.querySelector('#summary-confirm');
    button.disabled = true;
    try {
      await saveOnboardingFacts('confirmed');
      state.onboardingFacts = [];
      state.step = 'onboarding-cv';
      render();
    } catch (error) { document.querySelector('#summary-error').textContent = error.message || 'Δεν αποθηκεύτηκε το προφίλ.'; button.disabled = false; }
  });
  document.querySelector('#summary-later').addEventListener('click', async () => {
    const button = document.querySelector('#summary-later');
    button.disabled = true;
    try {
      state.onboardingFacts = state.onboardingFacts.map((fact) => ({ ...fact, value: fact.value.trim() })).filter((fact) => fact.value);
      await saveOnboardingFacts('proposed');
      state.onboardingFacts = [];
      state.step = 'onboarding-cv';
      render();
    } catch (error) { document.querySelector('#summary-error').textContent = error.message || 'Δεν αποθηκεύτηκαν οι απαντήσεις.'; button.disabled = false; }
  });
}

function renderOnboardingCv() {
  app.innerHTML = `
    <section class="welcome onboarding-screen"><div class="welcome-card onboarding-card">
      <h1>Ας γνωριστούμε · Τελικό βήμα</h1>
      <h2>Βοήθησέ μας να σε μάθουμε καλύτερα</h2>
      <p class="description">Το CV σου βοηθά τον <span class="echo-word">Echo</span> να καταλάβει την επαγγελματική σου πορεία. Ανέβασε αρχείο PDF/TXT ή επικόλλησε το κείμενο.</p>
      <form id="onboarding-cv-form"><label for="onboarding-cv-file">Επίλεξε αρχείο PDF ή TXT</label><input type="file" id="onboarding-cv-file" accept=".txt,.pdf,text/plain,application/pdf">
      <label for="onboarding-cv-text">Ή επικόλλησε εδώ το κείμενο του CV σου</label><textarea id="onboarding-cv-text" rows="6" placeholder="Επικόλληση..."></textarea>
      <p class="cv-privacy-message" id="onboarding-cv-mode">Έλεγχος ενεργής λειτουργίας…</p>
      <p id="onboarding-cv-error" class="form-error" aria-live="polite">${escapeHtml(state.onboardingCvError)}</p>
      <div class="onboarding-actions"><button class="button-secondary" type="button" id="onboarding-cv-later">Αργότερα</button><button class="button-primary" id="onboarding-cv-submit" type="submit" disabled>Δημιουργία προφίλ</button></div></form>
    </div></section>`;
  const file = document.querySelector('#onboarding-cv-file');
  const text = document.querySelector('#onboarding-cv-text');
  const submit = document.querySelector('#onboarding-cv-submit');
  let cloudUnavailable = false;
  const update = () => { submit.disabled = cloudUnavailable || (!file.files.length && !text.value.trim()); };
  Promise.resolve(fetch('/api/config').then((r) => r.json())).then((config) => {
    cloudUnavailable = config.mode === 'openai' && !config.openai_available;
    const modeNotice = document.querySelector('#onboarding-cv-mode');
    modeNotice.textContent = config.mode === 'openai'
      ? `Cloud με OpenAI: το κείμενο θα σταλεί στην OpenAI για embeddings και εξαγωγή προτάσεων και μπορεί να υπάρξει χρέωση. Το αρχικό αρχείο θα αποθηκευτεί τοπικά.${cloudUnavailable ? ' Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.' : ''}`
      : 'Το αρχικό αρχείο θα αποθηκευτεί τοπικά στα έγγραφά σου και θα παραμείνει αναζητήσιμο.';
    modeNotice.hidden = config.mode !== 'openai';
    update();
  }).catch(() => { document.querySelector('#onboarding-cv-mode').textContent = 'Δεν ήταν δυνατός ο έλεγχος ενεργής λειτουργίας.'; });
  file.addEventListener('change', update); text.addEventListener('input', update);
  document.querySelector('#onboarding-cv-later').addEventListener('click', () => { state.step = 'onboarding-finish'; render(); });
  document.querySelector('#onboarding-cv-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData();
    if (file.files.length) data.append('file', file.files[0]); else data.append('cv_text', text.value);
    state.onboardingCvError = '';
    state.step = 'onboarding-cv-loading';
    state.onboardingCvLoading = 'loading';
    state.onboardingCvResult = '';
    render();
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const response = await fetch('/api/profile/cv?privacy_ack=true', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Δεν αναλύθηκε το CV.');
      state.onboardingCvLoading = 'complete';
      render();
      await new Promise((resolve) => setTimeout(resolve, 1100));
      state.step = 'onboarding-finish'; render();
    } catch (error) {
      state.onboardingCvLoading = 'error';
      state.onboardingCvError = error.message || 'Δεν αναλύθηκε το CV.';
      render();
    }
  });
}

function renderOnboardingFinish() {
  app.innerHTML = `
    <section class="welcome onboarding-screen"><div class="welcome-card onboarding-card onboarding-summary">
      <div class="eyebrow">Η αρχική γνωριμία ολοκληρώθηκε</div>
      <h1>Το Echo είναι έτοιμο, ${escapeHtml(state.name)}.</h1>
      <p class="description">Στο Προφίλ μπορείς να ελέγξεις όσα δήλωσες. Στην Προσθήκη βάλε τα συνθετικά αρχεία του demo και στην Καθοδήγηση ρώτησε τον Echo· κάθε απάντηση θα δείχνει από πού προέκυψε.</p>
      <div class="onboarding-actions"><button class="button-primary" id="finish-onboarding">Άνοιγμα προφίλ <span aria-hidden="true">→</span></button></div>
    </div></section>`;
  document.querySelector('#finish-onboarding').addEventListener('click', () => {
    localStorage.setItem('echoOnboardingComplete', 'true');
    state.step = 'main';
    state.section = 'Profile';
    localStorage.setItem('echoLastSection', 'Profile');
    render();
  });
}

function renderOnboardingCvLoading() {
  const complete = state.onboardingCvLoading === 'complete';
  const failed = state.onboardingCvLoading === 'error';
  app.innerHTML = `
    <section class="welcome onboarding-screen"><div class="welcome-card onboarding-card cv-loading-card">
      <div class="cv-loading-indicator ${complete ? 'is-complete' : ''} ${failed ? 'has-error' : ''}" aria-hidden="true">${complete ? '✓' : failed ? '!' : '<span></span>'}</div>
      <h1>${failed ? 'Δεν ολοκληρώθηκε η δημιουργία προφίλ' : complete ? 'Το προφίλ δημιουργήθηκε' : '<span>Ο </span><span class="echo-word">Echo</span><span> δημιουργεί το προφίλ σου</span>'}</h1>
      ${failed ? `<p class="description">${escapeHtml(state.onboardingCvError)}</p>` : ''}
      ${failed ? '<button class="button-secondary" id="cv-loading-back" type="button">Επιστροφή στο CV</button>' : '<div class="cv-loading-track" aria-hidden="true"><span></span></div>'}
    </div></section>`;
  document.querySelector('#cv-loading-back')?.addEventListener('click', () => { state.step = 'onboarding-cv'; render(); });
}

async function syncProfileIdentity() {
  try {
    const response = await fetch('/api/profile');
    const profile = await response.json();
    if (!response.ok) return;
    if (profile.identity.display_name) {
      state.name = profile.identity.display_name;
      localStorage.setItem('twinName', state.name);
    } else if (state.name) {
      await fetch('/api/profile/identity', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: state.name }) });
    }
  } catch {}
}

async function loadProfileSection(identityReady = Promise.resolve()) {
  const root = document.querySelector('#profile-page-content');
  if (!root) return;
  await identityReady;
  try {
    const response = await fetch('/api/profile');
    const profile = await response.json();
    if (!response.ok) throw new Error(profile.detail || 'Δεν φορτώθηκε το προφίλ.');
    const identity = profile.identity;
    const items = profile.items || [];
    state.name = identity.display_name || state.name;
    if (state.name) localStorage.setItem('twinName', state.name);
    const renderItem = (item) => {
      const sourceLabel = ['cv', 'document'].includes(item.source_type)
        ? `${item.source_name}${item.source_page ? ` · σελίδα ${item.source_page}` : ''}`
        : item.source_type === 'onboarding' ? 'Αρχική γνωριμία' : 'Προσθήκη από εσένα';
      const proposedActions = item.status === 'proposed'
        ? `<button type="button" class="button-primary profile-action" data-profile-action="confirm" data-item-id="${item.id}">Έγκριση</button><button type="button" class="button-secondary profile-action" data-profile-action="reject" data-item-id="${item.id}">Απόρριψη</button>`
        : '';
      return `<article class="profile-item ${item.status === 'proposed' ? 'is-proposed' : ''}">
        <div class="profile-item-heading"><span class="profile-category">${escapeHtml(profileCategoryLabels[item.category] || item.category)}</span><span class="profile-status status-${escapeHtml(item.status)}">${item.status === 'proposed' ? 'Πρόταση · χρειάζεται έλεγχο' : item.status === 'confirmed' ? 'Επιβεβαιωμένο' : item.status === 'corrected' ? 'Διορθωμένο' : 'Απορρίφθηκε'}</span></div>
        <textarea class="profile-item-value" data-profile-value="${item.id}" rows="2">${escapeHtml(item.value)}</textarea>
        <small class="profile-source">Προέλευση: ${escapeHtml(sourceLabel)} · Προστέθηκε ${escapeHtml(new Date(item.created_at).toLocaleDateString('el-GR'))}</small>
        ${item.source_removed ? '<small class="profile-source">Το αρχικό αρχείο έχει αφαιρεθεί.</small>' : ''}
        ${item.source_excerpt ? `<details><summary>Δες το απόσπασμα</summary><blockquote>${escapeHtml(item.source_excerpt)}</blockquote></details>` : ''}
        <div class="profile-item-actions">${proposedActions}<button type="button" class="button-secondary profile-action" data-profile-action="save" data-item-id="${item.id}">Αποθήκευση διόρθωσης</button><button type="button" class="text-button danger-text profile-action" data-profile-action="delete" data-item-id="${item.id}">Διαγραφή</button></div>
      </article>`;
    };
    const activeItems = items.filter((item) => item.status !== 'rejected');
    const proposedItems = activeItems.filter((item) => item.status === 'proposed');
    const confirmedItems = activeItems.filter((item) => ['confirmed', 'corrected'].includes(item.status));
    const renderGroups = (records) => Object.entries(profileCategoryLabels).map(([category, label]) => {
      const group = records.filter((item) => item.category === category);
      return group.length ? `<details class="profile-category-group"><summary class="profile-category-heading"><h3>${label}</h3><span class="profile-toggle-trailing"><span class="profile-item-total ${group.length <= 6 ? 'is-low' : group.length <= 12 ? 'is-medium' : 'is-high'}">${group.length}</span><span class="profile-toggle-icon" aria-hidden="true">+</span></span></summary><div class="profile-category-items">${group.map(renderItem).join('')}</div></details>` : '';
    }).join('');
    const confirmedGroups = renderGroups(confirmedItems);
    const proposedGroups = renderGroups(proposedItems);
    const pendingCount = proposedItems.length === 1 ? '1' : `<strong>${proposedItems.length}</strong>`;
    const language = document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'el';
    const pronounLabels = language === 'en'
      ? { masculine: 'Masculine (he/him)', feminine: 'Feminine (she/her)', neutral: 'Neutral (they/them)', other: 'Other' }
      : { masculine: 'Αρσενικό', feminine: 'Θηλυκό', neutral: 'Ουδέτερο', other: 'Άλλο' };
    root.innerHTML = `
      <button type="button" class="profile-panel profile-overview-identity profile-identity-trigger" id="open-profile-identity" aria-haspopup="dialog">
        <span class="profile-avatar" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="17" r="7"/><path d="M10 40c1.4-7.2 6.1-11 14-11s12.6 3.8 14 11"/></svg></span>
        <span class="profile-overview-copy"><span class="profile-kicker">ΤΟ ΠΡΟΦΙΛ ΣΟΥ</span><strong>${escapeHtml(identity.display_name || state.name || 'Το προφίλ σου')}</strong><span>${escapeHtml(identity.bio || 'Ο Echo χρησιμοποιεί τα εγκεκριμένα στοιχεία για να σου απαντά.')}</span></span>
      </button>
      <dialog class="profile-identity-dialog" id="profile-identity-dialog" aria-labelledby="profile-identity-title">
        <form id="profile-identity-form" class="profile-identity-form">
          <div class="profile-dialog-heading"><div><p class="profile-kicker">ΡΥΘΜΙΣΕΙΣ ΠΡΟΦΙΛ</p><h2 id="profile-identity-title">Η ταυτότητά σου</h2></div><button class="profile-dialog-close" type="button" aria-label="Κλείσιμο">×</button></div>
          <label for="profile-display-name">Όνομα προφίλ</label><input id="profile-display-name" maxlength="48" value="${escapeHtml(identity.display_name || state.name)}" required>
          <label for="profile-bio">Bio <span>Προαιρετικό</span></label><textarea id="profile-bio" maxlength="500" rows="4" placeholder="Γράψε ό,τι θέλεις να γνωρίζει ο Echo για σένα">${escapeHtml(identity.bio || '')}</textarea>
          <label for="profile-pronouns">Αντωνυμίες</label><select id="profile-pronouns" name="pronouns">${Object.entries(pronounLabels).map(([value, label]) => `<option value="${value}" ${identity.pronouns === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <label for="profile-custom-pronouns" id="profile-custom-pronouns-label" ${identity.pronouns === 'other' ? '' : 'hidden'}>${language === 'en' ? 'Your pronouns' : 'Οι αντωνυμίες σου'}</label><input id="profile-custom-pronouns" maxlength="80" value="${escapeHtml(identity.custom_pronouns || '')}" placeholder="${language === 'en' ? 'e.g. xe/xem' : 'π.χ. εκείνο/εκείνου'}" ${identity.pronouns === 'other' ? '' : 'hidden'}>
          <div class="profile-dialog-actions"><button type="button" class="button-secondary" id="cancel-profile-identity">Ακύρωση</button><button class="button-primary" id="save-profile-identity" type="submit" disabled>Αποθήκευση</button></div>
        </form>
      </dialog>
      <section class="profile-panel profile-facts-panel"><div class="profile-panel-heading"><div><h2>Τα στοιχεία που γνωρίζει ο Echo για σένα</h2></div><span class="profile-count-badge">${confirmedItems.length}</span></div>${confirmedGroups || '<p class="profile-empty-state">Δεν υπάρχουν ακόμη επιβεβαιωμένα στοιχεία.</p>'}</section>
      <section class="profile-panel profile-review-panel ${proposedItems.length ? 'has-pending' : ''}"><div class="profile-panel-heading"><div><h2>Στοιχεία προς έγκριση</h2><p>Στοιχεία που απαιτούν επιβεβαίωση</p></div><span class="profile-count-badge ${proposedItems.length ? 'has-pending' : ''}">${proposedItems.length}</span></div>${proposedItems.length ? `<p class="profile-review-summary ${proposedItems.length > 1 ? 'multiple' : ''}">${proposedItems.length === 1 ? 'Υπάρχει' : 'Υπάρχουν'} ${pendingCount} ${proposedItems.length === 1 ? 'στοιχείο που αναμένει' : 'στοιχεία που αναμένουν'} επιβεβαίωση.</p>` : '<p class="profile-empty-state"><span aria-hidden="true">✓</span> Όλα τα στοιχεία έχουν επιβεβαιωθεί.</p>'}${proposedGroups}</section>
      <details class="profile-panel profile-settings-panel"><summary class="profile-toggle"><div><h2>Ρυθμίσεις προφίλ</h2><p>Τρόπος απάντησης του Echo.</p></div><span class="profile-toggle-icon" aria-hidden="true">+</span></summary><div class="profile-settings-grid"><section class="profile-tool-card"><h3>Προτιμήσεις απάντησης</h3><p>Επίλεξε το μήκος και τον τόνο του Echo.</p><form id="profile-preferences-form" class="profile-preferences-form"><label>Μήκος απάντησης<select name="response_length"><option value="concise" ${identity.response_length === 'concise' ? 'selected' : ''}>Σύντομη</option><option value="detailed" ${identity.response_length === 'detailed' ? 'selected' : ''}>Αναλυτική</option></select></label><label>Τόνος<select name="response_tone"><option value="friendly" ${identity.response_tone === 'friendly' ? 'selected' : ''}>Φιλικός</option><option value="formal" ${identity.response_tone === 'formal' ? 'selected' : ''}>Επίσημος</option></select></label><button class="button-primary" type="submit">Αποθήκευση προτιμήσεων</button></form></section></div></details>`;

    const identityDialog = document.querySelector('#profile-identity-dialog');
    const identityForm = document.querySelector('#profile-identity-form');
    const identityFields = ['#profile-display-name', '#profile-bio', '#profile-pronouns', '#profile-custom-pronouns'].map((selector) => document.querySelector(selector));
    const identitySnapshot = JSON.stringify([identity.display_name || state.name, identity.bio || '', identity.pronouns || 'neutral', identity.custom_pronouns || '']);
    const updateIdentitySaveState = () => {
      const current = JSON.stringify([identityFields[0].value.trim(), identityFields[1].value.trim(), identityFields[2].value, identityFields[2].value === 'other' ? identityFields[3].value.trim() : '']);
      document.querySelector('#save-profile-identity').disabled = current === identitySnapshot || !identityFields[0].value.trim() || (identityFields[2].value === 'other' && !identityFields[3].value.trim());
    };
    document.querySelector('#open-profile-identity').addEventListener('click', () => identityDialog.showModal());
    document.querySelectorAll('#cancel-profile-identity, .profile-dialog-close').forEach((button) => button.addEventListener('click', () => identityDialog.close()));
    identityFields.forEach((field) => field.addEventListener('input', updateIdentitySaveState));
    identityFields[2].addEventListener('change', () => {
      const isOther = identityFields[2].value === 'other';
      document.querySelector('#profile-custom-pronouns-label').hidden = !isOther;
      identityFields[3].hidden = !isOther;
      updateIdentitySaveState();
    });
    identityForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const [name, bio, pronouns, custom_pronouns] = identityFields.map((field) => field.value.trim());
      const result = await profileRequest('/api/profile/identity', 'PUT', { name, bio, pronouns, custom_pronouns: pronouns === 'other' ? custom_pronouns : '' });
      state.name = result.name;
      localStorage.setItem('twinName', state.name);
      await loadProfileSection();
    });
    document.querySelector('#profile-preferences-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await profileRequest('/api/profile/preferences', 'PUT', Object.fromEntries(new FormData(event.currentTarget)));
      await loadProfileSection();
    });
    document.querySelectorAll('[data-profile-action]').forEach((button) => button.addEventListener('click', async () => {
      const itemId = button.dataset.itemId;
      const action = button.dataset.profileAction;
      if (action === 'delete') await profileRequest(`/api/profile/items/${itemId}`, 'DELETE');
      else {
        const value = document.querySelector(`[data-profile-value="${itemId}"]`).value.trim();
        const status = action === 'confirm' ? 'confirmed' : action === 'reject' ? 'rejected' : 'corrected';
        await profileRequest(`/api/profile/items/${itemId}`, 'PATCH', { value, status });
      }
      await loadProfileSection();
    }));
  } catch (error) { root.innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Δεν φορτώθηκε το προφίλ.')}</p>`; }
}

async function loadAddProfileContent(identityReady = Promise.resolve()) {
  const root = document.querySelector('#add-profile-content');
  if (!root) return;
  await identityReady;
  try {
    const profileResponse = await fetch('/api/profile');
    const profile = await profileResponse.json();
    if (!profileResponse.ok) throw new Error(profile.detail || 'Δεν φορτώθηκαν τα στοιχεία προφίλ.');
    const items = profile.items || [];
    const totalItems = items.filter((item) => item.status !== 'rejected').length;
    root.innerHTML = `
      <details class="profile-panel profile-tools-panel add-profile-tools"><summary class="profile-toggle"><div><h2>Εμπλούτισε το προφίλ σου</h2><p>Πρόσθεσε στοιχεία που ο Echo θα θυμάται στις επόμενες ερωτήσεις σου.</p></div><span class="profile-toggle-trailing"><span class="profile-item-total ${totalItems <= 6 ? 'is-low' : totalItems <= 12 ? 'is-medium' : 'is-high'}">${totalItems}</span><span class="profile-toggle-icon" aria-hidden="true">+</span></span></summary><div class="profile-tools-grid add-profile-tools-grid">
        <section class="profile-tool-card"><h3>Πρόσθεσε στοιχείο</h3><p>Γράψε κάτι που θέλεις να λαμβάνει υπόψη ο Echo.</p><form id="profile-add-form" class="profile-add-form"><label>Κατηγορία<select name="category">${Object.entries(profileCategoryLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label for="profile-add-value">Πληροφορία</label><textarea id="profile-add-value" name="value" rows="2" maxlength="500" required placeholder="Πρόσθεσε ένα στοιχείο στο προφίλ σου"></textarea><button class="button-primary" type="submit">Προσθήκη στοιχείου</button></form></section>
        <section class="profile-tool-card"><h3>Γνώρισέ με καλύτερα</h3><p>Απάντησε σε όποιες ερωτήσεις θέλεις. Οι απαντήσεις αποθηκεύονται στο προφίλ σου και μπορείς να τις ρωτήσεις στο chat.</p><form id="profile-followup-form" class="profile-add-form"><label for="followup-goal">Τι θα ήθελες να πετύχεις ή να βελτιώσεις;</label><textarea id="followup-goal" name="goals" rows="2" maxlength="500" placeholder="π.χ. Θέλω να τρέχω πιο γρήγορα"></textarea><label for="followup-interest">Τι σε ενδιαφέρει αυτό τον καιρό;</label><textarea id="followup-interest" name="interests" rows="2" maxlength="500" placeholder="π.χ. Μου αρέσει η ορειβασία"></textarea><label for="followup-focus">Ποια δεξιότητα ή εργασία θέλεις να έχει υπόψη ο Echo;</label><textarea id="followup-focus" name="skills" rows="2" maxlength="500" placeholder="π.χ. Μαθαίνω Python για ανάλυση δεδομένων"></textarea><button class="button-primary" type="submit">Αποθήκευση απαντήσεων</button><p id="followup-status" class="mode-status" aria-live="polite"></p></form></section>
        <section class="profile-tool-card"><h3>Πρόσθεσε διασύνδεση στον Γράφο</h3><p>Καταχώρισε κάποιον που γνωρίζεις και πώς συνδέεστε. Η σχέση και τα προαιρετικά στοιχεία του θα εμφανιστούν στον Γράφο.</p><form id="profile-connection-form" class="profile-add-form"><label for="connection-person-name">Όνομα</label><input id="connection-person-name" name="name" maxlength="160" required placeholder="π.χ. Άννα Παπαδοπούλου"><label for="connection-predicate">Πώς συνδέεστε;</label><input id="connection-predicate" name="predicate" maxlength="120" required placeholder="π.χ. είναι φίλη με"><label for="connection-details">Πώς γνωρίζεστε; <span>Προαιρετικό</span></label><textarea id="connection-details" name="details" rows="2" maxlength="500" placeholder="π.χ. Γνωριστήκαμε στο πανεπιστήμιο"></textarea><label for="connection-role">Εργασία ή ρόλος <span>Προαιρετικό</span></label><input id="connection-role" name="role" maxlength="220" placeholder="π.χ. Μηχανικός λογισμικού"><label for="connection-workplace">Οργανισμός <span>Προαιρετικό</span></label><input id="connection-workplace" name="workplace" maxlength="220" placeholder="π.χ. Acme Ltd"><label for="connection-email">Email <span>Προαιρετικό</span></label><input id="connection-email" name="email" type="email" maxlength="220" placeholder="name@example.com"><button class="button-primary" type="submit">Προσθήκη στον Γράφο</button><p id="connection-status" class="mode-status" aria-live="polite"></p></form></section>
        <section class="profile-tool-card"><h3>Ανέβασε CV</h3><p>Το αρχείο θα αποθηκευτεί στις Πηγές και θα παραμείνει αναζητήσιμο. Οι προτάσεις του θα χρειαστούν έγκριση.</p><form id="profile-cv-form"><input type="file" id="profile-cv-file" accept=".txt,.pdf,text/plain,application/pdf"><label class="privacy-ack-label"><input type="checkbox" id="cv-privacy-ack">Καταλαβαίνω τον τρόπο επεξεργασίας των δεδομένων μου.</label><button class="button-primary" id="profile-cv-submit" type="submit" disabled>Εξαγωγή προτάσεων για έλεγχο</button><p id="cv-privacy-message" class="cv-privacy-message" aria-live="polite">Έλεγχος ενεργής λειτουργίας…</p><p id="cv-status" class="mode-status" aria-live="polite"></p></form></section>
      </div></details>`;

    root.querySelector('#profile-add-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await profileRequest('/api/profile/items', 'POST', { status: 'confirmed', source_type: 'manual', items: [{ category: formData.get('category'), value: formData.get('value') }] });
      await loadAddProfileContent();
      await loadProfileSection();
      showUploadPopup('success', 'Το στοιχείο αποθηκεύτηκε στο προφίλ σου. Ο Echo μπορεί να το χρησιμοποιήσει στις ερωτήσεις σου.');
    });
    root.querySelector('#profile-followup-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const items = [...new FormData(form).entries()].filter(([, value]) => String(value).trim()).map(([category, value]) => ({ category, value: String(value).trim() }));
      const status = root.querySelector('#followup-status');
      if (!items.length) { status.textContent = 'Συμπλήρωσε τουλάχιστον μία απάντηση.'; return; }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await profileRequest('/api/profile/items', 'POST', { status: 'confirmed', source_type: 'manual', items });
        await Promise.all([loadAddProfileContent(), loadProfileSection()]);
        showUploadPopup('success', `Αποθηκεύτηκαν ${items.length} απαντήσεις στο προφίλ σου. Μπορείς να ρωτήσεις τον Echo γι’ αυτές.`);
      } catch (error) { status.textContent = error.message || 'Δεν αποθηκεύτηκαν οι απαντήσεις.'; button.disabled = false; }
    });
    root.querySelector('#profile-connection-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = root.querySelector('#connection-status');
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await profileRequest('/api/relationships/manual', 'POST', Object.fromEntries(new FormData(form)));
        await loadGraphSection();
        await loadAddProfileContent();
        showUploadPopup('success', 'Η διασύνδεση αποθηκεύτηκε και προστέθηκε στον Γράφο.');
      } catch (error) { status.textContent = error.message || 'Δεν αποθηκεύτηκε η διασύνδεση.'; button.disabled = false; }
    });
    const cvForm = root.querySelector('#profile-cv-form');
    const cvFile = root.querySelector('#profile-cv-file');
    const cvAck = root.querySelector('#cv-privacy-ack');
    const cvSubmit = root.querySelector('#profile-cv-submit');
    const privacyMessage = root.querySelector('#cv-privacy-message');
    let cloudUnavailable = false;
    let modeReady = false;
    fetch('/api/config').then((result) => result.json()).then((config) => {
      cloudUnavailable = config.mode === 'openai' && !config.openai_available;
      privacyMessage.classList.toggle('is-cloud', config.mode === 'openai');
      privacyMessage.textContent = config.mode === 'openai'
        ? `Προειδοποίηση: Με OpenAI, το περιεχόμενο του CV αποστέλλεται στην OpenAI για επεξεργασία και ενδέχεται να υπάρξει χρέωση. Το αρχικό αρχείο αποθηκεύεται τοπικά.${cloudUnavailable ? ' Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.' : ''}`
        : 'Προειδοποίηση: Με Ollama, το CV αναλύεται τοπικά και δεν αποστέλλεται στην OpenAI. Το αρχικό αρχείο αποθηκεύεται τοπικά.';
      modeReady = true;
      updateCvButton();
    }).catch(() => { privacyMessage.textContent = 'Δεν ήταν δυνατός ο έλεγχος ενεργής λειτουργίας.'; cvSubmit.disabled = true; });
    const updateCvButton = () => { cvSubmit.disabled = !modeReady || cloudUnavailable || !cvAck.checked || !cvFile.files.length; };
    cvFile.addEventListener('change', updateCvButton);
    cvAck.addEventListener('change', updateCvButton);
    cvForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!modeReady || cloudUnavailable || !cvFile.files.length || !cvAck.checked) return;
      cvSubmit.disabled = true;
      root.querySelector('#cv-status').textContent = 'Ανάγνωση αρχείου και δημιουργία προτάσεων…';
      const form = new FormData();
      form.append('file', cvFile.files[0]);
      try {
        const response = await fetch('/api/profile/cv?privacy_ack=true', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Δεν αναλύθηκε το αρχείο.');
        await Promise.all([loadAddProfileContent(), refreshUploadedFiles()]);
      } catch (error) {
        root.querySelector('#cv-status').textContent = error.message || 'Δεν αναλύθηκε το αρχείο.';
        updateCvButton();
      }
    });
  } catch (error) { root.innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Δεν φορτώθηκαν τα έγγραφα και τα εργαλεία προφίλ.')}</p>`; }
}

async function profileRequest(url, method, data) {
  const response = await fetch(url, { method, ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Δεν αποθηκεύτηκαν οι αλλαγές στο προφίλ.');
  return result;
}

async function loadGraphSection() {
  const root = document.querySelector('#graph-page-content');
  if (!root) return;
  try {
    const response = await fetch('/api/relationships');
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν φορτώθηκαν οι σχέσεις.');
    const rows = (result.relationships || []).filter((item) => item.status !== 'rejected');
    const userName = result.user_name || 'Εγώ';
    const normalizeName = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el').trim();
    const isSelfName = (value) => normalizeName(value) === normalizeName(userName) || ['εγω', 'εμενα', 'μου', 'i', 'me', 'myself', 'ο χρηστης', 'η χρηστρια'].includes(normalizeName(value));
    const nodes = new Map([['__self__', { key: '__self__', name: userName, isSelf: true, type: 'person', attributes: result.user_attributes || {} }]]);
    const getNode = (item, side) => {
      const rawName = side === 'subject' ? item.subject_name : item.object_name || item.object_value;
      const name = rawName || 'Άγνωστη οντότητα';
      const isSelf = (side === 'subject' ? item.subject_is_self : item.object_is_self) || isSelfName(name);
      const type = side === 'subject' ? item.subject_type : item.object_type || 'topic';
      const attributeKey = side === 'subject' ? 'subject_attributes' : 'object_attributes';
      const attributes = item[attributeKey] || {};
      const profileName = type === 'person' ? [attributes.first_name, attributes.last_name].filter(Boolean).join(' ') : '';
      const nodeName = profileName || name;
      const personKey = type === 'person' ? normalizeName(profileName || name) : '';
      const key = isSelf ? '__self__' : `${type}:${personKey || normalizeName(name)}`;
      if (!nodes.has(key)) nodes.set(key, { key, name: nodeName, isSelf: false, type, attributes });
      else if (!isSelf) nodes.set(key, { ...nodes.get(key), name: profileName || nodes.get(key).name, attributes: { ...nodes.get(key).attributes, ...attributes } });
      if (isSelf && item[attributeKey]) nodes.get('__self__').attributes = { ...nodes.get('__self__').attributes, ...item[attributeKey] };
      return key;
    };
    const edges = rows.map((item) => ({ item, from: getNode(item, 'subject'), to: getNode(item, 'object') }));
    const personNodes = [...nodes.values()].filter((node) => node.type === 'person');
    const displayEdges = edges.filter(({ from, to }) => nodes.get(from)?.type === 'person' && nodes.get(to)?.type === 'person');
    const sharedContexts = new Map();
    edges.forEach((edge) => {
      const person = nodes.get(edge.from), context = nodes.get(edge.to);
      if (person?.type !== 'person' || context?.type !== 'event' || edge.item.predicate !== 'συμμετέχει στο') return;
      if (!sharedContexts.has(edge.to)) sharedContexts.set(edge.to, []);
      sharedContexts.get(edge.to).push(edge);
    });
    sharedContexts.forEach((members, contextKey) => {
      const uniqueMembers = [...new Map(members.map((edge) => [edge.from, edge])).values()];
      for (let index = 0; index < uniqueMembers.length; index += 1) {
        for (let other = index + 1; other < uniqueMembers.length; other += 1) {
          const left = uniqueMembers[index], right = uniqueMembers[other];
          if (displayEdges.some((edge) => (edge.from === left.from && edge.to === right.from) || (edge.from === right.from && edge.to === left.from))) continue;
          const contextName = nodes.get(contextKey).name;
          displayEdges.push({
            from: left.from, to: right.from,
            item: { id: `shared:${contextKey}:${left.from}:${right.from}`, predicate: 'συμμετέχουν στο ίδιο συμβούλιο', status: 'derived', source_name: 'Κοινό στοιχείο από δύο αρχεία', source_excerpt: `${left.item.subject_name} συμμετέχει στο «${contextName}» (${left.item.source_name}). ${right.item.subject_name} συμμετέχει στο ίδιο «${contextName}» (${right.item.source_name}).` },
          });
        }
      }
    });
    const width = 900, height = 600, center = { x: width / 2, y: height / 2 };
    const otherNodes = personNodes.filter((node) => !node.isSelf);
    nodes.get('__self__').x = center.x;
    nodes.get('__self__').y = center.y;
    const radiusX = otherNodes.length > 6 ? 330 : 260;
    const radiusY = otherNodes.length > 6 ? 225 : 205;
    otherNodes.forEach((node, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(otherNodes.length, 1);
      node.x = center.x + Math.cos(angle) * radiusX;
      node.y = center.y + Math.sin(angle) * radiusY;
    });
    const edgeMarkup = displayEdges.map(({ item, from, to }, index) => {
      const a = nodes.get(from), b = nodes.get(to);
      const label = item.predicate || 'συνδέεται με';
      const labelWidth = Math.min(205, Math.max(74, label.length * 7 + 20));
      const accessibleLabel = `${a.isSelf ? 'Εγώ' : a.name} ${label} ${b.isSelf ? 'Εγώ' : b.name}`;
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
      const side = index % 2 ? 1 : -1;
      const lx = Math.max(110, Math.min(width - 110, (a.x + b.x) / 2 + side * (-dy / length) * 17));
      const ly = Math.max(34, Math.min(height - 34, (a.y + b.y) / 2 + side * (dx / length) * 17));
      const edgeClass = item.status === 'proposed' ? 'is-proposed' : item.status === 'derived' ? 'is-derived' : 'is-confirmed';
      return `<g class="graph-edge ${edgeClass}" data-graph-edge="${escapeHtml(String(item.id))}" tabindex="0" role="button" aria-label="${escapeHtml(accessibleLabel)}"><line class="graph-edge-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="graph-edge-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><rect class="graph-edge-label-bg" x="${lx - labelWidth / 2}" y="${ly - 13}" width="${labelWidth}" height="26" rx="13"/><text class="graph-edge-label" x="${lx}" y="${ly + 4}">${escapeHtml(label.length > 25 ? `${label.slice(0, 22)}…` : label)}</text></g>`;
    }).join('');
    const nodeMarkup = personNodes.map((node) => {
      const label = node.isSelf ? (userName.length < 10 ? `Εγώ · ${userName}` : 'Εγώ') : node.name;
      const visibleLabel = label.length > 18 ? `${label.slice(0, 16)}…` : label;
      return `<g class="graph-node ${node.isSelf ? 'is-self' : ''}" data-graph-node="${escapeHtml(node.key)}" tabindex="0" role="button" aria-label="Προφίλ ${escapeHtml(node.isSelf ? `Εγώ, ${userName}` : node.name)}" transform="translate(${node.x} ${node.y})"><title>${escapeHtml(node.isSelf ? `Εγώ · ${userName}` : node.name)}</title><circle r="${node.isSelf ? 58 : 48}"/><text y="5">${escapeHtml(visibleLabel)}</text></g>`;
    }).join('');
    root.innerHTML = `<section class="graph-panel"><div class="graph-canvas-wrap"><svg class="relationship-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Γράφος προσώπων με κέντρο το προφίλ σου">${edgeMarkup}${nodeMarkup}</svg><div class="graph-person-tooltip" id="graph-person-tooltip" hidden></div>${personNodes.length <= 1 ? '<p class="graph-empty-hint">Δεν βρέθηκαν ακόμη άλλα πρόσωπα με τεκμηριωμένες σχέσεις στα αρχεία σου.</p>' : ''}</div><aside class="graph-edge-details" id="graph-edge-details" aria-live="polite"><h2>Οι διασυνδέσεις σου</h2><p>${displayEdges.length ? `Εμφανίζονται ${personNodes.length} πρόσωπα και ${displayEdges.length} συνδέσεις. Οι πληροφορίες εργασίας, ρόλου και ομάδας φαίνονται όταν επιλέξεις μια σύνδεση.` : 'Οι σχέσεις που θα εξαχθούν από τα αρχεία σου θα εμφανιστούν εδώ.'}</p><button class="button-primary" id="find-job-path" type="button">Βρες σύνδεση με τη θέση εργασίας</button><div id="job-path-result" aria-live="polite"></div></aside></section>`;
    const details = root.querySelector('#graph-edge-details');
    const renderPersonCard = (node) => {
      const fields = [['Όνομα', node.attributes.first_name], ['Επώνυμο', node.attributes.last_name], ['Ηλικία', node.attributes.age], ['Εργασία', node.attributes.workplace], ['Ρόλος', node.attributes.role], ['Email', node.attributes.email], ['Ενδιαφέροντα', node.attributes.interests], ['Στόχοι', node.attributes.goals], ['Δεξιότητες', node.attributes.skills]];
      const fullName = node.isSelf ? userName : node.name;
      return `<article class="connection-person-card">${node.isSelf ? '<p class="connection-you-label">Εσύ</p>' : ''}<div class="connection-person-avatar" aria-hidden="true"><svg viewBox="0 0 32 32"><circle cx="16" cy="10" r="5"/><path d="M5 29c1-6 4.6-9 11-9s10 3 11 9"/></svg></div><h3>${escapeHtml(fullName || 'N/A')}</h3><dl>${fields.map(([label, value]) => `<div><dt>${label}:</dt><dd>${escapeHtml(value || 'N/A')}</dd></div>`).join('')}</dl></article>`;
    };
    const showEdge = (id) => {
      const edge = displayEdges.find((candidate) => String(candidate.item.id) === String(id));
      if (!edge) return;
      const { item, from, to } = edge;
      const left = nodes.get(from), right = nodes.get(to);
      document.querySelector('#connection-popup')?.remove();
      document.body.insertAdjacentHTML('beforeend', `<div class="connection-popup-backdrop" id="connection-popup"><section class="connection-popup" role="dialog" aria-modal="true" aria-labelledby="connection-popup-title"><button type="button" class="connection-popup-close" aria-label="Κλείσιμο">×</button><div class="connection-person-pair">${renderPersonCard(left)}${renderPersonCard(right)}</div><h2 id="connection-popup-title">Σύνδεση</h2><div class="connection-summary"><strong>${escapeHtml(item.predicate)}</strong><span>${item.status === 'proposed' ? 'Πρόταση προς έλεγχο' : item.status === 'derived' ? 'Σύνδεση από κοινό στοιχείο' : 'Επιβεβαιωμένη σύνδεση'}</span></div><p class="graph-detail-source">Πηγή: ${escapeHtml(item.source_name)}${item.source_page ? ` · σελίδα ${item.source_page}` : ''}${item.source_removed ? ' · το αρχείο αφαιρέθηκε' : ''}</p>${item.source_excerpt ? `<blockquote>${escapeHtml(item.source_excerpt)}</blockquote>` : ''}${item.status === 'proposed' ? `<div class="profile-item-actions"><button class="button-primary relationship-action" data-relationship-action="confirmed" data-relationship-id="${item.id}">Έγκριση σχέσης</button><button class="button-secondary relationship-action" data-relationship-action="rejected" data-relationship-id="${item.id}">Απόρριψη</button></div>` : ''}</section></div>`);
      const popup = document.querySelector('#connection-popup');
      const close = () => popup.remove();
      popup.querySelector('.connection-popup-close').addEventListener('click', close);
      popup.addEventListener('click', (event) => { if (event.target === popup) close(); });
      popup.querySelectorAll('[data-relationship-action]').forEach((button) => button.addEventListener('click', async () => {
        button.disabled = true;
        try { await profileRequest(`/api/relationships/${button.dataset.relationshipId}`, 'PATCH', { status: button.dataset.relationshipAction }); close(); await loadGraphSection(); }
        catch (error) { button.disabled = false; button.textContent = error.message || 'Δεν αποθηκεύτηκε η επιλογή.'; }
      }));
    };
    const tooltip = root.querySelector('#graph-person-tooltip');
    const showPerson = (key) => {
      const node = nodes.get(key);
      if (!node) return;
      tooltip.innerHTML = `<strong>${escapeHtml(node.isSelf ? 'Εσύ' : node.name)}</strong><dl>${[['Όνομα', node.attributes.first_name], ['Επώνυμο', node.attributes.last_name], ['Ηλικία', node.attributes.age], ['Εργασία', node.attributes.workplace], ['Ρόλος', node.attributes.role], ['Email', node.attributes.email], ['Ενδιαφέροντα', node.attributes.interests], ['Στόχοι', node.attributes.goals], ['Δεξιότητες', node.attributes.skills]].map(([label, value]) => `<div><dt>${label}:</dt><dd>${escapeHtml(value || 'N/A')}</dd></div>`).join('')}</dl>`;
      tooltip.hidden = false;
    };
    root.querySelectorAll('[data-graph-node]').forEach((node) => {
      node.addEventListener('mouseenter', () => showPerson(node.dataset.graphNode));
      node.addEventListener('focus', () => showPerson(node.dataset.graphNode));
      node.addEventListener('mouseleave', () => { tooltip.hidden = true; });
      node.addEventListener('blur', () => { tooltip.hidden = true; });
    });
    const pathResult = root.querySelector('#job-path-result');
    root.querySelector('#find-job-path')?.addEventListener('click', async () => {
      const targets = [...nodes.values()].filter((node) => node.attributes.hiring_for);
      if (!targets.length) { pathResult.innerHTML = '<p>Δεν βρέθηκε ακόμη επιβεβαιωμένη θέση εργασίας στα προφίλ του φακέλου Συνδέσεις.</p>'; return; }
      const adjacency = new Map([...nodes.keys()].map((key) => [key, []]));
      edges.forEach((edge) => { adjacency.get(edge.from)?.push({ key: edge.to, edge }); adjacency.get(edge.to)?.push({ key: edge.from, edge }); });
      const pending = [{ key: '__self__', cost: 0 }], previous = new Map([['__self__', null]]), bestCost = new Map([['__self__', 0]]);
      let target = null;
      while (pending.length && !target) {
        pending.sort((a, b) => a.cost - b.cost);
        const { key: current, cost } = pending.shift();
        if (cost !== bestCost.get(current)) continue;
        if (targets.some((node) => node.key === current)) { target = current; break; }
        for (const next of adjacency.get(current) || []) {
          const nextNode = nodes.get(next.key);
          const sharedCircle = /council|committee|forum|συμβουλ|επιτροπ|κοινοτητ/i.test(nextNode?.name || '');
          const weight = nextNode?.type === 'organization' && !sharedCircle ? 3 : nextNode?.type === 'person' ? 1 : 1.25;
          const nextCost = cost + weight;
          if (nextCost < (bestCost.get(next.key) ?? Infinity)) {
            bestCost.set(next.key, nextCost);
            previous.set(next.key, { key: current, edge: next.edge });
            pending.push({ key: next.key, cost: nextCost });
          }
        }
      }
      if (!target) { pathResult.innerHTML = '<p>Δεν βρέθηκε διαδρομή από εσένα προς τον hiring manager στα στοιχεία που έχουν εξαχθεί.</p>'; return; }
      const steps = [];
      for (let current = target; current !== '__self__';) { const step = previous.get(current); steps.unshift(step.edge); current = step.key; }
      const targetNode = nodes.get(target);
      const pathText = steps.map((step) => {
        const source = step.item.source_name;
        return `<li><strong>${escapeHtml(step.item.subject_name)} ${escapeHtml(step.item.predicate)} ${escapeHtml(step.item.object_name || step.item.object_value || '')}</strong><small>${escapeHtml(source)} · ${step.item.status === 'proposed' ? 'προς επιβεβαίωση' : 'επιβεβαιωμένο'}${step.item.source_excerpt ? ` · «${escapeHtml(step.item.source_excerpt)}»` : ''}</small></li>`;
      }).join('');
      const filesResponse = await fetch('/api/files');
      const filesResult = await filesResponse.json();
      const cvFiles = (filesResult.files || []).filter((file) => /\.(pdf|txt)$/i.test(file.name) && /(cv|resume|βιογραφ)/i.test(file.name) && !/^connections-/i.test(file.name));
      const hiring = targetNode.attributes.hiring_for;
      const emailSubject = `Ενδιαφέρον για θέση ${hiring}`;
      const fullName = userName;
      const targetFullName = [targetNode.attributes.first_name, targetNode.attributes.last_name].filter(Boolean).join(' ') || targetNode.name;
      const emailBody = `Καλησπέρα κ. ${targetNode.attributes.last_name || targetNode.name},\n\nΕπικοινωνώ σχετικά με τη θέση ${hiring} στην ${targetNode.attributes.workplace || 'ομάδα σας'}. Εντόπισα τη σχετική ευκαιρία μέσα από το επαγγελματικό μου δίκτυο: ${steps.map((step) => `${step.item.subject_name} ${step.item.predicate} ${step.item.object_name || step.item.object_value || ''}`).join(' · ')}.\n\nΘα χαρώ να συζητήσουμε αν η εμπειρία μου ταιριάζει στις ανάγκες της ομάδας. Επισυνάπτω το βιογραφικό μου.\n\nΜε εκτίμηση,\n${fullName}`;
      pathResult.innerHTML = `<section class="job-path-card"><h3>Προτεινόμενη διαδρομή προς ${escapeHtml(targetFullName)}</h3><ol>${pathText}</ol><p>Η σύνδεση αξιοποιεί μόνο τα στοιχεία και τα αποσπάσματα των πηγών. Τα βήματα που εμφανίζονται ως προτάσεις χρειάζονται έγκριση.</p><label for="path-cv-select">CV προς επισύναψη</label><select id="path-cv-select">${cvFiles.map((file) => `<option value="${escapeHtml(file.name)}">${escapeHtml(file.name)}</option>`).join('')}</select>${cvFiles.length ? `<a class="button-primary" id="download-email-draft" href="#">Κατέβασε προσχέδιο email με CV</a><p class="job-path-email">Προς: ${escapeHtml(targetNode.attributes.email || 'N/A')} · Θέμα: ${escapeHtml(emailSubject)}</p>` : '<p>Δεν βρέθηκε CV. Ανέβασε πρώτα το βιογραφικό σου στην ενότητα Προσθήκη.</p>'}</section>`;
      pathResult.dataset.email = targetNode.attributes.email || '';
      pathResult.dataset.subject = emailSubject;
      pathResult.dataset.body = emailBody;
      pathResult.querySelector('#download-email-draft')?.addEventListener('click', async (event) => {
        event.preventDefault();
        const cvName = pathResult.querySelector('#path-cv-select').value;
        if (!pathResult.dataset.email || !cvName) { pathResult.querySelector('.job-path-email').textContent = 'Χρειάζεται έγκυρο email προορισμού και αρχείο CV.'; return; }
        try {
          const draftResponse = await fetch('/api/email-draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: pathResult.dataset.email, subject: pathResult.dataset.subject, body: pathResult.dataset.body, cv_name: cvName }) });
          if (!draftResponse.ok) { const error = await draftResponse.json(); throw new Error(error.detail || 'Δεν δημιουργήθηκε το προσχέδιο.'); }
          const blob = await draftResponse.blob();
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a'); link.href = url; link.download = 'Echo-email-draft.eml'; link.click(); URL.revokeObjectURL(url);
        } catch (error) { pathResult.querySelector('.job-path-email').textContent = error.message || 'Δεν δημιουργήθηκε το προσχέδιο.'; }
      });
    });
    root.querySelectorAll('[data-graph-edge]').forEach((edge) => {
      edge.addEventListener('click', () => showEdge(edge.dataset.graphEdge));
      edge.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showEdge(edge.dataset.graphEdge); } });
    });
  } catch (error) { root.innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Δεν φορτώθηκαν οι σχέσεις.')}</p>`; }
}

function setupConnectionFolderImport() {
  const picker = document.querySelector('#connections-folder');
  const button = document.querySelector('#analyze-connections');
  const status = document.querySelector('#connections-status');
  const progress = document.querySelector('#connections-progress');
  if (!picker || !button || !status || !progress) return;
  picker.addEventListener('change', () => {
    const files = [...picker.files];
    button.disabled = files.length === 0 || files.some((file) => !/\.(txt|pdf)$/i.test(file.name));
    status.textContent = files.length ? `${files.length} αρχεία επιλέχθηκαν.` : '';
    progress.hidden = true;
  });
  button.addEventListener('click', async () => {
    const files = [...picker.files];
    if (!files.length) return;
    button.disabled = true;
    progress.hidden = false;
    progress.max = 100;
    progress.value = 0;
    status.textContent = `Μεταφόρτωση 0% · 0 από ${files.length} αρχεία.`;
    try {
      const form = new FormData();
      files.forEach((file) => form.append('files', file, `connections-${file.name}`));
      const uploadResult = await uploadWithProgress(form, (loaded, total) => {
        const percent = Math.min(100, Math.round((loaded / total) * 100));
        progress.max = 100;
        progress.value = percent;
        status.textContent = `Μεταφόρτωση ${percent}% των δεδομένων.`;
      });
      status.textContent = `Η μεταφόρτωση ολοκληρώθηκε. Ο server αποθηκεύει και προετοιμάζει ${uploadResult.added.length} αρχεία…`;
      picker.value = '';
      await refreshConnectionFiles();
      const extractResponse = await fetch('/api/connections/extract', { method: 'POST' });
      const extractResult = await extractResponse.json();
      if (!extractResponse.ok) throw new Error(extractResult.detail || 'Δεν ολοκληρώθηκε η εξαγωγή σχέσεων.');
      progress.max = extractResult.total;
      progress.value = 0;
      let job = extractResult;
      while (job.status === 'running') {
        status.textContent = `Εξαγωγή σχέσεων · αρχείο ${Math.min(job.processed + 1, job.total)} από ${job.total}${job.current_file ? ` · ${job.current_file}` : ''}`;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        const jobResponse = await fetch(`/api/connections/jobs/${encodeURIComponent(job.job_id)}`);
        job = await jobResponse.json();
        if (!jobResponse.ok) throw new Error(job.detail || 'Δεν βρέθηκε η εργασία εξαγωγής.');
        progress.value = job.processed;
      }
      if (job.status !== 'complete') throw new Error(job.error || 'Η εξαγωγή σχέσεων απέτυχε.');
      const proposals = job.relationship_proposals || 0;
      const profiles = job.person_profiles || 0;
      status.textContent = `Εξήχθησαν ${profiles} προφίλ και ${proposals} σχέσεις από ${job.total} αρχεία. Οι νέες ακμές εμφανίζονται ως προτάσεις προς έλεγχο.${job.errors?.length ? ` Δεν αναλύθηκαν: ${job.errors.map((entry) => entry.name).join(', ')}.` : ''}`;
      await refreshConnectionFiles();
      await loadGraphSection();
    } catch (error) {
      status.textContent = getApiErrorMessage(error);
    } finally {
      button.disabled = picker.files.length === 0;
    }
  });
}

function renderMain() {
  const identityReady = syncProfileIdentity();
  const content = {
    Guidance: `<h1>Καθοδήγηση</h1><p class="subheading">Συνομίλησε με τον Echo. Κάνε ερωτήσεις με βάση τα αρχεία σου ή για θέματα που σχετίζονται με εσένα. Οι συνομιλίες αποθηκεύονται σε αυτή τη συσκευή.</p>${retrievalDebugEnabled ? '<p class="retrieval-debug-notice">Λειτουργία διάγνωσης retrieval ενεργή — λεπτομέρειες εμφανίζονται κάτω από κάθε απάντηση.</p>' : ''}<div class="guidance-chat"><div id="guidance-answer" class="guidance-response" aria-live="polite"></div><div class="chat-box guidance-question-box"><form id="guidance-form"><label class="sr-only" for="guidance-question">Η ερώτησή σου</label><textarea id="guidance-question" required placeholder="Ρώτησε οτιδήποτε"></textarea><div class="guidance-composer-footer"><button class="button-secondary" id="clear-guidance-history" type="button">Νέα συνομιλία</button><span class="guidance-model"><i></i><span id="guidance-model-name">Φόρτωση μοντέλου…</span></span><button class="guidance-send" id="guidance-submit" aria-label="Αποστολή ερώτησης" title="Αποστολή ερώτησης">↑</button></div></form></div></div>`,
    Add: `<h1>Προσθήκη</h1><p class="subheading">Ανέβασε αρχεία ή πρόσθεσε στοιχεία που ο Echo θα χρησιμοποιεί για να απαντά εκ μέρους σου.</p>${state.showFirstFilePrompt ? '<p class="first-file-notice">Ξεκίνα προσθέτοντας το πρώτο σου αρχείο.</p>' : ''}<div class="chat-box"><div class="file-picker-control" id="file-picker-control"><label class="file-picker-label" for="text-files">Επίλεξε αρχεία .txt ή PDF</label><input id="text-files" type="file" accept=".txt,.pdf,text/plain,application/pdf" multiple></div><p class="file-size-hint">Έως 10 MB ανά αρχείο. Τα σαρωμένα PDF χρειάζονται OCR και μπορεί να διαρκέσουν περισσότερο. Η αναγνώριση γίνεται τοπικά.</p><button class="button-primary" id="add-files" type="button">Επεξεργασία αρχείων</button></div><section class="profile-panel uploaded-files-section"><div class="profile-panel-heading"><div><h2>Αρχεία και προτάσεις</h2><p>Τα αρχεία που ανεβάζεις εμφανίζονται εδώ. Πάτησε το όνομα για προεπισκόπηση στην αρχική μορφή. Η εξαγωγή προτάσεων βρίσκει στοιχεία για έλεγχο στο Προφίλ και σχέσεις στον Γράφο.</p><button class="button-secondary extract-all-files-button" id="extract-all-files" type="button" disabled>Εξαγωγή προτάσεων για έλεγχο όλων</button><p id="extract-all-files-status" class="bulk-extract-status" aria-live="polite"></p></div></div><div id="uploaded-files"></div></section><div id="add-profile-content" class="profile-page-content">Φόρτωση στοιχείων προφίλ…</div>`,
    Graph: `<h1>Ο γράφος σου</h1><p class="subheading">Ο γράφος των διασυνδέσεων σου</p><section class="connection-import"><div><strong>Φάκελος «Συνδέσεις»</strong><p>Επίλεξε φάκελο με προφίλ TXT/PDF για εξαγωγή προσώπων και σχέσεων. Αν η λειτουργία είναι Cloud, τα κείμενα αποστέλλονται στον πάροχο επεξεργασίας.</p></div><label class="button-secondary connection-folder-picker">Επιλογή φακέλου<input id="connections-folder" type="file" accept=".txt,.pdf,text/plain,application/pdf" webkitdirectory directory multiple></label><button class="button-primary" id="analyze-connections" type="button" disabled>Εξαγωγή σχέσεων</button><progress id="connections-progress" class="connections-progress" max="100" value="0" hidden></progress><p id="connections-status" aria-live="polite"></p></section><section class="profile-panel connection-files-panel"><div class="profile-panel-heading"><div><h2>Αρχεία διασυνδέσεων</h2><p>Τα αρχεία που φορτώθηκαν από τον φάκελο Συνδέσεις εμφανίζονται εδώ. Άνοιξε το όνομα για προεπισκόπηση ή αφαίρεσε ένα αρχείο.</p><button class="button-secondary extract-all-files-button" id="extract-all-connection-files" type="button" disabled>Εξαγωγή προτάσεων για έλεγχο όλων</button><p id="extract-all-connection-files-status" class="bulk-extract-status" aria-live="polite"></p></div></div><div id="connection-files"></div></section><div id="graph-page-content" class="profile-page-content">Φόρτωση σχέσεων…</div>`,
    Profile: `<h1>Το <span class="profile-title-accent">προφίλ</span> σου</h1><p class="subheading">Ο Echo χρησιμοποιεί τα εγκεκριμένα στοιχεία για να σου απαντά.</p><div id="profile-page-content" class="profile-page-content">Φόρτωση προφίλ…</div>`,
    Settings: `<h1>Ρυθμίσεις</h1><section class="openai-key-settings profile-panel"><h2>Σύνδεση με OpenAI</h2><p>Πρόσθεσε το API key σου για να χρησιμοποιείς το OpenAI στο chat και στην επεξεργασία αρχείων.</p><p class="key-privacy-note">Το key αποθηκεύεται μόνο σε αυτή τη συσκευή και δεν εμφανίζεται ξανά. Όταν ενεργοποιήσεις το OpenAI, τα επιλεγμένα αποσπάσματα και τα αρχεία που αναλύονται αποστέλλονται στην OpenAI. Η χρήση API μπορεί να χρεωθεί ξεχωριστά από τη συνδρομή ChatGPT.</p><form id="openai-key-form"><label for="openai-api-key">OpenAI API key</label><div class="api-key-input-row"><input id="openai-api-key" name="key" type="password" autocomplete="new-password" placeholder="sk-…" required><button class="button-primary" type="submit" id="save-openai-key">Έλεγχος και αποθήκευση</button></div></form><p id="openai-key-status" class="mode-status" aria-live="polite">Έλεγχος ρύθμισης…</p><button class="button-primary" id="activate-openai" type="button" hidden>Ενεργοποίηση OpenAI</button><button class="button-secondary" id="remove-openai-key" type="button" hidden>Αφαίρεση API key</button><progress id="openai-key-progress" class="mode-progress" max="100" value="0" hidden></progress><p id="openai-key-progress-status" class="mode-status" aria-live="polite"></p></section><section class="reset-card"><div class="reset-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2"/></svg></div><div><p class="reset-card-kicker">ΝΕΑ ΑΡΧΗ</p><h2>Ξεκίνα το demo από την αρχή</h2><p>Διαγράφει το προφίλ, τις προτιμήσεις, τις συνομιλίες, τα αρχεία και τη μνήμη του Echo και σε επιστρέφει στα welcome slides.</p><button class="reset-demo-button" id="reset-demo">Επανεκκίνηση demo</button></div></section>`,
  };

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">${twinName}<span> · AI εαυτός</span></div>
        <nav class="nav" aria-label="Κύριες ενότητες">${sections.map((section) => `<button class="nav-item ${state.section === section.id ? 'active' : ''}" data-section="${section.id}">${section.label}</button>`).join('')}</nav>
        <button class="settings-button" id="open-settings" aria-label="Άνοιγμα ρυθμίσεων" title="Ρυθμίσεις">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="m19.4 13.5 1.1.85-1.1 1.9-1.35-.48a7.9 7.9 0 0 1-1.35.78l-.24 1.42h-2.2l-.25-1.42a7.9 7.9 0 0 1-1.55 0l-.25 1.42h-2.2l-.24-1.42a7.9 7.9 0 0 1-1.35-.78l-1.35.48-1.1-1.9 1.1-.85a7.7 7.7 0 0 1 0-1.55l-1.1-.85 1.1-1.9 1.35.48a7.9 7.9 0 0 1 1.35-.78l.24-1.42h2.2l.25 1.42a7.9 7.9 0 0 1 1.55 0l.25-1.42h2.2l.24 1.42a7.9 7.9 0 0 1 1.35.78l1.35-.48 1.1 1.9-1.1.85a7.7 7.7 0 0 1 0 1.55Z"/></svg>
        </button>
      </header>
      <section class="page ${state.section === 'Guidance' ? `guidance-page ${localStorage.getItem(guidanceStartedStorageKey) === 'true' ? 'has-conversation' : 'is-empty'}` : ''}">${content[state.section]}</section>
    </div>`;

  if (state.section === 'Profile') loadProfileSection(identityReady);
  if (state.section === 'Settings') setupOpenAIKeySettings();
  if (state.section === 'Graph') {
    loadGraphSection();
    setupConnectionFolderImport();
    refreshConnectionFiles();
    document.querySelector('#extract-all-connection-files')?.addEventListener('click', (event) => {
      extractAllFileSuggestions(true, event.currentTarget, document.querySelector('#extract-all-connection-files-status'));
    });
  }

  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.section = button.dataset.section;
      localStorage.setItem('echoLastSection', state.section);
      render();
      if (state.section === 'Guidance' && !hasSeenSectionPopup(state.section)) {
        showSectionIntro(state.section);
      } else if (tourCopy[state.section] && !hasSeenSectionPopup(state.section)) {
        showTour(state.section);
      }
    });
  });

  if (state.section === 'Add') {
    loadAddProfileContent(identityReady);
    document.querySelector('#extract-all-files')?.addEventListener('click', (event) => {
      extractAllFileSuggestions(false, event.currentTarget, document.querySelector('#extract-all-files-status'));
    });
    const chatBox = document.querySelector('.page .chat-box');
    chatBox.insertAdjacentHTML('beforebegin', `
      <section class="chat-box processing-mode-panel" aria-labelledby="processing-mode-title">
        <h2 id="processing-mode-title">Διάλεξε πώς θα επεξεργάζεται ο Echo τα δεδομένα σου</h2>
        <select id="processing-mode" hidden aria-hidden="true" tabindex="-1"><option value="openai">openai</option><option value="ollama">ollama</option></select>
        <div class="processing-mode-options">
          <button class="choice-card mode-card" type="button" data-mode-choice="openai" aria-pressed="false">
            <h3><span>Cloud με OpenAI</span><small class="active-mode-badge" data-active-badge="openai" hidden>ΕΝΕΡΓΗ</small></h3>
            <p>Γρήγορο, με επεξεργασία δεδομένων στο cloud.</p>
            <small class="mode-note">Τα αρχεία και οι ερωτήσεις επεξεργάζονται στην <strong>OpenAI</strong> με το <strong>API key της ομάδας</strong>. Απαιτείται <strong>internet</strong>· τυχόν χρέωση αφορά τον λογαριασμό που διαχειρίζεται το key.</small>
            <small class="mode-availability" id="openai-availability" aria-live="polite"></small>
            <small class="mode-privacy">Ταχύτερη επιλογή</small>
          </button>
          <button class="choice-card mode-card" type="button" data-mode-choice="ollama" aria-pressed="false">
            <h3><span>Τοπικά με Ollama</span><small class="active-mode-badge" data-active-badge="ollama" hidden>ΕΝΕΡΓΗ</small></h3>
            <p>Τα αρχεία και οι ερωτήσεις σου επεξεργάζονται <strong>τοπικά</strong>. Η λειτουργία απαιτεί <strong>εγκατάσταση</strong> του τοπικού AI.</p>
            <small class="mode-privacy">Αυξημένη προστασία</small>
          </button>
        </div>
        <div class="mode-action-row"><div><strong>Αλλαγή λειτουργίας</strong><p>Ο Echo θα προετοιμάσει ξανά τα αρχεία σου. Θα σε ρωτήσουμε πριν ξεκινήσει.</p></div><button id="apply-mode" class="mode-apply-button" type="button">Αλλαγή λειτουργίας <span>→</span></button></div>
        <p id="provider-hint" class="mode-status" aria-live="polite">Φόρτωση τρέχουσας λειτουργίας…</p>
        <progress id="mode-progress" class="mode-progress" max="100" value="0" hidden></progress>
      </section>`);
    const modeSelect = document.querySelector('#processing-mode');
    let activeMode = null;
    let openaiAvailable = false;
    const syncUploadAvailability = () => {
      const unavailable = activeMode === 'openai' && !openaiAvailable;
      const fileInput = document.querySelector('#text-files');
      const uploadButton = document.querySelector('#add-files');
      if (fileInput) fileInput.disabled = unavailable;
      if (uploadButton) uploadButton.disabled = unavailable;
      if (unavailable) document.querySelector('#provider-hint').textContent = 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.';
    };
    const syncModeCards = () => {
      document.querySelectorAll('[data-mode-choice]').forEach((card) => {
        const selected = card.dataset.modeChoice === modeSelect.value;
        card.classList.toggle('selected', selected);
        card.setAttribute('aria-pressed', String(selected));
        const badge = card.querySelector('[data-active-badge]');
        badge.hidden = card.dataset.modeChoice !== activeMode;
      });
    };
    const updateModeAction = () => {
      const selected = modeSelect.value;
      const label = selected === 'openai' ? 'Cloud με OpenAI' : 'Τοπικά με Ollama';
      const action = document.querySelector('#apply-mode');
      const alreadyActive = selected === activeMode;
      const cloudUnavailable = selected === 'openai' && !openaiAvailable;
      action.innerHTML = alreadyActive || cloudUnavailable
        ? `${cloudUnavailable && !alreadyActive ? 'Cloud μη διαθέσιμο' : `Αλλαγή σε ${label}`} <svg class="mode-action-icon lock-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"></rect><path d="M8 10V7a4 4 0 1 1 8 0v3"></path></svg>`
        : `Αλλαγή σε ${label} <svg class="mode-action-icon arrow-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h17M13 5l7 7-7 7"></path></svg>`;
      action.disabled = alreadyActive || cloudUnavailable;
      action.title = alreadyActive ? 'Αυτή η λειτουργία είναι ήδη ενεργή.' : cloudUnavailable ? 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.' : '';
    };
    document.querySelectorAll('[data-mode-choice]').forEach((card) => card.addEventListener('click', () => {
      modeSelect.value = card.dataset.modeChoice;
      syncModeCards();
      updateModeAction();
      document.querySelector('#provider-hint').textContent = modeSelect.value === 'openai' && !openaiAvailable
        ? 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.'
        : '';
    }));
    fetch('/api/config').then((response) => response.json()).then((config) => {
      openaiAvailable = Boolean(config.openai_available);
      document.querySelector('#openai-availability').textContent = openaiAvailable ? '' : (config.openai_message || 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.');
      activeMode = config.mode;
      modeSelect.value = config.mode;
      syncModeCards();
      updateModeAction();
      syncUploadAvailability();
      if (openaiAvailable || config.mode !== 'openai') document.querySelector('#provider-hint').textContent = '';
    }).catch(() => { document.querySelector('#openai-availability').textContent = 'Δεν ήταν δυνατός ο έλεγχος διαθεσιμότητας Cloud.'; });
    document.querySelector('#apply-mode').addEventListener('click', async (event) => {
      const mode = document.querySelector('#processing-mode').value;
      const button = event.currentTarget;
      if (!button.dataset.confirmed) {
        showModeSwitchConfirmation(mode, () => { button.dataset.confirmed = 'true'; button.click(); });
        return;
      }
      delete button.dataset.confirmed;
      const hint = document.querySelector('#provider-hint');
      const progress = document.querySelector('#mode-progress');
      button.disabled = true;
      progress.hidden = false;
      progress.value = 0;
      hint.textContent = 'Ξεκινά επανεπεξεργασία όλων των αρχείων. Τα αρχικά αρχεία διατηρούνται.';
      try {
        const response = await fetch('/api/mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }) });
        const job = await response.json();
        if (!response.ok) throw new Error(job.detail || 'Δεν ξεκίνησε η αλλαγή λειτουργίας.');
        if (job.status === 'unchanged') { hint.textContent = 'Η λειτουργία είναι ήδη ενεργή και συμβατή.'; return; }
        let status = job;
        while (status.status === 'running') {
          progress.value = status.total ? Math.round(status.processed / status.total * 100) : 100;
          hint.textContent = status.total ? `Επανεπεξεργασία ${status.processed}/${status.total}${status.current_file ? ` · ${status.current_file}` : ''}` : 'Δεν υπάρχουν αρχεία για επανεπεξεργασία.';
          await new Promise((resolve) => setTimeout(resolve, 700));
          const poll = await fetch(`/api/mode/jobs/${job.job_id}`);
          status = await poll.json();
        }
        if (status.status !== 'complete') throw new Error(status.error || 'Η αλλαγή απέτυχε. Τα προηγούμενα embeddings διατηρήθηκαν.');
        progress.value = 100;
        activeMode = mode;
        modeSelect.value = mode;
        syncModeCards();
        updateModeAction();
        syncUploadAvailability();
        hint.textContent = `Έτοιμο: ${status.processed} αρχεία επεξεργάστηκαν με ${mode === 'openai' ? 'OpenAI' : 'Ollama'}.`;
        await refreshUploadedFiles();
        await loadAddProfileContent();
      } catch (error) {
        hint.textContent = `${error.message || 'Η αλλαγή λειτουργίας απέτυχε.'} Τα προηγούμενα αρχεία και embeddings παραμένουν. Διόρθωσε το πρόβλημα και πάτησε ξανά εφαρμογή.`;
        try { const config = await (await fetch('/api/config')).json(); openaiAvailable = Boolean(config.openai_available); activeMode = config.mode; modeSelect.value = config.mode; syncModeCards(); updateModeAction(); syncUploadAvailability(); } catch {}
      }
      finally { updateModeAction(); }
    });
    document.querySelector('#add-files').addEventListener('click', addSelectedTextFiles);
    refreshUploadedFiles();
  }

  if (state.section === 'Guidance') {
    const questionInput = document.querySelector('#guidance-question');
    const submitButton = document.querySelector('#guidance-submit');
    const answerOutput = document.querySelector('#guidance-answer');
    const clearHistoryButton = document.querySelector('#clear-guidance-history');
    const renderDebug = (debug) => {
      if (!retrievalDebugEnabled || !debug) return '';
      const timings = Object.entries(debug.timings_ms || {}).map(([name, value]) => `${name}: ${value} ms`).join(' · ');
      const candidates = (debug.candidates || []).map((item, index) => `<li><strong>#${index + 1} · ${escapeHtml(item.file)}${item.page ? ` · σελ. ${item.page}` : ''} · score ${item.score}</strong><span>${item.selected ? 'Επιλέχθηκε' : item.eligible ? 'Σχετικό, δεν επιλέχθηκε' : 'Κάτω από το όριο'}</span><p>${escapeHtml(item.text)}</p></li>`).join('');
      return `<details class="retrieval-debug-panel" open><summary>Debug retrieval · ${escapeHtml(debug.path)} · ${debug.selected_chunks ?? 0} επιλεγμένα</summary><p>${escapeHtml(timings)}</p><ul>${candidates || '<li>Δεν ανακτήθηκαν υποψήφια αποσπάσματα.</li>'}</ul></details>`;
    };
    const cleanAnswer = (answer) => String(answer || '').replace(/^(?:Σύμφωνα\s+με|Με\s+βάση)\s+(?:το|τη|την|τα|τις)\s+[^:\n]+:\s*/i, '').trim();
    const renderTurn = (question, answer, sources = [], debug = null, typing = false) => {
      const documentFiles = [...new Set(sources.filter((source) => source.kind === 'document').map((source) => (source.label || source.file || 'έγγραφο').replace(/\s+·\s+σελίδα\s+\d+$/i, '')))];
      const documentFileKeys = new Set(documentFiles.map((file) => file.toLocaleLowerCase()));
      const otherSources = sources.filter((source) => {
        if (source.kind === 'document') return false;
        const label = (source.label || source.file || '').replace(/\s+·\s+σελίδα\s+\d+$/i, '');
        return !documentFileKeys.has(label.toLocaleLowerCase());
      });
      const answerUsesGeneralKnowledge = sources.some((source) => source.kind === 'general');
      const answerUsesDemoGuide = sources.some((source) => source.kind === 'demo');
      const answerUsesClock = sources.some((source) => source.kind === 'clock');
      const hint = answerUsesGeneralKnowledge
        ? 'Ο Echo απαντά με γενική γνώση και συλλογισμό, χωρίς να βασίζεται σε προσωπικά αρχεία ή στοιχεία προφίλ.'
        : answerUsesDemoGuide
          ? 'Ο Echo απάντησε με βάση τον οδηγό του demo· δεν αναζήτησε προσωπικά αρχεία.'
          : answerUsesClock
            ? 'Η ώρα προέρχεται από το ρολόι του demo, με ζώνη ώρας Αθήνας.'
          : documentFiles.length && otherSources.length
        ? `<span>Η απάντηση βασίστηκε στις διαθέσιμες πληροφορίες από:</span><ul class="answer-origin-list">${otherSources.map((source) => {
          const label = source.label || source.file || 'Προφίλ';
          const separatorIndex = label.indexOf(' · ');
          if (label.startsWith('Προφίλ') && separatorIndex !== -1) return `<li><strong>Προφίλ:</strong> ${escapeHtml(label.slice(separatorIndex + 3))}</li>`;
          return `<li>${escapeHtml(label)}</li>`;
        }).join('')}${documentFiles.map((file) => `<li><strong>Αρχείο:</strong> ${escapeHtml(file)}</li>`).join('')}</ul>`
        : documentFiles.length === 1
        ? `Η απάντηση προέκυψε από το επιβεβαιωμένο αρχείο ${escapeHtml(documentFiles[0])}.`
        : documentFiles.length > 1
          ? `Η απάντηση προέκυψε από τα επιβεβαιωμένα αρχεία ${documentFiles.map(escapeHtml).join(', ')}.`
          : sources.length
            ? `<span>Η απάντηση βασίστηκε στις διαθέσιμες πληροφορίες από:</span><ul class="answer-origin-list">${sources.map((source) => {
              const label = source.label || source.file || 'Προφίλ';
              const separatorIndex = label.indexOf(' · ');
              if (label.startsWith('Προφίλ') && separatorIndex !== -1) return `<li><strong>Προφίλ:</strong> ${escapeHtml(label.slice(separatorIndex + 3))}</li>`;
              return `<li>${escapeHtml(label)}</li>`;
            }).join('')}</ul>`
            : 'Ο Echo διαμόρφωσε την απάντηση με βάση το ερώτημά σου και τις διαθέσιμες πληροφορίες. Δεν υπάρχουν συγκεκριμένες πηγές για αυτή την απάντηση.';
      return `<article class="guidance-turn"><div class="guidance-user-message"><small>${escapeHtml(state.name || 'Εσύ')}</small><p>${escapeHtml(question)}</p></div><article class="echo-message"><small class="echo-name">Echo</small><p class="answer-text">${typing ? '' : escapeHtml(cleanAnswer(answer))}</p><details class="answer-hint"><summary><span class="answer-hint-icon" aria-hidden="true">✦</span>Πώς προέκυψε</summary><div class="answer-hint-content">${hint}</div></details></article>${renderDebug(debug)}</article>`;
    };
    const typeAnswer = (element, answer) => {
      const text = cleanAnswer(answer);
      let index = 0;
      const timer = window.setInterval(() => {
        index = Math.min(text.length, index + 3);
        element.textContent = text.slice(0, index);
        answerOutput.scrollTop = answerOutput.scrollHeight;
        if (index >= text.length) window.clearInterval(timer);
      }, 12);
    };
    submitButton.disabled = true;
    questionInput.disabled = true;
    const resizeQuestion = () => { questionInput.style.height = 'auto'; questionInput.style.height = `${Math.min(questionInput.scrollHeight, 180)}px`; };
    const updateSubmitState = () => {
      const hasText = Boolean(questionInput.value.trim());
      submitButton.classList.toggle('has-text', hasText);
      submitButton.disabled = !hasText || questionInput.disabled || answerOutput.getAttribute('aria-busy') === 'true';
    };
    questionInput.addEventListener('input', () => { resizeQuestion(); updateSubmitState(); });
    questionInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!submitButton.disabled && questionInput.value.trim()) document.querySelector('#guidance-form').requestSubmit();
      }
    });
    answerOutput.textContent = 'Έλεγχος διαθεσιμότητας λειτουργίας…';
    Promise.all([fetch('/api/config').then((response) => response.json()), identityReady]).then(([config]) => {
      if (config.mode === 'openai' && !config.openai_available) {
        answerOutput.textContent = config.openai_message || 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.';
        return;
      }
      questionInput.disabled = false;
      updateSubmitState();
      document.querySelector('#guidance-model-name').textContent = config.mode === 'openai' ? 'OpenAI' : 'Ollama';
      fetch(`/api/chat/history?session_id=${encodeURIComponent(guidanceSessionId)}`).then((response) => response.json()).then(({ messages }) => {
        const turns = [];
        for (let index = 0; index < messages.length; index += 2) {
          if (messages[index]?.role === 'user' && messages[index + 1]?.role === 'assistant') turns.push(renderTurn(messages[index].content, messages[index + 1].content, messages[index + 1].sources || []));
        }
        answerOutput.innerHTML = turns.join('');
        const guidancePage = document.querySelector('.guidance-page');
        if (turns.length) {
          localStorage.setItem(guidanceStartedStorageKey, 'true');
          guidancePage.classList.replace('is-empty', 'has-conversation');
        } else {
          localStorage.removeItem(guidanceStartedStorageKey);
          guidancePage.classList.replace('has-conversation', 'is-empty');
        }
        answerOutput.scrollTop = answerOutput.scrollHeight;
      }).catch(() => { answerOutput.textContent = 'Δεν φορτώθηκε το ιστορικό συνομιλίας.'; });
    }).catch(() => { answerOutput.textContent = 'Δεν ήταν δυνατός ο έλεγχος διαθεσιμότητας λειτουργίας.'; });
    clearHistoryButton.addEventListener('click', async () => {
      clearHistoryButton.disabled = true;
      try {
        const response = await fetch(`/api/chat/history?session_id=${encodeURIComponent(guidanceSessionId)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Δεν διαγράφηκε το ιστορικό.');
        answerOutput.innerHTML = '';
        questionInput.value = '';
        localStorage.removeItem(guidanceStartedStorageKey);
        updateSubmitState();
        document.querySelector('.guidance-page').classList.replace('has-conversation', 'is-empty');
        resizeQuestion();
      } catch (error) { answerOutput.textContent = error.message || 'Δεν διαγράφηκε το ιστορικό.'; }
      finally { clearHistoryButton.disabled = false; }
    });
    document.querySelector('#guidance-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const output = document.querySelector('#guidance-answer');
      const question = questionInput.value.trim();
      if (!question) return;
      localStorage.setItem(guidanceStartedStorageKey, 'true');
      document.querySelector('.guidance-page').classList.replace('is-empty', 'has-conversation');
      output.setAttribute('aria-busy', 'true');
      updateSubmitState();
      const controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 75000);
      const pending = document.createElement('div');
      pending.innerHTML = `<article class="guidance-turn"><div class="guidance-user-message"><small>Εσύ</small><p>${escapeHtml(question)}</p></div><article class="answer-card"><h2>Απάντηση Echo</h2><div class="thinking-card" role="status"><div class="thinking-label"><span class="thinking-orb" aria-hidden="true"></span><span>Ο Echo σκέφτεται</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="thinking-track" aria-hidden="true"><span></span></div></div></article></article>`;
      const turn = pending.firstElementChild;
      output.append(turn);
      output.scrollTop = output.scrollHeight;
      try {
        let persona = {};
        try { persona = JSON.parse(localStorage.getItem('echoPersona') || '{}'); } catch {}
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, session_id: guidanceSessionId, debug: retrievalDebugEnabled, persona }), signal: controller.signal });
        const result = await response.json();
        if (!response.ok) {
          const detail = Array.isArray(result.detail) ? result.detail.map((item) => item.msg || '').filter(Boolean).join(' · ') : result.detail;
          throw new Error(detail || 'Δεν ολοκληρώθηκε η ερώτηση.');
        }
        turn.outerHTML = renderTurn(question, result.answer, result.sources || [], result.retrieval_debug || null, true);
        const answerText = output.querySelector('.guidance-turn:last-child .answer-text');
        if (answerText) typeAnswer(answerText, result.answer);
        output.scrollTop = output.scrollHeight;
        questionInput.value = '';
      } catch (error) {
        const message = error.name === 'AbortError'
          ? 'Η απάντηση άργησε πολύ και σταμάτησα την αναμονή. Έλεγξε ότι το Ollama ή η Cloud λειτουργία είναι διαθέσιμα και δοκίμασε ξανά.'
          : getApiErrorMessage(error);
        turn.innerHTML = `<p class="form-error">${escapeHtml(message)}</p>`;
      }
      finally { window.clearTimeout(requestTimeout); output.setAttribute('aria-busy', 'false'); updateSubmitState(); }
    });
  }

  document.querySelector('#open-settings').addEventListener('click', () => {
    state.section = 'Settings';
    render();
  });

  document.querySelector('#reset-demo')?.addEventListener('click', openResetDemoConfirmation);

  if (state.tour && tourCopy[state.tour]) showTour(state.tour);
}

function setupOpenAIKeySettings() {
  const form = document.querySelector('#openai-key-form');
  if (!form) return;
  const input = document.querySelector('#openai-api-key');
  const status = document.querySelector('#openai-key-status');
  const activate = document.querySelector('#activate-openai');
  const remove = document.querySelector('#remove-openai-key');
  const save = document.querySelector('#save-openai-key');

  fetch('/api/config').then((response) => response.json()).then((config) => {
    status.textContent = config.openai_available ? 'Υπάρχει αποθηκευμένο API key.' : 'Δεν έχει συνδεθεί API key.';
    activate.hidden = !config.openai_available || config.mode === 'openai';
    remove.hidden = !config.openai_available;
    if (config.mode === 'openai') status.textContent += ' Το OpenAI είναι ενεργό.';
  }).catch(() => { status.textContent = 'Δεν ήταν δυνατός ο έλεγχος της σύνδεσης.'; });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    status.textContent = 'Έλεγχος API key…';
    try {
      const response = await fetch('/api/settings/openai-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: input.value.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Δεν αποθηκεύτηκε το API key.');
      input.value = '';
      status.textContent = result.message;
      activate.hidden = false;
      remove.hidden = false;
    } catch (error) { status.textContent = error.message || 'Δεν αποθηκεύτηκε το API key.'; }
    finally { save.disabled = false; }
  });

  activate.addEventListener('click', async () => {
    if (!window.confirm('Η ενεργοποίηση στέλνει τα απαραίτητα αποσπάσματα αρχείων στην OpenAI, επανεπεξεργάζεται τα embeddings και μπορεί να χρεωθεί. Συνέχεια;')) return;
    const progress = document.querySelector('#openai-key-progress');
    const progressStatus = document.querySelector('#openai-key-progress-status');
    activate.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    try {
      const response = await fetch('/api/mode', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'openai' }) });
      let job = await response.json();
      if (!response.ok) throw new Error(job.detail || 'Δεν ενεργοποιήθηκε το OpenAI.');
      while (job.status === 'running') {
        progress.max = Math.max(1, job.total || 1);
        progress.value = job.processed || 0;
        progressStatus.textContent = `Επεξεργασία ${job.processed || 0}/${job.total || 0}${job.current_file ? ` · ${job.current_file}` : ''}`;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const poll = await fetch(`/api/mode/jobs/${encodeURIComponent(job.job_id)}`);
        job = await poll.json();
        if (!poll.ok) throw new Error(job.detail || 'Δεν βρέθηκε η εργασία αλλαγής λειτουργίας.');
      }
      if (job.status !== 'complete' && job.status !== 'unchanged') throw new Error(job.error || 'Δεν ολοκληρώθηκε η αλλαγή λειτουργίας.');
      progress.value = progress.max;
      progressStatus.textContent = 'Το OpenAI είναι ενεργό για το chat και τις επόμενες επεξεργασίες.';
      activate.hidden = true;
      remove.hidden = true;
    } catch (error) {
      progressStatus.textContent = `${error.message || 'Δεν ενεργοποιήθηκε το OpenAI.'} Τα προηγούμενα embeddings διατηρούνται.`;
      activate.disabled = false;
    }
  });

  remove.addEventListener('click', async () => {
    if (!window.confirm('Να αφαιρεθεί το API key από αυτή τη συσκευή;')) return;
    remove.disabled = true;
    try {
      const response = await fetch('/api/settings/openai-key', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || 'Δεν αφαιρέθηκε το API key.');
      status.textContent = 'Το API key αφαιρέθηκε από αυτή τη συσκευή.';
      activate.hidden = true;
      remove.hidden = true;
    } catch (error) { status.textContent = error.message || 'Δεν αφαιρέθηκε το API key.'; }
    finally { remove.disabled = false; }
  });
}

function openResetDemoConfirmation() {
  const modalId = 'reset-demo-confirmation';
  document.querySelector(`#${modalId}`)?.remove();
  document.body.insertAdjacentHTML('beforeend', `<div class="mode-confirmation-backdrop reset-confirmation-backdrop" id="${modalId}"><section class="mode-confirmation-dialog reset-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-demo-title"><span class="reset-warning-icon" aria-hidden="true">!</span><span class="mode-confirmation-label">ΠΡΟΣΟΧΗ · ΟΡΙΣΤΙΚΗ ΔΙΑΓΡΑΦΗ</span><h2 id="reset-demo-title">Θέλεις να ξεκινήσεις όλο το demo από την αρχή;</h2><p>Θα διαγραφούν οριστικά το όνομα και το προφίλ σου, οι ρυθμίσεις, τα αρχεία, οι συνομιλίες, η μνήμη, οι προτάσεις και οι σχέσεις που αποθηκεύτηκαν σε αυτό το demo.</p><p>Μετά θα επιστρέψεις στα welcome slides, σαν να ανοίγεις το demo για πρώτη φορά.</p><div class="mode-confirmation-actions"><button type="button" class="mode-cancel">Ακύρωση</button><button type="button" class="mode-confirm">Συνέχεια</button></div></section></div>`);
  const modal = document.getElementById(modalId);
  const cancel = () => modal.remove();
  modal.querySelector('.mode-cancel').addEventListener('click', cancel);
  modal.addEventListener('click', (event) => { if (event.target === modal) cancel(); });
  modal.querySelector('.mode-confirm').addEventListener('click', () => {
    modal.querySelector('.mode-confirmation-label').textContent = 'ΤΕΛΙΚΗ ΕΠΙΒΕΒΑΙΩΣΗ';
    modal.querySelector('h2').textContent = 'Είσαι σίγουρος; Δεν μπορεί να αναιρεθεί.';
    modal.querySelectorAll('p').forEach((paragraph) => paragraph.remove());
    const actions = modal.querySelector('.mode-confirmation-actions');
    actions.innerHTML = '<button type="button" class="mode-cancel">Ακύρωση</button><button type="button" class="mode-confirm" disabled>Περίμενε 5 δευτερόλεπτα…</button>';
    const confirmButton = actions.querySelector('.mode-confirm');
    let remaining = 5;
    const countdown = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(countdown); confirmButton.disabled = false; confirmButton.textContent = 'Επιβεβαίωση διαγραφής'; }
      else confirmButton.textContent = `Περίμενε ${remaining} δευτερόλεπτα…`;
    }, 1000);
    const close = () => { clearInterval(countdown); modal.remove(); };
    actions.querySelector('.mode-cancel').addEventListener('click', close);
    confirmButton.addEventListener('click', async () => {
      if (confirmButton.disabled) return;
      confirmButton.disabled = true;
      confirmButton.textContent = 'Γίνεται διαγραφή…';
      try {
        const response = await fetch('/api/demo/reset', { method: 'POST' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Δεν ολοκληρώθηκε η επανεκκίνηση.');
        localStorage.clear();
        sessionStorage.clear();
        location.href = `${location.pathname}?onboarding=1`;
      } catch (error) {
        clearInterval(countdown);
        modal.querySelector('h2').textContent = 'Δεν ολοκληρώθηκε η διαγραφή';
        actions.innerHTML = `<p class="reset-error">${escapeHtml(error.message || 'Παρουσιάστηκε σφάλμα.')}</p><button type="button" class="mode-cancel">Κλείσιμο</button>`;
        actions.querySelector('.mode-cancel').addEventListener('click', close);
      }
    });
  });
}

// Τοποθετεί το ενημερωτικό πλαίσιο κάτω από την καρτέλα της ενότητας και δείχνει προς αυτή.
function placePopupNearSection(popup, section) {
  const navButton = document.querySelector(`[data-section="${section}"]`);
  if (!navButton) return;
  const nav = document.querySelector('.nav');
  const buttonRect = navButton.getBoundingClientRect();
  const navRect = nav.getBoundingClientRect();
  const popupWidth = Math.min(360, window.innerWidth - 32);
  const left = Math.min(
    Math.max(16, buttonRect.left + buttonRect.width / 2 - popupWidth / 2),
    window.innerWidth - popupWidth - 16,
  );

  popup.style.width = `${popupWidth}px`;
  popup.style.left = `${left}px`;
  popup.style.top = `${navRect.bottom + 14}px`;
  popup.style.setProperty('--arrow-left', `${Math.min(Math.max(buttonRect.left + buttonRect.width / 2 - left, 18), popupWidth - 18)}px`);
}

// Δημιουργεί ένα ενημερωτικό πλαίσιο δίπλα στην ενότητα και εκτελεί την ενέργεια κλεισίματος.
function addAnchoredPopup(section, eyebrow, title, message, buttonLabel, onClose = () => {}) {
  app.insertAdjacentHTML('beforeend', `
    <div class="tour-backdrop"></div>
    <aside class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div class="eyebrow">${eyebrow}</div>
      <h2 id="tour-title">${title}</h2>
      <p>${message}</p>
      <div class="tour-actions"><button class="button-primary" id="tour-close">${buttonLabel}</button></div>
    </aside>`);
  const popup = document.querySelector('.tour-card');
  // Η καρτέλα παραμένει ορατή και σε μικρές οθόνες με οριζόντια κύλιση.
  document.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center' });
  placePopupNearSection(popup, section);
  document.querySelector('#tour-close').addEventListener('click', () => {
    onClose();
  });
}

// Προχωρά την πρώτη περιήγηση: Προσθήκη → Προφίλ → Γράφος και μετά επιστρέφει στην Προσθήκη.
function advanceFirstTour(section) {
  if (state.tour === 'Add' && section === 'Add') {
    state.tour = 'Profile';
    state.section = 'Profile';
  } else if (state.tour === 'Profile' && section === 'Profile') {
    state.tour = 'Graph';
    state.section = 'Graph';
  } else if (state.tour === 'Graph' && section === 'Graph') {
    state.tour = null;
    state.section = 'Add';
    state.showFirstFilePrompt = true;
    localStorage.setItem('twinTourCompleteV3', 'true');
  } else {
    state.tour = null;
  }
  render();
}

// Παρουσιάζει μια ενότητα και, στην πρώτη περιήγηση, συνεχίζει στο επόμενο βήμα.
function showTour(section) {
  markSectionPopupSeen(section);
  const sectionLabel = sections.find((item) => item.id === section).label;
  const isLastTourPopup = state.tour === 'Graph' && section === 'Graph';
  const message = isLastTourPopup
    ? `${tourCopy[section]} Όταν κλείσεις αυτό το μήνυμα, θα επιστρέψεις στην Προσθήκη για να βάλεις το πρώτο σου αρχείο.`
    : tourCopy[section];
  addAnchoredPopup(
    section,
    sectionLabel,
    'Τι θα βρεις εδώ',
    message,
    isLastTourPopup ? 'Κλείσιμο' : 'Επόμενο',
    () => advanceFirstTour(section),
  );
}

function showSectionIntro(section) {
  markSectionPopupSeen(section);
  const sectionLabel = sections.find((item) => item.id === section).label;
  const message = 'Εδώ μπορείς να ρωτάς τον Echo για συμβουλές και κατευθύνσεις, αξιοποιώντας πληροφορίες από το προφίλ και τον γράφο σου.';
  addAnchoredPopup(
    section,
    sectionLabel,
    'Ρώτησε τον Echo',
    message,
    'Κλείσιμο',
    () => {
      state.tour = null;
      render();
    },
  );
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function render() {
  if (state.step === 'intro' || state.step === 'welcome') renderWelcome();
  else if (state.step === 'name') renderNameStep();
  else if (state.step === 'onboarding') renderOnboarding();
  else if (state.step === 'onboarding-summary') renderOnboardingSummary();
  else if (state.step === 'onboarding-cv') renderOnboardingCv();
  else if (state.step === 'onboarding-cv-loading') renderOnboardingCvLoading();
  else if (state.step === 'onboarding-finish') renderOnboardingFinish();
  else renderMain();
}

render();
