const JSON_HEADERS = {
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: JSON_HEADERS,
    credentials: "include",
    ...options,
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.errors?.join(" ") || "Something went wrong.";
    throw new Error(message);
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
