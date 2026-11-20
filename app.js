const app = document.querySelector('#app');
const initialParams = new URLSearchParams(location.search);
const startOnboarding = initialParams.get('onboarding') === '1';
const legacyOnboardingUrl = initialParams.get('start') === 'onboarding';
if (startOnboarding || legacyOnboardingUrl) {
  localStorage.setItem('echoOnboardingDeferred', 'true');
  history.replaceState(null, '', location.pathname);
}
if (startOnboarding) {
  localStorage.removeItem('twinName');
  localStorage.removeItem('echoPersona');
}
const onboardingDeferred = localStorage.getItem('echoOnboardingDeferred') === 'true';
const sections = [
  { id: 'Connection', label: 'Διασύνδεση' },
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
  section: localStorage.getItem('echoLastSection') || (onboardingDeferred ? 'Profile' : 'Add'),
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
function renderUploadedFiles(files) {
  const list = document.querySelector('#uploaded-files');
  if (!list) return;
  list.innerHTML = files.length
    ? files.map((file) => `
        <article class="uploaded-file">
          <div class="uploaded-file-heading">
            <strong>${escapeHtml(file.name)}</strong>
            <button class="remove-file" type="button" data-remove-file="${escapeHtml(file.name)}">Αφαίρεση</button>
          </div>
          <small>${file.status === 'embedded' ? 'Έτοιμο για αναζήτηση' : 'Αποθηκεύτηκε, αλλά δεν ολοκληρώθηκαν τα embeddings'} · ${escapeHtml(file.provider)} / ${escapeHtml(file.model)} · ${Math.round(file.size / 1024)} KB</small>
          ${file.error ? `<p class="file-processing-error">${escapeHtml(file.error)}</p>` : ''}
          ${file.status !== 'embedded' ? `<button class="retry-embedding" type="button" data-retry-embedding="${escapeHtml(file.name)}">Επανάληψη embeddings</button>` : ''}
          <details><summary>Δες το περιεχόμενο (${file.content.length} χαρακτήρες)</summary><pre>${escapeHtml(file.content)}</pre></details>
          ${file.status === 'embedded' ? `<details class="chunk-details" data-chunks-for="${escapeHtml(file.name)}"><summary>Δες τμήματα και σελίδες πηγής</summary><div class="chunk-list">Άνοιξε για φόρτωση…</div></details>` : ''}
        </article>`).join('')
    : '<p class="empty-files">Δεν έχεις προσθέσει ακόμη αρχεία.</p>';

  list.querySelectorAll('[data-remove-file]').forEach((button) => {
    button.addEventListener('click', () => removeUploadedFile(button.dataset.removeFile));
  });
  list.querySelectorAll('[data-retry-embedding]').forEach((button) => button.addEventListener('click', () => retryFileEmbeddings(button.dataset.retryEmbedding, button)));
  list.querySelectorAll('[data-chunks-for]').forEach((details) => details.addEventListener('toggle', async () => {
    if (!details.open || details.dataset.loaded) return;
    try {
      const response = await fetch(`/api/files/${encodeURIComponent(details.dataset.chunksFor)}/chunks`);
      const { chunks } = await response.json();
      details.querySelector('.chunk-list').innerHTML = chunks.map((chunk) => `<article class="source-chunk"><small>${chunk.page ? `Σελίδα ${chunk.page}` : 'Κείμενο'} · Τμήμα ${chunk.ordinal + 1}</small><p>${escapeHtml(chunk.text)}</p></article>`).join('') || 'Δεν υπάρχουν αποθηκευμένα τμήματα.';
      details.dataset.loaded = 'true';
    } catch { details.querySelector('.chunk-list').textContent = 'Δεν φορτώθηκαν τα τμήματα.'; }
  }));
}

async function retryFileEmbeddings(fileName, button) {
  button.disabled = true;
  button.textContent = 'Δημιουργία embeddings…';
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}/embed`, { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ολοκληρώθηκαν τα embeddings.');
    await refreshUploadedFiles();
    showUploadPopup('success', `Το ${fileName} είναι έτοιμο για αναζήτηση.`);
  } catch (error) { showUploadPopup('error', error.message || 'Δεν ολοκληρώθηκαν τα embeddings.'); }
  finally { button.disabled = false; button.textContent = 'Επανάληψη embeddings'; }
}

// Ζητά από το backend τη λίστα αρχείων και ενημερώνει την οθόνη.
async function refreshUploadedFiles() {
  const list = document.querySelector('#uploaded-files');
  if (location.protocol === 'file:') {
    list.innerHTML = '<p class="backend-unavailable">Άνοιξε την εφαρμογή από <a href="http://127.0.0.1:8000">http://127.0.0.1:8000</a> για σύνδεση με το backend.</p>';
    return false;
  }

  try {
    const response = await fetch('/api/files');
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ήταν δυνατή η φόρτωση των αρχείων.');
    renderUploadedFiles(result.files);
    return true;
  } catch {
    list.innerHTML = '<p class="backend-unavailable">Δεν υπάρχει σύνδεση με το backend. Άφησε ανοιχτό το Terminal όπου τρέχει το `uvicorn` και άνοιξε ξανά την εφαρμογή από <a href="http://127.0.0.1:8000">http://127.0.0.1:8000</a>.</p>';
    return false;
  }
}

// Μετατρέπει σφάλματα σύνδεσης σε οδηγία για την εκκίνηση του backend.
function getApiErrorMessage(error) {
  if (error instanceof TypeError) {
    return 'Δεν μπορώ να συνδεθώ με το backend. Έλεγξε ότι το uvicorn τρέχει και άνοιξε την εφαρμογή από http://127.0.0.1:8000.';
  }
  return error.message || 'Δεν ήταν δυνατή η επικοινωνία με το backend.';
}

// Διαγράφει ένα αποθηκευμένο αρχείο μέσω του backend.
async function removeUploadedFile(fileName) {
  try {
    const response = await fetch(`/api/files/${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.detail || 'Δεν ήταν δυνατή η αφαίρεση του αρχείου.');
    await refreshUploadedFiles();
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
    const response = await fetch('/api/files', { method: 'POST', body: formData });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.detail || 'Δεν ήταν δυνατή η αποθήκευση των αρχείων.');
      error.type = response.status === 409 ? 'warning' : 'error';
      throw error;
    }

    picker.value = '';
    await refreshUploadedFiles();
    const addedCount = result.added.length;
    const failedCount = result.embedding_errors?.length || 0;
    const successMessage = failedCount
      ? `Αποθηκεύτηκαν ${addedCount} αρχεία, αλλά τα embeddings απέτυχαν για ${failedCount}. Το αρχείο παραμένει στη λίστα και μπορείς να δοκιμάσεις ξανά αργότερα.`
      : addedCount === 1 ? 'Το αρχείο αποθηκεύτηκε και είναι έτοιμο για αναζήτηση.' : `Αποθηκεύτηκαν ${addedCount} αρχεία και είναι έτοιμα για αναζήτηση.`;
    showUploadPopup(failedCount ? 'warning' : 'success', successMessage);
  } catch (error) {
    showUploadPopup(error.type || 'error', getApiErrorMessage(error));
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
        await saveOnboardingFacts('confirmed');
        localStorage.setItem('echoPersona', JSON.stringify(persona));
        state.onboardingFacts = [];
        state.step = 'onboarding-cv';
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
      ? `Cloud με OpenAI: το κείμενο θα σταλεί στην OpenAI για εξαγωγή προτάσεων και μπορεί να υπάρξει χρέωση. Το αρχικό αρχείο δεν αποθηκεύεται.${cloudUnavailable ? ' Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.' : ''}`
      : '';
    modeNotice.hidden = config.mode !== 'openai';
    update();
  }).catch(() => { document.querySelector('#onboarding-cv-mode').textContent = 'Δεν ήταν δυνατός ο έλεγχος ενεργής λειτουργίας.'; });
  file.addEventListener('change', update); text.addEventListener('input', update);
  document.querySelector('#onboarding-cv-later').addEventListener('click', () => { state.step = 'main'; state.section = 'Profile'; localStorage.setItem('echoLastSection', 'Profile'); render(); });
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
      state.step = 'main'; state.section = 'Profile'; localStorage.setItem('echoLastSection', 'Profile'); render();
    } catch (error) {
      state.onboardingCvLoading = 'error';
      state.onboardingCvError = error.message || 'Δεν αναλύθηκε το CV.';
      render();
    }
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
      const sourceLabel = item.source_type === 'cv'
        ? `${item.source_name}${item.source_page ? ` · σελίδα ${item.source_page}` : ''}`
        : item.source_type === 'onboarding' ? 'Αρχική γνωριμία' : 'Προσθήκη από εσένα';
      const proposedActions = item.status === 'proposed'
        ? `<button type="button" class="button-primary profile-action" data-profile-action="confirm" data-item-id="${item.id}">Έγκριση</button><button type="button" class="button-secondary profile-action" data-profile-action="reject" data-item-id="${item.id}">Απόρριψη</button>`
        : '';
      return `<article class="profile-item ${item.status === 'proposed' ? 'is-proposed' : ''}">
        <div class="profile-item-heading"><span class="profile-category">${escapeHtml(profileCategoryLabels[item.category] || item.category)}</span><span class="profile-status status-${escapeHtml(item.status)}">${item.status === 'proposed' ? 'Πρόταση · χρειάζεται έλεγχο' : item.status === 'confirmed' ? 'Επιβεβαιωμένο' : item.status === 'corrected' ? 'Διορθωμένο' : 'Απορρίφθηκε'}</span></div>
        <textarea class="profile-item-value" data-profile-value="${item.id}" rows="2">${escapeHtml(item.value)}</textarea>
        <small class="profile-source">Προέλευση: ${escapeHtml(sourceLabel)} · Προστέθηκε ${escapeHtml(new Date(item.created_at).toLocaleDateString('el-GR'))}</small>
        ${item.source_excerpt ? `<details><summary>Δες το απόσπασμα</summary><blockquote>${escapeHtml(item.source_excerpt)}</blockquote></details>` : ''}
        <div class="profile-item-actions">${proposedActions}<button type="button" class="button-secondary profile-action" data-profile-action="save" data-item-id="${item.id}">Αποθήκευση διόρθωσης</button><button type="button" class="text-button danger-text profile-action" data-profile-action="delete" data-item-id="${item.id}">Διαγραφή</button></div>
      </article>`;
    };
    const activeItems = items.filter((item) => item.status !== 'rejected');
    const proposedItems = activeItems.filter((item) => item.status === 'proposed');
    const confirmedItems = activeItems.filter((item) => ['confirmed', 'corrected'].includes(item.status));
    const rejectedItems = items.filter((item) => item.status === 'rejected');
    const totalItems = activeItems.length;
    const renderGroups = (records) => Object.entries(profileCategoryLabels).map(([category, label]) => {
      const group = records.filter((item) => item.category === category);
      return group.length ? `<details class="profile-category-group"><summary class="profile-category-heading"><h3>${label}</h3><span class="profile-toggle-trailing"><span class="profile-item-total ${group.length <= 6 ? 'is-low' : group.length <= 12 ? 'is-medium' : 'is-high'}">${group.length}</span><span class="profile-toggle-icon" aria-hidden="true">+</span></span></summary><div class="profile-category-items">${group.map(renderItem).join('')}</div></details>` : '';
    }).join('');
    const confirmedGroups = renderGroups(confirmedItems);
    const proposedGroups = renderGroups(proposedItems);
    const displayName = identity.display_name || state.name || 'Το προφίλ μου';

    root.innerHTML = `
      <section class="profile-overview">
        <article class="profile-overview-identity"><div class="profile-avatar" aria-hidden="true">${escapeHtml(displayName.slice(0, 1).toUpperCase())}</div><div><span class="profile-kicker">ΤΟ ΠΡΟΦΙΛ ΣΟΥ</span><h2>${escapeHtml(displayName)}</h2><p>Ο Echo χρησιμοποιεί τα εγκεκριμένα στοιχεία για να απαντά εκ μέρους σου.</p></div><span class="profile-confirmed-tag">${identity.identity_confirmed ? 'Ταυτότητα επιβεβαιωμένη' : 'Επιβεβαίωσε την ταυτότητα'}</span></article>
        <div class="profile-stat-grid"><article class="profile-stat"><strong>${confirmedItems.length}</strong><span>Επιβεβαιωμένα στοιχεία</span></article><article class="profile-stat ${proposedItems.length ? 'has-pending' : ''}"><strong>${proposedItems.length}</strong><span>Προς έλεγχο</span></article></div>
      </section>
      <section class="profile-panel profile-facts-panel"><div class="profile-panel-heading"><div><h2>Τα στοιχεία που γνωρίζει ο Echo</h2><p>Επιβεβαιωμένα στοιχεία.</p></div></div>${confirmedGroups || '<p class="profile-empty-state">Δεν υπάρχουν ακόμη επιβεβαιωμένα στοιχεία.</p>'}</section>
      <section class="profile-panel profile-review-panel"><div class="profile-panel-heading"><div><h2>Προς έλεγχο</h2><p>Στοιχεία προς έγκριση</p></div><span class="profile-count-badge ${proposedItems.length ? 'has-pending' : ''}">${proposedItems.length}</span></div>${proposedGroups || '<p class="profile-empty-state"><span aria-hidden="true">✓</span> Όλα τα στοιχεία έχουν ελεγχθεί.</p>'}</section>
      <details class="profile-panel profile-tools-panel"><summary class="profile-toggle"><div><h2>Εμπλούτισε το προφίλ</h2><p>Πρόσθεσε ένα στοιχείο ή ανέβασε το CV σου.</p></div><span class="profile-toggle-trailing"><span class="profile-item-total ${totalItems <= 6 ? 'is-low' : totalItems <= 12 ? 'is-medium' : 'is-high'}">${totalItems}</span><span class="profile-toggle-icon" aria-hidden="true">+</span></span></summary><div class="profile-tools-grid">
        <section class="profile-tool-card"><h3>Πρόσθεσε στοιχείο</h3><p>Γράψε κάτι που θέλεις να λαμβάνει υπόψη ο Echo.</p><form id="profile-add-form" class="profile-add-form"><label>Κατηγορία<select name="category">${Object.entries(profileCategoryLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label for="profile-add-value">Πληροφορία</label><textarea id="profile-add-value" name="value" rows="2" maxlength="500" required placeholder="Πρόσθεσε ένα στοιχείο στο προφίλ σου"></textarea><button class="button-primary" type="submit">Προσθήκη στοιχείου</button></form></section>
        <section class="profile-tool-card"><h3>Ανέβασε CV</h3><p>Το αρχικό αρχείο δεν αποθηκεύεται. Οι προτάσεις θα εμφανιστούν για έλεγχο.</p><p id="cv-privacy-message" class="cv-privacy-message">Έλεγχος ενεργής λειτουργίας…</p><form id="profile-cv-form"><input type="file" id="profile-cv-file" accept=".txt,.pdf,text/plain,application/pdf"><label class="privacy-ack-label"><input type="checkbox" id="cv-privacy-ack">Καταλαβαίνω πού θα επεξεργαστεί το κείμενο του αρχείου.</label><button class="button-primary" id="profile-cv-submit" type="submit" disabled>Εξαγωγή προτάσεων για έλεγχο</button><p id="cv-status" class="mode-status" aria-live="polite"></p></form></section>
      </div></details>
      <details class="profile-panel profile-settings-panel"><summary class="profile-toggle"><div><h2>Ρυθμίσεις προφίλ</h2><p>Όνομα και τρόπος απάντησης του Echo.</p></div><span class="profile-toggle-trailing"><span class="profile-item-total ${totalItems <= 6 ? 'is-low' : totalItems <= 12 ? 'is-medium' : 'is-high'}">${totalItems}</span><span class="profile-toggle-icon" aria-hidden="true">+</span></span></summary><div class="profile-settings-grid"><section class="profile-tool-card"><h3>Ταυτότητα</h3><form id="profile-identity-form" class="profile-inline-form"><label for="profile-display-name">Όνομα</label><input id="profile-display-name" maxlength="48" value="${escapeHtml(identity.display_name || state.name)}" required><button class="button-primary" type="submit">Αποθήκευση</button></form></section><section class="profile-tool-card"><h3>Προτιμήσεις απάντησης</h3><p>Επίλεξε το μήκος και τον τόνο που προτιμάς.</p><form id="profile-preferences-form" class="profile-preferences-form"><label>Μήκος απάντησης<select name="response_length"><option value="concise" ${identity.response_length === 'concise' ? 'selected' : ''}>Σύντομη</option><option value="detailed" ${identity.response_length === 'detailed' ? 'selected' : ''}>Αναλυτική</option></select></label><label>Τόνος<select name="response_tone"><option value="friendly" ${identity.response_tone === 'friendly' ? 'selected' : ''}>Φιλικός</option><option value="formal" ${identity.response_tone === 'formal' ? 'selected' : ''}>Επίσημος</option></select></label><button class="button-primary" type="submit">Αποθήκευση προτιμήσεων</button></form></section></div>${rejectedItems.length ? `<details class="rejected-profile-items"><summary>Απορριφθείσες προτάσεις (${rejectedItems.length})</summary>${rejectedItems.map(renderItem).join('')}</details>` : ''}<div class="profile-danger-zone"><button type="button" class="text-button danger-text" id="delete-profile-all">Διαγραφή όλων των στοιχείων προφίλ</button></div></details>`;

    document.querySelector('#profile-identity-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = document.querySelector('#profile-display-name').value.trim();
      const result = await profileRequest('/api/profile/identity', 'PUT', { name });
      state.name = result.name;
      localStorage.setItem('twinName', state.name);
      await loadProfileSection();
    });
    document.querySelector('#profile-preferences-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      await profileRequest('/api/profile/preferences', 'PUT', Object.fromEntries(new FormData(event.currentTarget)));
      await loadProfileSection();
    });
    document.querySelector('#profile-add-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      await profileRequest('/api/profile/items', 'POST', { status: 'confirmed', source_type: 'manual', items: [{ category: formData.get('category'), value: formData.get('value') }] });
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
    document.querySelector('#delete-profile-all').addEventListener('click', async () => {
      if (!window.confirm('Να διαγραφούν το όνομα, οι προτιμήσεις και όλα τα στοιχεία προφίλ;')) return;
      await profileRequest('/api/profile', 'DELETE');
      localStorage.removeItem('twinName');
      state.name = '';
      state.step = 'name';
      render();
    });

    const cvForm = document.querySelector('#profile-cv-form');
    const cvFile = document.querySelector('#profile-cv-file');
    const cvAck = document.querySelector('#cv-privacy-ack');
    const cvSubmit = document.querySelector('#profile-cv-submit');
    let cloudUnavailable = false;
    fetch('/api/config').then((result) => result.json()).then((config) => {
      const message = document.querySelector('#cv-privacy-message');
      cloudUnavailable = config.mode === 'openai' && !config.openai_available;
      message.textContent = config.mode === 'openai'
        ? 'Cloud με OpenAI: το κείμενο του CV θα σταλεί στην OpenAI για εξαγωγή προτάσεων και μπορεί να υπάρξει χρέωση. Το αρχικό αρχείο δεν αποθηκεύεται.'
        : 'Τοπικά με Ollama: το CV αναλύεται στον υπολογιστή σου και δεν αποστέλλεται στην OpenAI. Το αρχικό αρχείο δεν αποθηκεύεται.';
      if (cloudUnavailable) message.textContent += ' Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.';
      cvSubmit.disabled = cloudUnavailable || !cvAck.checked || !cvFile.files.length;
    }).catch(() => { document.querySelector('#cv-privacy-message').textContent = 'Δεν ήταν δυνατός ο έλεγχος ενεργής λειτουργίας.'; cvSubmit.disabled = true; });
    const updateCvButton = () => { cvSubmit.disabled = cloudUnavailable || !cvAck.checked || !cvFile.files.length; };
    cvFile.addEventListener('change', updateCvButton);
    cvAck.addEventListener('change', updateCvButton);
    cvForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!cvFile.files.length || !cvAck.checked) return;
      cvSubmit.disabled = true;
      document.querySelector('#cv-status').textContent = 'Ανάγνωση αρχείου και δημιουργία προτάσεων…';
      const form = new FormData();
      form.append('file', cvFile.files[0]);
      try {
        const response = await fetch('/api/profile/cv?privacy_ack=true', { method: 'POST', body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Δεν αναλύθηκε το αρχείο.');
        const statusMessage = result.proposals.length
          ? `Βρέθηκαν ${result.proposals.length} προτάσεις. Έλεγξέ τες πριν εγκριθούν.`
          : 'Δεν βρέθηκαν ασφαλείς πληροφορίες προς πρόταση. Το αρχικό αρχείο δεν αποθηκεύτηκε.';
        await loadProfileSection();
        const status = document.querySelector('#cv-status');
        if (status) status.textContent = statusMessage;
      } catch (error) { document.querySelector('#cv-status').textContent = error.message || 'Δεν αναλύθηκε το αρχείο.'; cvSubmit.disabled = false; }
    });
  } catch (error) { root.innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Δεν φορτώθηκε το προφίλ.')}</p>`; }
}

async function profileRequest(url, method, data) {
  const response = await fetch(url, { method, ...(data ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || 'Δεν αποθηκεύτηκαν οι αλλαγές στο προφίλ.');
  return result;
}

function renderMain() {
  const identityReady = syncProfileIdentity();
  const content = {
    Connection: `<h1>Διασύνδεση</h1><p class="subheading">Ο Echo μπορεί να εξερευνήσει τι αξία μπορείτε να προσφέρετε ο ένας στον άλλον μέσα από τα AI δίδυμά σας. Εσύ επιλέγεις τι μοιράζεσαι.</p><div class="cards"><button class="choice-card"><h3>Σύνδεση με άλλο δίδυμο</h3><p>Σκάναρε ή πληκτρολόγησε τον κωδικό σύνδεσης που θα σου δώσει το άλλο άτομο.</p></button><button class="choice-card"><h3>Προβολή πιθανής συνεργασίας</h3><p>Δες πού συναντιούνται τα ενδιαφέροντα και οι δεξιότητές σας.</p></button></div>`,
    Guidance: `<h1>Καθοδήγηση</h1><p class="subheading">Συνομίλησε με τον Echo. Κάνε ερωτήσεις με βάση τα αρχεία σου ή για θέματα που σχετίζονται με εσένα. Οι συνομιλίες αποθηκεύονται σε αυτή τη συσκευή.</p><div class="chat-box guidance-question-box"><form id="guidance-form"><label for="guidance-question">Η ερώτησή σου</label><textarea id="guidance-question" required placeholder="Τι θέλεις να αναζητήσεις στα αρχεία σου;"></textarea><div class="guidance-form-actions"><button class="button-primary" id="guidance-submit">Ρώτησε τον Echo</button><button class="button-secondary" id="clear-guidance-history" type="button">Νέα συνομιλία</button></div></form></div><div id="guidance-answer" class="guidance-response" aria-live="polite"></div>`,
    Add: `<h1>Πρόσθεσε στοιχεία στον AI εαυτό σου</h1>${state.showFirstFilePrompt ? '<p class="first-file-notice">Ξεκίνα προσθέτοντας το πρώτο σου αρχείο.</p>' : ''}<div class="chat-box"><div class="file-picker-control" id="file-picker-control"><label class="file-picker-label" for="text-files">Επίλεξε αρχεία .txt ή PDF</label><input id="text-files" type="file" accept=".txt,.pdf,text/plain,application/pdf" multiple></div><p class="file-size-hint">Έως 10 MB ανά αρχείο. Τα σαρωμένα PDF χρειάζονται OCR και μπορεί να διαρκέσουν περισσότερο. Η αναγνώριση γίνεται τοπικά.</p><button class="button-primary" id="add-files" type="button">Επεξεργασία αρχείων</button></div><section class="uploaded-files-section"><h2>Τα αρχεία μου</h2><div id="uploaded-files"></div></section>`,
    Graph: `<h1>Ο γράφος σου</h1><p class="subheading">Δες τους ανθρώπους, τους οργανισμούς και τις σχέσεις που εμφανίζονται στα δεδομένα σου.</p>`,
    Profile: `<h1>Το προφίλ μου</h1><div id="profile-page-content" class="profile-page-content">Φόρτωση προφίλ…</div>`,
    Settings: '',
  };

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">${twinName}<span> · AI εαυτός</span></div>
        <nav class="nav" aria-label="Κύριες ενότητες">${sections.map((section) => `<button class="nav-item ${state.section === section.id ? 'active' : ''}" data-section="${section.id}">${section.label}</button>`).join('')}</nav>
        <button class="settings-button" id="open-settings" aria-label="Άνοιγμα ρυθμίσεων" title="Ρυθμίσεις">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Z"/><path d="m19.4 13.5 1.1.85-1.1 1.9-1.35-.48a7.9 7.9 0 0 1-1.35.78l-.24 1.42h-2.2l-.25-1.42a7.9 7.9 0 0 1-1.55 0l-.25 1.42h-2.2l-.24-1.42a7.9 7.9 0 0 1-1.35-.78l-1.35.48-1.1-1.9 1.1-.85a7.7 7.7 0 0 1 0-1.55l-1.1-.85 1.1-1.9 1.35.48a7.9 7.9 0 0 1 1.35-.78l.24-1.42h2.2l.25 1.42a7.9 7.9 0 0 1 1.55 0l.25-1.42h2.2l.24 1.42a7.9 7.9 0 0 1 1.35.78l1.35-.48 1.1 1.9-1.1.85a7.7 7.7 0 0 1 0 1.55Z"/></svg>
        </button>
      </header>
      <section class="page">${content[state.section]}</section>
    </div>`;

  if (state.section === 'Profile') loadProfileSection(identityReady);

  document.querySelectorAll('[data-section]').forEach((button) => {
    button.addEventListener('click', () => {
      state.section = button.dataset.section;
      localStorage.setItem('echoLastSection', state.section);
      render();
      if (['Guidance', 'Connection'].includes(state.section) && !hasSeenSectionPopup(state.section)) {
        showSectionIntro(state.section);
      } else if (tourCopy[state.section] && !hasSeenSectionPopup(state.section)) {
        showTour(state.section);
      }
    });
  });

  if (state.section === 'Add') {
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
        : 'Διάλεξε λειτουργία και πάτησε το κουμπί για να εφαρμοστεί.';
    }));
    fetch('/api/config').then((response) => response.json()).then((config) => {
      openaiAvailable = Boolean(config.openai_available);
      document.querySelector('#openai-availability').textContent = openaiAvailable ? '' : (config.openai_message || 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.');
      activeMode = config.mode;
      modeSelect.value = config.mode;
      syncModeCards();
      updateModeAction();
      syncUploadAvailability();
      if (openaiAvailable || config.mode !== 'openai') document.querySelector('#provider-hint').textContent = 'Διάλεξε λειτουργία και πάτησε το κουμπί για να εφαρμοστεί.';
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
    const renderTurn = (question, answer, sources = []) => `<article class="guidance-turn"><div class="guidance-user-message"><small>Εσύ</small><p>${escapeHtml(question)}</p></div><article class="answer-card"><h2>Απάντηση Echo</h2><p class="answer-text">${escapeHtml(answer)}</p></article>${sources.length ? `<section class="answer-sources"><h3>Πηγές</h3><ul>${sources.map((source) => `<li>${escapeHtml(source.label || source.file || 'Προφίλ')}</li>`).join('')}</ul></section>` : ''}</article>`;
    submitButton.disabled = true;
    questionInput.disabled = true;
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
      submitButton.disabled = false;
      fetch(`/api/chat/history?session_id=${encodeURIComponent(guidanceSessionId)}`).then((response) => response.json()).then(({ messages }) => {
        const turns = [];
        for (let index = 0; index < messages.length; index += 2) {
          if (messages[index]?.role === 'user' && messages[index + 1]?.role === 'assistant') turns.push(renderTurn(messages[index].content, messages[index + 1].content, messages[index + 1].sources || []));
        }
        answerOutput.innerHTML = turns.join('');
      }).catch(() => { answerOutput.textContent = 'Δεν φορτώθηκε το ιστορικό συνομιλίας.'; });
    }).catch(() => { answerOutput.textContent = 'Δεν ήταν δυνατός ο έλεγχος διαθεσιμότητας λειτουργίας.'; });
    clearHistoryButton.addEventListener('click', async () => {
      clearHistoryButton.disabled = true;
      try {
        const response = await fetch(`/api/chat/history?session_id=${encodeURIComponent(guidanceSessionId)}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Δεν διαγράφηκε το ιστορικό.');
        answerOutput.innerHTML = '';
        questionInput.value = '';
      } catch (error) { answerOutput.textContent = error.message || 'Δεν διαγράφηκε το ιστορικό.'; }
      finally { clearHistoryButton.disabled = false; }
    });
    document.querySelector('#guidance-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const output = document.querySelector('#guidance-answer');
      const submit = document.querySelector('#guidance-submit');
      const question = questionInput.value.trim();
      submit.disabled = true;
      output.setAttribute('aria-busy', 'true');
      const pending = document.createElement('div');
      pending.innerHTML = `<article class="guidance-turn"><div class="guidance-user-message"><small>Εσύ</small><p>${escapeHtml(question)}</p></div><article class="answer-card"><h2>Απάντηση Echo</h2><div class="thinking-card" role="status"><div class="thinking-label"><span class="thinking-orb" aria-hidden="true"></span><span>Ο Echo σκέφτεται</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="thinking-track" aria-hidden="true"><span></span></div></div></article></article>`;
      output.append(pending.firstElementChild);
      try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question, session_id: guidanceSessionId }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Δεν ολοκληρώθηκε η ερώτηση.');
        pending.firstElementChild.outerHTML = renderTurn(question, result.answer, result.sources || []);
        questionInput.value = '';
      } catch (error) { pending.firstElementChild.innerHTML = `<p class="form-error">${escapeHtml(error.message || 'Δεν ολοκληρώθηκε η ερώτηση.')}</p>`; }
      finally { output.setAttribute('aria-busy', 'false'); submit.disabled = false; }
    });
  }

  // Ανοίγει την κενή οθόνη ρυθμίσεων, την οποία θα συμπληρώσουμε αργότερα.
  document.querySelector('#open-settings').addEventListener('click', () => {
    state.section = 'Settings';
    render();
  });

  if (state.tour && tourCopy[state.tour]) showTour(state.tour);
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
  const isGuidance = section === 'Guidance';
  const sectionLabel = sections.find((item) => item.id === section).label;
  const message = isGuidance
    ? `Εδώ μπορείς να ρωτάς τον Echo για συμβουλές και κατευθύνσεις, αξιοποιώντας πληροφορίες από το προφίλ και τον γράφο σου.`
    : `Εδώ ο Echo μπορεί να επικοινωνήσει με το AI δίδυμο κάποιου άλλου και να διερευνήσει πώς μπορείτε να προσφέρετε αξία ο ένας στον άλλον. Εσύ εγκρίνεις τι θα κοινοποιηθεί και κάθε πρόταση γνωριμίας.`;
  addAnchoredPopup(
    section,
    sectionLabel,
    isGuidance ? 'Ρώτησε τον Echo' : 'Γνώρισε άλλο AI δίδυμο',
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
  else renderMain();
}

render();
