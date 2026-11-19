const app = document.querySelector('#app');
const sections = [
  { id: 'Connection', label: 'Διασύνδεση' },
  { id: 'Guidance', label: 'Καθοδήγηση' },
  { id: 'Add', label: 'Προσθήκη' },
  { id: 'Profile', label: 'Προφίλ' },
  { id: 'Graph', label: 'Γράφος' },
];
const twinName = 'Echo';
const uploadedFilesKey = 'twinUploadedFiles';
const maxTextFileSize = 1024 * 1024;
const state = {
  step: localStorage.getItem('twinName') ? 'main' : 'welcome',
  name: localStorage.getItem('twinName') || '',
  section: 'Add',
  showFirstFilePrompt: false,
  // Νέο κλειδί ώστε να εμφανιστεί η ενημερωμένη περιήγηση και σε υπάρχοντες δοκιμαστικούς χρήστες.
  tour: localStorage.getItem('twinTourCompleteV3') ? null : 'Add',
};

const tourCopy = {
  Add: 'Εδώ μπορείς να προσθέτεις αρχεία κειμένου. Προς το παρόν αποθηκεύονται σε αυτόν τον browser και μπορείς να ελέγχεις το περιεχόμενό τους. Η εξαγωγή πληροφοριών για το προφίλ και τον γράφο θα προστεθεί σε επόμενο βήμα.',
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

// Διαβάζει τη λίστα αρχείων που έχουν αποθηκευτεί τοπικά στον browser.
function getUploadedFiles() {
  try {
    return JSON.parse(localStorage.getItem(uploadedFilesKey) || '[]');
  } catch {
    return [];
  }
}

// Εμφανίζει τα αρχεία και το περιεχόμενό τους για να μπορεί ο χρήστης να ελέγξει τι πρόσθεσε.
function renderUploadedFiles() {
  const list = document.querySelector('#uploaded-files');
  if (!list) return;
  const files = getUploadedFiles();
  list.innerHTML = files.length
    ? files.map((file) => `
        <article class="uploaded-file">
          <div class="uploaded-file-heading">
            <strong>${escapeHtml(file.name)}</strong>
            <button class="remove-file" type="button" data-remove-file="${escapeHtml(file.id)}">Αφαίρεση</button>
          </div>
          <details><summary>Δες το περιεχόμενο (${file.text.length} χαρακτήρες)</summary><pre>${escapeHtml(file.text)}</pre></details>
        </article>`).join('')
    : '<p class="empty-files">Δεν έχεις προσθέσει ακόμη αρχεία.</p>';

  list.querySelectorAll('[data-remove-file]').forEach((button) => {
    button.addEventListener('click', () => {
      const remainingFiles = getUploadedFiles().filter((file) => file.id !== button.dataset.removeFile);
      localStorage.setItem(uploadedFilesKey, JSON.stringify(remainingFiles));
      render();
      showUploadPopup('success', 'Το αρχείο αφαιρέθηκε.');
    });
  });
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

// Διαβάζει επιλεγμένα .txt, τα αποθηκεύει τοπικά και εμφανίζει το αποτέλεσμα σε pop-up.
async function addSelectedTextFiles() {
  const picker = document.querySelector('#text-files');
  const button = document.querySelector('#add-files');
  const selectedFiles = [...(picker?.files || [])];

  if (!selectedFiles.length) {
    showUploadPopup('warning', 'Για να προσθέσεις αρχείο, πάτησε εδώ και επίλεξε ένα αρχείο .txt.', true);
    return;
  }

  button.disabled = true;
  button.textContent = 'Προσθήκη…';

  try {
    const currentFiles = getUploadedFiles();
    const newFiles = [];
    for (const file of selectedFiles) {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        throw new Error(`Το «${file.name}» δεν είναι αρχείο .txt.`);
      }
      const normalizedName = file.name.normalize('NFC').trim().toLocaleLowerCase();
      const duplicate = [...currentFiles, ...newFiles].some(
        (savedFile) => savedFile.name.normalize('NFC').trim().toLocaleLowerCase() === normalizedName,
      );
      if (duplicate) {
        const warning = new Error(`Υπάρχει ήδη αρχείο με το όνομα «${file.name}». Επίλεξε αρχείο με διαφορετικό όνομα.`);
        warning.type = 'warning';
        throw warning;
      }
      if (file.size > maxTextFileSize) {
        throw new Error(`Το «${file.name}» ξεπερνά το όριο του 1 MB.`);
      }
      const text = await file.text();
      if (!text.trim()) throw new Error(`Το «${file.name}» δεν περιέχει κείμενο.`);
      newFiles.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        text,
        addedAt: new Date().toISOString(),
      });
    }

    localStorage.setItem(uploadedFilesKey, JSON.stringify([...currentFiles, ...newFiles]));
    const successMessage = newFiles.length === 1 ? 'Το αρχείο προστέθηκε με επιτυχία.' : `Προστέθηκαν ${newFiles.length} αρχεία με επιτυχία.`;
    picker.value = '';
    renderUploadedFiles();
    showUploadPopup('success', successMessage);
  } catch (error) {
    picker.value = '';
    showUploadPopup(error.type || 'error', error.message || 'Δεν ήταν δυνατή η αποθήκευση των αρχείων.');
  } finally {
    button.disabled = false;
    button.textContent = 'Προσθήκη αρχείων';
  }
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
          <button class="button-primary" type="submit">Συνέχεια <span aria-hidden="true">→</span></button>
        </form>
      </div>
    </section>`;
  document.querySelector('#name-form').addEventListener('submit', (event) => {
    event.preventDefault();
    state.name = new FormData(event.currentTarget).get('name').trim();
    if (!state.name) return;
    localStorage.setItem('twinName', state.name);
    state.step = 'main';
    render();
  });
}

function renderMain() {
  const content = {
    Connection: `<h1>Διασύνδεση</h1><p class="subheading">Ο Echo μπορεί να εξερευνήσει τι αξία μπορείτε να προσφέρετε ο ένας στον άλλον μέσα από τα AI δίδυμά σας. Εσύ επιλέγεις τι μοιράζεσαι.</p><div class="cards"><button class="choice-card"><h3>Σύνδεση με άλλο δίδυμο</h3><p>Σκάναρε ή πληκτρολόγησε τον κωδικό σύνδεσης που θα σου δώσει το άλλο άτομο.</p></button><button class="choice-card"><h3>Προβολή πιθανής συνεργασίας</h3><p>Δες πού συναντιούνται τα ενδιαφέροντα και οι δεξιότητές σας.</p></button></div>`,
    Guidance: `<h1>Καθοδήγηση</h1><p class="subheading">Ρώτησε τον Echo για συμβουλές και κατευθύνσεις, με βάση το προφίλ και τον γράφο σου.</p><div class="chat-box"><div class="chat-row"><input aria-label="Ρώτησε τον Echo" placeholder="Γράψε την ερώτησή σου"><button class="button-primary">Αποστολή</button></div></div>`,
    Add: `<h1>Πρόσθεσε στοιχεία στον AI εαυτό σου</h1><p class="subheading">Πρόσθεσε αρχεία κειμένου. Προς το παρόν αποθηκεύονται σε αυτόν τον browser και μπορείς να ελέγχεις το περιεχόμενό τους.</p>${state.showFirstFilePrompt ? '<p class="first-file-notice">Ξεκίνα προσθέτοντας το πρώτο σου αρχείο κειμένου.</p>' : ''}<div class="chat-box"><div class="file-picker-control" id="file-picker-control"><label class="file-picker-label" for="text-files">Επίλεξε αρχεία κειμένου</label><input id="text-files" type="file" accept=".txt,text/plain" multiple></div><p class="file-size-hint">Αρχεία .txt έως 1 MB το καθένα. Τα αρχεία αποθηκεύονται σε αυτόν τον browser.</p><button class="button-primary" id="add-files" type="button">Προσθήκη αρχείων</button></div><section class="uploaded-files-section"><h2>Τα αρχεία μου</h2><div id="uploaded-files"></div></section>`,
    Graph: `<h1>Ο γράφος σου</h1><p class="subheading">Δες τους ανθρώπους, τους οργανισμούς και τις σχέσεις που εμφανίζονται στα δεδομένα σου.</p>`,
    Profile: `<h1>${escapeHtml(state.name)}</h1><p class="subheading">Εδώ θα εμφανίζονται όσα γνωρίζει ο Echo για τις αξίες σου, τον τρόπο επικοινωνίας, τα ενδιαφέροντα και τις προτιμήσεις εργασίας σου.</p>`,
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
    document.querySelector('#add-files').addEventListener('click', addSelectedTextFiles);
    renderUploadedFiles();
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
  else renderMain();
}

render();
