(() => {
  const form = document.getElementById('poll-form');
  const optionsBox = document.getElementById('poll-options');
  const resultsList = document.getElementById('poll-results');
  const total = document.getElementById('poll-total');
  const status = document.getElementById('poll-status');
  const question = document.getElementById('poll-question');

  const ROLES = [
    { id: 'estudiante', label: 'Estudiantes' },
    { id: 'profesor', label: 'Profesores' },
  ];
  let options = [];
  let myVote = null;

  const savedRole = localStorage.getItem('role');
  if (savedRole) {
    const radio = form.querySelector(`input[name="poll-role"][value="${savedRole}"]`);
    if (radio) radio.checked = true;
  }

  function setStatus(message, kind = 'info') {
    status.textContent = message;
    status.dataset.kind = kind;
  }

  function renderOptions() {
    optionsBox.replaceChildren(...options.map((option) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'poll-option';
      button.dataset.option = option.id;
      button.textContent = option.label;
      button.disabled = Boolean(myVote);
      button.setAttribute('aria-pressed', String(myVote === option.id));
      button.addEventListener('click', () => vote(option.id));
      return button;
    }));
    if (myVote) setStatus('¡Gracias! Tu voto ya está contado.', 'ok');
  }

  // Bars are created once and only their width changes, so CSS can animate them.
  function buildResults() {
    resultsList.replaceChildren(...options.map((option) => {
      const item = document.createElement('li');
      item.className = 'poll-row';
      const label = document.createElement('span');
      label.className = 'poll-label';
      label.textContent = option.label;
      item.append(label);
      for (const role of ROLES) {
        const bar = document.createElement('div');
        bar.className = `bar bar-${role.id}`;
        bar.innerHTML = '<span class="bar-fill"></span><span class="bar-value"></span>';
        bar.dataset.option = option.id;
        bar.dataset.role = role.id;
        item.append(bar);
      }
      return item;
    }));
  }

  function renderResults(results) {
    const totals = Object.fromEntries(ROLES.map((r) => [r.id, Object.values(results[r.id]).reduce((a, b) => a + b, 0)]));
    for (const bar of resultsList.querySelectorAll('.bar')) {
      const count = results[bar.dataset.role][bar.dataset.option];
      const percent = totals[bar.dataset.role] ? Math.round((count / totals[bar.dataset.role]) * 100) : 0;
      bar.querySelector('.bar-fill').style.width = `${percent}%`;
      const roleLabel = ROLES.find((r) => r.id === bar.dataset.role).label;
      const value = bar.querySelector('.bar-value');
      value.replaceChildren(
        Object.assign(document.createElement('span'), { textContent: roleLabel }),
        Object.assign(document.createElement('span'), { textContent: `${percent}% (${count})` }),
      );
      bar.setAttribute('aria-label', `${roleLabel}: ${count} votos, ${percent}%`);
      bar.setAttribute('role', 'img');
    }
    total.textContent = `Votos: ${totals.estudiante} de estudiantes · ${totals.profesor} de profesores`;
  }

  async function vote(optionId) {
    const role = form.querySelector('input[name="poll-role"]:checked')?.value;
    if (!role) return setStatus('Primero elige si eres estudiante o profesor.', 'error');
    try {
      const res = await fetch('/api/poll/vote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ option: optionId, role }),
      });
      const body = await res.json();
      if (res.status === 409) {
        await loadPoll();
        return setStatus(body.error, 'ok');
      }
      if (!res.ok) return setStatus(body.error, 'error');
      localStorage.setItem('role', role);
      myVote = body.myVote;
      renderOptions();
      renderResults(body.results);
    } catch {
      setStatus('Sin conexión. Intenta de nuevo.', 'error');
    }
  }

  async function loadPoll() {
    try {
      const poll = await (await fetch('/api/poll')).json();
      question.textContent = poll.question;
      if (options.length === 0) {
        options = poll.options;
        buildResults();
      }
      myVote = poll.myVote;
      renderOptions();
      renderResults(poll.results);
    } catch {
      setStatus('No se pudo cargar la encuesta.', 'error');
    }
  }

  liveEvents.addEventListener('poll', (event) => renderResults(JSON.parse(event.data).results));
  liveEvents.addEventListener('open', loadPoll);
  loadPoll();
})();
