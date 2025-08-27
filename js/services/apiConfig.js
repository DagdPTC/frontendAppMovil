// js/services/apiConfig.js
export const API_BASE = "http://localhost:8080"; // ajusta si usas otro host/puerto

export const API = {
  mesa: `${API_BASE}/apiMesa`,
  estadoMesa: `${API_BASE}/apiEstadoMesa`, // 👈 añade la base de estados
};
