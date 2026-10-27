export const POLL = {
  question: '¿Para qué usarías un agente?',
  options: [
    { id: 'estudiar', label: 'Estudiar y repasar' },
    { id: 'programar', label: 'Programar y depurar código' },
    { id: 'investigar', label: 'Investigar y resumir información' },
    { id: 'automatizar', label: 'Automatizar tareas repetitivas' },
  ],
};

export const OPTION_IDS = new Set(POLL.options.map((o) => o.id));
