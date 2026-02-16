const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function request(path, init) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const body = await response.json();
      message = body.message ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined;
  }

  return response.json();
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

export async function register(username, email, password) {
  return request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password })
  });
}

export async function login(identifier, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password })
  });
}

export async function getMe(token) {
  return request("/auth/me", { headers: auth(token) });
}

export async function getMyPremiumRequests(token) {
  return request("/auth/premium-requests/me", { headers: auth(token) });
}

export async function createPremiumRequest(token, payload) {
  return request("/auth/premium-requests", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function getOverview(token) {
  return request("/analytics/overview", { headers: auth(token) });
}

export async function getLinks(token) {
  return request("/links", { headers: auth(token) });
}

export async function checkLinkCodeAvailability(token, code, excludeId) {
  const params = new URLSearchParams();
  if (excludeId) params.set("excludeId", excludeId);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return request(`/links/check-code/${encodeURIComponent(code)}${suffix}`, { headers: auth(token) });
}

export async function createLink(token, payload) {
  return request("/links", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function toggleLink(token, id) {
  return request(`/links/${id}/toggle`, {
    method: "POST",
    headers: auth(token)
  });
}

export async function deleteLink(token, id) {
  return request(`/links/${id}`, {
    method: "DELETE",
    headers: auth(token)
  });
}

export async function updateLink(token, id, payload) {
  return request(`/links/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function getAdminSummary(token) {
  return request("/admin/summary", { headers: auth(token) });
}

export async function getAdminLinks(token) {
  return request("/admin/links", { headers: auth(token) });
}

export async function createAdminLink(token, payload) {
  return request("/admin/links", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function updateAdminLink(token, id, payload) {
  return request(`/admin/links/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function deleteAdminLink(token, id) {
  return request(`/admin/links/${id}`, {
    method: "DELETE",
    headers: auth(token)
  });
}

export async function getUsers(token) {
  return request("/admin/users", { headers: auth(token) });
}

export async function getPremiumRequests(token) {
  return request("/admin/premium-requests", { headers: auth(token) });
}

export async function updatePremiumRequest(token, id, payload) {
  return request(`/admin/premium-requests/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function createUser(token, payload) {
  return request("/admin/users", {
    method: "POST",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function updateUser(token, id, payload) {
  return request(`/admin/users/${id}`, {
    method: "PATCH",
    headers: auth(token),
    body: JSON.stringify(payload)
  });
}

export async function deleteUser(token, id) {
  return request(`/admin/users/${id}`, {
    method: "DELETE",
    headers: auth(token)
  });
}

export function shortUrl(code) {
  return `${API_BASE_URL}/${code}`;
}
