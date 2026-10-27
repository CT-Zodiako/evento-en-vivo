(() => {
  const form = document.getElementById('wall-form');
  const textarea = document.getElementById('wall-text');
  const counter = document.getElementById('wall-count');
  const status = document.getElementById('wall-status');
  const list = document.getElementById('wall-list');
  const empty = document.getElementById('wall-empty');
  const moderateButton = document.getElementById('moderate-button');
  const dialog = document.getElementById('admin-dialog');
  const adminKeyInput = document.getElementById('admin-key');

  const ROLE_LABEL = { estudiante: 'Estudiante', profesor: 'Profesor' };
  const MAX = 140;

  const savedRole = localStorage.getItem('role');
  if (savedRole) {
    const radio = form.querySelector(`input[name="role"][value="${savedRole}"]`);
    if (radio) radio.checked = true;
  }

  function setStatus(message, kind = 'info') {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function updateCounter() {
    const length = [...textarea.value].length;
    counter.textContent = `${length}/${MAX}`;
    counter.classList.toggle('over', length > MAX);
  }

  function renderMessage(message) {
    const item = document.createElement('li');
    item.id = `msg-${message.id}`;
    item.className = `wall-item role-${message.role}`;

    const meta = document.createElement('div');
    meta.className = 'wall-meta';
    const role = document.createElement('span');
    role.className = 'role-tag';
    role.textContent = ROLE_LABEL[message.role] ?? message.role;
    const time = document.createElement('time');
    time.dateTime = message.createdAt;
    time.textContent = new Date(message.createdAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    meta.append(role, time);

    const text = document.createElement('p');
    text.className = 'wall-text';
    text.textContent = message.text;

    const hide = document.createElement('button');
    hide.type = 'button';
    hide.className = 'hide-button';
    hide.textContent = 'Ocultar';
    hide.setAttribute('aria-label', `Ocultar mensaje: ${message.text}`);
    hide.addEventListener('click', () => hideMessage(message.id));

    item.append(meta, text, hide);
    return item;
  }

  function refreshEmpty() {
    empty.hidden = list.children.length > 0;
  }

  async function loadMessages() {
    try {
      const res = await fetch('/api/messages');
      const { messages } = await res.json();
      list.replaceChildren(...messages.map(renderMessage));
    } catch {
      setStatus('No se pudieron cargar los mensajes.', 'error');
    }
    refreshEmpty();
  }

  async function hideMessage(id) {
    const key = sessionStorage.getItem('adminKey');
    if (!key) return openModeration();
    const res = await fetch(`/api/messages/${id}/hide`, { method: 'POST', headers: { 'x-admin-key': key } });
    if (res.ok) return;
    const { error } = await res.json().catch(() => ({ error: 'No se pudo ocultar el mensaje.' }));
    if (res.status === 401 || res.status === 503) exitModeration();
    setStatus(error, 'error');
  }

  function enterModeration(key) {
    sessionStorage.setItem('adminKey', key);
    document.body.classList.add('moderating');
    moderateButton.textContent = 'Salir de moderación';
  }

  function exitModeration() {
    sessionStorage.removeItem('adminKey');
    document.body.classList.remove('moderating');
    moderateButton.textContent = 'Moderar';
  }

  function openModeration() {
    adminKeyInput.value = '';
    dialog.showModal();
  }

  moderateButton.addEventListener('click', () => {
    if (document.body.classList.contains('moderating')) exitModeration();
    else openModeration();
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'ok' && adminKeyInput.value) enterModeration(adminKeyInput.value);
    adminKeyInput.value = '';
  });

  if (sessionStorage.getItem('adminKey')) enterModeration(sessionStorage.getItem('adminKey'));

  textarea.addEventListener('input', updateCounter);

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();
    const role = form.querySelector('input[name="role"]:checked')?.value;
    if (!text) return setStatus('Escribe un mensaje antes de publicar.', 'error');
    if ([...text].length > MAX) return setStatus(`Máximo ${MAX} caracteres.`, 'error');
    if (!role) return setStatus('Elige si eres estudiante o profesor.', 'error');

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, role }),
      });
      const body = await res.json();
      if (!res.ok) return setStatus(body.error, 'error');
      localStorage.setItem('role', role);
      textarea.value = '';
      updateCounter();
      setStatus('¡Publicado!', 'ok');
    } catch {
      setStatus('Sin conexión. Intenta de nuevo.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  liveEvents.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (document.getElementById(`msg-${message.id}`)) return;
    const item = renderMessage(message);
    item.classList.add('is-new');
    list.prepend(item);
    refreshEmpty();
  });

  liveEvents.addEventListener('hide', (event) => {
    const { id } = JSON.parse(event.data);
    document.getElementById(`msg-${id}`)?.remove();
    refreshEmpty();
  });

  // Reload on every (re)connection so messages sent while offline are not lost.
  liveEvents.addEventListener('open', loadMessages);
  loadMessages();
})();
