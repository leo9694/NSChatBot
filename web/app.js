const state = {
  conversations: [],
  currentMessages: [],
  selectedConversationId: null,
  selectedConversation: null,
  connectedAccountJid: "",
  connectedAccountPhone: "",
  connectedAccountName: "",
  connectedAccountAvatarUrl: "",
  search: "",
  serviceTab: "pending",
  showAllChats: false,
  serviceCounts: {
    pending: 0,
    in_progress: 0,
    finalized: 0,
    bulk: 0,
  },
  loadingConversations: false,
  loadingMessages: false,
  contextConversationId: null,
  currentView: "chats",
  bulkContacts: [],
  bulkContactsSearch: "",
  bulkJobs: [],
  selectedBulkJobId: null,
  bulkJobDetailsMap: {},
  sectors: [],
  settingsUsers: [],
  agents: [],
  currentUser: null,
  isAuthenticated: false,
  sessionToken: "",
  settingsTab: "perfil",
  realtimeCheckpointToken: "",
};
const SESSION_TOKEN_KEY = "nschat_session_token";

const layoutEl = document.querySelector(".layout");
const chatMainEl = document.querySelector(".chat-main");
const loginScreenEl = document.getElementById("loginScreen");
const loginFormEl = document.getElementById("loginForm");
const loginUsernameEl = document.getElementById("loginUsername");
const loginPasswordEl = document.getElementById("loginPassword");
const loginSubmitBtnEl = document.getElementById("loginSubmitBtn");
const chatSidebarEl = document.getElementById("chatSidebar");
const conversationListEl = document.getElementById("conversationList");
const messagesAreaEl = document.getElementById("messagesArea");
const chatHeaderEl = document.getElementById("chatHeader");
const searchInputEl = document.getElementById("searchInput");
const allChatsBtnEl = document.getElementById("allChatsBtn");
const sendFormEl = document.getElementById("sendForm");
const textComposerEl = document.getElementById("textComposer");
const audioComposerEl = document.getElementById("audioComposer");
const attachBtnEl = document.getElementById("attachBtn");
const attachMenuEl = document.getElementById("attachMenu");
const attachPhotoBtnEl = document.getElementById("attachPhotoBtn");
const attachFileBtnEl = document.getElementById("attachFileBtn");
const attachPhotoInputEl = document.getElementById("attachPhotoInput");
const attachFileInputEl = document.getElementById("attachFileInput");
const messageInputEl = document.getElementById("messageInput");
const composerActionBtnEl = document.getElementById("composerActionBtn");
const audioDeleteBtnEl = document.getElementById("audioDeleteBtn");
const audioPreviewBtnEl = document.getElementById("audioPreviewBtn");
const audioTimerEl = document.getElementById("audioTimer");
const audioCancelBtnEl = document.getElementById("audioCancelBtn");
const audioSendBtnEl = document.getElementById("audioSendBtn");
const audioReviewPlayerEl = document.getElementById("audioReviewPlayer");
const waStatusEl = document.getElementById("waStatus");
const connectedProfileEl = document.getElementById("connectedProfile");
const connectedPhoneMiniEl = document.getElementById("connectedPhoneMini");
const profileOverlayEl = document.getElementById("profileOverlay");
const profilePanelEl = document.getElementById("profilePanel");
const profileCloseBtnEl = document.getElementById("profileCloseBtn");
const profileAvatarEl = document.getElementById("profileAvatar");
const profileNameEl = document.getElementById("profileName");
const profileStatusEl = document.getElementById("profileStatus");
const profilePhoneEl = document.getElementById("profilePhone");
const profileJidEl = document.getElementById("profileJid");
const disconnectBtnEl = document.getElementById("disconnectBtn");
const syncHistoryBtnEl = document.getElementById("syncHistoryBtn");
const connectBtnEl = document.getElementById("connectBtn");
const historySyncPanelEl = document.getElementById("historySyncPanel");
const historySyncPercentEl = document.getElementById("historySyncPercent");
const historySyncBarEl = document.getElementById("historySyncBar");
const historySyncMetaEl = document.getElementById("historySyncMeta");
const historySyncHintEl = document.getElementById("historySyncHint");
const syncOverlayEl = document.getElementById("syncOverlay");
const syncOverlayMessageEl = document.getElementById("syncOverlayMessage");
const syncOverlayBarEl = document.getElementById("syncOverlayBar");
const syncOverlayPercentEl = document.getElementById("syncOverlayPercent");
const syncOverlayMetaEl = document.getElementById("syncOverlayMeta");
const bulkImportOverlayEl = document.getElementById("bulkImportOverlay");
const bulkImportMessageEl = document.getElementById("bulkImportMessage");
const bulkImportBarEl = document.getElementById("bulkImportBar");
const bulkImportPercentEl = document.getElementById("bulkImportPercent");
const bulkImportMetaEl = document.getElementById("bulkImportMeta");
const qrPanelEl = document.getElementById("qrPanel");
const qrCodeBoxEl = document.getElementById("qrCodeBox");
const qrHintEl = document.getElementById("qrHint");
const newChatBtnEl = document.getElementById("newChatBtn");
const tabPendingBtnEl = document.getElementById("tabPendingBtn");
const tabInProgressBtnEl = document.getElementById("tabInProgressBtn");
const tabFinalizedBtnEl = document.getElementById("tabFinalizedBtn");
const tabBulkBtnEl = document.getElementById("tabBulkBtn");
const tabPendingCountEl = document.getElementById("tabPendingCount");
const tabInProgressCountEl = document.getElementById("tabInProgressCount");
const tabBulkCountEl = document.getElementById("tabBulkCount");
const newChatOverlayEl = document.getElementById("newChatOverlay");
const newChatModalEl = document.getElementById("newChatModal");
const newChatFormEl = document.getElementById("newChatForm");
const newChatNameEl = document.getElementById("newChatName");
const newChatPhoneEl = document.getElementById("newChatPhone");
const newChatMessageEl = document.getElementById("newChatMessage");
const newChatCancelEl = document.getElementById("newChatCancel");
const editUserOverlayEl = document.getElementById("editUserOverlay");
const editUserModalEl = document.getElementById("editUserModal");
const editUserFormEl = document.getElementById("editUserForm");
const editUserNameEl = document.getElementById("editUserName");
const editUserUsernameEl = document.getElementById("editUserUsername");
const editUserRoleEl = document.getElementById("editUserRole");
const editUserSectorEl = document.getElementById("editUserSector");
const editUserPasswordEl = document.getElementById("editUserPassword");
const editUserCancelEl = document.getElementById("editUserCancel");
const conversationMenuEl = document.getElementById("conversationMenu");
const deleteConversationBtnEl = document.getElementById("deleteConversationBtn");
const editConversationBtnEl = document.getElementById("editConversationBtn");
const transferConversationBtnEl = document.getElementById("transferConversationBtn");
const transferOverlayEl = document.getElementById("transferOverlay");
const transferModalEl = document.getElementById("transferModal");
const transferFormEl = document.getElementById("transferForm");
const transferUserSelectEl = document.getElementById("transferUserSelect");
const transferCancelEl = document.getElementById("transferCancel");
const conversationItemTpl = document.getElementById("conversationItemTpl");
const railChatsEl = document.getElementById("railChats");
const railBulkCreateEl = document.getElementById("railBulkCreate");
const railBulkMonitorEl = document.getElementById("railBulkMonitor");
const settingsBtnEl = document.getElementById("settingsBtn");
const chatViewEl = document.getElementById("chatView");
const bulkCreateViewEl = document.getElementById("bulkCreateView");
const bulkMonitorViewEl = document.getElementById("bulkMonitorView");
const settingsViewEl = document.getElementById("settingsView");
const bulkCreateFormEl = document.getElementById("bulkCreateForm");
const bulkFileEl = document.getElementById("bulkFile");
const bulkIntervalMinEl = document.getElementById("bulkIntervalMin");
const bulkIntervalMaxEl = document.getElementById("bulkIntervalMax");
const bulkMessagesContainerEl = document.getElementById("bulkMessagesContainer");
const bulkAddMessageBtnEl = document.getElementById("bulkAddMessageBtn");
const bulkContactsCountEl = document.getElementById("bulkContactsCount");
const bulkContactsSearchEl = document.getElementById("bulkContactsSearch");
const bulkSelectAllBtnEl = document.getElementById("bulkSelectAllBtn");
const bulkClearAllBtnEl = document.getElementById("bulkClearAllBtn");
const bulkContactsListEl = document.getElementById("bulkContactsList");
const bulkJobsListEl = document.getElementById("bulkJobsList");
const bulkJobDetailsEl = document.getElementById("bulkJobDetails");
const uiDialogOverlayEl = document.getElementById("uiDialogOverlay");
const uiDialogTitleEl = document.getElementById("uiDialogTitle");
const uiDialogMessageEl = document.getElementById("uiDialogMessage");
const uiDialogInputWrapEl = document.getElementById("uiDialogInputWrap");
const uiDialogInputEl = document.getElementById("uiDialogInput");
const uiDialogCancelEl = document.getElementById("uiDialogCancel");
const uiDialogConfirmEl = document.getElementById("uiDialogConfirm");
const mediaModalOverlayEl = document.getElementById("mediaModalOverlay");
const mediaModalBodyEl = document.getElementById("mediaModalBody");
const mediaModalCloseBtnEl = document.getElementById("mediaModalCloseBtn");
const settingsHeaderEl = document.getElementById("settingsHeader");
const settingsAdminSectionEl = document.getElementById("settingsAdminSection");
const settingsUsersListEl = document.getElementById("settingsUsersList");
const settingsTabPerfilEl = document.getElementById("settingsTabPerfil");
const settingsTabCreateEl = document.getElementById("settingsTabCreate");
const settingsTabListEl = document.getElementById("settingsTabList");
const settingsTabSectorsEl = document.getElementById("settingsTabSectors");
const settingsPanelPerfilEl = document.getElementById("settingsPanelPerfil");
const settingsPanelCreateEl = document.getElementById("settingsPanelCreate");
const settingsPanelListEl = document.getElementById("settingsPanelList");
const settingsPanelSectorsEl = document.getElementById("settingsPanelSectors");
const settingsProfileNameEl = document.getElementById("settingsProfileName");
const settingsProfileUsernameEl = document.getElementById("settingsProfileUsername");
const settingsProfileRoleEl = document.getElementById("settingsProfileRole");
const settingsProfileSectorEl = document.getElementById("settingsProfileSector");
const settingsAdminActionsEl = document.getElementById("settingsAdminActions");
const settingsFinalizePendingBtnEl = document.getElementById("settingsFinalizePendingBtn");
const createUserFormEl = document.getElementById("createUserForm");
const newUserNameEl = document.getElementById("newUserName");
const newUserUsernameEl = document.getElementById("newUserUsername");
const newUserPasswordEl = document.getElementById("newUserPassword");
const newUserRoleEl = document.getElementById("newUserRole");
const newUserSectorEl = document.getElementById("newUserSector");
const createSectorFormEl = document.getElementById("createSectorForm");
const newSectorNameEl = document.getElementById("newSectorName");
const settingsSectorsListEl = document.getElementById("settingsSectorsList");
const settingsLogoutBtnEl = document.getElementById("settingsLogoutBtn");
let mediaRecorder = null;
let mediaChunks = [];
let mediaStream = null;
let recordingTimer = null;
let recordingSeconds = 0;
let realtimeReconnectTimer = null;
let realtimePollController = null;
let realtimePolling = false;
let realtimePollToken = 0;
let realtimeLastEventAt = 0;
let realtimeLastPollAt = 0;
let realtimeCursor = 0;
let realtimeWatchdogTimer = null;
let realtimeCheckpointTimer = null;
let qrPollTimer = null;
let lastQrText = "";
let composerMode = "text";
let recordedAudioBlob = null;
let recordedAudioUrl = "";
let healthTimer = null;
let bulkMonitorTimer = null;
let editingUserId = "";
let transferConversationId = "";
let bulkMessagesDraft = [""];
let pendingConversationRefresh = false;
let pendingMessagesRefresh = false;
let conversationRefreshTimer = null;
let messageRefreshTimer = null;
const PLAYER_PLAY_ICON = '<i class="bi bi-play-fill"></i>';
const PLAYER_PAUSE_ICON = '<i class="bi bi-pause-fill"></i>';
const PREVIEW_PLAY_ICON = '<i class="bi bi-play-fill"></i>';
const PREVIEW_PAUSE_ICON = '<i class="bi bi-pause-fill"></i>';
const MIC_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-1 5.93V17.9a5 5 0 0 1-4-4.9H5a7 7 0 0 0 6 6.93ZM13 19.93A7 7 0 0 0 19 13h-2a5 5 0 0 1-4 4.9v2.03ZM11 22h2v-2h-2v2Z"/></svg>';

function readSessionToken() {
  try {
    const current = sessionStorage.getItem(SESSION_TOKEN_KEY) || "";
    if (current) return current;

    // Migracao de versao antiga (localStorage -> sessionStorage).
    const legacy = localStorage.getItem(SESSION_TOKEN_KEY) || "";
    if (legacy) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, legacy);
      localStorage.removeItem(SESSION_TOKEN_KEY);
      return legacy;
    }

    return "";
  } catch {
    return "";
  }
}

function writeSessionToken(token) {
  state.sessionToken = String(token || "").trim();
  try {
    if (state.sessionToken) {
      sessionStorage.setItem(SESSION_TOKEN_KEY, state.sessionToken);
    } else {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

function fmtTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDateShort(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) return fmtTime(value);

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function fmtDateDivider(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (target.getTime() === today.getTime()) {
    return "Hoje";
  }

  if (target.getTime() === yesterday.getTime()) {
    return "Ontem";
  }

  return date.toLocaleDateString("pt-BR");
}

function checksByStatus(message) {
  const CHECK = "\u2713";
  const DOUBLE_CHECK = `${CHECK}${CHECK}`;
  if (!message.from_me) return { text: "", type: "" };
  if (message.read_at) return { text: DOUBLE_CHECK, type: "read" };
  if (message.delivered_at) return { text: DOUBLE_CHECK, type: "delivered" };
  return { text: CHECK, type: "sent" };
}

function fmtDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function formatPhone(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return digits;
  return `+${digits}`;
}

function profileLabel(name, phone) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  }

  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length >= 2) {
    return digits.slice(-2);
  }

  return "NS";
}

function normalizeBrazilPhoneInput(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return "";
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
  const national = withCountry.slice(2);
  if (national.length === 11 && national[2] === "9") {
    return `55${national.slice(0, 2)}${national.slice(3)}`;
  }
  return withCountry;
}

function conversationDisplayName(conv) {
  if (conv.display_name && conv.display_name.trim()) {
    return conv.display_name.trim();
  }

  if (String(conv.wa_jid || "").endsWith("@lid")) {
    return "Contato WhatsApp";
  }

  return conv.phone || "Contato";
}

function applyAvatar(el, conv) {
  if (!el) return;
  const url = String(conv?.avatar_url || "").trim();
  if (url) {
    el.style.backgroundImage = `url("${url}")`;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
  } else {
    el.style.backgroundImage = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";
    el.style.backgroundRepeat = "";
  }
}

function applyConnectedProfileAvatar() {
  const avatarUrl = String(state.connectedAccountAvatarUrl || "").trim();
  connectedProfileEl.classList.toggle("has-image", Boolean(avatarUrl));

  if (avatarUrl) {
    connectedProfileEl.innerHTML = "";
    connectedProfileEl.style.backgroundImage = `url("${avatarUrl}")`;
    connectedProfileEl.style.backgroundSize = "cover";
    connectedProfileEl.style.backgroundPosition = "center";
    connectedProfileEl.style.backgroundRepeat = "no-repeat";
    return;
  }

  connectedProfileEl.style.backgroundImage = "";
  connectedProfileEl.style.backgroundSize = "";
  connectedProfileEl.style.backgroundPosition = "";
  connectedProfileEl.style.backgroundRepeat = "";
  connectedProfileEl.innerHTML = '<i class="bi bi-person-fill"></i>';
}

async function refreshConnectedAccountAvatar() {
  if (!state.connectedAccountJid) {
    state.connectedAccountAvatarUrl = "";
    applyConnectedProfileAvatar();
    return;
  }

  try {
    const result = await api("/whatsapp/profile-avatar");
    state.connectedAccountAvatarUrl = String(result?.avatar_url || "");
  } catch {
    state.connectedAccountAvatarUrl = "";
  }

  applyConnectedProfileAvatar();
}

function openProfilePanel() {
  profileOverlayEl.classList.add("open");
  profilePanelEl.classList.add("open");
}

function closeProfilePanel() {
  profileOverlayEl.classList.remove("open");
  profilePanelEl.classList.remove("open");
}

function canManageWhatsAppSession() {
  return String(state.currentUser?.role || "") === "administrador";
}

function syncProfilePanel() {
  const name = state.connectedAccountName || "-";
  const phone = formatPhone(state.connectedAccountPhone) || "-";
  const jid = state.connectedAccountJid || "-";
  const isOnline = waStatusEl.classList.contains("online");
  const canManageSession = canManageWhatsAppSession();

  profileAvatarEl.textContent = profileLabel(state.connectedAccountName, state.connectedAccountPhone);
  profileNameEl.textContent = name;
  profileStatusEl.textContent = isOnline ? "Conectado" : "Desconectado";
  profilePhoneEl.textContent = phone;
  profileJidEl.textContent = jid;
  disconnectBtnEl.hidden = !isOnline || !canManageSession;
  syncHistoryBtnEl.hidden = !isOnline || !canManageSession;
  connectBtnEl.hidden = isOnline;
}

function renderHistorySyncStatus(wa = {}) {
  if (!canManageWhatsAppSession()) {
    historySyncPanelEl.hidden = true;
    historySyncPanelEl.style.display = "none";
    historySyncHintEl.hidden = true;
    historySyncHintEl.style.display = "none";
    syncOverlayEl.hidden = true;
    syncOverlayEl.style.display = "none";
    return;
  }

  const rawActive = Boolean(wa.historySyncActive);
  const progress = Math.max(0, Math.min(100, Number(wa.historySyncProgress || 0)));
  const imported = Math.max(0, Number(wa.historySyncImportedCount || 0));
  const message = String(wa.historySyncMessage || "").trim();
  const active = rawActive && (progress > 0 || imported > 0) && progress < 100;

  historySyncPanelEl.hidden = !active;
  historySyncPanelEl.style.display = active ? "" : "none";
  historySyncHintEl.hidden = false;
  historySyncHintEl.style.display = "";
  historySyncPercentEl.textContent = `${progress}%`;
  historySyncBarEl.style.width = `${progress}%`;
  historySyncMetaEl.textContent = `${imported} mensagens importadas`;
  syncHistoryBtnEl.disabled = active;
  syncHistoryBtnEl.textContent = active ? "Sincronizando..." : "Sincronizar";
  historySyncHintEl.textContent =
    message ||
    "Para puxar historico antigo, desconecte este dispositivo no WhatsApp do celular e conecte novamente no app.";
  syncOverlayEl.hidden = !active;
  syncOverlayEl.style.display = active ? "flex" : "none";
  syncOverlayMessageEl.textContent =
    message || "Aguarde enquanto o app sincroniza as mensagens pendentes.";
  syncOverlayBarEl.style.width = `${progress}%`;
  syncOverlayPercentEl.textContent = `${progress}%`;
  syncOverlayMetaEl.textContent = `${imported} mensagens importadas`;
}

function clearQrCode() {
  lastQrText = "";
  qrCodeBoxEl.innerHTML = "";
}

function stopQrPolling() {
  if (qrPollTimer) {
    clearInterval(qrPollTimer);
    qrPollTimer = null;
  }
}

function renderQrCode(text) {
  if (!text || text === lastQrText) return;
  lastQrText = text;
  qrCodeBoxEl.innerHTML = "";

  if (!window.QRCode) {
    qrHintEl.textContent = "Gerador de QR indisponivel.";
    return;
  }

  // eslint-disable-next-line no-new
  new window.QRCode(qrCodeBoxEl, {
    text,
    width: 220,
    height: 220,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
}

async function pollQrCode() {
  try {
    const statusData = await api("/whatsapp/status");
    const online = Boolean(statusData?.whatsapp?.connected);
    if (online) {
      qrHintEl.textContent = "Conectado com sucesso.";
      qrPanelEl.hidden = true;
      stopQrPolling();
      await refreshHealth();
      await loadConversations();
      return;
    }

    const qrData = await api("/whatsapp/qr");
    if (qrData?.qr) {
      qrHintEl.textContent = "Escaneie o QR code no WhatsApp.";
      renderQrCode(qrData.qr);
    } else {
      qrHintEl.textContent = "Aguardando geracao do QR...";
    }
  } catch (error) {
    qrHintEl.textContent = "Falha ao carregar QR.";
    console.error(error);
  }
}

function startQrPolling() {
  stopQrPolling();
  qrPollTimer = setInterval(() => {
    pollQrCode().catch((error) => console.error(error));
  }, 2500);
}

function openNewChatModal() {
  newChatOverlayEl.classList.add("open");
  newChatModalEl.classList.add("open");
  setTimeout(() => newChatNameEl.focus(), 10);
}

function closeNewChatModal() {
  newChatOverlayEl.classList.remove("open");
  newChatModalEl.classList.remove("open");
  newChatFormEl.reset();
}

function openConversationMenu(conversationId, x, y) {
  state.contextConversationId = conversationId;
  const conv = state.conversations.find((item) => item.id === conversationId) || null;
  const status = String(conv?.service_status || "pending");
  const isMine = canCurrentUserSendInConversation(conv);
  const canTransfer =
    Boolean(state.currentUser) &&
    (state.currentUser.role === "administrador" || isMine || status === "pending" || status === "finalized");
  transferConversationBtnEl.style.display = canTransfer ? "" : "none";
  conversationMenuEl.style.left = `${x}px`;
  conversationMenuEl.style.top = `${y}px`;
  conversationMenuEl.classList.add("open");
}

function closeConversationMenu() {
  state.contextConversationId = null;
  conversationMenuEl.classList.remove("open");
}

function setRailActive(view) {
  railChatsEl.classList.toggle("active", view === "chats");
  railBulkCreateEl.classList.toggle("active", view === "bulk-create");
  railBulkMonitorEl.classList.toggle("active", view === "bulk-monitor");
  settingsBtnEl.classList.toggle("active", view === "settings");
}

function switchView(view) {
  if (!state.isAuthenticated) return;
  state.currentView = view;
  setRailActive(view);

  chatViewEl.classList.toggle("active", view === "chats");
  bulkCreateViewEl.classList.toggle("active", view === "bulk-create");
  bulkMonitorViewEl.classList.toggle("active", view === "bulk-monitor");
  settingsViewEl.classList.toggle("active", view === "settings");

  const showSidebar = view === "chats";
  chatSidebarEl.style.display = showSidebar ? "" : "none";
  layoutEl.classList.toggle("no-sidebar", !showSidebar);
  chatMainEl.classList.toggle("global-scroll", view !== "chats");

  if (view === "bulk-monitor") {
    // Always open monitor focused on the latest dispatch.
    state.selectedBulkJobId = null;
    loadBulkJobs().catch((error) => console.error(error));
  } else if (view === "settings") {
    renderSettingsHeader();
    setSettingsTab(state.settingsTab || "perfil");
    loadUsersForSettings().catch((error) => console.error(error));
  }
}

function showLoginScreen() {
  state.isAuthenticated = false;
  state.currentUser = null;
  document.body.classList.add("auth-lock");
  loginScreenEl.classList.remove("hidden");
  if (state.currentView === "settings") {
    state.currentView = "chats";
  }
  closeProfilePanel();
  closeConversationMenu();
  closeRealtime();
}

function hideLoginScreen() {
  document.body.classList.remove("auth-lock");
  loginScreenEl.classList.add("hidden");
}

function renderSettingsHeader() {
  const user = state.currentUser;
  if (!user) {
    settingsHeaderEl.textContent = "";
    settingsProfileNameEl.textContent = "-";
    settingsProfileUsernameEl.textContent = "-";
    settingsProfileRoleEl.textContent = "-";
    settingsProfileSectorEl.textContent = "-";
    settingsAdminActionsEl.hidden = true;
    return;
  }
  settingsHeaderEl.textContent = `Logado como ${user.name} (${user.role})`;
  settingsProfileNameEl.textContent = user.name || "-";
  settingsProfileUsernameEl.textContent = user.username || "-";
  settingsProfileRoleEl.textContent = user.role || "-";
  settingsProfileSectorEl.textContent = user.sector_name || "-";
  settingsAdminActionsEl.hidden = user.role !== "administrador";
}

function setSettingsTab(tab) {
  state.settingsTab = tab;

  settingsTabPerfilEl.classList.toggle("active", tab === "perfil");
  settingsTabCreateEl.classList.toggle("active", tab === "create");
  settingsTabListEl.classList.toggle("active", tab === "list");
  settingsTabSectorsEl.classList.toggle("active", tab === "sectors");

  settingsPanelPerfilEl.classList.toggle("active", tab === "perfil");
  settingsPanelCreateEl.classList.toggle("active", tab === "create");
  settingsPanelListEl.classList.toggle("active", tab === "list");
  settingsPanelSectorsEl.classList.toggle("active", tab === "sectors");
}

function openSettingsModal() {
  if (!state.isAuthenticated) return;
  renderSettingsHeader();
  setSettingsTab(state.settingsTab || "perfil");
  switchView("settings");
}

function closeSettingsModal() {
  if (state.currentView === "settings") {
    switchView("chats");
  }
}

function renderUsersList(users) {
  settingsUsersListEl.innerHTML = "";
  if (!users || !users.length) {
    settingsUsersListEl.innerHTML = '<div class="empty-state">Nenhum usuario cadastrado.</div>';
    return;
  }

  for (const user of users) {
    const row = document.createElement("div");
    row.className = "settings-user-item";
    row.dataset.userId = user.id;
    const showActions = state.currentUser?.role === "administrador";
    row.innerHTML = `
      <div class="settings-user-main">
        <strong>${user.name}</strong><br />
        <small>${user.username}${user.sector_name ? ` - ${user.sector_name}` : ""}</small>
      </div>
      <div class="settings-user-right">
        <span class="settings-user-role">${user.role}</span>
        ${
          showActions
            ? `<div class="settings-user-actions">
                <button type="button" class="btn-secondary settings-user-edit" data-action="edit-user">Editar</button>
                <button type="button" class="btn-danger settings-user-delete" data-action="delete-user">Excluir</button>
              </div>`
            : ""
        }
      </div>
    `;
    settingsUsersListEl.appendChild(row);
  }
}

function renderSectorsList(items) {
  settingsSectorsListEl.innerHTML = "";
  if (!items || !items.length) {
    settingsSectorsListEl.innerHTML = '<div class="empty-state">Nenhum setor cadastrado.</div>';
    return;
  }

  for (const sector of items) {
    const row = document.createElement("div");
    row.className = "settings-user-item";
    row.innerHTML = `
      <div>
        <strong>${sector.name}</strong><br />
        <small>${fmtDateShort(sector.created_at)} ${fmtTime(sector.created_at)}</small>
      </div>
    `;
    settingsSectorsListEl.appendChild(row);
  }
}

function renderSectorOptions() {
  const previous = String(newUserSectorEl.value || "");
  newUserSectorEl.innerHTML = "";

  if (!state.sectors.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem setores cadastrados";
    newUserSectorEl.appendChild(opt);
    newUserSectorEl.disabled = true;
    return;
  }

  newUserSectorEl.disabled = false;
  for (const sector of state.sectors) {
    const opt = document.createElement("option");
    opt.value = sector.id;
    opt.textContent = sector.name;
    newUserSectorEl.appendChild(opt);
  }

  if (previous && state.sectors.some((item) => item.id === previous)) {
    newUserSectorEl.value = previous;
  } else {
    newUserSectorEl.value = state.sectors[0].id;
  }
}

async function loadSectorsForSettings() {
  if (!state.currentUser || state.currentUser.role !== "administrador") {
    state.sectors = [];
    renderSectorOptions();
    renderSectorsList([]);
    return;
  }

  const result = await api("/auth/sectors");
  state.sectors = result.items || [];
  renderSectorOptions();
  renderSectorsList(state.sectors);
}

async function loadUsersForSettings() {
  if (!state.currentUser || state.currentUser.role !== "administrador") {
    state.settingsUsers = [];
    settingsAdminSectionEl.hidden = true;
    settingsTabCreateEl.disabled = true;
    settingsTabListEl.disabled = true;
    settingsTabSectorsEl.disabled = true;
    if (state.settingsTab !== "perfil") {
      setSettingsTab("perfil");
    }
    settingsUsersListEl.innerHTML = '<div class="empty-state">Somente administrador pode ver usuarios.</div>';
    return;
  }

  settingsAdminSectionEl.hidden = false;
  settingsTabCreateEl.disabled = false;
  settingsTabListEl.disabled = false;
  settingsTabSectorsEl.disabled = false;
  await loadSectorsForSettings();
  const result = await api("/auth/users");
  state.settingsUsers = result.items || [];
  renderUsersList(state.settingsUsers);
}

async function loadAgents() {
  if (!state.isAuthenticated) {
    state.agents = [];
    return;
  }
  try {
    const result = await api("/auth/agents");
    state.agents = Array.isArray(result?.items) ? result.items : [];
  } catch {
    state.agents = [];
  }
}

function populateTransferUsers(selectedUserId = "") {
  transferUserSelectEl.innerHTML = "";
  const agents = state.agents.filter((item) => item?.id);
  if (!agents.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhum atendente disponivel";
    transferUserSelectEl.appendChild(opt);
    transferUserSelectEl.disabled = true;
    return;
  }
  transferUserSelectEl.disabled = false;

  for (const agent of agents) {
    const opt = document.createElement("option");
    opt.value = agent.id;
    const sector = agent.sector_name ? ` - ${agent.sector_name}` : "";
    opt.textContent = `${agent.name}${sector}`;
    transferUserSelectEl.appendChild(opt);
  }

  if (selectedUserId && agents.some((a) => a.id === selectedUserId)) {
    transferUserSelectEl.value = selectedUserId;
  } else {
    transferUserSelectEl.value = agents[0].id;
  }
}

async function openTransferModal(conversationId) {
  transferConversationId = String(conversationId || "").trim();
  if (!transferConversationId) return;

  if (!state.agents.length) {
    await loadAgents();
  }

  const selectedConversation =
    state.conversations.find((item) => item.id === transferConversationId) || state.selectedConversation;
  populateTransferUsers(String(selectedConversation?.assigned_user_id || ""));
  transferOverlayEl.classList.add("open");
  transferModalEl.classList.add("open");
  setTimeout(() => transferUserSelectEl.focus(), 10);
}

function closeTransferModal() {
  transferConversationId = "";
  transferOverlayEl.classList.remove("open");
  transferModalEl.classList.remove("open");
  transferFormEl.reset();
}

function populateEditUserSectorOptions(selectedSectorId) {
  editUserSectorEl.innerHTML = "";
  for (const sector of state.sectors) {
    const opt = document.createElement("option");
    opt.value = sector.id;
    opt.textContent = sector.name;
    editUserSectorEl.appendChild(opt);
  }
  if (selectedSectorId && state.sectors.some((item) => item.id === selectedSectorId)) {
    editUserSectorEl.value = selectedSectorId;
  } else if (state.sectors.length) {
    editUserSectorEl.value = state.sectors[0].id;
  }
}

function openEditUserModal(user) {
  editingUserId = user.id;
  editUserNameEl.value = user.name || "";
  editUserUsernameEl.value = user.username || "";
  editUserRoleEl.value = user.role || "operador";
  editUserPasswordEl.value = "";
  populateEditUserSectorOptions(user.sector_id || "");
  editUserOverlayEl.classList.add("open");
  editUserModalEl.classList.add("open");
  setTimeout(() => editUserNameEl.focus(), 10);
}

function closeEditUserModal() {
  editingUserId = "";
  editUserOverlayEl.classList.remove("open");
  editUserModalEl.classList.remove("open");
  editUserFormEl.reset();
}

async function handleEditUser(userId) {
  const user = state.settingsUsers.find((item) => item.id === userId);
  if (!user) return;
  openEditUserModal(user);
}

async function handleDeleteUser(userId) {
  const user = state.settingsUsers.find((item) => item.id === userId);
  if (!user) return;

  const confirmed = await showConfirm(
    `Excluir o usuario ${user.name}?`,
    "Excluir usuario",
    "Excluir",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api(`/auth/users/${user.id}`, { method: "DELETE" });
    await loadUsersForSettings();
    await showAlert("Usuario excluido com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao excluir usuario.");
  }
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function showBulkImportProgress() {
  bulkImportOverlayEl.hidden = false;
  bulkImportOverlayEl.style.display = "flex";
  updateBulkImportProgress(0, "Iniciando...", "Processando arquivo e preparando lista de contatos...");
}

function hideBulkImportProgress() {
  bulkImportOverlayEl.hidden = true;
  bulkImportOverlayEl.style.display = "none";
}

function updateBulkImportProgress(percent, metaText, messageText = "") {
  const safePercent = Math.max(0, Math.min(100, Number(percent || 0)));
  bulkImportBarEl.style.width = `${safePercent}%`;
  bulkImportPercentEl.textContent = `${Math.round(safePercent)}%`;
  bulkImportMetaEl.textContent = metaText || "";
  if (messageText) {
    bulkImportMessageEl.textContent = messageText;
  }
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function normalizeBulkMessagesDraft() {
  if (!Array.isArray(bulkMessagesDraft)) {
    bulkMessagesDraft = [""];
  }
  if (!bulkMessagesDraft.length) {
    bulkMessagesDraft = [""];
  }
}

function renderBulkMessagesBuilder() {
  normalizeBulkMessagesDraft();
  bulkMessagesContainerEl.innerHTML = "";

  bulkMessagesDraft.forEach((value, index) => {
    const label = document.createElement("label");
    label.className = "bulk-message-item";
    label.innerHTML = `
      Mensagem ${index + 1}
      <textarea class="bulk-message-input" rows="4" placeholder="Digite a mensagem do disparo"></textarea>
    `;

    const textarea = label.querySelector("textarea");
    textarea.value = String(value || "");
    textarea.addEventListener("input", () => {
      bulkMessagesDraft[index] = textarea.value;
    });

    if (bulkMessagesDraft.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-danger bulk-remove-message-btn";
      removeBtn.textContent = "Remover";
      removeBtn.addEventListener("click", () => {
        bulkMessagesDraft.splice(index, 1);
        renderBulkMessagesBuilder();
      });
      label.appendChild(removeBtn);
    }

    bulkMessagesContainerEl.appendChild(label);
  });
}

function collectBulkMessages() {
  normalizeBulkMessagesDraft();
  return bulkMessagesDraft
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

async function parseContactsFromRows(rows, onProgress) {
  if (!rows.length) return [];
  const header = rows[0].map((item) => normalizeHeader(item));
  let phoneIndex = header.findIndex((h) => /telefone|phone|numero|celular|whatsapp/.test(h));
  let nameIndex = header.findIndex((h) => /nome|name|contato/.test(h));

  let startRow = 1;
  if (phoneIndex < 0) {
    phoneIndex = 0;
    nameIndex = 1;
    startRow = 0;
  }

  const contacts = [];
  const total = Math.max(rows.length - startRow, 1);
  const chunkSize = 120;
  let processed = 0;

  for (let i = startRow; i < rows.length; i += 1) {
    const row = rows[i];
    const phone = normalizeBrazilPhoneInput(String(row[phoneIndex] || "").trim());
    const name = String(row[nameIndex] || "").trim();
    if (!phone) continue;
    contacts.push({ id: `${phone}-${i}`, name, phone, selected: true });

    processed += 1;
    if (processed % chunkSize === 0) {
      const percent = 50 + Math.floor((processed / total) * 45);
      onProgress?.(Math.min(percent, 95), `${processed}/${total} linhas processadas`, "Validando contatos...");
      await tick();
    }
  }
  onProgress?.(96, `${processed}/${total} linhas processadas`, "Finalizando importacao...");
  return contacts;
}

async function parseContactsFromExcel(file, onProgress) {
  if (!window.XLSX) {
    throw new Error("Leitor de Excel nao carregado. Recarregue a pagina.");
  }

  onProgress?.(10, "Lendo arquivo...", "Carregando arquivo Excel...");
  const data = await file.arrayBuffer();
  onProgress?.(35, "Arquivo lido", "Processando planilha...");
  const workbook = window.XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const rows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  onProgress?.(50, "Planilha processada", "Convertendo dados para contatos...");
  return parseContactsFromRows(rows, onProgress);
}

function updateBulkContactsMeta() {
  const selected = state.bulkContacts.filter((item) => item.selected).length;
  const total = state.bulkContacts.length;
  const filtered = getFilteredBulkContacts().length;
  const searchLabel = state.bulkContactsSearch.trim() ? ` | ${filtered} na busca` : "";
  bulkContactsCountEl.textContent = `${selected}/${total} contatos selecionados${searchLabel}`;
}

function getFilteredBulkContacts() {
  const term = String(state.bulkContactsSearch || "")
    .trim()
    .toLowerCase();

  if (!term) {
    return state.bulkContacts;
  }

  const numericTerm = term.replace(/\D/g, "");
  return state.bulkContacts.filter((contact) => {
    const name = String(contact.name || "").toLowerCase();
    const phone = String(contact.phone || "");
    const phoneDigits = phone.replace(/\D/g, "");
    return name.includes(term) || phone.includes(term) || (numericTerm && phoneDigits.includes(numericTerm));
  });
}

function renderBulkContacts() {
  bulkContactsListEl.innerHTML = "";
  if (!state.bulkContacts.length) {
    bulkContactsListEl.innerHTML = '<div class="empty-state">Nenhum contato carregado.</div>';
    updateBulkContactsMeta();
    return;
  }

  const filteredContacts = getFilteredBulkContacts();
  if (!filteredContacts.length) {
    bulkContactsListEl.innerHTML = '<div class="empty-state">Nenhum contato encontrado na busca.</div>';
    updateBulkContactsMeta();
    return;
  }

  for (const contact of filteredContacts) {
    const row = document.createElement("label");
    row.className = "bulk-contact-row";

    const icon = document.createElement("i");
    icon.className = "bi bi-person-circle";

    const nameEl = document.createElement("strong");
    nameEl.className = "bulk-contact-name";
    nameEl.textContent = contact.name || "Sem nome";

    const phoneEl = document.createElement("span");
    phoneEl.className = "bulk-contact-phone";
    phoneEl.textContent = formatPhone(contact.phone);

    const mainInfo = document.createElement("div");
    mainInfo.className = "bulk-contact-main";
    mainInfo.appendChild(icon);
    mainInfo.appendChild(nameEl);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(contact.selected);
    checkbox.addEventListener("change", () => {
      contact.selected = checkbox.checked;
      updateBulkContactsMeta();
    });

    row.appendChild(mainInfo);
    row.appendChild(phoneEl);
    row.appendChild(checkbox);
    bulkContactsListEl.appendChild(row);
  }

  updateBulkContactsMeta();
}

function renderBulkJobDetails(data) {
  if (!bulkJobDetailsEl) return;
  const job = data?.job;
  if (!job) {
    bulkJobDetailsEl.textContent = "Selecione um disparo para ver detalhes.";
    return;
  }

  bulkJobDetailsEl.textContent = buildBulkJobDetailsText(data);
}

function buildBulkJobDetailsText(data) {
  const job = data?.job || {};
  const items = Array.isArray(data?.items) ? data.items : [];
  const failed = items.filter((item) => item.status === "failed");
  const sent = items.filter((item) => item.status === "sent");
  const queued = items.filter((item) => item.status === "queued");
  const failedPreview = failed
    .slice(0, 10)
    .map((item) => `- ${formatPhone(item.phone)}: ${item.error_message || "Falha"}`)
    .join("\n");

  return [
    `Status: ${job.status}`,
    `Conta: ${job.account_wa_jid || "-"}`,
    `Mensagem: ${job.message_text}`,
    `Intervalo: ${job.interval_min_seconds || job.interval_seconds}s a ${job.interval_max_seconds || job.interval_seconds}s (randomico)`,
    `Total: ${job.total_count} | Enviadas: ${sent.length} | Falhas: ${failed.length} | Pendentes: ${queued.length}`,
    "",
    failed.length > 0 ? "Falhas recentes:\n" + failedPreview : "Sem falhas registradas.",
  ].join("\n");
}

async function selectBulkJob(jobId) {
  state.selectedBulkJobId = jobId;
  await loadBulkJobs();
}

async function stopBulkJob(job) {
  const confirmed = await showConfirm(
    `Interromper o disparo ${String(job.status || "").toUpperCase()}?`,
    "Interromper disparo",
    "Interromper",
    "Cancelar",
  );
  if (!confirmed) return;
  await api(`/bulk-dispatch/jobs/${job.id}/stop`, { method: "PATCH" });
}

async function deleteBulkJob(job) {
  const confirmed = await showConfirm(
    "Excluir este disparo do historico?",
    "Excluir disparo",
    "Excluir",
    "Cancelar",
  );
  if (!confirmed) return;
  await api(`/bulk-dispatch/jobs/${job.id}`, { method: "DELETE" });
}

function renderBulkJobs() {
  bulkJobsListEl.innerHTML = "";

  if (!state.bulkJobs.length) {
    bulkJobsListEl.innerHTML = '<div class="empty-state">Nenhum disparo criado ainda.</div>';
    if (bulkJobDetailsEl) {
      bulkJobDetailsEl.textContent = "Selecione um disparo para ver detalhes.";
    }
    return;
  }

  for (const job of state.bulkJobs) {
    const done = Number(job.sent_count || 0) + Number(job.failed_count || 0);
    const total = Math.max(Number(job.total_count || 0), 1);
    const percent = Math.min(100, Math.round((done * 100) / total));
    const isSelected = job.id === state.selectedBulkJobId;

    const wrap = document.createElement("div");
    wrap.className = "bulk-job-wrap";
    const item = document.createElement("div");
    item.className = `bulk-job-item ${isSelected ? "active" : ""}`;
    item.innerHTML = `
      <div class="bulk-job-title">${job.status.toUpperCase()} - ${done}/${job.total_count}</div>
      <div class="bulk-job-sub">Intervalo ${job.interval_min_seconds || job.interval_seconds}s-${job.interval_max_seconds || job.interval_seconds}s | Criado ${fmtDateShort(job.created_at)} ${fmtTime(job.created_at)}</div>
      <div class="bulk-progress"><span style="width:${percent}%"></span></div>
    `;
    item.addEventListener("click", () => {
      selectBulkJob(job.id).catch((error) => console.error(error));
    });
    wrap.appendChild(item);

    if (isSelected) {
      const detailsData = state.bulkJobDetailsMap[job.id];
      const details = document.createElement("div");
      details.className = "bulk-job-expand";

      const summary = document.createElement("pre");
      summary.className = "bulk-job-details";
      summary.textContent = detailsData ? buildBulkJobDetailsText(detailsData) : "Carregando detalhes do disparo...";
      details.appendChild(summary);

      const actions = document.createElement("div");
      actions.className = "bulk-job-actions";

      const isActive = String(job.status || "") === "running" || String(job.status || "") === "queued";
      if (isActive) {
        const stopBtn = document.createElement("button");
        stopBtn.type = "button";
        stopBtn.className = "btn-danger";
        stopBtn.innerHTML = '<i class="bi bi-pause-circle"></i> Interromper';
        stopBtn.addEventListener("click", async (event) => {
          event.stopPropagation();
          try {
            await stopBulkJob(job);
            await loadBulkJobs();
          } catch (error) {
            await showAlert(error.message || "Falha ao interromper disparo.");
          }
        });
        actions.appendChild(stopBtn);
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn-secondary";
      deleteBtn.innerHTML = '<i class="bi bi-trash3"></i> Excluir';
      deleteBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await deleteBulkJob(job);
          if (state.selectedBulkJobId === job.id) {
            state.selectedBulkJobId = null;
          }
          delete state.bulkJobDetailsMap[job.id];
          await loadBulkJobs();
        } catch (error) {
          await showAlert(error.message || "Falha ao excluir disparo.");
        }
      });
      actions.appendChild(deleteBtn);

      details.appendChild(actions);
      wrap.appendChild(details);
    }

    bulkJobsListEl.appendChild(wrap);
  }
}

async function loadBulkJobs() {
  if (!state.isAuthenticated) return;
  const result = await api("/bulk-dispatch/jobs?limit=20");
  state.bulkJobs = result.items || [];
  if (
    state.bulkJobs.length > 0 &&
    (!state.selectedBulkJobId || !state.bulkJobs.some((job) => job.id === state.selectedBulkJobId))
  ) {
    state.selectedBulkJobId = state.bulkJobs[0].id;
  }
  renderBulkJobs();

  if (state.selectedBulkJobId) {
    const detail = await api(`/bulk-dispatch/jobs/${state.selectedBulkJobId}`);
    state.bulkJobDetailsMap[state.selectedBulkJobId] = detail;
    renderBulkJobDetails(detail);
    renderBulkJobs();
  } else {
    renderBulkJobDetails(null);
  }
}

function resetAppAfterLogout() {
  state.conversations = [];
  state.selectedConversationId = null;
  state.selectedConversation = null;
  state.connectedAccountJid = "";
  state.connectedAccountPhone = "";
  state.connectedAccountName = "";
  state.connectedAccountAvatarUrl = "";
  state.search = "";
  state.agents = [];
  state.currentView = "chats";
  writeSessionToken("");
  searchInputEl.value = "";
  clearChatStateForDisconnected();
  renderHeader();
  syncProfilePanel();
  applyConnectedProfileAvatar();
}

function handleUnauthorized() {
  if (!state.isAuthenticated) return;
  state.isAuthenticated = false;
  closeRealtime();
  resetAppAfterLogout();
  showLoginScreen();
  showAlert("Sessao expirada. Faca login novamente.").catch(() => undefined);
}

async function api(path, options = {}) {
  const { skipAuthRedirect = false, ...fetchOptions } = options;
  const customHeaders = fetchOptions.headers || {};
  const authHeaders = {};
  if (state.sessionToken) {
    authHeaders["x-session-token"] = state.sessionToken;
  }

  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...authHeaders, ...customHeaders },
    ...fetchOptions,
  });

  if (response.status === 401 && !skipAuthRedirect) {
    handleUnauthorized();
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  return response.json();
}

function showDialog(options = {}) {
  const {
    title = "NS Chat",
    message = "",
    confirmText = "OK",
    cancelText = "Cancelar",
    showCancel = false,
    kind = "alert",
    defaultValue = "",
    placeholder = "",
  } = options;

  return new Promise((resolve) => {
    let done = false;
    let canCloseByOverlay = Boolean(showCancel);
    const finish = (value) => {
      if (done) return;
      done = true;
      uiDialogOverlayEl.classList.remove("open");
      document.removeEventListener("keydown", onKeyDown);
      uiDialogOverlayEl.onclick = null;
      uiDialogConfirmEl.onclick = null;
      uiDialogCancelEl.onclick = null;
      resolve(value);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && showCancel) {
        event.preventDefault();
        finish(kind === "prompt" ? null : false);
      }
      if (event.key === "Enter" && kind === "prompt" && document.activeElement === uiDialogInputEl) {
        event.preventDefault();
        finish(uiDialogInputEl.value.trim());
      }
    };

    uiDialogTitleEl.textContent = title;
    uiDialogMessageEl.textContent = message;
    uiDialogConfirmEl.textContent = confirmText;
    uiDialogCancelEl.textContent = cancelText;
    uiDialogCancelEl.hidden = !showCancel;
    uiDialogInputWrapEl.hidden = kind !== "prompt";
    uiDialogInputEl.value = kind === "prompt" ? String(defaultValue || "") : "";
    uiDialogInputEl.placeholder = placeholder;
    uiDialogOverlayEl.classList.add("open");

    uiDialogConfirmEl.onclick = () => {
      if (kind === "prompt") {
        finish(uiDialogInputEl.value.trim());
        return;
      }
      finish(true);
    };
    uiDialogCancelEl.onclick = () => {
      finish(kind === "prompt" ? null : false);
    };
    uiDialogOverlayEl.onclick = (event) => {
      if (!canCloseByOverlay) return;
      if (event.target === uiDialogOverlayEl) {
        finish(kind === "prompt" ? null : false);
      }
    };
    document.addEventListener("keydown", onKeyDown);

    if (kind === "prompt") {
      setTimeout(() => {
        uiDialogInputEl.focus();
        uiDialogInputEl.select();
      }, 10);
    } else {
      setTimeout(() => uiDialogConfirmEl.focus(), 10);
    }
  });
}

function showAlert(message, title = "NS Chat") {
  return showDialog({ title, message, showCancel: false, kind: "alert", confirmText: "OK" });
}

function showConfirm(message, title = "NS Chat", confirmText = "Confirmar", cancelText = "Cancelar") {
  return showDialog({
    title,
    message,
    showCancel: true,
    kind: "confirm",
    confirmText,
    cancelText,
  });
}

function showPrompt(message, defaultValue = "", options = {}) {
  return showDialog({
    title: options.title || "NS Chat",
    message,
    showCancel: true,
    kind: "prompt",
    confirmText: options.confirmText || "Salvar",
    cancelText: options.cancelText || "Cancelar",
    defaultValue,
    placeholder: options.placeholder || "",
  });
}

async function loadCurrentUser() {
  try {
    if (!state.sessionToken) {
      state.sessionToken = readSessionToken();
    }
    const result = await api("/auth/me", { skipAuthRedirect: true });
    if (!result?.user) return false;
    state.currentUser = result.user;
    state.isAuthenticated = true;
    renderSettingsHeader();
    settingsBtnEl.style.display = "";
    hideLoginScreen();
    return true;
  } catch {
    state.currentUser = null;
    state.isAuthenticated = false;
    settingsBtnEl.style.display = "none";
    showLoginScreen();
    return false;
  }
}

async function performLogout() {
  try {
    await api("/auth/logout", { method: "POST", skipAuthRedirect: true });
  } catch {
    // no-op
  }
  resetAppAfterLogout();
  state.currentUser = null;
  state.isAuthenticated = false;
  settingsBtnEl.style.display = "none";
  showLoginScreen();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao processar audio gravado."));
    reader.readAsDataURL(blob);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao processar arquivo."));
    reader.readAsDataURL(file);
  });
}

function updateComposerAction() {
  const hasText = Boolean(String(messageInputEl.value || "").trim());
  const isRecording = mediaRecorder && mediaRecorder.state === "recording";
  const micEl = composerActionBtnEl.querySelector(".icon-mic");

  if (composerMode !== "text") {
    return;
  }

  if (isRecording) {
    composerActionBtnEl.classList.add("recording");
    composerActionBtnEl.classList.remove("send", "mic");
    composerActionBtnEl.title = "Parar e enviar audio";
    const mm = String(Math.floor(recordingSeconds / 60)).padStart(2, "0");
    const ss = String(recordingSeconds % 60).padStart(2, "0");
    if (micEl) {
      micEl.textContent = `${mm}:${ss}`;
    }
    return;
  }

  composerActionBtnEl.classList.remove("recording");
  if (micEl) {
    micEl.innerHTML = MIC_ICON_SVG;
  }

  if (hasText) {
    composerActionBtnEl.classList.add("send");
    composerActionBtnEl.classList.remove("mic");
    composerActionBtnEl.title = "Enviar mensagem";
  } else {
    composerActionBtnEl.classList.add("mic");
    composerActionBtnEl.classList.remove("send");
    composerActionBtnEl.title = "Gravar audio";
  }
}

function clearRecordedAudio() {
  recordedAudioBlob = null;
  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
    recordedAudioUrl = "";
  }
  audioReviewPlayerEl.pause();
  audioReviewPlayerEl.removeAttribute("src");
  audioReviewPlayerEl.load();
}

function setComposerMode(mode) {
  composerMode = mode;
  const isTextMode = mode === "text";
  textComposerEl.hidden = !isTextMode;
  audioComposerEl.hidden = isTextMode;

  if (mode === "recording") {
    audioPreviewBtnEl.disabled = true;
    audioSendBtnEl.disabled = true;
    audioPreviewBtnEl.innerHTML = PREVIEW_PLAY_ICON;
    audioTimerEl.textContent = fmtDuration(recordingSeconds);
  } else if (mode === "review") {
    audioPreviewBtnEl.disabled = false;
    audioSendBtnEl.disabled = false;
    audioPreviewBtnEl.innerHTML = PREVIEW_PLAY_ICON;
  } else {
    audioPreviewBtnEl.disabled = false;
    audioSendBtnEl.disabled = false;
    attachMenuEl.classList.remove("open");
    updateComposerAction();
  }
}

function captureActiveAudioState() {
  const active = messagesAreaEl.querySelector(".msg-audio-native[data-message-id]:not([data-paused='true'])");
  if (!active) {
    return null;
  }

  return {
    messageId: active.dataset.messageId || "",
    currentTime: active.currentTime || 0,
    volume: active.volume,
    muted: active.muted,
  };
}

function createCustomAudioPlayer(messageId, audioUrl, preservedState) {
  const wrapper = document.createElement("div");
  wrapper.className = "msg-audio-player";

  const playBtn = document.createElement("button");
  playBtn.type = "button";
  playBtn.className = "audio-play-btn";
  playBtn.innerHTML = PLAYER_PLAY_ICON;

  const progress = document.createElement("input");
  progress.type = "range";
  progress.className = "audio-progress";
  progress.min = "0";
  progress.max = "0";
  progress.step = "0.01";
  progress.value = "0";

  const time = document.createElement("span");
  time.className = "audio-time";
  time.textContent = "00:00 / 00:00";

  const audio = document.createElement("audio");
  audio.className = "msg-audio-native";
  audio.dataset.messageId = String(messageId || "");
  audio.dataset.paused = "true";
  audio.preload = "metadata";
  audio.src = audioUrl;

  playBtn.addEventListener("click", async () => {
    if (audio.paused) {
      const allAudios = messagesAreaEl.querySelectorAll(".msg-audio-native");
      allAudios.forEach((item) => {
        if (item !== audio) {
          item.pause();
          item.dataset.paused = "true";
        }
      });
      try {
        await audio.play();
      } catch (error) {
        console.error(error);
      }
    } else {
      audio.pause();
    }
  });

  audio.addEventListener("play", () => {
    audio.dataset.paused = "false";
    playBtn.innerHTML = PLAYER_PAUSE_ICON;
  });

  audio.addEventListener("pause", () => {
    audio.dataset.paused = "true";
    playBtn.innerHTML = PLAYER_PLAY_ICON;
  });

  audio.addEventListener("loadedmetadata", async () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    progress.max = String(duration);
    time.textContent = `${fmtDuration(audio.currentTime)} / ${fmtDuration(duration)}`;

    if (preservedState && preservedState.messageId === audio.dataset.messageId) {
      audio.currentTime = Math.min(preservedState.currentTime || 0, duration || preservedState.currentTime || 0);
      audio.volume = preservedState.volume;
      audio.muted = preservedState.muted;
      try {
        await audio.play();
      } catch (error) {
        console.error(error);
      }
    }
  });

  audio.addEventListener("timeupdate", () => {
    if (!progress.matches(":active")) {
      progress.value = String(audio.currentTime || 0);
    }
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    time.textContent = `${fmtDuration(audio.currentTime)} / ${fmtDuration(duration)}`;
  });

  progress.addEventListener("input", () => {
    const nextTime = Number(progress.value || 0);
    audio.currentTime = nextTime;
  });

  wrapper.appendChild(playBtn);
  wrapper.appendChild(progress);
  wrapper.appendChild(time);
  wrapper.appendChild(audio);
  return wrapper;
}

function closeAttachMenu() {
  attachMenuEl.classList.remove("open");
}

async function sendMediaFile(file) {
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }
  if (!file) {
    return;
  }

  try {
    const dataUrl = await fileToDataUrl(file);
    await api("/messages/send-media", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: state.selectedConversation.id,
        phone: state.selectedConversation.phone,
        client_id: state.selectedConversation.client_id || null,
        file_base64: dataUrl,
        mimetype: file.type || "application/octet-stream",
        file_name: file.name || "arquivo",
      }),
    });

    await loadConversations();
    await loadMessages();
  } catch (error) {
    await showAlert(error.message || "Falha ao enviar arquivo.");
  }
}

function renderConversations() {
  conversationListEl.innerHTML = "";

  const orderedConversations = [...state.conversations].sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime();
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  if (orderedConversations.length === 0) {
    conversationListEl.innerHTML = '<div class="empty-state">Nenhuma conversa encontrada.</div>';
    return;
  }

  for (const conv of orderedConversations) {
    const node = conversationItemTpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = conv.id;

    if (conv.id === state.selectedConversationId) {
      node.classList.add("active");
    }

    const displayName = conversationDisplayName(conv);
    applyAvatar(node.querySelector(".avatar"), conv);
    const nameEl = node.querySelector(".name");
    nameEl.textContent = displayName;
    const showBulkAlert =
      Boolean(conv.bulk_initiated) && String(conv.service_status || "") !== "in_progress";
    if (showBulkAlert) {
      node.classList.add("bulk-chat");
      const icon = document.createElement("span");
      icon.className = "bulk-alert-icon";
      icon.textContent = "!";
      nameEl.prepend(icon);
    }
    node.querySelector(".time").textContent = fmtDateShort(conv.last_message_at || conv.updated_at);
    const previewEl = node.querySelector(".preview");
    previewEl.textContent = conv.last_message_preview || "Sem mensagens";

    if (String(conv.service_status || "") === "in_progress" && String(conv.assigned_user_name || "").trim()) {
      const attendant = document.createElement("div");
      attendant.className = "conversation-attendant";
      attendant.textContent = `Atendente: ${conv.assigned_user_name}`;
      node.querySelector(".conversation-body").appendChild(attendant);
    }

    const badge = node.querySelector(".badge");
    if (Number(conv.unread_count) > 0) {
      badge.textContent = String(conv.unread_count);
      badge.classList.add("show");
    }

    node.addEventListener("click", () => selectConversation(conv.id));
    node.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      openConversationMenu(conv.id, event.clientX, event.clientY);
    });
    conversationListEl.appendChild(node);
  }
}

function renderServiceTabs() {
  allChatsBtnEl.classList.toggle("active", state.showAllChats);
  tabPendingBtnEl.classList.toggle("active", !state.showAllChats && state.serviceTab === "pending");
  tabInProgressBtnEl.classList.toggle("active", !state.showAllChats && state.serviceTab === "in_progress");
  tabFinalizedBtnEl.classList.toggle("active", !state.showAllChats && state.serviceTab === "finalized");
  tabBulkBtnEl.classList.toggle("active", !state.showAllChats && state.serviceTab === "bulk");

  const pending = Number(state.serviceCounts.pending || 0);
  const inProgress = Number(state.serviceCounts.in_progress || 0);
  const bulk = Number(state.serviceCounts.bulk || 0);

  tabPendingCountEl.textContent = String(pending);
  tabPendingCountEl.hidden = pending <= 0;
  tabInProgressCountEl.textContent = String(inProgress);
  tabInProgressCountEl.hidden = inProgress <= 0;
  tabBulkCountEl.textContent = String(bulk);
  tabBulkCountEl.hidden = bulk <= 0;
}

async function loadConversationSummary() {
  if (!state.isAuthenticated || !state.connectedAccountJid) {
    state.serviceCounts = { pending: 0, in_progress: 0, finalized: 0, bulk: 0 };
    renderServiceTabs();
    return;
  }

  const query = new URLSearchParams();
  query.set("account_jid", state.connectedAccountJid);
  const result = await api(`/conversations/summary?${query.toString()}`);
  state.serviceCounts = {
    pending: Number(result?.pending_count || 0),
    in_progress: Number(result?.in_progress_count || 0),
    finalized: Number(result?.finalized_count || 0),
    bulk: Number(result?.bulk_count || 0),
  };
  renderServiceTabs();
}

function canCurrentUserSendInConversation(conv) {
  if (!state.currentUser || !conv) return false;
  return conv.service_status === "in_progress" && conv.assigned_user_id === state.currentUser.id;
}

function updateComposerLock() {
  const canSend = canCurrentUserSendInConversation(state.selectedConversation);
  const disabled = !canSend;

  messageInputEl.disabled = false;
  attachBtnEl.disabled = false;
  composerActionBtnEl.disabled = false;
  messageInputEl.readOnly = disabled;
  messageInputEl.dataset.locked = disabled ? "true" : "false";
  attachBtnEl.dataset.locked = disabled ? "true" : "false";
  composerActionBtnEl.dataset.locked = disabled ? "true" : "false";

  if (disabled) {
    messageInputEl.placeholder = "Assuma o atendimento para enviar mensagens.";
  } else {
    messageInputEl.placeholder = "Digite uma mensagem";
  }
}

async function ensureConversationReadyForCompose() {
  if (!state.selectedConversation) {
    await showAlert("Selecione uma conversa.");
    return false;
  }
  if (canCurrentUserSendInConversation(state.selectedConversation)) {
    return true;
  }

  const status = String(state.selectedConversation.service_status || "pending");
  if (status === "in_progress") {
    const responsible = state.selectedConversation.assigned_user_name || "outro atendente";
    await showAlert(`Esta conversa esta em atendimento por ${responsible}.`);
    return false;
  }

  await maybeClaimSelectedConversation();
  const refreshed =
    state.conversations.find((item) => item.id === state.selectedConversationId) || state.selectedConversation;
  state.selectedConversation = refreshed;
  renderHeader();
  return canCurrentUserSendInConversation(state.selectedConversation);
}

function renderHeader() {
  if (!state.selectedConversation) {
    chatHeaderEl.innerHTML = '<div class="chat-contact">Selecione uma conversa</div>';
    updateComposerLock();
    return;
  }

  const name = conversationDisplayName(state.selectedConversation);
  const phone = formatPhone(state.selectedConversation.phone) || state.selectedConversation.phone || "-";
  chatHeaderEl.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "chat-contact-wrap";

  const avatar = document.createElement("div");
  avatar.className = "chat-header-avatar";
  applyAvatar(avatar, state.selectedConversation);

  const info = document.createElement("div");
  info.className = "chat-contact-wrap";

  const contact = document.createElement("div");
  contact.className = "chat-contact";
  contact.textContent = name;

  const phoneEl = document.createElement("div");
  phoneEl.className = "chat-contact-phone";
  phoneEl.textContent = phone;

  info.appendChild(contact);
  info.appendChild(phoneEl);
  wrap.appendChild(avatar);
  wrap.appendChild(info);
  chatHeaderEl.appendChild(wrap);

  const actions = document.createElement("div");
  actions.className = "chat-header-actions";

  const status = String(state.selectedConversation.service_status || "pending");
  const assignedName = state.selectedConversation.assigned_user_name || "";
  const isMine = canCurrentUserSendInConversation(state.selectedConversation);
  const canTransfer = Boolean(
    state.currentUser &&
      (state.currentUser.role === "administrador" || isMine) &&
      status === "in_progress",
  );

  const statusTag = document.createElement("span");
  statusTag.className = `service-status-tag ${status}`;
  statusTag.textContent =
    status === "in_progress"
      ? assignedName
        ? `Em atendimento: ${assignedName}`
        : "Em atendimento"
      : status === "finalized"
        ? "Finalizado"
        : "Pendente";
  actions.appendChild(statusTag);

  if (isMine) {
    const finalizeBtn = document.createElement("button");
    finalizeBtn.type = "button";
    finalizeBtn.className = "btn-secondary chat-header-btn chat-header-btn-danger";
    finalizeBtn.title = "Finalizar";
    finalizeBtn.innerHTML = '<i class="bi bi-check2-circle"></i>';
    finalizeBtn.addEventListener("click", async () => {
      const ok = await showConfirm(
        "Deseja finalizar este atendimento?",
        "Finalizar atendimento",
        "Finalizar",
        "Cancelar",
      );
      if (!ok) return;
      try {
        await api(`/conversations/${state.selectedConversation.id}/finalize`, { method: "PATCH" });
        await loadConversations();
      } catch (error) {
        await showAlert(error.message || "Falha ao finalizar atendimento.");
      }
    });
    actions.appendChild(finalizeBtn);
  }

  if (canTransfer) {
    const transferBtn = document.createElement("button");
    transferBtn.type = "button";
    transferBtn.className = "btn-secondary chat-header-btn";
    transferBtn.title = "Transferir";
    transferBtn.innerHTML = '<i class="bi bi-arrow-left-right"></i>';
    transferBtn.addEventListener("click", () => {
      openTransferModal(state.selectedConversation.id).catch((error) => console.error(error));
    });
    actions.appendChild(transferBtn);
  }

  chatHeaderEl.appendChild(actions);
  updateComposerLock();
}

function closeMediaModal() {
  mediaModalBodyEl.innerHTML = "";
  mediaModalOverlayEl.hidden = true;
}

function openMediaModal(type, url, mimeType = "") {
  mediaModalBodyEl.innerHTML = "";
  if (!url) return;

  if (type === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    if (mimeType) {
      video.setAttribute("type", mimeType);
    }
    mediaModalBodyEl.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = url;
    img.alt = "Midia";
    mediaModalBodyEl.appendChild(img);
  }

  mediaModalOverlayEl.hidden = false;
}

function renderMessages(messages) {
  const preservedAudio = captureActiveAudioState();
  messagesAreaEl.innerHTML = "";

  if (!messages || messages.length === 0) {
    messagesAreaEl.innerHTML = '<div class="empty-state">Sem mensagens nesta conversa.</div>';
    return;
  }

  const orderedMessages = [...messages].sort((a, b) => {
    const aPrimary = new Date(a.sent_at || a.created_at || 0).getTime();
    const bPrimary = new Date(b.sent_at || b.created_at || 0).getTime();
    if (aPrimary !== bPrimary) {
      return aPrimary - bPrimary;
    }

    const aSecondary = new Date(a.created_at || a.sent_at || 0).getTime();
    const bSecondary = new Date(b.created_at || b.sent_at || 0).getTime();
    if (aSecondary !== bSecondary) {
      return aSecondary - bSecondary;
    }

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  let lastDateKey = "";
  for (const message of orderedMessages) {
    const messageDate = new Date(message.sent_at || message.created_at || Date.now());
    const messageDateKey = Number.isNaN(messageDate.getTime())
      ? ""
      : `${messageDate.getFullYear()}-${messageDate.getMonth()}-${messageDate.getDate()}`;

    if (messageDateKey && messageDateKey !== lastDateKey) {
      lastDateKey = messageDateKey;
      const dividerRow = document.createElement("div");
      dividerRow.className = "msg-date-divider-row";

      const divider = document.createElement("div");
      divider.className = "msg-date-divider";
      divider.textContent = fmtDateDivider(message.sent_at || message.created_at);

      dividerRow.appendChild(divider);
      messagesAreaEl.appendChild(dividerRow);
    }

    const row = document.createElement("div");
    row.className = `msg-row ${message.from_me ? "outbound" : "inbound"}`;

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble";
    const mediaType = String(message?.metadata?.media_type || "");
    const mimeType = String(message?.metadata?.mime_type || "");
    const imageUrl =
      message?.metadata?.image_preview_url ||
      ((mediaType === "image" || mimeType.startsWith("image/")) ? message?.metadata?.file_url || "" : "");
    const videoUrl =
      message?.metadata?.video_url || ((mediaType === "video" || mimeType.startsWith("video/")) ? message?.metadata?.file_url || "" : "");
    const videoMimeType = message?.metadata?.video_mime_type || mimeType || "";
    const audioUrl = message?.metadata?.audio_url || "";
    const fileUrl = message?.metadata?.file_url || "";
    const fileName = message?.metadata?.file_name || "Arquivo";
    const rawBody = String(message.body || "").trim();
    const isImagePlaceholder = /^\[imagem\]$/i.test(rawBody);
    const isVideoPlaceholder = /^\[video\]$/i.test(rawBody);
    const isAudioPlaceholder = /^\[audio\]$/i.test(rawBody);
    const isFilePlaceholder = /^\[arquivo\]/i.test(rawBody) || /^\[documento\]$/i.test(rawBody);
    const shouldRenderText =
      Boolean(rawBody) &&
      !(
        (imageUrl && isImagePlaceholder) ||
        (videoUrl && isVideoPlaceholder) ||
        (audioUrl && isAudioPlaceholder) ||
        (fileUrl && isFilePlaceholder)
      );

    if (imageUrl) {
      const img = document.createElement("img");
      img.className = "msg-image";
      img.src = imageUrl;
      img.alt = "Imagem recebida";
      img.loading = "lazy";
      img.addEventListener("click", () => {
        openMediaModal("image", imageUrl);
      });
      bubble.appendChild(img);
    }

    if (videoUrl) {
      const videoWrap = document.createElement("button");
      videoWrap.type = "button";
      videoWrap.className = "msg-video-wrap";

      const video = document.createElement("video");
      video.className = "msg-video";
      video.src = videoUrl;
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;

      const playBadge = document.createElement("span");
      playBadge.className = "msg-video-play";
      playBadge.innerHTML = '<i class="bi bi-play-fill"></i>';

      videoWrap.appendChild(video);
      videoWrap.appendChild(playBadge);
      videoWrap.addEventListener("click", () => {
        openMediaModal("video", videoUrl, videoMimeType);
      });
      bubble.appendChild(videoWrap);
    }

    if (audioUrl) {
      const player = createCustomAudioPlayer(message.id, audioUrl, preservedAudio);
      bubble.appendChild(player);
    }

    if (fileUrl && !imageUrl && !videoUrl && !audioUrl) {
      const doc = document.createElement("a");
      doc.className = "msg-file";
      doc.href = fileUrl;
      doc.target = "_blank";
      doc.rel = "noopener noreferrer";
      doc.download = fileName;
      doc.innerHTML = `<i class="bi bi-file-earmark"></i><span>${fileName}</span>`;
      bubble.appendChild(doc);
    }

    if (shouldRenderText) {
      const text = document.createElement("div");
      text.className = "msg-text";
      text.textContent = rawBody;
      bubble.appendChild(text);
    }

    if ((imageUrl || videoUrl || audioUrl) && !shouldRenderText) {
      bubble.classList.add("media-only");
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";

    const t = document.createElement("span");
    t.textContent = fmtTime(message.sent_at || message.created_at);

    const checksStatus = checksByStatus(message);
    const checks = document.createElement("span");
    checks.className = `checks ${checksStatus.type || ""}`.trim();
    checks.textContent = checksStatus.text;

    meta.appendChild(t);
    if (message.from_me) {
      meta.appendChild(checks);
    }

    bubble.appendChild(meta);
    row.appendChild(bubble);
    messagesAreaEl.appendChild(row);
  }

  messagesAreaEl.scrollTop = messagesAreaEl.scrollHeight;
}

function scheduleRealtimeReconnect() {
  if (realtimeReconnectTimer) return;
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    connectRealtime();
  }, 2000);
}

function queueConversationRefresh() {
  if (conversationRefreshTimer) return;
  conversationRefreshTimer = setTimeout(() => {
    conversationRefreshTimer = null;
    if (state.loadingConversations) {
      pendingConversationRefresh = true;
      return;
    }
    loadConversations().catch((error) => console.error(error));
  }, 120);
}

function queueMessageRefresh() {
  if (messageRefreshTimer) return;
  messageRefreshTimer = setTimeout(() => {
    messageRefreshTimer = null;
    loadMessages().catch((error) => console.error(error));
  }, 80);
}

function closeRealtime() {
  realtimePollToken += 1;
  realtimePolling = false;
  if (realtimePollController) {
    realtimePollController.abort();
    realtimePollController = null;
  }
  realtimeLastEventAt = 0;
  realtimeLastPollAt = 0;
  if (realtimeWatchdogTimer) {
    clearInterval(realtimeWatchdogTimer);
    realtimeWatchdogTimer = null;
  }
  if (realtimeCheckpointTimer) {
    clearInterval(realtimeCheckpointTimer);
    realtimeCheckpointTimer = null;
  }
}

function upsertRealtimeMessage(message) {
  if (!message || !message.id) return;
  const current = Array.isArray(state.currentMessages) ? [...state.currentMessages] : [];
  const index = current.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    current[index] = { ...current[index], ...message };
  } else {
    current.push(message);
  }

  current.sort((a, b) => {
    const aPrimary = new Date(a.sent_at || a.created_at || 0).getTime();
    const bPrimary = new Date(b.sent_at || b.created_at || 0).getTime();
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;

    const aSecondary = new Date(a.created_at || a.sent_at || 0).getTime();
    const bSecondary = new Date(b.created_at || b.sent_at || 0).getTime();
    if (aSecondary !== bSecondary) return aSecondary - bSecondary;

    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  state.currentMessages = current;
  renderMessages(state.currentMessages);
}

function handleRealtimePayload(payload, eventType = "message_saved") {
  if (!payload) return;

  if (eventType === "checkpoint_changed") {
    state.realtimeCheckpointToken = String(payload.token || state.realtimeCheckpointToken || "");
    console.warn("[REALTIME] checkpoint_changed", payload);
    if (state.currentView === "chats") {
      queueConversationRefresh();
      if (state.selectedConversationId) {
        queueMessageRefresh();
      }
    }
    return;
  }

  if (!payload.conversationId) return;

  if (state.currentView === "chats") {
    if (payload.conversationId === state.selectedConversationId) {
      if (payload.message) {
        upsertRealtimeMessage(payload.message);
      }
      queueMessageRefresh();
    }
    queueConversationRefresh();
  }
}

function clearChatStateForDisconnected() {
  state.conversations = [];
  state.currentMessages = [];
  state.selectedConversationId = null;
  state.selectedConversation = null;
  state.loadingConversations = false;
  state.loadingMessages = false;
  state.serviceCounts = { pending: 0, in_progress: 0, finalized: 0, bulk: 0 };
  realtimeCursor = 0;
  state.realtimeCheckpointToken = "";
  closeConversationMenu();
  closeRealtime();
  renderConversations();
  renderServiceTabs();
  renderHeader();
  messagesAreaEl.innerHTML = '<div class="empty-state">Conecte o WhatsApp para ver conversas.</div>';
  updateComposerAction();
  updateComposerLock();
}

function ensureRealtimeWatchdog() {
  if (realtimeWatchdogTimer) return;
  realtimeWatchdogTimer = setInterval(() => {
    if (!realtimePolling || !state.isAuthenticated || !state.connectedAccountJid) return;
    const idleMs = Date.now() - (realtimeLastPollAt || 0);
    if (idleMs > 35_000) {
      console.warn("[REALTIME] watchdog_reconnect", { idleMs });
      closeRealtime();
      connectRealtime().catch((error) => console.error(error));
    }
  }, 8000);
}

function ensureRealtimeCheckpointVerifier() {
  if (realtimeCheckpointTimer) return;
  realtimeCheckpointTimer = setInterval(async () => {
    if (!state.isAuthenticated || !state.connectedAccountJid || state.currentView !== "chats") return;
    try {
      const query = new URLSearchParams({
        account_jid: state.connectedAccountJid,
        selected_conversation_id: String(state.selectedConversationId || ""),
        _: String(Date.now()),
      });
      const result = await api(`/realtime/checkpoint?${query.toString()}`);
      const nextToken = String(result?.checkpoint?.token || "");
      if (!nextToken) return;
      if (!state.realtimeCheckpointToken) {
        state.realtimeCheckpointToken = nextToken;
        return;
      }
      if (nextToken !== state.realtimeCheckpointToken) {
        console.warn("[REALTIME] verifier_checkpoint_changed", result.checkpoint);
        state.realtimeCheckpointToken = nextToken;
        queueConversationRefresh();
        if (state.selectedConversationId) {
          queueMessageRefresh();
        }
      }
    } catch (error) {
      console.error(error);
    }
  }, 2500);
}

async function connectRealtime() {
  if (!state.isAuthenticated) {
    closeRealtime();
    return;
  }
  if (!state.connectedAccountJid) {
    closeRealtime();
    return;
  }

  if (realtimePolling) {
    return;
  }

  realtimePolling = true;
  realtimeLastPollAt = Date.now();
  ensureRealtimeWatchdog();
  ensureRealtimeCheckpointVerifier();
  const pollToken = ++realtimePollToken;

  while (realtimePolling && pollToken === realtimePollToken && state.isAuthenticated && state.connectedAccountJid) {
    const query = new URLSearchParams({
      account_jid: state.connectedAccountJid,
      since: String(realtimeCursor || 0),
      checkpoint: String(state.realtimeCheckpointToken || ""),
      selected_conversation_id: String(state.selectedConversationId || ""),
      _: String(Date.now()),
    });
    realtimePollController = new AbortController();

    try {
      const result = await api(`/realtime/poll?${query.toString()}`, {
        signal: realtimePollController.signal,
      });
      realtimeLastPollAt = Date.now();
      if (pollToken !== realtimePollToken) {
        break;
      }

      realtimeLastEventAt = Date.now();
      if (result?.event?.payload?.token) {
        state.realtimeCheckpointToken = String(result.event.payload.token || state.realtimeCheckpointToken || "");
      }
      if (result?.event?.seq) {
        realtimeCursor = Number(result.event.seq) || realtimeCursor;
      }
      if (result?.event?.payload) {
        if (result?.event?.type) {
          console.debug("[REALTIME] event", result.event.type, result.event.payload);
        }
        handleRealtimePayload(result.event.payload, String(result.event.type || ""));
      }
    } catch (error) {
      if (realtimePollController?.signal?.aborted || pollToken !== realtimePollToken) {
        break;
      }
      console.error(error);
      realtimePolling = false;
      realtimePollController = null;
      scheduleRealtimeReconnect();
      return;
    }
  }

  realtimePolling = false;
  realtimePollController = null;
}

async function loadConversations() {
  if (!state.isAuthenticated) return;
  if (!state.connectedAccountJid) {
    clearChatStateForDisconnected();
    return;
  }

  if (state.loadingConversations) return;
  state.loadingConversations = true;

  try {
    const query = new URLSearchParams({
      limit: "50",
      offset: "0",
      search: state.search,
    });
    if (!state.showAllChats) {
      if (state.serviceTab === "bulk") {
        query.set("bulk_only", "true");
      } else {
        query.set("service_status", state.serviceTab);
      }
    }
    if (state.connectedAccountJid) {
      query.set("account_jid", state.connectedAccountJid);
    }

    const result = await api(`/conversations?${query.toString()}`);
    state.conversations = result.items || [];
    await loadConversationSummary();

    const selectedExists = state.conversations.find((item) => item.id === state.selectedConversationId) || null;

    if (selectedExists) {
      state.selectedConversation = selectedExists;
      await loadMessages();
    } else if (state.conversations.length > 0) {
      state.selectedConversationId = state.conversations[0].id;
      state.selectedConversation = state.conversations[0];
      await loadMessages();
    } else {
      state.selectedConversationId = null;
      state.selectedConversation = null;
      state.currentMessages = [];
      renderMessages([]);
    }

    renderConversations();
    renderHeader();
    renderServiceTabs();
  } catch (error) {
    console.error(error);
  } finally {
    state.loadingConversations = false;
    if (pendingConversationRefresh && state.currentView === "chats") {
      pendingConversationRefresh = false;
      loadConversations().catch((error) => console.error(error));
    }
  }
}

async function loadMessages() {
  if (!state.isAuthenticated || !state.connectedAccountJid || !state.selectedConversationId) return;
  if (state.loadingMessages) {
    pendingMessagesRefresh = true;
    return;
  }
  state.loadingMessages = true;
  const targetConversationId = state.selectedConversationId;

  try {
    const result = await api(`/conversations/${targetConversationId}/messages?limit=200`);
    if (targetConversationId !== state.selectedConversationId) {
      return;
    }
    state.currentMessages = result.items || [];
    renderMessages(state.currentMessages);
  } catch (error) {
    console.error(error);
  } finally {
    state.loadingMessages = false;
    if (pendingMessagesRefresh && targetConversationId === state.selectedConversationId) {
      pendingMessagesRefresh = false;
      loadMessages().catch((error) => console.error(error));
    }
  }
}

async function markSelectedConversationRead() {
  if (!state.selectedConversationId) return;
  try {
    await api(`/conversations/${state.selectedConversationId}/read`, { method: "PATCH" });
  } catch (error) {
    console.error(error);
  }
}

async function selectConversation(conversationId) {
  if (!state.isAuthenticated) return;
  if (!conversationId) return;

  if (conversationId === state.selectedConversationId) {
    state.selectedConversation = state.conversations.find((item) => item.id === conversationId) || state.selectedConversation;
    renderConversations();
    renderHeader();
    await loadMessages();
    if (!canCurrentUserSendInConversation(state.selectedConversation)) {
      await maybeClaimSelectedConversation();
    }
    markSelectedConversationRead();
    refreshConversationAvatar(conversationId);
    return;
  }

  state.selectedConversationId = conversationId;
  state.selectedConversation = state.conversations.find((item) => item.id === conversationId) || null;
  renderConversations();
  renderHeader();
  await loadMessages();
  if (!canCurrentUserSendInConversation(state.selectedConversation)) {
    await maybeClaimSelectedConversation();
  }
  markSelectedConversationRead();
  refreshConversationAvatar(conversationId);
  await loadConversations();
}

async function maybeClaimSelectedConversation() {
  if (!state.selectedConversation || !state.currentUser) return;
  const conv = state.selectedConversation;
  const status = String(conv.service_status || "pending");
  const isMine = canCurrentUserSendInConversation(conv);
  if (isMine) return;

  const canClaim = status === "pending" || status === "finalized";
  if (!canClaim) return;

  const confirmed = await showConfirm(
    "Deseja iniciar este atendimento agora?",
    "Iniciar atendimento",
    "Atender",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api(`/conversations/${conv.id}/claim`, { method: "PATCH" });
    state.showAllChats = false;
    state.serviceTab = "in_progress";
    await loadConversations();
    state.selectedConversation = state.conversations.find((item) => item.id === conv.id) || state.selectedConversation;
    renderHeader();
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar atendimento.");
  }
}

async function refreshConversationAvatar(conversationId) {
  if (!conversationId) return;
  try {
    const result = await api(`/conversations/${conversationId}/avatar`);
    const avatarUrl = result?.avatar_url || "";
    if (!avatarUrl) return;

    const conv = state.conversations.find((item) => item.id === conversationId);
    if (conv) {
      conv.avatar_url = avatarUrl;
    }
    if (state.selectedConversation && state.selectedConversation.id === conversationId) {
      state.selectedConversation.avatar_url = avatarUrl;
    }
    renderConversations();
    renderHeader();
  } catch (error) {
    console.error(error);
  }
}

async function sendCurrentMessage(evt) {
  evt.preventDefault();
  await sendCurrentText();
}

async function sendCurrentText() {
  if (!state.selectedConversation || !messageInputEl.value.trim()) {
    return;
  }
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }

  const text = messageInputEl.value.trim();
  messageInputEl.value = "";

  try {
    await api("/messages/send", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: state.selectedConversation.id,
        phone: state.selectedConversation.phone,
        message: text,
        client_id: state.selectedConversation.client_id || null,
      }),
    });

    await loadMessages();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha no envio.");
  } finally {
    updateComposerAction();
  }
}

async function sendAudioBlob(blob, fileName = "gravacao.webm") {
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }
  if (!blob) {
    return;
  }

  try {
    const dataUrl = await blobToDataUrl(blob);
    await api("/messages/send-audio", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: state.selectedConversation.id,
        phone: state.selectedConversation.phone,
        client_id: state.selectedConversation.client_id || null,
        audio_base64: dataUrl,
        mimetype: blob.type || "audio/webm",
        file_name: fileName,
      }),
    });
    await loadMessages();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha ao enviar audio.");
  }
}

function clearRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

async function startRecording() {
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    await showAlert("Seu navegador nao suporta gravacao de audio.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaChunks = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
      ? "audio/ogg;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : undefined;
    mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        mediaChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      clearRecordingTimer();
      const blobType = mediaRecorder?.mimeType || "audio/webm";
      const audioBlob = new Blob(mediaChunks, { type: blobType });
      mediaChunks = [];

      if (mediaStream) {
        for (const track of mediaStream.getTracks()) {
          track.stop();
        }
      }
      mediaStream = null;
      mediaRecorder = null;
      recordingSeconds = 0;
      messageInputEl.placeholder = "Digite uma mensagem";

      if (audioBlob.size > 0) {
        clearRecordedAudio();
        recordedAudioBlob = audioBlob;
        recordedAudioUrl = URL.createObjectURL(audioBlob);
        audioReviewPlayerEl.src = recordedAudioUrl;
        audioReviewPlayerEl.load();
        setComposerMode("review");
      } else {
        setComposerMode("text");
      }
    };

    mediaRecorder.start();
    recordingSeconds = 0;
    messageInputEl.placeholder = "Gravando...";
    setComposerMode("recording");
    clearRecordingTimer();
    recordingTimer = setInterval(() => {
      recordingSeconds += 1;
      audioTimerEl.textContent = fmtDuration(recordingSeconds);
    }, 1000);
    audioTimerEl.textContent = fmtDuration(recordingSeconds);
  } catch (error) {
    await showAlert(error.message || "Nao foi possivel iniciar a gravacao.");
    setComposerMode("text");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
}

async function handleNewChatSubmit(evt) {
  evt.preventDefault();
  const name = newChatNameEl.value.trim();
  const phone = normalizeBrazilPhoneInput(newChatPhoneEl.value);
  const message = newChatMessageEl.value.trim();

  if (!name || !phone) {
    await showAlert("Informe nome e telefone.");
    return;
  }

  newChatPhoneEl.value = phone;

  try {
    const result = await api("/conversations/start", {
      method: "POST",
      body: JSON.stringify({
        name,
        phone,
        message,
      }),
    });

    closeNewChatModal();
    state.showAllChats = false;
    state.serviceTab = "in_progress";
    await loadConversations();
    if (result?.conversation_id) {
      await selectConversation(result.conversation_id);
    }
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar conversa.");
  }
}

async function deleteContextConversation() {
  const conversationId = state.contextConversationId;
  if (!conversationId) return;

  const conv = state.conversations.find((item) => item.id === conversationId);
  const contactName = conv ? conversationDisplayName(conv) : "este contato";

  const confirmed = await showConfirm(
    `Confirma excluir a conversa de ${contactName}?\n\nIsso tambem remove o contato salvo no app (se ele nao estiver em outra conversa).`,
    "Excluir conversa",
    "Excluir",
    "Cancelar",
  );
  if (!confirmed) {
    closeConversationMenu();
    return;
  }

  try {
    await api(`/conversations/${conversationId}?delete_contact=true`, { method: "DELETE" });

    if (state.selectedConversationId === conversationId) {
      state.selectedConversationId = null;
      state.selectedConversation = null;
      state.currentMessages = [];
      renderHeader();
      renderMessages([]);
    }

    closeConversationMenu();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha ao excluir conversa.");
    closeConversationMenu();
  }
}

async function editContextConversation() {
  const conversationId = state.contextConversationId;
  if (!conversationId) return;

  const conv = state.conversations.find((item) => item.id === conversationId);
  const currentName = conv ? conversationDisplayName(conv) : "";
  const nextName = await showPrompt("Novo nome do contato:", currentName, {
    title: "Editar contato",
    confirmText: "Salvar",
    placeholder: "Digite o nome",
  });

  if (!nextName || !nextName.trim()) {
    closeConversationMenu();
    return;
  }

  try {
    await api(`/conversations/${conversationId}/contact`, {
      method: "PATCH",
      body: JSON.stringify({ name: nextName.trim() }),
    });
    closeConversationMenu();
    await loadConversations();
    if (state.selectedConversationId === conversationId) {
      renderHeader();
    }
  } catch (error) {
    await showAlert(error.message || "Falha ao editar contato.");
    closeConversationMenu();
  }
}

async function transferContextConversation() {
  const conversationId = state.contextConversationId;
  if (!conversationId) return;
  closeConversationMenu();
  await openTransferModal(conversationId);
}

async function refreshHealth() {
  if (!state.isAuthenticated) return;
  try {
    const health = await api("/health");
    const wa = health?.whatsapp || {};
    const online = Boolean(wa.connected);
    const phone = wa.userPhone || "";
    const name = wa.userName || "";
    const jid = wa.userId || "";
    const previousAccountJid = state.connectedAccountJid;

    waStatusEl.textContent = online ? "Online" : "Offline";
    waStatusEl.classList.toggle("online", online);

    state.connectedAccountJid = online ? jid : "";
    state.connectedAccountPhone = online ? phone : "";
    state.connectedAccountName = online ? name : "";

    await refreshConnectedAccountAvatar();
    connectedProfileEl.title = online
      ? `${state.connectedAccountName || "Telefone conectado"} ${formatPhone(state.connectedAccountPhone)}`.trim()
      : "Telefone desconectado";

    connectedPhoneMiniEl.textContent = online
      ? (state.connectedAccountName || formatPhone(state.connectedAccountPhone) || "conectado")
      : "offline";
    syncProfilePanel();
    renderHistorySyncStatus(wa);
    if (online && previousAccountJid && previousAccountJid !== state.connectedAccountJid) {
      state.selectedConversationId = null;
      state.selectedConversation = null;
      closeRealtime();
    }
    if (online) {
      qrPanelEl.hidden = true;
      stopQrPolling();
      clearQrCode();
    } else {
      clearChatStateForDisconnected();
    }
    connectRealtime();
  } catch (error) {
    waStatusEl.textContent = "Offline";
    waStatusEl.classList.remove("online");
    state.connectedAccountAvatarUrl = "";
    applyConnectedProfileAvatar();
    connectedProfileEl.title = "Telefone desconectado";
    connectedPhoneMiniEl.textContent = "offline";
    state.connectedAccountJid = "";
    state.connectedAccountPhone = "";
    state.connectedAccountName = "";
    syncProfilePanel();
    renderHistorySyncStatus({});
    clearChatStateForDisconnected();
    connectRealtime();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const username = String(loginUsernameEl.value || "").trim();
  const password = String(loginPasswordEl.value || "").trim();
  if (!username || !password) {
    await showAlert("Informe usuario e senha.");
    return;
  }

  loginSubmitBtnEl.disabled = true;
  loginSubmitBtnEl.textContent = "Entrando...";
  try {
    const result = await api("/auth/login", {
      method: "POST",
      skipAuthRedirect: true,
      body: JSON.stringify({ username, password }),
    });

    writeSessionToken(result.session_token || "");
    state.currentUser = result.user || null;
    state.isAuthenticated = Boolean(state.currentUser);
    renderSettingsHeader();
    settingsBtnEl.style.display = "";
    hideLoginScreen();
    loginPasswordEl.value = "";
    await loadAgents();
    await refreshHealth();
    await loadConversations();
    await loadUsersForSettings();
  } catch (error) {
    await showAlert(error.message || "Falha no login.");
  } finally {
    loginSubmitBtnEl.disabled = false;
    loginSubmitBtnEl.textContent = "Entrar";
  }
}

async function handleCreateUserSubmit(event) {
  event.preventDefault();
  const name = String(newUserNameEl.value || "").trim();
  const username = String(newUserUsernameEl.value || "").trim().toLowerCase();
  const password = String(newUserPasswordEl.value || "").trim();
  const role = String(newUserRoleEl.value || "operador");
  const sectorId = String(newUserSectorEl.value || "").trim();

  if (!name || !username || !password || !sectorId) {
    await showAlert("Preencha nome, usuario, senha e setor.");
    return;
  }

  try {
    await api("/auth/users", {
      method: "POST",
      body: JSON.stringify({ name, username, password, role, sector_id: sectorId }),
    });
    createUserFormEl.reset();
    newUserRoleEl.value = "operador";
    renderSectorOptions();
    await loadUsersForSettings();
    await showAlert("Usuario cadastrado com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao cadastrar usuario.");
  }
}

async function handleCreateSectorSubmit(event) {
  event.preventDefault();
  const name = String(newSectorNameEl.value || "").trim();
  if (!name) {
    await showAlert("Informe o nome do setor.");
    return;
  }

  try {
    await api("/auth/sectors", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    createSectorFormEl.reset();
    await loadSectorsForSettings();
    await showAlert("Setor cadastrado com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao cadastrar setor.");
  }
}

loginFormEl.addEventListener("submit", handleLoginSubmit);

searchInputEl.addEventListener("input", async () => {
  state.search = searchInputEl.value.trim();
  await loadConversations();
});
allChatsBtnEl.addEventListener("click", async () => {
  state.showAllChats = true;
  renderServiceTabs();
  await loadConversations();
});
tabPendingBtnEl.addEventListener("click", async () => {
  state.showAllChats = false;
  state.serviceTab = "pending";
  renderServiceTabs();
  await loadConversations();
});
tabInProgressBtnEl.addEventListener("click", async () => {
  state.showAllChats = false;
  state.serviceTab = "in_progress";
  renderServiceTabs();
  await loadConversations();
});
tabFinalizedBtnEl.addEventListener("click", async () => {
  state.showAllChats = false;
  state.serviceTab = "finalized";
  renderServiceTabs();
  await loadConversations();
});
tabBulkBtnEl.addEventListener("click", async () => {
  state.showAllChats = false;
  state.serviceTab = "bulk";
  renderServiceTabs();
  await loadConversations();
});
messageInputEl.addEventListener("input", updateComposerAction);
messageInputEl.addEventListener("focus", async () => {
  if (messageInputEl.dataset.locked !== "true") return;
  messageInputEl.blur();
  await ensureConversationReadyForCompose();
});

railChatsEl.addEventListener("click", () => switchView("chats"));
railBulkCreateEl.addEventListener("click", () => switchView("bulk-create"));
railBulkMonitorEl.addEventListener("click", () => switchView("bulk-monitor"));
settingsBtnEl.addEventListener("click", async () => {
  if (!state.currentUser) return;
  renderSettingsHeader();
  openSettingsModal();
});
settingsTabPerfilEl.addEventListener("click", () => setSettingsTab("perfil"));
settingsTabCreateEl.addEventListener("click", () => setSettingsTab("create"));
settingsTabListEl.addEventListener("click", () => setSettingsTab("list"));
settingsTabSectorsEl.addEventListener("click", () => setSettingsTab("sectors"));
settingsUsersListEl.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const row = target.closest(".settings-user-item");
  const userId = String(row?.dataset?.userId || "").trim();
  if (!userId) return;

  const action = target.dataset.action;
  if (action === "edit-user") {
    await handleEditUser(userId);
    return;
  }
  if (action === "delete-user") {
    await handleDeleteUser(userId);
  }
});
settingsLogoutBtnEl.addEventListener("click", async () => {
  const confirmed = await showConfirm("Deseja encerrar sua sessao neste navegador?", "Encerrar sessao", "Sair", "Cancelar");
  if (!confirmed) return;
  closeSettingsModal();
  await performLogout();
});
settingsFinalizePendingBtnEl.addEventListener("click", async () => {
  if (state.currentUser?.role !== "administrador") return;
  const confirmed = await showConfirm(
    "Mover todas as conversas pendentes para finalizadas?",
    "Finalizar pendentes",
    "Finalizar",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    const result = await api("/conversations/finalize-pending-all", {
      method: "POST",
      body: JSON.stringify({
        account_jid: state.connectedAccountJid || "",
      }),
    });
    await loadConversations();
    await showAlert(`${Number(result.finalized_count || 0)} conversa(s) pendente(s) finalizada(s).`);
  } catch (error) {
    await showAlert(error.message || "Falha ao finalizar pendentes.");
  }
});
createUserFormEl.addEventListener("submit", handleCreateUserSubmit);
createSectorFormEl.addEventListener("submit", handleCreateSectorSubmit);
bulkAddMessageBtnEl.addEventListener("click", () => {
  normalizeBulkMessagesDraft();
  bulkMessagesDraft.push("");
  renderBulkMessagesBuilder();
});

bulkFileEl.addEventListener("change", async () => {
  const file = bulkFileEl.files?.[0];
  if (!file) {
    state.bulkContacts = [];
    state.bulkContactsSearch = "";
    bulkContactsSearchEl.value = "";
    renderBulkContacts();
    hideBulkImportProgress();
    return;
  }

  showBulkImportProgress();
  try {
    const contacts = await parseContactsFromExcel(file, updateBulkImportProgress);
    state.bulkContacts = contacts;
    state.bulkContactsSearch = "";
    bulkContactsSearchEl.value = "";
    renderBulkContacts();
    updateBulkImportProgress(100, `${contacts.length} contatos carregados`, "Concluido com sucesso.");
    setTimeout(() => {
      hideBulkImportProgress();
    }, 450);
  } catch (error) {
    state.bulkContacts = [];
    renderBulkContacts();
    hideBulkImportProgress();
    await showAlert(error.message || "Falha ao ler Excel.");
  }
});

bulkContactsSearchEl.addEventListener("input", () => {
  state.bulkContactsSearch = bulkContactsSearchEl.value || "";
  renderBulkContacts();
});

bulkSelectAllBtnEl.addEventListener("click", () => {
  for (const contact of getFilteredBulkContacts()) {
    contact.selected = true;
  }
  renderBulkContacts();
});

bulkClearAllBtnEl.addEventListener("click", () => {
  for (const contact of getFilteredBulkContacts()) {
    contact.selected = false;
  }
  renderBulkContacts();
});

bulkCreateFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const intervalMinSeconds = Number(bulkIntervalMinEl.value || 0);
  const intervalMaxSeconds = Number(bulkIntervalMaxEl.value || 0);
  const messages = collectBulkMessages();
  const message = messages[0] || "";
  const contacts = state.bulkContacts.filter((item) => item.selected);

  if (!contacts.length) {
    await showAlert("Selecione ao menos 1 contato.");
    return;
  }
  if (intervalMinSeconds < 40) {
    await showAlert("Intervalo menor que 40 segundos tem alto risco de ban. Ajuste para 40s ou mais.");
    return;
  }
  const safeIntervalMax = Math.max(intervalMinSeconds, intervalMaxSeconds);
  if (!message) {
    await showAlert("Digite ao menos 1 mensagem do disparo.");
    return;
  }

  try {
    const result = await api("/bulk-dispatch/jobs", {
      method: "POST",
      body: JSON.stringify({
        contacts,
        interval_min_seconds: intervalMinSeconds,
        interval_max_seconds: safeIntervalMax,
        message,
        messages,
      }),
    });

    await showAlert(`Disparo iniciado com ${result.total} contatos.`);
    switchView("bulk-monitor");
    state.selectedBulkJobId = result.job_id || null;
    await loadBulkJobs();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar disparo.");
  }
});

composerActionBtnEl.addEventListener("click", async () => {
  if (composerActionBtnEl.dataset.locked === "true") {
    await ensureConversationReadyForCompose();
    return;
  }
  const hasText = Boolean(String(messageInputEl.value || "").trim());
  const isRecording = mediaRecorder && mediaRecorder.state === "recording";

  if (isRecording) {
    stopRecording();
    return;
  }

  if (hasText) {
    await sendCurrentText();
    return;
  }

  await startRecording();
});

audioDeleteBtnEl.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
    clearRecordedAudio();
    setComposerMode("text");
    return;
  }
  clearRecordedAudio();
  setComposerMode("text");
});

audioCancelBtnEl.addEventListener("click", () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopRecording();
  }
  clearRecordedAudio();
  setComposerMode("text");
});

audioSendBtnEl.addEventListener("click", async () => {
  if (!recordedAudioBlob) return;
  const blob = recordedAudioBlob;
  clearRecordedAudio();
  setComposerMode("text");
  await sendAudioBlob(blob);
});

audioPreviewBtnEl.addEventListener("click", async () => {
  if (!recordedAudioBlob || !audioReviewPlayerEl.src) {
    return;
  }
  if (audioReviewPlayerEl.paused) {
    try {
      await audioReviewPlayerEl.play();
      audioPreviewBtnEl.innerHTML = PREVIEW_PAUSE_ICON;
    } catch (error) {
      console.error(error);
    }
  } else {
    audioReviewPlayerEl.pause();
    audioPreviewBtnEl.innerHTML = PREVIEW_PLAY_ICON;
  }
});

audioReviewPlayerEl.addEventListener("loadedmetadata", () => {
  const duration = Number.isFinite(audioReviewPlayerEl.duration) ? audioReviewPlayerEl.duration : 0;
  if (composerMode === "review") {
    audioTimerEl.textContent = fmtDuration(duration);
  }
});

audioReviewPlayerEl.addEventListener("ended", () => {
  audioPreviewBtnEl.innerHTML = PREVIEW_PLAY_ICON;
});

sendFormEl.addEventListener("submit", sendCurrentMessage);
connectedProfileEl.addEventListener("click", openProfilePanel);
profileCloseBtnEl.addEventListener("click", closeProfilePanel);
profileOverlayEl.addEventListener("click", closeProfilePanel);
disconnectBtnEl.addEventListener("click", async () => {
  const confirmed = await showConfirm("Desconectar este telefone do app?", "Desconectar", "Sair", "Cancelar");
  if (!confirmed) return;

  try {
    await api("/whatsapp/disconnect", { method: "POST" });
    qrPanelEl.hidden = true;
    stopQrPolling();
    clearQrCode();
    await refreshHealth();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha ao desconectar.");
  }
});
connectBtnEl.addEventListener("click", async () => {
  try {
    await api("/whatsapp/connect", { method: "POST" });
    qrPanelEl.hidden = false;
    qrHintEl.textContent = "Gerando QR code. Depois da leitura, a sincronizacao sera iniciada automaticamente.";
    clearQrCode();
    await pollQrCode();
    startQrPolling();
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar conexao.");
  }
});
syncHistoryBtnEl.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "O app vai remover a conexao atual, gerar um novo QR code e, depois da leitura, sincronizar automaticamente as mensagens pendentes.\n\nSe nao houver sincronizacao pendente, nada sera importado.",
    "Sincronizar historico",
    "Sincronizar",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api("/whatsapp/sync-history", { method: "POST" });
    qrPanelEl.hidden = false;
    qrHintEl.textContent = "Leia o novo QR code. Depois da leitura, a sincronizacao vai iniciar automaticamente.";
    clearQrCode();
    await pollQrCode();
    startQrPolling();
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar sincronizacao.");
  }
});
newChatBtnEl.addEventListener("click", openNewChatModal);
newChatOverlayEl.addEventListener("click", closeNewChatModal);
newChatCancelEl.addEventListener("click", closeNewChatModal);
newChatFormEl.addEventListener("submit", handleNewChatSubmit);
deleteConversationBtnEl.addEventListener("click", deleteContextConversation);
editConversationBtnEl.addEventListener("click", editContextConversation);
transferConversationBtnEl.addEventListener("click", transferContextConversation);
editUserOverlayEl.addEventListener("click", closeEditUserModal);
editUserCancelEl.addEventListener("click", closeEditUserModal);
transferOverlayEl.addEventListener("click", closeTransferModal);
transferCancelEl.addEventListener("click", closeTransferModal);
transferFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const conversationId = String(transferConversationId || "").trim();
  const targetUserId = String(transferUserSelectEl.value || "").trim();
  if (!conversationId || !targetUserId) {
    await showAlert("Selecione um atendente para transferir.");
    return;
  }

  try {
    await api(`/conversations/${conversationId}/transfer`, {
      method: "PATCH",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    closeTransferModal();
    await loadConversations();
    if (state.selectedConversationId === conversationId) {
      state.selectedConversation =
        state.conversations.find((item) => item.id === conversationId) || state.selectedConversation;
      renderHeader();
    }
    await showAlert("Atendimento transferido com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao transferir atendimento.");
  }
});
editUserFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingUserId) return;

  const name = String(editUserNameEl.value || "").trim();
  const username = String(editUserUsernameEl.value || "").trim().toLowerCase();
  const role = String(editUserRoleEl.value || "").trim().toLowerCase();
  const sectorId = String(editUserSectorEl.value || "").trim();
  const password = String(editUserPasswordEl.value || "").trim();

  if (!name || !username || !role || !sectorId) {
    await showAlert("Preencha nome, usuario, cargo e setor.");
    return;
  }
  if (!["administrador", "operador"].includes(role)) {
    await showAlert("Cargo invalido.");
    return;
  }
  if (password && password.length < 6) {
    await showAlert("Senha deve ter pelo menos 6 caracteres.");
    return;
  }

  try {
    await api(`/auth/users/${editingUserId}`, {
      method: "PUT",
      body: JSON.stringify({
        name,
        username,
        role,
        sector_id: sectorId,
        password,
      }),
    });
    closeEditUserModal();
    await loadUsersForSettings();
    await showAlert("Usuario atualizado com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao editar usuario.");
  }
});
document.addEventListener("click", (event) => {
  if (!conversationMenuEl.classList.contains("open")) return;
  if (!conversationMenuEl.contains(event.target)) {
    closeConversationMenu();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeConversationMenu();
    if (!mediaModalOverlayEl.hidden) {
      closeMediaModal();
    }
  }
});

mediaModalCloseBtnEl.addEventListener("click", closeMediaModal);
mediaModalOverlayEl.addEventListener("click", (event) => {
  if (event.target === mediaModalOverlayEl) {
    closeMediaModal();
  }
});

attachBtnEl.addEventListener("click", () => {
  if (attachBtnEl.dataset.locked === "true") {
    ensureConversationReadyForCompose().catch((error) => console.error(error));
    return;
  }
  attachMenuEl.classList.toggle("open");
});

attachPhotoBtnEl.addEventListener("click", () => {
  closeAttachMenu();
  attachPhotoInputEl.click();
});

attachFileBtnEl.addEventListener("click", () => {
  closeAttachMenu();
  attachFileInputEl.click();
});

attachPhotoInputEl.addEventListener("change", async () => {
  const file = attachPhotoInputEl.files?.[0];
  await sendMediaFile(file);
  attachPhotoInputEl.value = "";
});

attachFileInputEl.addEventListener("change", async () => {
  const file = attachFileInputEl.files?.[0];
  await sendMediaFile(file);
  attachFileInputEl.value = "";
});

document.addEventListener("click", (event) => {
  if (!attachMenuEl.classList.contains("open")) return;
  if (attachBtnEl.contains(event.target)) return;
  if (attachMenuEl.contains(event.target)) return;
  closeAttachMenu();
});

async function boot() {
  state.sessionToken = readSessionToken();
  showLoginScreen();
  settingsBtnEl.style.display = "none";
  switchView("chats");
  renderServiceTabs();
  renderBulkContacts();
  renderBulkMessagesBuilder();
  hideBulkImportProgress();
  applyConnectedProfileAvatar();
  const micEl = composerActionBtnEl.querySelector(".icon-mic");
  if (micEl) {
    micEl.innerHTML = MIC_ICON_SVG;
  }
  setComposerMode("text");
  updateComposerAction();
  const loggedIn = await loadCurrentUser();
  if (loggedIn) {
    await loadAgents();
    await refreshHealth();
    await loadConversations();
  }

  if (!healthTimer) {
    healthTimer = setInterval(() => {
      refreshHealth().catch((error) => console.error(error));
    }, 7000);
  }
  if (!bulkMonitorTimer) {
    bulkMonitorTimer = setInterval(() => {
      if (!state.isAuthenticated) return;
      if (state.currentView === "bulk-monitor") {
        loadBulkJobs().catch((error) => console.error(error));
      }
    }, 3000);
  }
}

boot().catch((error) => {
  console.error(error);
});
