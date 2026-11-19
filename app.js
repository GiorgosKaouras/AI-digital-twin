const app = document.querySelector('#app');
const sections = [
  { id: 'Connection', label: 'Διασύνδεση' },
  { id: 'Guidance', label: 'Καθοδήγηση' },
  { id: 'Add', label: 'Προσθήκη' },
  { id: 'Profile', label: 'Προφίλ' },
  { id: 'Graph', label: 'Γράφος' },
];
const twinName = 'Echo';
const state = {
  step: localStorage.getItem('twinName') ? 'main' : 'welcome',
  name: localStorage.getItem('twinName') || '',
  onboardingIndex: 0,
  onboardingAnswers: [],
  onboardingFacts: [],
  section: 'Add',
  showFirstFilePrompt: false,
  // Νέο κλειδί ώστε να εμφανιστεί η ενημερωμένη περιήγηση και σε υπάρχοντες δοκιμαστικούς χρήστες.
  tour: localStorage.getItem('twinTourCompleteV3') ? null : 'Add',
};

const onboardingQuestions = [
  { category: 'work', title: 'Με τι ασχολείσαι επαγγελματικά;', choices: ['Εργάζομαι σε εταιρεία', 'Ελεύθερος επαγγελματίας', 'Σπουδάζω', 'Αναζητώ εργασία', 'Έχω δική μου επιχείρηση'] },
  { category: 'skills', title: 'Ποιες δεξιότητες ή εμπειρίες θέλεις να γνωρίζει ο Echo;', choices: ['Επικοινωνία', 'Οργάνωση', 'Ανάλυση και επίλυση προβλημάτων', 'Τεχνολογία', 'Δημιουργικότητα', 'Συνεργασία'] },
  { category: 'interests', title: 'Τι σε ενδιαφέρει;', choices: ['Τεχνολογία', 'Επιχειρηματικότητα', 'Τέχνη και σχεδιασμός', 'Αθλητισμός', 'Βιβλία και μάθηση', 'Προσφορά στην κοινότητα'] },
  { category: 'values', title: 'Τι είναι σημαντικό για σένα στη δουλειά ή στη ζωή;', choices: ['Συνεχής μάθηση', 'Συνεργασία', 'Δημιουργικότητα', 'Ισορροπία', 'Σταθερότητα', 'Θετικός αντίκτυπος'] },
  { category: 'goals', title: 'Σε τι θα ήθελες να σε βοηθά ο Echo;', choices: ['Επαγγελματική εξέλιξη', 'Οργάνωση και προγραμματισμός', 'Λήψη αποφάσεων', 'Εκμάθηση νέων πραγμάτων', 'Επικοινωνία', 'Ανάπτυξη ιδεών'] },
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
  app.innerHTML = `
    <section class="welcome">
      <div class="welcome-card">
        <div class="eyebrow">Ο προσωπικός σου AI σύντροφος</div>
        <h1>Καλώς ήρθες στον AI εαυτό σου</h1>
        <p class="description">&nbsp;</p>
        <button class="button-primary" id="next">Επόμενο <span aria-hidden="true">→</span></button>
      </div>
    </section>`;
  document.querySelector('#next').addEventListener('click', () => {
    state.step = 'name';
    render();
  });
}

function renderNameStep() {
  app.innerHTML = `
    <section class="name-step">
      <div class="name-card">
        <div class="eyebrow">Γνώρισε τον Echo</div>
        <h1>Είμαι ο Echo, ο AI κλώνος σου.</h1>
        <p class="subheading">Πώς θέλεις να σε αποκαλώ όταν σου μιλάω;</p>
        <form id="name-form">
          <label for="preferred-name">Το όνομα που προτιμάς</label>
          <input id="preferred-name" name="name" autocomplete="given-name" required maxlength="48" placeholder="Γράψε το όνομά σου">
          <p id="name-error" class="form-error" aria-live="polite"></p>
          <button class="button-primary" type="submit">Συνέχεια <span aria-hidden="true">→</span></button>
        </form>
      </div>
    </section>`;
  document.querySelector('#name-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    state.name = new FormData(event.currentTarget).get('name').trim();
    if (!state.name) return;
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
      state.step = 'onboarding';
      render();
    } catch (error) {
      const message = document.querySelector('#name-error');
      if (message) message.textContent = error.message || 'Δεν αποθηκεύτηκε το όνομα.';
      button.disabled = false;
    }
  });
}

function onboardingFactsForCurrentStep(form) {
  const question = onboardingQuestions[state.onboardingIndex];
  const values = [...form.querySelectorAll('[name="onboarding-choice"]:checked')].map((input) => input.value);
  const freeText = form.querySelector('#onboarding-other').value.split(/[\n;]+/).map((value) => value.trim()).filter(Boolean);
  const additions = [...values, ...freeText].map((value) => ({ category: question.category, value }));
  state.onboardingFacts = [...state.onboardingFacts.filter((fact) => fact.category !== question.category), ...additions];
  state.onboardingAnswers[state.onboardingIndex] = { selected: values, other: form.querySelector('#onboarding-other').value };
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

function renderOnboarding() {
  const index = state.onboardingIndex;
  const question = onboardingQuestions[index];
  const saved = state.onboardingAnswers[index] || { selected: [], other: '' };
  app.innerHTML = `
    <section class="welcome onboarding-screen">
      <div class="welcome-card onboarding-card">
        <div class="eyebrow">Σύντομη γνωριμία · ${index + 1}/${onboardingQuestions.length}</div>
        <h1>Ας γνωριστούμε, ${escapeHtml(state.name)}</h1>
        ${index === 0 ? '<p class="description">Οι απαντήσεις σου θα βοηθήσουν τον Echo να φτιάξει ένα αρχικό προσωπικό προφίλ. Μπορείς να το αλλάξεις ή να το διαγράψεις όποτε θέλεις.</p>' : ''}
        <progress class="onboarding-progress" max="${onboardingQuestions.length}" value="${index + 1}"></progress>
        <form id="onboarding-form">
          <h2>${escapeHtml(question.title)}</h2>
          <div class="onboarding-options">${question.choices.map((choice) => `<label class="onboarding-option"><input type="checkbox" name="onboarding-choice" value="${escapeHtml(choice)}" ${saved.selected.includes(choice) ? 'checked' : ''}><span>${escapeHtml(choice)}</span></label>`).join('')}</div>
          <label class="onboarding-free-label" for="onboarding-other">Άλλο ή κάτι ακόμη (προαιρετικό)</label>
          <textarea id="onboarding-other" placeholder="Γράψε λίγες λέξεις αν θέλεις">${escapeHtml(saved.other)}</textarea>
          <p id="onboarding-error" class="form-error" aria-live="polite"></p>
          <div class="onboarding-actions">
            ${index > 0 ? '<button class="button-secondary" id="onboarding-back" type="button">Πίσω</button>' : ''}
            <button class="button-secondary" id="onboarding-skip" type="button">Δεν θέλω να απαντήσω</button>
            <button class="button-primary" id="onboarding-next" type="submit">${index === onboardingQuestions.length - 1 ? 'Σύνοψη' : 'Επόμενο'}</button>
          </div>
          <button class="text-button" id="onboarding-later" type="button">Θα το συμπληρώσω αργότερα</button>
        </form>
      </div>
    </section>`;

  document.querySelector('#onboarding-form').addEventListener('submit', (event) => {
    event.preventDefault();
    onboardingFactsForCurrentStep(event.currentTarget);
    if (state.onboardingIndex < onboardingQuestions.length - 1) state.onboardingIndex += 1;
    else state.step = 'onboarding-summary';
    render();
  });
  document.querySelector('#onboarding-skip').addEventListener('click', () => {
    state.onboardingAnswers[index] = { selected: [], other: '' };
    state.onboardingFacts = state.onboardingFacts.filter((fact) => fact.category !== question.category);
    if (state.onboardingIndex < onboardingQuestions.length - 1) state.onboardingIndex += 1;
    else state.step = 'onboarding-summary';
    render();
  });
  document.querySelector('#onboarding-back')?.addEventListener('click', () => { state.onboardingIndex -= 1; render(); });
  document.querySelector('#onboarding-later').addEventListener('click', async () => {
    const error = document.querySelector('#onboarding-error');
    const button = document.querySelector('#onboarding-later');
    onboardingFactsForCurrentStep(document.querySelector('#onboarding-form'));
    button.disabled = true;
    try {
      await saveOnboardingFacts('proposed');
      state.onboardingFacts = [];
      state.step = 'main';
      state.section = 'Profile';
      render();
    } catch (saveError) { error.textContent = saveError.message || 'Δεν αποθηκεύτηκαν οι απαντήσεις.'; button.disabled = false; }
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
      state.step = 'main';
      state.section = 'Profile';
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
      state.step = 'main';
      state.section = 'Profile';
      render();
    } catch (error) { document.querySelector('#summary-error').textContent = error.message || 'Δεν αποθηκεύτηκαν οι απαντήσεις.'; button.disabled = false; }
  });
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
    const rejectedItems = items.filter((item) => item.status === 'rejected');
    const groups = Object.entries(profileCategoryLabels).map(([category, label]) => {
      const group = activeItems.filter((item) => item.category === category);
      return group.length ? `<section class="profile-category-group"><h3>${label}</h3>${group.map(renderItem).join('')}</section>` : '';
    }).join('');

    root.innerHTML = `
      <section class="profile-panel">
        <div class="profile-panel-heading"><div><h2>Ταυτότητα</h2><p>Ο Echo χρησιμοποιεί αυτό το όνομα για να γνωρίζει ποιον εκπροσωπεί.</p></div><span class="profile-confirmed-tag">${identity.identity_confirmed ? 'Επιβεβαιωμένη' : 'Δεν έχει επιβεβαιωθεί'}</span></div>
        <form id="profile-identity-form" class="profile-inline-form"><label for="profile-display-name">Όνομα</label><input id="profile-display-name" maxlength="48" value="${escapeHtml(identity.display_name || state.name)}" required><button class="button-primary" type="submit">Αποθήκευση</button></form>
      </section>
      <section class="profile-panel">
        <h2>Πώς θέλεις να απαντά ο Echo;</h2><p>Αυτές είναι απλές προτιμήσεις απάντησης· δεν σημαίνουν ότι έχει μάθει το προσωπικό σου ύφος γραφής.</p>
        <form id="profile-preferences-form" class="profile-preferences-form"><label>Μήκος απάντησης<select name="response_length"><option value="concise" ${identity.response_length === 'concise' ? 'selected' : ''}>Σύντομη</option><option value="detailed" ${identity.response_length === 'detailed' ? 'selected' : ''}>Αναλυτική</option></select></label><label>Τόνος<select name="response_tone"><option value="friendly" ${identity.response_tone === 'friendly' ? 'selected' : ''}>Φιλικός</option><option value="formal" ${identity.response_tone === 'formal' ? 'selected' : ''}>Επίσημος</option></select></label><button class="button-primary" type="submit">Αποθήκευση προτιμήσεων</button></form>
      </section>
      <section class="profile-panel">
        <div class="profile-panel-heading"><div><h2>Προαιρετικό CV ή βιογραφικό</h2><p>Οι πληροφορίες θα εμφανιστούν ως προτάσεις. Το αρχικό αρχείο δεν αποθηκεύεται.</p></div></div>
        <p id="cv-privacy-message" class="cv-privacy-message">Έλεγχος ενεργής λειτουργίας…</p>
        <form id="profile-cv-form"><input type="file" id="profile-cv-file" accept=".txt,.pdf,text/plain,application/pdf"><label class="privacy-ack-label"><input type="checkbox" id="cv-privacy-ack">Καταλαβαίνω πού θα επεξεργαστεί το κείμενο του αρχείου.</label><button class="button-primary" id="profile-cv-submit" type="submit" disabled>Εξαγωγή προτάσεων για έλεγχο</button><p id="cv-status" class="mode-status" aria-live="polite"></p></form>
      </section>
      <section class="profile-panel">
        <div class="profile-panel-heading"><div><h2>Τα στοιχεία του προφίλ σου</h2><p>Μόνο τα επιβεβαιωμένα ή διορθωμένα στοιχεία χρησιμοποιούνται στις απαντήσεις.</p></div><button class="button-secondary" id="start-profile-interview" type="button">Σύντομη γνωριμία</button></div>
        <form id="profile-add-form" class="profile-add-form"><label>Κατηγορία<select name="category">${Object.entries(profileCategoryLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label for="profile-add-value">Πρόσθεσε ένα στοιχείο</label><textarea id="profile-add-value" name="value" rows="2" maxlength="500" required placeholder="Γράψε μόνο ό,τι θέλεις να θυμάται ο Echo"></textarea><button class="button-primary" type="submit">Προσθήκη στο προφίλ</button></form>
        ${groups || '<p class="empty-files">Δεν υπάρχουν ακόμη στοιχεία. Μπορείς να ξεκινήσεις τη σύντομη γνωριμία ή να προσθέσεις προαιρετικά CV.</p>'}
        ${rejectedItems.length ? `<details class="rejected-profile-items"><summary>Απορριφθείσες προτάσεις (${rejectedItems.length})</summary>${rejectedItems.map(renderItem).join('')}</details>` : ''}
      </section>
      <div class="profile-danger-zone"><button type="button" class="text-button danger-text" id="delete-profile-all">Διαγραφή όλων των στοιχείων προφίλ</button></div>`;

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
    document.querySelector('#start-profile-interview').addEventListener('click', () => {
      state.onboardingIndex = 0;
      state.onboardingAnswers = [];
      state.onboardingFacts = [];
      state.step = 'onboarding';
      render();
    });
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
    Guidance: `<h1>Καθοδήγηση</h1><p class="subheading">Συνομίλησε με τον Echo. Κάνε ερωτήσεις με βάση τα αρχεία σου ή για θέματα που σχετίζονται με εσένα.</p><div class="chat-box guidance-question-box"><form id="guidance-form"><label for="guidance-question">Η ερώτησή σου</label><textarea id="guidance-question" required placeholder="Τι θέλεις να αναζητήσεις στα αρχεία σου;"></textarea><button class="button-primary" id="guidance-submit">Ρώτησε τον Echo</button></form></div><div id="guidance-answer" class="guidance-response" aria-live="polite"></div>`,
    Add: `<h1>Πρόσθεσε στοιχεία στον AI εαυτό σου</h1>${state.showFirstFilePrompt ? '<p class="first-file-notice">Ξεκίνα προσθέτοντας το πρώτο σου αρχείο.</p>' : ''}<div class="chat-box"><div class="file-picker-control" id="file-picker-control"><label class="file-picker-label" for="text-files">Επίλεξε αρχεία .txt ή PDF</label><input id="text-files" type="file" accept=".txt,.pdf,text/plain,application/pdf" multiple></div><p class="file-size-hint">Έως 10 MB ανά αρχείο. Τα σαρωμένα PDF χρειάζονται OCR και μπορεί να διαρκέσουν περισσότερο. Η αναγνώριση γίνεται τοπικά.</p><button class="button-primary" id="add-files" type="button">Επεξεργασία αρχείων</button></div><section class="uploaded-files-section"><h2>Τα αρχεία μου</h2><div id="uploaded-files"></div></section>`,
    Graph: `<h1>Ο γράφος σου</h1><p class="subheading">Δες τους ανθρώπους, τους οργανισμούς και τις σχέσεις που εμφανίζονται στα δεδομένα σου.</p>`,
    Profile: `<h1>Το προφίλ μου</h1><p class="subheading">Εσύ ελέγχεις τι γνωρίζει ο Echo. Επιβεβαίωσε, διόρθωσε ή διέγραψε στοιχεία όποτε θέλεις.</p><div id="profile-page-content" class="profile-page-content">Φόρτωση προφίλ…</div>`,
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
            <small class="mode-privacy">Ταχύτερη επιλογή · Λιγότερη προστασία</small>
          </button>
          <button class="choice-card mode-card" type="button" data-mode-choice="ollama" aria-pressed="false">
            <h3><span>Τοπικά με Ollama</span><small class="active-mode-badge" data-active-badge="ollama" hidden>ΕΝΕΡΓΗ</small></h3>
            <p>Τα αρχεία και οι ερωτήσεις σου επεξεργάζονται <strong>τοπικά</strong>. Η λειτουργία απαιτεί <strong>εγκατάσταση</strong> του τοπικού AI.</p>
            <small class="mode-privacy">Λιγότερο αποδοτική · Αυξημένη προστασία</small>
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
    submitButton.disabled = true;
    questionInput.disabled = true;
    answerOutput.textContent = 'Έλεγχος διαθεσιμότητας λειτουργίας…';
    Promise.all([fetch('/api/config').then((response) => response.json()), identityReady]).then(([config]) => {
      if (config.mode === 'openai' && !config.openai_available) {
        answerOutput.textContent = config.openai_message || 'Η Cloud λειτουργία χρειάζεται ρύθμιση από την ομάδα.';
        return;
      }
      questionInput.disabled = false;
      submitButton.disabled = false;
      answerOutput.textContent = '';
    }).catch(() => { answerOutput.textContent = 'Δεν ήταν δυνατός ο έλεγχος διαθεσιμότητας λειτουργίας.'; });
    document.querySelector('#guidance-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const output = document.querySelector('#guidance-answer');
      const submit = document.querySelector('#guidance-submit');
      const question = questionInput.value.trim();
      submit.disabled = true;
      output.setAttribute('aria-busy', 'true');
      output.innerHTML = '<div class="thinking-card" role="status"><div class="thinking-label"><span class="thinking-orb" aria-hidden="true"></span><span>Ο Echo σκέφτεται</span><span class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></span></div><div class="thinking-track" aria-hidden="true"><span></span></div></div>';
      try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.detail || 'Δεν ολοκληρώθηκε η ερώτηση.');
        output.innerHTML = `<article class="answer-card"><h2>Απάντηση Echo</h2><p class="answer-text">${escapeHtml(result.answer)}</p></article>${result.sources.length ? `<section class="answer-sources"><h3>Πηγές</h3><ul>${result.sources.map((source) => `<li>${escapeHtml(source.label || source.file || 'Προφίλ')}</li>`).join('')}</ul></section>` : ''}`;
      } catch (error) { output.textContent = error.message || 'Δεν ολοκληρώθηκε η ερώτηση.'; }
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
  if (state.step === 'welcome') renderWelcome();
  else if (state.step === 'name') renderNameStep();
  else if (state.step === 'onboarding') renderOnboarding();
  else if (state.step === 'onboarding-summary') renderOnboardingSummary();
  else renderMain();
}

render();
