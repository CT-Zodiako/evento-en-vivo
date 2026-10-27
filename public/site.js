// Fills the corner badge with the current stage and the time of the last change.
(async () => {
  const badge = document.getElementById('stage-badge');
  if (!badge) return;
  try {
    const res = await fetch('/api/site');
    const { stage, lastChange } = await res.json();
    badge.textContent = lastChange
      ? `Etapa ${stage} · último cambio ${new Date(lastChange).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}`
      : `Etapa ${stage} · aún sin commits`;
  } catch {
    badge.textContent = 'Etapa ? · sin conexión';
  }
})();
