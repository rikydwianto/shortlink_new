"use client";

import { useEffect, useMemo, useState } from "react";
import Swal from "sweetalert2";
import {
  checkLinkCodeAvailability,
  createAdminLink,
  createLink,
  createPremiumRequest,
  createUser,
  deleteAdminLink,
  deleteLink,
  deleteUser,
  getAdminLinks,
  getPremiumRequests,
  getAdminSummary,
  getLinks,
  getMe,
  getMyPremiumRequests,
  getOverview,
  getUsers,
  login,
  register,
  shortUrl,
  toggleLink,
  updatePremiumRequest,
  updateAdminLink,
  updateLink,
  updateUser
} from "../lib/api";

const TOKEN_KEY = "shortlink_token";
const ACTIVE_MENU_KEY = "shortlink_active_menu";
const LINK_TABLE_PAGE_SIZE = 8;
const NON_PREMIUM_LINK_LIMIT = 5;

const toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 1800,
  timerProgressBar: true
});

const menusByRole = (role) => {
  const list = [
    { key: "overview", label: "Overview" },
    { key: "analysis", label: "Analisa" },
    { key: "create", label: "Create Link" },
    { key: "myLinks", label: "My Links" }
  ];

  if (role === "USER") list.push({ key: "upgradePremium", label: "Upgrade Premium" });
  if (role === "ADMIN" || role === "SUPER_ADMIN") list.push({ key: "adminLinks", label: "All Links" });
  if (role === "SUPER_ADMIN") list.push({ key: "users", label: "Users" });
  if (role === "ADMIN" || role === "SUPER_ADMIN") list.push({ key: "premiumRequests", label: "Premium Requests" });
  list.push({ key: "settings", label: "Settings" });
  return list;
};

function parseCsv(value) {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isValidHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateUsername(username) {
  return /^[a-zA-Z0-9._-]{3,30}$/.test(username);
}

function validateCode(code) {
  if (!code) return { ok: true };
  if (code.length < 1 || code.length > 20) return { ok: false, message: "Code min 1 max 20" };
  if (!/^[a-zA-Z0-9_-]+$/.test(code)) return { ok: false, message: "Code hanya huruf/angka/_/-" };
  return { ok: true };
}

function getLinkFormErrors({
  targetUrl,
  customCode,
  title,
  maxClickLimit,
  linkFormScope,
  linkFormMode,
  linkOwnerId,
  codeAvailabilityStatus
}) {
  const errors = {};
  const cleanUrl = targetUrl.trim();
  const cleanCode = customCode.trim();
  const cleanTitle = title.trim();
  const codeCheck = validateCode(cleanCode);

  if (!cleanUrl || !isValidHttpUrl(cleanUrl)) {
    errors.targetUrl = "Destination URL harus valid (http/https).";
  }

  if (!cleanTitle) {
    errors.title = "Title wajib diisi.";
  }

  if (!codeCheck.ok) {
    errors.customCode = codeCheck.message;
  } else if (cleanCode && codeAvailabilityStatus === "taken") {
    errors.customCode = "Custom slug sudah dipakai.";
  }

  if (linkFormScope === "all" && linkFormMode === "create" && !linkOwnerId) {
    errors.linkOwnerId = "Owner link wajib dipilih.";
  }

  const maxClicks = maxClickLimit ? Number(maxClickLimit) : undefined;
  if (maxClicks !== undefined && (!Number.isInteger(maxClicks) || maxClicks < 1)) {
    errors.maxClickLimit = "Max click limit harus bilangan bulat lebih dari 0.";
  }

  return errors;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (num) => String(num).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatDateOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(date);
}

function formatCompact(value) {
  return new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(Number(value ?? 0));
}

function getLinkSortValue(item, key) {
  switch (key) {
    case "owner":
      return `${item.user?.username ?? ""} ${item.user?.email ?? ""}`.toLowerCase();
    case "code":
      return (item.code ?? "").toLowerCase();
    case "title":
      return (item.title ?? "").toLowerCase();
    case "targetUrl":
      return (item.targetUrl ?? "").toLowerCase();
    case "clicks":
      return Number(item.clicks ?? 0);
    case "status":
      return item.isActive ? 1 : 0;
    case "createdAt":
      return new Date(item.createdAt ?? 0).getTime();
    default:
      return "";
  }
}

function getUserSortValue(item, key) {
  switch (key) {
    case "username":
      return (item.username ?? "").toLowerCase();
    case "email":
      return (item.email ?? "").toLowerCase();
    case "role":
      return (item.role ?? "").toLowerCase();
    case "linksCount":
      return Number(item.linksCount ?? 0);
    case "createdAt":
      return new Date(item.createdAt ?? 0).getTime();
    default:
      return "";
  }
}

function sortLinks(items, sortState) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aValue = getLinkSortValue(a, sortState.key);
    const bValue = getLinkSortValue(b, sortState.key);
    const multiplier = sortState.direction === "asc" ? 1 : -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * multiplier;
    }

    return String(aValue).localeCompare(String(bValue)) * multiplier;
  });

  return sorted;
}

function sortUsers(items, sortState) {
  const sorted = [...items];
  sorted.sort((a, b) => {
    const aValue = getUserSortValue(a, sortState.key);
    const bValue = getUserSortValue(b, sortState.key);
    const multiplier = sortState.direction === "asc" ? 1 : -1;

    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * multiplier;
    }

    return String(aValue).localeCompare(String(bValue)) * multiplier;
  });

  return sorted;
}

function nextSortState(previous, key) {
  if (previous.key === key) {
    return {
      key,
      direction: previous.direction === "asc" ? "desc" : "asc"
    };
  }

  const defaultDesc = key === "clicks" || key === "createdAt";
  return {
    key,
    direction: defaultDesc ? "desc" : "asc"
  };
}

export default function Page() {
  const [token, setToken] = useState("");
  const [authMode, setAuthMode] = useState("login");
  const [activeMenu, setActiveMenu] = useState("overview");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [loading, setLoading] = useState(false);

  const [authIdentifier, setAuthIdentifier] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  const [user, setUser] = useState(null);
  const [overview, setOverview] = useState({ totalLinks: 0, totalClicks: 0 });
  const [myLinks, setMyLinks] = useState([]);
  const [adminLinks, setAdminLinks] = useState([]);
  const [adminSummary, setAdminSummary] = useState({ totalUsers: 0, totalLinks: 0, totalClicks: 0 });
  const [users, setUsers] = useState([]);
  const [premiumRequests, setPremiumRequests] = useState([]);
  const [myPremiumRequests, setMyPremiumRequests] = useState([]);
  const [premiumRequestMessage, setPremiumRequestMessage] = useState("");

  const [searchMyLinks, setSearchMyLinks] = useState("");
  const [searchAdminLinks, setSearchAdminLinks] = useState("");
  const [searchUsers, setSearchUsers] = useState("");
  const [analysisUserId, setAnalysisUserId] = useState("all");
  const [myLinksSort, setMyLinksSort] = useState({ key: "createdAt", direction: "desc" });
  const [adminLinksSort, setAdminLinksSort] = useState({ key: "createdAt", direction: "desc" });
  const [usersSort, setUsersSort] = useState({ key: "createdAt", direction: "desc" });
  const [myLinksPage, setMyLinksPage] = useState(1);
  const [adminLinksPage, setAdminLinksPage] = useState(1);
  const [usersPage, setUsersPage] = useState(1);
  const [userFormMode, setUserFormMode] = useState("create");
  const [editingUserId, setEditingUserId] = useState(null);
  const [userFormUsername, setUserFormUsername] = useState("");
  const [userFormEmail, setUserFormEmail] = useState("");
  const [userFormPassword, setUserFormPassword] = useState("");
  const [userFormRole, setUserFormRole] = useState("USER");
  const [userFormIsPremium, setUserFormIsPremium] = useState(false);
  const [linkFormMode, setLinkFormMode] = useState("create");
  const [linkFormScope, setLinkFormScope] = useState("my");
  const [editingLinkId, setEditingLinkId] = useState(null);
  const [linkOwnerId, setLinkOwnerId] = useState("");

  const [targetUrl, setTargetUrl] = useState("");
  const [customCode, setCustomCode] = useState("");
  const [codeAvailabilityStatus, setCodeAvailabilityStatus] = useState("idle");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [maxClickLimit, setMaxClickLimit] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [enableTracking, setEnableTracking] = useState(true);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [trackingPixelId, setTrackingPixelId] = useState("");
  const [targetAndroid, setTargetAndroid] = useState(false);
  const [targetIos, setTargetIos] = useState(false);
  const [targetDesktop, setTargetDesktop] = useState(false);
  const [geoCountries, setGeoCountries] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const menus = useMemo(() => menusByRole(user?.role), [user?.role]);
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const menuGroups = useMemo(() => {
    const mainKeys = new Set(["overview", "analysis", "create", "myLinks", "adminLinks", "users", "upgradePremium", "premiumRequests"]);
    return {
      main: menus.filter((item) => mainKeys.has(item.key)),
      system: menus.filter((item) => !mainKeys.has(item.key))
    };
  }, [menus]);

  useEffect(() => {
    const saved = window.localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    const savedMenu = window.localStorage.getItem(ACTIVE_MENU_KEY);
    if (savedMenu) setActiveMenu(savedMenu);
    if (!saved) setIsBootstrapping(false);
  }, []);

  useEffect(() => {
    if (!token) {
      setIsBootstrapping(false);
      return;
    }

    void (async () => {
      try {
        await refreshAll(token);
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!user) return;
    window.localStorage.setItem(ACTIVE_MENU_KEY, activeMenu);
  }, [activeMenu, user]);

  useEffect(() => {
    if (!user) return;
    if (!menus.some((item) => item.key === activeMenu)) {
      setActiveMenu("overview");
    }
  }, [activeMenu, menus, user]);

  useEffect(() => {
    const code = customCode.trim();
    const codeCheck = validateCode(code);

    if (!token || !code || !codeCheck.ok) {
      setCodeAvailabilityStatus("idle");
      return;
    }

    let cancelled = false;
    setCodeAvailabilityStatus("checking");

    const timer = window.setTimeout(async () => {
      try {
        const response = await checkLinkCodeAvailability(token, code, editingLinkId ?? undefined);
        if (!cancelled) {
          setCodeAvailabilityStatus(response.data?.isAvailable ? "available" : "taken");
        }
      } catch {
        if (!cancelled) setCodeAvailabilityStatus("error");
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customCode, editingLinkId, token]);

  async function refreshAll(activeToken) {
    try {
      const me = (await getMe(activeToken)).data;
      setUser(me);
      const [overviewRes, linksRes] = await Promise.all([getOverview(activeToken), getLinks(activeToken)]);
      setOverview(overviewRes.data);
      setMyLinks(linksRes.data);

      if (me.role === "ADMIN" || me.role === "SUPER_ADMIN") {
        const [s, l, requestsRes] = await Promise.all([getAdminSummary(activeToken), getAdminLinks(activeToken), getPremiumRequests(activeToken)]);
        setAdminSummary(s.data);
        setAdminLinks(l.data);
        setPremiumRequests(requestsRes.data);
      } else {
        setAdminSummary({ totalUsers: 0, totalLinks: 0, totalClicks: 0 });
        setAdminLinks([]);
        setPremiumRequests([]);
      }

      if (me.role === "SUPER_ADMIN") {
        setUsers((await getUsers(activeToken)).data);
      } else {
        setUsers([]);
      }

      if (me.role === "USER") {
        setMyPremiumRequests((await getMyPremiumRequests(activeToken)).data);
      } else {
        setMyPremiumRequests([]);
      }
    } catch (err) {
      doLogout(false);
      Swal.fire({ icon: "error", title: "Sesi berakhir", text: err?.message ?? "Login ulang" });
    }
  }

  function doLogout(showToast = true) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(ACTIVE_MENU_KEY);
    setToken("");
    setUser(null);
    setIsBootstrapping(false);
    setAuthIdentifier("");
    setAuthEmail("");
    setAuthUsername("");
    setAuthPassword("");
    setPremiumRequests([]);
    setMyPremiumRequests([]);
    setPremiumRequestMessage("");
    setActiveMenu("overview");
    if (showToast) void toast.fire({ icon: "success", title: "Logout berhasil" });
  }

  async function onAuthSubmit(event) {
    event.preventDefault();
    const cleanIdentifier = authIdentifier.trim().toLowerCase();
    const cleanEmail = authEmail.trim().toLowerCase();
    const cleanUsername = authUsername.trim().toLowerCase();
    if (authPassword.length < 8) return Swal.fire({ icon: "warning", title: "Password minimal 8 karakter" });

    if (authMode === "login") {
      if (!cleanIdentifier) return Swal.fire({ icon: "warning", title: "Username / email wajib diisi" });
    } else {
      if (!validateUsername(cleanUsername)) {
        return Swal.fire({ icon: "warning", title: "Username hanya huruf/angka/._- (3-30 karakter)" });
      }
      if (!validateEmail(cleanEmail)) return Swal.fire({ icon: "warning", title: "Email tidak valid" });
    }

    try {
      setLoading(true);
      const result = authMode === "login"
        ? await login(cleanIdentifier, authPassword)
        : await register(cleanUsername, cleanEmail, authPassword);
      window.localStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setAuthIdentifier("");
      setAuthEmail("");
      setAuthUsername("");
      setAuthPassword("");
      await toast.fire({ icon: "success", title: authMode === "login" ? "Login berhasil" : "Register berhasil" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Auth gagal", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  function resetLinkForm(scope = "my") {
    setLinkFormMode("create");
    setLinkFormScope(scope);
    setEditingLinkId(null);
    setLinkOwnerId(scope === "all" ? users[0]?.id ?? "" : "");
    setTargetUrl("");
    setCustomCode("");
    setCodeAvailabilityStatus("idle");
    setTitle("");
    setDescription("");
    setNotes("");
    setExpirationDate("");
    setMaxClickLimit("");
    setLinkPassword("");
    setIsActive(true);
    setEnableTracking(true);
    setUtmSource("");
    setUtmMedium("");
    setUtmCampaign("");
    setTrackingPixelId("");
    setTargetAndroid(false);
    setTargetIos(false);
    setTargetDesktop(false);
    setGeoCountries("");
    setScheduledAt("");
    setTagsInput("");
  }

  function onOpenCreateLinkForm(scope = "my") {
    if (scope === "my" && !user?.isPremium && myLinks.length >= NON_PREMIUM_LINK_LIMIT) {
      void Swal.fire({
        icon: "info",
        title: "Batas Link Non-Premium",
        text: `Maksimal ${NON_PREMIUM_LINK_LIMIT} link. Hapus salah satu link dulu atau upgrade ke premium.`
      });
      setActiveMenu("myLinks");
      return;
    }

    resetLinkForm(scope);
    setActiveMenu("create");
  }

  function onOpenEditLinkForm(item, scope = "my") {
    setLinkFormMode("edit");
    setLinkFormScope(scope);
    setEditingLinkId(item.id);
    setLinkOwnerId(item.userId ?? item.user?.id ?? "");
    setTargetUrl(item.targetUrl ?? "");
    setCustomCode(item.code ?? "");
    setCodeAvailabilityStatus("idle");
    setTitle(item.title ?? "");
    setDescription(item.description ?? "");
    setNotes(item.notes ?? "");
    setExpirationDate(toDateTimeLocal(item.expiresAt));
    setMaxClickLimit(item.maxClicks ? String(item.maxClicks) : "");
    setLinkPassword("");
    setIsActive(Boolean(item.isActive));
    setEnableTracking(item.enableTracking !== false);
    setUtmSource(item.utmSource ?? "");
    setUtmMedium(item.utmMedium ?? "");
    setUtmCampaign(item.utmCampaign ?? "");
    setTrackingPixelId(item.trackingPixelId ?? "");
    setTargetAndroid(Boolean(item.allowedDevices?.includes("android")));
    setTargetIos(Boolean(item.allowedDevices?.includes("ios")));
    setTargetDesktop(Boolean(item.allowedDevices?.includes("desktop")));
    setGeoCountries(item.allowedCountries?.join(",") ?? "");
    setScheduledAt(toDateTimeLocal(item.scheduledAt));
    setTagsInput(item.tags?.join(",") ?? "");
    setActiveMenu("create");
  }

  function onMenuClick(menuKey) {
    if (menuKey === "create") {
      onOpenCreateLinkForm("my");
      return;
    }

    setActiveMenu(menuKey);
  }

  function onSortMyLinks(key) {
    setMyLinksSort((previous) => nextSortState(previous, key));
  }

  function onSortAdminLinks(key) {
    setAdminLinksSort((previous) => nextSortState(previous, key));
  }

  function onSortUsers(key) {
    setUsersSort((previous) => nextSortState(previous, key));
  }

  function getSortMarker(sortState, key) {
    if (sortState.key !== key) return "";
    return sortState.direction === "asc" ? " ^" : " v";
  }

  async function onSubmitLinkForm(event) {
    event.preventDefault();
    if (!token) return;

    const cleanUrl = targetUrl.trim();
    const cleanCode = customCode.trim();
    const cleanTitle = title.trim();
    if (isCodeCheckPending) {
      return Swal.fire({ icon: "info", title: "Menunggu validasi slug selesai..." });
    }
    if (hasLinkFormErrors) {
      const firstError = Object.values(linkFormErrors)[0];
      return Swal.fire({ icon: "warning", title: firstError });
    }

    const maxClicks = maxClickLimit ? Number(maxClickLimit) : undefined;

    const allowedDevices = [];
    if (targetAndroid) allowedDevices.push("android");
    if (targetIos) allowedDevices.push("ios");
    if (targetDesktop) allowedDevices.push("desktop");

    const payload = {
      targetUrl: cleanUrl,
      code: cleanCode || undefined,
      title: cleanTitle,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
      expiresAt: expirationDate ? new Date(expirationDate).toISOString() : undefined,
      maxClicks,
      password: linkPassword.trim() || undefined,
      isActive,
      enableTracking,
      utmSource: utmSource.trim() || undefined,
      utmMedium: utmMedium.trim() || undefined,
      utmCampaign: utmCampaign.trim() || undefined,
      trackingPixelId: trackingPixelId.trim() || undefined,
      allowedDevices,
      allowedCountries: parseCsv(geoCountries).map((x) => x.toUpperCase()),
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      tags: parseCsv(tagsInput)
    };

    try {
      setLoading(true);
      const wasEdit = linkFormMode === "edit";

      if (wasEdit) {
        if (!editingLinkId) return;
        if (linkFormScope === "all") {
          await updateAdminLink(token, editingLinkId, payload);
        } else {
          await updateLink(token, editingLinkId, payload);
        }
      } else if (linkFormScope === "all") {
        await createAdminLink(token, { userId: linkOwnerId, ...payload });
      } else {
        await createLink(token, payload);
      }

      const nextMenu = linkFormScope === "all" ? "adminLinks" : "myLinks";
      resetLinkForm(linkFormScope);
      setActiveMenu(nextMenu);
      await refreshAll(token);
      await toast.fire({
        icon: "success",
        title: wasEdit ? "Link berhasil diperbarui" : "Link berhasil dibuat"
      });
    } catch (err) {
      Swal.fire({
        icon: "error",
        title: linkFormMode === "edit" ? "Gagal edit link" : "Gagal membuat link",
        text: err?.message ?? "Coba lagi"
      });
    } finally {
      setLoading(false);
    }
  }

  async function onToggleMyLink(id) {
    if (!token) return;
    try {
      setLoading(true);
      await toggleLink(token, id);
      await refreshAll(token);
      await toast.fire({ icon: "success", title: "Status link diubah" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal toggle", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteMyLink(id) {
    if (!token) return;
    const confirm = await Swal.fire({ icon: "warning", title: "Hapus link ini?", showCancelButton: true });
    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);
      await deleteLink(token, id);
      await refreshAll(token);
      await toast.fire({ icon: "success", title: "Link dihapus" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal hapus", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  async function onCopy(url) {
    try {
      await navigator.clipboard.writeText(url);
      await toast.fire({ icon: "success", title: "Link disalin" });
    } catch {
      Swal.fire({ icon: "error", title: "Gagal menyalin" });
    }
  }

  function resetUserForm() {
    setUserFormMode("create");
    setEditingUserId(null);
    setUserFormUsername("");
    setUserFormEmail("");
    setUserFormPassword("");
    setUserFormRole("USER");
    setUserFormIsPremium(false);
  }

  function onOpenCreateUserForm() {
    resetUserForm();
  }

  function onOpenEditUserForm(item) {
    setUserFormMode("edit");
    setEditingUserId(item.id);
    setUserFormUsername(item.username ?? "");
    setUserFormEmail(item.email ?? "");
    setUserFormPassword("");
    setUserFormRole(item.role);
    setUserFormIsPremium(Boolean(item.isPremium));
  }

  async function onSubmitUserForm(event) {
    event.preventDefault();
    if (!token) return;

    const cleanUsername = userFormUsername.trim().toLowerCase();
    const cleanEmail = userFormEmail.trim().toLowerCase();
    if (!validateUsername(cleanUsername)) {
      return Swal.fire({ icon: "warning", title: "Username hanya huruf/angka/._- (3-30 karakter)" });
    }
    if (!validateEmail(cleanEmail)) {
      return Swal.fire({ icon: "warning", title: "Email tidak valid" });
    }
    if (userFormMode === "create" && userFormPassword.length < 8) {
      return Swal.fire({ icon: "warning", title: "Password minimal 8 karakter" });
    }
    if (userFormMode === "edit" && userFormPassword && userFormPassword.length < 8) {
      return Swal.fire({ icon: "warning", title: "Password baru minimal 8 karakter" });
    }

    if (userFormMode === "edit" && !editingUserId) {
      return;
    }

    const payload = {
      username: cleanUsername,
      email: cleanEmail,
      role: userFormRole,
      isPremium: userFormIsPremium,
      password: userFormPassword || undefined
    };

    try {
      setLoading(true);
      const isEdit = userFormMode === "edit";
      if (isEdit) {
        await updateUser(token, editingUserId, payload);
      } else {
        await createUser(token, payload);
      }
      await refreshAll(token);
      resetUserForm();
      await toast.fire({ icon: "success", title: isEdit ? "User diperbarui" : "User dibuat" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal simpan user", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteUser(item) {
    if (!token) return;
    const confirm = await Swal.fire({
      icon: "warning",
      title: `Hapus ${item.username} (${item.email})?`,
      showCancelButton: true
    });
    if (!confirm.isConfirmed) return;
    try {
      await deleteUser(token, item.id);
      await refreshAll(token);
      await toast.fire({ icon: "success", title: "User dihapus" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal hapus user", text: err?.message ?? "Coba lagi" });
    }
  }

  async function onDeleteAdminLink(item) {
    if (!token) return;
    const confirm = await Swal.fire({ icon: "warning", title: `Hapus ${item.code}?`, showCancelButton: true });
    if (!confirm.isConfirmed) return;
    try {
      await deleteAdminLink(token, item.id);
      await refreshAll(token);
      await toast.fire({ icon: "success", title: "Admin link dihapus" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal hapus admin link", text: err?.message ?? "Coba lagi" });
    }
  }

  async function onSubmitPremiumRequest(event) {
    event.preventDefault();
    if (!token) return;
    if (user?.isPremium) {
      return Swal.fire({ icon: "info", title: "Akun kamu sudah premium" });
    }

    try {
      setLoading(true);
      await createPremiumRequest(token, { message: premiumRequestMessage.trim() || undefined });
      setPremiumRequestMessage("");
      await refreshAll(token);
      await toast.fire({ icon: "success", title: "Permintaan premium dikirim" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal kirim request", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  async function onProcessPremiumRequest(item, action) {
    if (!token) return;
    const confirm = await Swal.fire({
      icon: "question",
      title: action === "approve" ? `Setujui premium untuk @${item.user?.username ?? "-" }?` : `Tolak request @${item.user?.username ?? "-" }?`,
      input: "text",
      inputLabel: "Catatan (opsional)",
      inputPlaceholder: "Masukkan catatan...",
      showCancelButton: true
    });
    if (!confirm.isConfirmed) return;

    try {
      setLoading(true);
      await updatePremiumRequest(token, item.id, {
        action,
        note: typeof confirm.value === "string" && confirm.value.trim() ? confirm.value.trim() : undefined
      });
      await refreshAll(token);
      await toast.fire({ icon: "success", title: action === "approve" ? "Request disetujui" : "Request ditolak" });
    } catch (err) {
      Swal.fire({ icon: "error", title: "Gagal memproses request", text: err?.message ?? "Coba lagi" });
    } finally {
      setLoading(false);
    }
  }

  const filteredMyLinks = useMemo(() => {
    const q = searchMyLinks.trim().toLowerCase();
    if (!q) return myLinks;
    return myLinks.filter((item) => `${item.code} ${item.title ?? ""} ${item.targetUrl}`.toLowerCase().includes(q));
  }, [myLinks, searchMyLinks]);

  const filteredAdminLinks = useMemo(() => {
    const q = searchAdminLinks.trim().toLowerCase();
    if (!q) return adminLinks;
    return adminLinks.filter((item) =>
      `${item.code} ${item.title ?? ""} ${item.targetUrl} ${item.user?.username ?? ""} ${item.user?.email ?? ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [adminLinks, searchAdminLinks]);

  const sortedMyLinks = useMemo(() => sortLinks(filteredMyLinks, myLinksSort), [filteredMyLinks, myLinksSort]);
  const sortedAdminLinks = useMemo(() => sortLinks(filteredAdminLinks, adminLinksSort), [filteredAdminLinks, adminLinksSort]);

  const myLinksTotalPages = Math.max(1, Math.ceil(sortedMyLinks.length / LINK_TABLE_PAGE_SIZE));
  const adminLinksTotalPages = Math.max(1, Math.ceil(sortedAdminLinks.length / LINK_TABLE_PAGE_SIZE));

  const safeMyLinksPage = Math.min(myLinksPage, myLinksTotalPages);
  const safeAdminLinksPage = Math.min(adminLinksPage, adminLinksTotalPages);

  const pagedMyLinks = useMemo(() => {
    const start = (safeMyLinksPage - 1) * LINK_TABLE_PAGE_SIZE;
    return sortedMyLinks.slice(start, start + LINK_TABLE_PAGE_SIZE);
  }, [safeMyLinksPage, sortedMyLinks]);

  const pagedAdminLinks = useMemo(() => {
    const start = (safeAdminLinksPage - 1) * LINK_TABLE_PAGE_SIZE;
    return sortedAdminLinks.slice(start, start + LINK_TABLE_PAGE_SIZE);
  }, [safeAdminLinksPage, sortedAdminLinks]);

  const myLinksFrom = sortedMyLinks.length === 0 ? 0 : (safeMyLinksPage - 1) * LINK_TABLE_PAGE_SIZE + 1;
  const myLinksTo = Math.min(safeMyLinksPage * LINK_TABLE_PAGE_SIZE, sortedMyLinks.length);
  const adminLinksFrom = sortedAdminLinks.length === 0 ? 0 : (safeAdminLinksPage - 1) * LINK_TABLE_PAGE_SIZE + 1;
  const adminLinksTo = Math.min(safeAdminLinksPage * LINK_TABLE_PAGE_SIZE, sortedAdminLinks.length);

  useEffect(() => {
    setMyLinksPage((previous) => Math.min(previous, myLinksTotalPages));
  }, [myLinksTotalPages]);

  useEffect(() => {
    setAdminLinksPage((previous) => Math.min(previous, adminLinksTotalPages));
  }, [adminLinksTotalPages]);

  const filteredUsers = useMemo(() => {
    const q = searchUsers.trim().toLowerCase();
    if (!q) return users;
    return users.filter((item) => `${item.username} ${item.email} ${item.role} ${item.isPremium ? "premium" : "regular"}`.toLowerCase().includes(q));
  }, [users, searchUsers]);

  const sortedUsers = useMemo(() => sortUsers(filteredUsers, usersSort), [filteredUsers, usersSort]);
  const usersTotalPages = Math.max(1, Math.ceil(sortedUsers.length / LINK_TABLE_PAGE_SIZE));
  const safeUsersPage = Math.min(usersPage, usersTotalPages);
  const pagedUsers = useMemo(() => {
    const start = (safeUsersPage - 1) * LINK_TABLE_PAGE_SIZE;
    return sortedUsers.slice(start, start + LINK_TABLE_PAGE_SIZE);
  }, [safeUsersPage, sortedUsers]);
  const usersFrom = sortedUsers.length === 0 ? 0 : (safeUsersPage - 1) * LINK_TABLE_PAGE_SIZE + 1;
  const usersTo = Math.min(safeUsersPage * LINK_TABLE_PAGE_SIZE, sortedUsers.length);

  useEffect(() => {
    setUsersPage((previous) => Math.min(previous, usersTotalPages));
  }, [usersTotalPages]);

  const overviewLinks = isAdmin ? adminLinks : myLinks;
  const overviewTotalLinks = isAdmin ? adminSummary.totalLinks : overview.totalLinks;
  const overviewTotalClicks = isAdmin ? adminSummary.totalClicks : overview.totalClicks;
  const overviewTotalUsers = isAdmin ? adminSummary.totalUsers : 1;
  const overviewActiveLinks = overviewLinks.filter((item) => item.isActive).length;
  const overviewInactiveLinks = Math.max(overviewTotalLinks - overviewActiveLinks, 0);
  const overviewAvgClicks = overviewTotalLinks > 0 ? (overviewTotalClicks / overviewTotalLinks).toFixed(1) : "0";
  const overviewActiveRate = overviewTotalLinks > 0 ? ((overviewActiveLinks / overviewTotalLinks) * 100).toFixed(1) : "0";
  const latestLink = overviewLinks[0];
  const userInitial = (user?.username ?? "US").slice(0, 2).toUpperCase();
  const analysisOwnerOptions = useMemo(() => {
    if (!user) return [];

    if (!isAdmin) {
      return [
        {
          id: user.id,
          label: `@${user.username} - ${user.email}`
        }
      ];
    }

    const seen = new Set();
    const options = [];

    adminLinks.forEach((item) => {
      const ownerId = item.user?.id ?? item.userId;
      if (!ownerId || seen.has(ownerId)) return;
      seen.add(ownerId);
      options.push({
        id: ownerId,
        label: `@${item.user?.username ?? "unknown"} - ${item.user?.email ?? "-"}`
      });
    });

    if (isSuperAdmin) {
      users.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        options.push({
          id: item.id,
          label: `@${item.username} - ${item.email}`
        });
      });
    }

    return options;
  }, [adminLinks, isAdmin, isSuperAdmin, user, users]);

  useEffect(() => {
    if (!user) return;
    if (!isAdmin) {
      setAnalysisUserId(user.id);
      return;
    }

    const hasSelectedOwner = analysisOwnerOptions.some((item) => item.id === analysisUserId);
    if (analysisUserId !== "all" && !hasSelectedOwner) {
      setAnalysisUserId("all");
    }
  }, [analysisOwnerOptions, analysisUserId, isAdmin, user]);

  const analysisFilteredLinks = useMemo(() => {
    if (!isAdmin) {
      return myLinks;
    }
    if (analysisUserId === "all") {
      return adminLinks;
    }
    return adminLinks.filter((item) => (item.user?.id ?? item.userId) === analysisUserId);
  }, [adminLinks, analysisUserId, isAdmin, myLinks]);

  const analysisTotalLinks = analysisFilteredLinks.length;
  const analysisActiveLinks = analysisFilteredLinks.filter((item) => item.isActive).length;
  const analysisInactiveLinks = Math.max(analysisTotalLinks - analysisActiveLinks, 0);
  const analysisTotalClicks = analysisFilteredLinks.reduce((total, item) => total + Number(item.clicks ?? 0), 0);
  const analysisAvgClicks = analysisTotalLinks > 0 ? (analysisTotalClicks / analysisTotalLinks).toFixed(1) : "0";
  const analysisTopLinks = useMemo(
    () => [...analysisFilteredLinks].sort((a, b) => Number(b.clicks ?? 0) - Number(a.clicks ?? 0)).slice(0, 5),
    [analysisFilteredLinks]
  );
  const analysisLatestLinks = useMemo(
    () =>
      [...analysisFilteredLinks]
        .sort((a, b) => new Date(b.lastClickedAt ?? b.createdAt ?? 0).getTime() - new Date(a.lastClickedAt ?? a.createdAt ?? 0).getTime())
        .slice(0, 6),
    [analysisFilteredLinks]
  );
  const isNonPremiumMyLimitReached = !user?.isPremium && myLinks.length >= NON_PREMIUM_LINK_LIMIT;
  const premiumPendingCount = premiumRequests.filter((item) => item.status === "PENDING").length;
  const myLatestPremiumRequest = myPremiumRequests[0] ?? null;
  const linkFormErrors = useMemo(
    () =>
      getLinkFormErrors({
        targetUrl,
        customCode,
        title,
        maxClickLimit,
        linkFormScope,
        linkFormMode,
        linkOwnerId,
        codeAvailabilityStatus
      }),
    [codeAvailabilityStatus, customCode, linkFormMode, linkFormScope, linkOwnerId, maxClickLimit, targetUrl, title]
  );
  const hasLinkFormErrors = Object.keys(linkFormErrors).length > 0;
  const isCodeCheckPending = customCode.trim() && codeAvailabilityStatus === "checking";

  if (isBootstrapping) {
    return (
      <main className="auth-shell">
        <section className="auth-card card">
          <p className="eyebrow">Loading</p>
          <h2>Menyiapkan dashboard...</h2>
          <p className="subtle">Memuat sesi login dan menu terakhir.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-brand card">
          <p className="eyebrow">Shortlink Platform</p>
          <h1>Modern Dashboard + User Management</h1>
          <p className="subtle">Login sebagai SUPER_ADMIN untuk membuka semua menu.</p>
        </section>
        <section className="auth-card card">
          <div className="row-between">
            <h2>{authMode === "login" ? "Login" : "Register"}</h2>
            <button className="btn ghost" type="button" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>{authMode === "login" ? "Buat akun" : "Punya akun? Login"}</button>
          </div>
          <form className="stack" onSubmit={onAuthSubmit}>
            {authMode === "login" ? (
              <label className="label">
                Username / Email
                <input className="input" value={authIdentifier} onChange={(e) => setAuthIdentifier(e.target.value)} required />
              </label>
            ) : (
              <>
                <label className="label">
                  Username
                  <input className="input" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} required />
                </label>
                <label className="label">
                  Email
                  <input className="input" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
                </label>
              </>
            )}
            <label className="label">Password<input className="input" type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required /></label>
            <button className="btn primary" type="submit" disabled={loading}>{loading ? "Memproses..." : authMode === "login" ? "Login" : "Register"}</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="top-header card">
        <div className="top-header-title">
          <h1>Dashboard</h1>
          <p className="subtle">Monitor performa link, tim, dan revenue klik dengan cepat.</p>
        </div>
        <div className="header-actions">
          <button className="btn icon" type="button" onClick={() => setActiveMenu("settings")}>Alerts</button>
          <button className="btn primary" type="button" onClick={() => onOpenCreateLinkForm("my")} disabled={isNonPremiumMyLimitReached}>Create Report</button>
          <div className="avatar-pill">{userInitial}</div>
          <button className="btn secondary" type="button" onClick={() => refreshAll(token)} disabled={loading}>Refresh</button>
          <button className="btn danger" type="button" onClick={() => doLogout(true)}>Logout</button>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-avatar">{userInitial}</div>
          <div>
            <h3>AdminDash</h3>
            <p className="subtle">Studio Analytics</p>
          </div>
        </div>
        <nav className="menu">
          <p className="menu-label">Main</p>
          {menuGroups.main.map((item) => (
            <button key={item.key} className={`menu-btn ${activeMenu === item.key ? "active" : ""}`} type="button" onClick={() => onMenuClick(item.key)}>{item.label}</button>
          ))}
          {menuGroups.system.length > 0 ? <p className="menu-label">System</p> : null}
          {menuGroups.system.map((item) => (
            <button key={item.key} className={`menu-btn ${activeMenu === item.key ? "active" : ""}`} type="button" onClick={() => onMenuClick(item.key)}>{item.label}</button>
          ))}
        </nav>
        <article className="online-card">
          <span className="online-dot" />
          <p>Online</p>
          <h4>{user.email}</h4>
        </article>
      </aside>

      <section className="content">
        {activeMenu === "overview" ? (
          <div className="overview-wrap">
            <div className="overview-head row-between">
              <div>
                <h2>Dashboard Overview</h2>
                <p className="subtle">Update utama untuk {formatDateOnly()}</p>
              </div>
              <div className="header-actions">
                <button className="btn ghost" type="button">Download</button>
                <button className="btn secondary" type="button">Share</button>
              </div>
            </div>

            <div className="overview-hero card">
              <div className="hero-left">
                <span className="hero-pill">Growth Pulse</span>
                <h3>Eksplorasi performa bisnis shortlink secara real-time</h3>
                <p className="subtle">
                  Ringkas semua metrik penting, dari traffic hingga engagement. Kelola link dan user tanpa berpindah halaman.
                </p>
                <div className="hero-actions">
                  <button className="btn primary" type="button" onClick={() => onOpenCreateLinkForm("my")} disabled={isNonPremiumMyLimitReached}>Launch Campaign</button>
                  <button className="btn ghost" type="button" onClick={() => setActiveMenu("myLinks")}>View Insights</button>
                  <span className="hero-chip">Updated {formatDateTime(new Date())}</span>
                </div>
              </div>

              <div className="hero-right">
                <div className="hero-kpi-grid">
                  <article className="hero-kpi">
                    <p>Total Clicks</p>
                    <h4>{formatCompact(overviewTotalClicks)}</h4>
                    <span className="trend up">Active rate {overviewActiveRate}%</span>
                  </article>
                  <article className="hero-kpi">
                    <p>Total Links</p>
                    <h4>{formatCompact(overviewTotalLinks)}</h4>
                    <span className="trend up">{overviewActiveLinks} aktif</span>
                  </article>
                  <article className="hero-kpi">
                    <p>Active Users</p>
                    <h4>{formatCompact(overviewTotalUsers)}</h4>
                    <span className="trend up">Role scope {isAdmin ? "global" : "personal"}</span>
                  </article>
                  <article className="hero-kpi">
                    <p>Inactive</p>
                    <h4>{formatCompact(overviewInactiveLinks)}</h4>
                    <span className="trend down">Perlu optimasi</span>
                  </article>
                </div>

                <article className="hero-focus">
                  <h4>Focus Today</h4>
                  <p className="subtle">
                    {latestLink
                      ? `Pantau link ${latestLink.code} dan tingkatkan performanya.`
                      : "Belum ada link, mulai dengan campaign baru hari ini."}
                  </p>
                  <button className="btn dark" type="button" onClick={() => setActiveMenu("myLinks")}>Open Taskboard</button>
                </article>
              </div>
            </div>

            <div className="stats-grid">
              <article className="stat-box"><p>My Links</p><h3>{overview.totalLinks}</h3></article>
              <article className="stat-box"><p>My Clicks</p><h3>{overview.totalClicks}</h3></article>
              <article className="stat-box"><p>All Links</p><h3>{isAdmin ? adminSummary.totalLinks : overview.totalLinks}</h3></article>
              <article className="stat-box"><p>Avg Click / Link</p><h3>{overviewAvgClicks}</h3></article>
            </div>
          </div>
        ) : null}

        {activeMenu === "analysis" ? (
          <div className="panel card">
            <div className="row-between">
              <div>
                <p className="eyebrow">Analisa</p>
                <h2>Analisa Performa Link</h2>
                <p className="subtle">
                  {isAdmin
                    ? "Pantau performa link lintas user atau per user tertentu."
                    : "Pantau performa seluruh link milik akun kamu."}
                </p>
              </div>
              <div className="header-actions">
                {isAdmin ? (
                  <label className="label">
                    Filter User
                    <select className="input" value={analysisUserId} onChange={(e) => setAnalysisUserId(e.target.value)}>
                      <option value="all">Semua User</option>
                      {analysisOwnerOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <button className="btn secondary" type="button" onClick={() => refreshAll(token)} disabled={loading}>Refresh</button>
              </div>
            </div>

            <div className="stats-grid">
              <article className="stat-box"><p>Total Links</p><h3>{analysisTotalLinks}</h3></article>
              <article className="stat-box"><p>Total Clicks</p><h3>{analysisTotalClicks}</h3></article>
              <article className="stat-box"><p>Active Links</p><h3>{analysisActiveLinks}</h3></article>
              <article className="stat-box"><p>Avg Click / Link</p><h3>{analysisAvgClicks}</h3></article>
            </div>

            <div className="settings-grid">
              <article className="setting-box">
                <p>Inactive Links</p>
                <h3>{analysisInactiveLinks}</h3>
              </article>
              <article className="setting-box">
                <p>Active Rate</p>
                <h3>{analysisTotalLinks > 0 ? `${((analysisActiveLinks / analysisTotalLinks) * 100).toFixed(1)}%` : "0%"}</h3>
              </article>
              <article className="setting-box">
                <p>Top Link</p>
                <h3>{analysisTopLinks[0]?.code ?? "-"}</h3>
              </article>
              <article className="setting-box">
                <p>Last Activity</p>
                <h3>{analysisLatestLinks[0] ? formatDateTime(analysisLatestLinks[0].lastClickedAt ?? analysisLatestLinks[0].createdAt) : "-"}</h3>
              </article>
            </div>

            <div className="stack">
              <div>
                <p className="eyebrow">Top Links</p>
                <h3>Peringkat Berdasarkan Clicks</h3>
              </div>
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>#</th>
                      {isAdmin ? <th>Owner</th> : null}
                      <th>Code</th>
                      <th>Title</th>
                      <th>Clicks</th>
                      <th>Status</th>
                      <th>Last Clicked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisTopLinks.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="empty-row">Belum ada data untuk dianalisa.</td>
                      </tr>
                    ) : (
                      analysisTopLinks.map((item, idx) => (
                        <tr key={item.id}>
                          <td>{idx + 1}</td>
                          {isAdmin ? <td>@{item.user?.username ?? "-"}</td> : null}
                          <td>
                            <a className="code-link" href={shortUrl(item.code)} target="_blank" rel="noreferrer">{item.code}</a>
                          </td>
                          <td><p className="cell-title">{item.title}</p></td>
                          <td>{item.clicks}</td>
                          <td><span className={`badge ${item.isActive ? "ok" : "mute"}`}>{item.isActive ? "Active" : "Inactive"}</span></td>
                          <td>{formatDateTime(item.lastClickedAt ?? item.createdAt)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "create" ? (
          <div className="panel card">
            <p className="eyebrow">{linkFormMode === "edit" ? "Edit Link" : "Create Link"}</p>
            <h2>{linkFormMode === "edit" ? "Edit Link Terpusat" : "Form Input Shortlink"}</h2>
            <p className="subtle">{linkFormScope === "all" ? "Mode: All Links (semua user)" : "Mode: My Links (link pribadi)"}</p>
            <form className="stack" onSubmit={onSubmitLinkForm}>
              {linkFormScope === "all" && linkFormMode === "create" ? (
                <label className="label">
                  Owner User
                  <select className={`input ${linkFormErrors.linkOwnerId ? "error" : ""}`} value={linkOwnerId} onChange={(e) => setLinkOwnerId(e.target.value)} required>
                    <option value="">Pilih user</option>
                    {users.map((item) => <option key={item.id} value={item.id}>@{item.username} - {item.email}</option>)}
                  </select>
                  {linkFormErrors.linkOwnerId ? <span className="field-error">{linkFormErrors.linkOwnerId}</span> : null}
                </label>
              ) : null}
              <h3>Informasi Utama</h3>
              <div className="split-grid">
                <label className="label">
                  Destination URL (required)
                  <input className={`input ${linkFormErrors.targetUrl ? "error" : ""}`} value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} required />
                  {linkFormErrors.targetUrl ? <span className="field-error">{linkFormErrors.targetUrl}</span> : null}
                </label>
                <label className="label">
                  Custom Slug (optional)
                  <input className={`input ${linkFormErrors.customCode ? "error" : ""}`} value={customCode} onChange={(e) => setCustomCode(e.target.value)} />
                  {linkFormErrors.customCode ? <span className="field-error">{linkFormErrors.customCode}</span> : null}
                  {!linkFormErrors.customCode && customCode.trim() && codeAvailabilityStatus === "checking" ? (
                    <span className="field-hint">Mengecek ketersediaan slug...</span>
                  ) : null}
                  {!linkFormErrors.customCode && customCode.trim() && codeAvailabilityStatus === "available" ? (
                    <span className="field-ok">Slug tersedia.</span>
                  ) : null}
                  {!linkFormErrors.customCode && customCode.trim() && codeAvailabilityStatus === "error" ? (
                    <span className="field-hint">Gagal cek slug realtime, akan dicek ulang saat submit.</span>
                  ) : null}
                </label>
              </div>
              <div className="split-grid">
                <label className="label">
                  Title (required)
                  <input className={`input ${linkFormErrors.title ? "error" : ""}`} value={title} onChange={(e) => setTitle(e.target.value)} required />
                  {linkFormErrors.title ? <span className="field-error">{linkFormErrors.title}</span> : null}
                </label>
                <label className="label">Description (optional)<input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
              </div>
              <label className="label">Description / Notes (optional)<textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>

              <h3>Pengaturan Link</h3>
              <div className="split-grid">
                <label className="label">Expiration Date<input className="input" type="datetime-local" value={expirationDate} onChange={(e) => setExpirationDate(e.target.value)} /></label>
                <label className="label">
                  Max Click Limit
                  <input className={`input ${linkFormErrors.maxClickLimit ? "error" : ""}`} type="number" min="1" value={maxClickLimit} onChange={(e) => setMaxClickLimit(e.target.value)} />
                  {linkFormErrors.maxClickLimit ? <span className="field-error">{linkFormErrors.maxClickLimit}</span> : null}
                </label>
              </div>
              <div className="split-grid">
                <label className="label">Password Protection<input className="input" type="password" value={linkPassword} onChange={(e) => setLinkPassword(e.target.value)} /></label>
                <label className="check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />Enable / Disable Link</label>
              </div>

              <h3>Tracking & Analytics</h3>
              <label className="check"><input type="checkbox" checked={enableTracking} onChange={(e) => setEnableTracking(e.target.checked)} />Enable Tracking</label>
              <div className="split-grid">
                <label className="label">utm_source<input className="input" value={utmSource} onChange={(e) => setUtmSource(e.target.value)} /></label>
                <label className="label">utm_medium<input className="input" value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} /></label>
              </div>
              <div className="split-grid">
                <label className="label">utm_campaign<input className="input" value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} /></label>
                <label className="label">Tracking Pixel ID<input className="input" value={trackingPixelId} onChange={(e) => setTrackingPixelId(e.target.value)} /></label>
              </div>

              <h3>Advanced Targeting</h3>
              <div className="check-grid">
                <label className="check"><input type="checkbox" checked={targetAndroid} onChange={(e) => setTargetAndroid(e.target.checked)} />Android</label>
                <label className="check"><input type="checkbox" checked={targetIos} onChange={(e) => setTargetIos(e.target.checked)} />iOS</label>
                <label className="check"><input type="checkbox" checked={targetDesktop} onChange={(e) => setTargetDesktop(e.target.checked)} />Desktop</label>
              </div>
              <div className="split-grid">
                <label className="label">Geo Targeting<input className="input" value={geoCountries} onChange={(e) => setGeoCountries(e.target.value)} placeholder="ID,SG,US" /></label>
                <label className="label">Scheduled Activation<input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></label>
              </div>

              <h3>Organisasi</h3>
              <label className="label">Tags / Label<input className="input" value={tagsInput} onChange={(e) => setTagsInput(e.target.value)} placeholder="marketing,affiliate,social" /></label>
              <div className="header-actions">
                <button className="btn primary" type="submit" disabled={loading || hasLinkFormErrors || isCodeCheckPending}>
                  {loading ? "Menyimpan..." : linkFormMode === "edit" ? "Update Link" : "Simpan"}
                </button>
                <button className="btn ghost" type="button" onClick={() => onOpenCreateLinkForm(linkFormScope)}>Reset Form</button>
              </div>
            </form>
          </div>
        ) : null}

        {activeMenu === "myLinks" ? (
          <div className="panel card">
            <div className="row-between">
              <div><p className="eyebrow">My Links</p><h2>Link Pribadi</h2></div>
              <div className="header-actions">
                <input
                  className="input search-input"
                  value={searchMyLinks}
                  onChange={(e) => {
                    setSearchMyLinks(e.target.value);
                    setMyLinksPage(1);
                  }}
                  placeholder="Cari link"
                />
                <button className="btn primary" type="button" onClick={() => onOpenCreateLinkForm("my")} disabled={isNonPremiumMyLimitReached}>Create Link</button>
              </div>
            </div>
            <div className="datatable-shell">
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "code" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("code")}>
                          Code{getSortMarker(myLinksSort, "code")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "title" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("title")}>
                          Title{getSortMarker(myLinksSort, "title")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "targetUrl" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("targetUrl")}>
                          Destination{getSortMarker(myLinksSort, "targetUrl")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "clicks" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("clicks")}>
                          Clicks{getSortMarker(myLinksSort, "clicks")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "status" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("status")}>
                          Status{getSortMarker(myLinksSort, "status")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${myLinksSort.key === "createdAt" ? "active" : ""}`} type="button" onClick={() => onSortMyLinks("createdAt")}>
                          Dibuat{getSortMarker(myLinksSort, "createdAt")}
                        </button>
                      </th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedMyLinks.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-row">Belum ada link.</td>
                      </tr>
                    ) : (
                      pagedMyLinks.map((item) => {
                        const url = shortUrl(item.code);
                        return (
                          <tr key={item.id}>
                            <td>
                              <a className="code-link" href={url} target="_blank" rel="noreferrer">{item.code}</a>
                            </td>
                            <td>
                              <p className="cell-title">{item.title}</p>
                            </td>
                            <td>
                              <p className="cell-url" title={item.targetUrl}>{item.targetUrl}</p>
                            </td>
                            <td>{item.clicks}</td>
                            <td>
                              <span className={`badge ${item.isActive ? "ok" : "mute"}`}>{item.isActive ? "Active" : "Inactive"}</span>
                            </td>
                            <td>{formatDateTime(item.createdAt)}</td>
                            <td>
                              <div className="table-actions">
                                <button className="btn secondary" type="button" onClick={() => onCopy(url)}>Copy</button>
                                <button className="btn secondary" type="button" onClick={() => onOpenEditLinkForm(item, "my")}>Edit</button>
                                <button className="btn secondary" type="button" onClick={() => onToggleMyLink(item.id)}>{item.isActive ? "Disable" : "Enable"}</button>
                                <button className="btn danger" type="button" onClick={() => onDeleteMyLink(item.id)}>Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <p className="subtle">Menampilkan {myLinksFrom}-{myLinksTo} dari {sortedMyLinks.length} link</p>
                <div className="pager">
                  <button className="btn ghost" type="button" disabled={safeMyLinksPage <= 1} onClick={() => setMyLinksPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                  <span className="pager-info">Hal. {safeMyLinksPage} / {myLinksTotalPages}</span>
                  <button className="btn ghost" type="button" disabled={safeMyLinksPage >= myLinksTotalPages} onClick={() => setMyLinksPage((prev) => Math.min(myLinksTotalPages, prev + 1))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "adminLinks" && isAdmin ? (
          <div className="panel card">
            <div className="row-between">
              <div><p className="eyebrow">Admin Links</p><h2>Semua Link</h2></div>
              <div className="header-actions">
                <input
                  className="input search-input"
                  value={searchAdminLinks}
                  onChange={(e) => {
                    setSearchAdminLinks(e.target.value);
                    setAdminLinksPage(1);
                  }}
                  placeholder="Cari"
                />
                {isSuperAdmin ? <button className="btn primary" type="button" onClick={() => onOpenCreateLinkForm("all")}>Create Link</button> : null}
              </div>
            </div>
            <div className="datatable-shell">
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "owner" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("owner")}>
                          Owner{getSortMarker(adminLinksSort, "owner")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "code" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("code")}>
                          Code{getSortMarker(adminLinksSort, "code")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "title" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("title")}>
                          Title{getSortMarker(adminLinksSort, "title")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "targetUrl" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("targetUrl")}>
                          Destination{getSortMarker(adminLinksSort, "targetUrl")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "clicks" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("clicks")}>
                          Clicks{getSortMarker(adminLinksSort, "clicks")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "status" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("status")}>
                          Status{getSortMarker(adminLinksSort, "status")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${adminLinksSort.key === "createdAt" ? "active" : ""}`} type="button" onClick={() => onSortAdminLinks("createdAt")}>
                          Dibuat{getSortMarker(adminLinksSort, "createdAt")}
                        </button>
                      </th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedAdminLinks.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="empty-row">Belum ada link.</td>
                      </tr>
                    ) : (
                      pagedAdminLinks.map((item) => (
                        <tr key={item.id}>
                          <td>@{item.user?.username ?? "-"}<p className="subtle">{item.user?.email ?? "-"}</p></td>
                          <td>
                            <a className="code-link" href={shortUrl(item.code)} target="_blank" rel="noreferrer">{item.code}</a>
                          </td>
                          <td>
                            <p className="cell-title">{item.title}</p>
                          </td>
                          <td>
                            <p className="cell-url" title={item.targetUrl}>{item.targetUrl}</p>
                          </td>
                          <td>{item.clicks}</td>
                          <td>
                            <span className={`badge ${item.isActive ? "ok" : "mute"}`}>{item.isActive ? "Active" : "Inactive"}</span>
                          </td>
                          <td>{formatDateTime(item.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              <button className="btn secondary" type="button" onClick={() => onOpenEditLinkForm(item, "all")}>Edit</button>
                              <button className="btn danger" type="button" onClick={() => onDeleteAdminLink(item)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <p className="subtle">Menampilkan {adminLinksFrom}-{adminLinksTo} dari {sortedAdminLinks.length} link</p>
                <div className="pager">
                  <button className="btn ghost" type="button" disabled={safeAdminLinksPage <= 1} onClick={() => setAdminLinksPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                  <span className="pager-info">Hal. {safeAdminLinksPage} / {adminLinksTotalPages}</span>
                  <button className="btn ghost" type="button" disabled={safeAdminLinksPage >= adminLinksTotalPages} onClick={() => setAdminLinksPage((prev) => Math.min(adminLinksTotalPages, prev + 1))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "users" && isSuperAdmin ? (
          <div className="panel card">
            <div className="row-between">
              <div><p className="eyebrow">User Management</p><h2>CRUD User</h2></div>
              <div className="header-actions">
                <input
                  className="input search-input"
                  value={searchUsers}
                  onChange={(e) => {
                    setSearchUsers(e.target.value);
                    setUsersPage(1);
                  }}
                  placeholder="Cari user"
                />
                <button className="btn primary" type="button" onClick={onOpenCreateUserForm}>Create User</button>
              </div>
            </div>

            <form className="user-form card" onSubmit={onSubmitUserForm}>
              <p className="eyebrow">{userFormMode === "edit" ? "Edit User" : "Create User"}</p>
              <div className="split-grid">
                <label className="label">
                  Username
                  <input className="input" value={userFormUsername} onChange={(e) => setUserFormUsername(e.target.value)} required />
                </label>
                <label className="label">
                  Email
                  <input className="input" type="email" value={userFormEmail} onChange={(e) => setUserFormEmail(e.target.value)} required />
                </label>
              </div>
              <div className="split-grid">
                <label className="label">
                  {userFormMode === "edit" ? "Password Baru (opsional)" : "Password"}
                  <input className="input" type="password" value={userFormPassword} onChange={(e) => setUserFormPassword(e.target.value)} />
                </label>
                <label className="label">
                  Role
                  <select className="input" value={userFormRole} onChange={(e) => setUserFormRole(e.target.value)}>
                    <option value="USER">USER</option>
                    <option value="ADMIN">ADMIN</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  </select>
                </label>
              </div>
              <label className="check">
                <input type="checkbox" checked={userFormIsPremium} onChange={(e) => setUserFormIsPremium(e.target.checked)} />
                Premium Access
              </label>
              <div className="header-actions">
                <button className="btn primary" type="submit" disabled={loading}>
                  {loading ? "Menyimpan..." : userFormMode === "edit" ? "Update User" : "Create User"}
                </button>
                <button className="btn ghost" type="button" onClick={onOpenCreateUserForm}>
                  {userFormMode === "edit" ? "Batal Edit" : "Reset Form"}
                </button>
              </div>
            </form>

            <div className="datatable-shell">
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>
                        <button className={`th-btn ${usersSort.key === "username" ? "active" : ""}`} type="button" onClick={() => onSortUsers("username")}>
                          Username{getSortMarker(usersSort, "username")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${usersSort.key === "email" ? "active" : ""}`} type="button" onClick={() => onSortUsers("email")}>
                          Email{getSortMarker(usersSort, "email")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${usersSort.key === "role" ? "active" : ""}`} type="button" onClick={() => onSortUsers("role")}>
                          Role{getSortMarker(usersSort, "role")}
                        </button>
                      </th>
                      <th>Premium</th>
                      <th>
                        <button className={`th-btn ${usersSort.key === "linksCount" ? "active" : ""}`} type="button" onClick={() => onSortUsers("linksCount")}>
                          Links{getSortMarker(usersSort, "linksCount")}
                        </button>
                      </th>
                      <th>
                        <button className={`th-btn ${usersSort.key === "createdAt" ? "active" : ""}`} type="button" onClick={() => onSortUsers("createdAt")}>
                          Dibuat{getSortMarker(usersSort, "createdAt")}
                        </button>
                      </th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-row">Belum ada user.</td>
                      </tr>
                    ) : (
                      pagedUsers.map((item) => (
                        <tr key={item.id}>
                          <td>@{item.username}</td>
                          <td>{item.email}</td>
                          <td>{item.role}</td>
                          <td>
                            <span className={`badge ${item.isPremium ? "ok" : "mute"}`}>{item.isPremium ? "Premium" : "Regular"}</span>
                          </td>
                          <td>{item.linksCount}</td>
                          <td>{formatDateTime(item.createdAt)}</td>
                          <td>
                            <div className="table-actions">
                              <button className="btn secondary" type="button" onClick={() => onOpenEditUserForm(item)}>Edit</button>
                              <button className="btn danger" type="button" onClick={() => onDeleteUser(item)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-footer">
                <p className="subtle">Menampilkan {usersFrom}-{usersTo} dari {sortedUsers.length} user</p>
                <div className="pager">
                  <button className="btn ghost" type="button" disabled={safeUsersPage <= 1} onClick={() => setUsersPage((prev) => Math.max(1, prev - 1))}>Prev</button>
                  <span className="pager-info">Hal. {safeUsersPage} / {usersTotalPages}</span>
                  <button className="btn ghost" type="button" disabled={safeUsersPage >= usersTotalPages} onClick={() => setUsersPage((prev) => Math.min(usersTotalPages, prev + 1))}>Next</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "upgradePremium" && user?.role === "USER" ? (
          <div className="panel card">
            <p className="eyebrow">Premium</p>
            <h2>Upgrade ke Premium</h2>
            <p className="subtle">Kirim permintaan upgrade. Admin/Super Admin akan melakukan konfirmasi.</p>

            <div className="settings-grid">
              <article className="setting-box"><p>Status Akun</p><h3>{user.isPremium ? "Premium" : "Regular"}</h3></article>
              <article className="setting-box"><p>Total Request</p><h3>{myPremiumRequests.length}</h3></article>
              <article className="setting-box"><p>Request Pending</p><h3>{myPremiumRequests.filter((item) => item.status === "PENDING").length}</h3></article>
              <article className="setting-box"><p>Status Terakhir</p><h3>{myLatestPremiumRequest?.status ?? "-"}</h3></article>
            </div>

            <form className="user-form card" onSubmit={onSubmitPremiumRequest}>
              <label className="label">
                Pesan ke Admin (opsional)
                <textarea className="input" rows={4} maxLength={500} value={premiumRequestMessage} onChange={(e) => setPremiumRequestMessage(e.target.value)} placeholder="Contoh: Saya butuh lebih dari 5 link aktif untuk campaign." />
              </label>
              <div className="header-actions">
                <button className="btn primary" type="submit" disabled={loading || user.isPremium || myPremiumRequests.some((item) => item.status === "PENDING")}>
                  {loading ? "Mengirim..." : "Kirim Permintaan Premium"}
                </button>
                {user.isPremium ? <span className="subtle">Akun kamu sudah premium.</span> : null}
                {!user.isPremium && myPremiumRequests.some((item) => item.status === "PENDING") ? (
                  <span className="subtle">Masih ada request yang pending.</span>
                ) : null}
              </div>
            </form>

            <div className="datatable-shell">
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Pesan</th>
                      <th>Catatan Admin</th>
                      <th>Dibuat</th>
                      <th>Diproses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myPremiumRequests.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="empty-row">Belum ada request premium.</td>
                      </tr>
                    ) : (
                      myPremiumRequests.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <span className={`badge ${item.status === "APPROVED" ? "ok" : item.status === "REJECTED" ? "mute" : ""}`}>{item.status}</span>
                          </td>
                          <td>{item.message ?? "-"}</td>
                          <td>{item.adminNote ?? "-"}</td>
                          <td>{formatDateTime(item.createdAt)}</td>
                          <td>{item.processedAt ? formatDateTime(item.processedAt) : "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "premiumRequests" && isAdmin ? (
          <div className="panel card">
            <div className="row-between">
              <div>
                <p className="eyebrow">Premium Requests</p>
                <h2>Konfirmasi Upgrade Premium</h2>
                <p className="subtle">Daftar permintaan upgrade dari user biasa.</p>
              </div>
              <div className="header-actions">
                <article className="setting-box"><p>Pending</p><h3>{premiumPendingCount}</h3></article>
                <button className="btn secondary" type="button" onClick={() => refreshAll(token)} disabled={loading}>Refresh</button>
              </div>
            </div>

            <div className="datatable-shell">
              <div className="datatable-wrap">
                <table className="datatable">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Pesan</th>
                      <th>Catatan Admin</th>
                      <th>Dibuat</th>
                      <th>Diproses</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {premiumRequests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="empty-row">Belum ada request premium.</td>
                      </tr>
                    ) : (
                      premiumRequests.map((item) => (
                        <tr key={item.id}>
                          <td>
                            @{item.user?.username ?? "-"}
                            <p className="subtle">{item.user?.email ?? "-"}</p>
                          </td>
                          <td>
                            <span className={`badge ${item.status === "APPROVED" ? "ok" : item.status === "REJECTED" ? "mute" : ""}`}>{item.status}</span>
                          </td>
                          <td>{item.message ?? "-"}</td>
                          <td>{item.adminNote ?? "-"}</td>
                          <td>{formatDateTime(item.createdAt)}</td>
                          <td>{item.processedAt ? formatDateTime(item.processedAt) : "-"}</td>
                          <td>
                            {item.status === "PENDING" ? (
                              <div className="table-actions">
                                <button className="btn secondary" type="button" onClick={() => onProcessPremiumRequest(item, "approve")}>Approve</button>
                                <button className="btn danger" type="button" onClick={() => onProcessPremiumRequest(item, "reject")}>Reject</button>
                              </div>
                            ) : (
                              <span className="subtle">Selesai</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}

        {activeMenu === "settings" ? (
          <div className="panel card">
            <p className="eyebrow">Settings</p>
            <h2>Account Info</h2>
            <div className="settings-grid">
              <article className="setting-box"><p>Username</p><h3>@{user.username}</h3></article>
              <article className="setting-box"><p>Email</p><h3>{user.email}</h3></article>
              <article className="setting-box"><p>Role</p><h3>{user.role}</h3></article>
              <article className="setting-box"><p>Plan</p><h3>{user.isPremium ? "Premium" : "Regular"}</h3></article>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
