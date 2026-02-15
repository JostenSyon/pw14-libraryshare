// Tengo false di default: qui voglio usare sempre le API reali.
const USE_MOCK = false;

// Se in futuro devo fare debug veloce, posso riattivare il mock da qui.
const api = await import(USE_MOCK ? "./mock.js" : "./real.js");

export { api };
