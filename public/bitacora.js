(async () => {
  const list = document.getElementById('timeline');
  const empty = document.getElementById('timeline-empty');
  try {
    const { commits } = await (await fetch('/api/history')).json();
    list.replaceChildren(...commits.map((commit, index) => {
      const item = document.createElement('li');
      item.className = 'timeline-item';

      const number = document.createElement('span');
      number.className = 'timeline-number';
      number.textContent = `#${index + 1}`;

      const time = document.createElement('time');
      time.dateTime = commit.date;
      time.textContent = new Date(commit.date).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });

      const [, type, text] = /^(\w+)(?:\([^)]*\))?!?:\s*(.*)$/.exec(commit.message) ?? [null, null, commit.message];
      const message = document.createElement('p');
      message.className = 'timeline-message';
      if (type) {
        const tag = document.createElement('span');
        tag.className = `commit-type type-${type}`;
        tag.textContent = type;
        message.append(tag, ' ');
      }
      message.append(text);

      item.append(number, time, message);
      return item;
    }));
    empty.hidden = commits.length > 0;
  } catch {
    empty.textContent = 'No se pudo cargar la bitácora.';
    empty.hidden = false;
  }
})();
