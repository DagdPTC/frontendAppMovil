const API_URL = "http://localhost:8080/apiPedido"

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    // Muestra el detalle de error de la API para depurar rápido
    let detail;
    try { detail = await res.text(); } catch { detail = ""; }
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${url}\n${detail}`);
  }
  // Algunas rutas pueden no devolver JSON (DELETE, PUT sin body)
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : null;
}

export async function getPedidos(){
    const res = await fetch(`${API_URL}/getDataPedido`);
    return res.json();
}

export async function createPedido(data){
    await fetch(`${API_URL}/createPedido`, {
        method: "POST",
        headers: {"Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

export async function updatePedido(id, data) {
    await fetch(`${API_URL}/modificarPedido/${id}`, {
        method: "PUT",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
    });
}

export async function deletePedido(id) {
    await fetch(`${API_URL}/eliminarPedido/${id}`, {
        method: "DELETE"
    });
    
}
