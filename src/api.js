const JSON_HEADERS = {
  "Content-Type": "application/json",
};

const LOCAL_API_ORIGIN = "http://localhost:4000";

function shouldTryLocalApi(path) {
  return (
    path.startsWith("/api") &&
    typeof window !== "undefined" &&
    window.location.origin !== LOCAL_API_ORIGIN
  );
}

async function fetchJson(path, options) {
  return fetch(path, {
    headers: JSON_HEADERS,
    credentials: "include",
    ...options,
  });
}

async function request(path, options = {}) {
  let response;

  try {
    response = await fetchJson(path, options);
  } catch {
    if (!shouldTryLocalApi(path)) {
      throw new Error("Could not reach the StockFlow server. Please start the app server and try again.");
    }

    try {
      response = await fetchJson(`${LOCAL_API_ORIGIN}${path}`, options);
    } catch {
      throw new Error("Could not reach the StockFlow server. Please start the app server and try again.");
    }
  }

  if (response.status === 204) {
    return null;
  }

  let data = await response.json().catch(() => null);
  if (!response.ok && !data && shouldTryLocalApi(path)) {
    try {
      response = await fetchJson(`${LOCAL_API_ORIGIN}${path}`, options);
      data = await response.json().catch(() => null);
    } catch {
      throw new Error("Could not reach the StockFlow server. Please start the app server and try again.");
    }
  }

  if (!response.ok) {
    const message =
      data?.errors?.join(" ") ||
      `The server returned ${response.status}. Please restart StockFlow and try again.`;
    throw new Error(message);
  }

  if (!data) {
    throw new Error("The server response was not valid. Please restart StockFlow and try again.");
  }

  return data;
}

export const api = {
  getCurrentUser: () => request("/api/auth/me"),
  login: (payload) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  signup: (payload) =>
    request("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () =>
    request("/api/auth/logout", {
      method: "POST",
    }),
  getDashboard: () => request("/api/dashboard"),
  getProducts: () => request("/api/products"),
  createProduct: (payload) =>
    request("/api/products", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProduct: (id, payload) =>
    request(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteProduct: (id) =>
    request(`/api/products/${id}`, {
      method: "DELETE",
    }),
  getSales: () => request("/api/sales"),
  createSale: (payload) =>
    request("/api/sales", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getInventoryHistory: () => request("/api/inventory/history"),
  restockProduct: (payload) =>
    request("/api/inventory/restock", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
