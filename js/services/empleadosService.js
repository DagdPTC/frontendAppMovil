// js/services/employeesService.js
import { API } from "./apiConfig.js";

function pickArray(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-cache", credentials: "include" });
  const txt = await res.text().catch(() => "");
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

function normalizeEmpleado(e) {
  if (!e || typeof e !== "object") return null;

  // ID robusto (acepta varias variantes comunes)
  const id =
    Number(e.id) ??
    Number(e.idEmpleado) ??
    Number(e.ID) ??
    Number(e.Id);

  // Nombre robusto (toma el primero que exista; arma nombres + apellidos si están)
  let nombre =
    e.nomEmpleado ??
    e.nombre ??
    (e.nombres && e.apellidos ? `${e.nombres} ${e.apellidos}` : (e.nombres || e.apellidos)) ??
    e.usuario ??  // por si solo viene el user
    "";

  // Si no hubo ningún nombre, usa "Empleado {id}" como fallback
  if (!nombre && Number.isFinite(id)) nombre = `Empleado ${id}`;

  // Validación final
  if (!Number.isFinite(id) || !String(nombre).trim()) return null;

  return { id: Number(id), nombre: String(nombre).trim() };
}


export async function getEmpleados(page = 0) {
  if (!API.empleado) return [];
  const sizes = [50, 20, 10, null];
  for (const s of sizes) {
    const url = s == null
      ? `${API.empleado}/getDataEmpleado?page=${page}`
      : `${API.empleado}/getDataEmpleado?page=${page}&size=${s}`;
    try {
      const data = await getJSON(url);
      const arr = pickArray(data).map(normalizeEmpleado).filter(Boolean);
      if (arr.length) return arr;
    } catch {}
  }
  return [];
}
