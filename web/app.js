const state = {
  conversations: [],
  currentMessages: [],
  selectedConversationId: null,
  selectedConversation: null,
  connectedAccountJid: "",
  connectedAccountPhone: "",
  connectedAccountName: "",
  connectedAccountAvatarUrl: "",
  whatsappAccounts: [],
  selectedWhatsAppAccountId: "",
  search: "",
  serviceTab: "pending",
  showAllChats: false,
  serviceCounts: {
    pending: 0,
    in_progress: 0,
    finalized: 0,
    bulk: 0,
  },
  internalChatContacts: [],
  selectedInternalContact: null,
  selectedInternalThreadId: "",
  internalMessages: [],
  internalChatLoading: false,
  internalUnreadCount: 0,
  loadingConversations: false,
  loadingMessages: false,
  contextConversationId: null,
  currentView: "chats",
  bulkContacts: [],
  bulkContactsSource: "none",
  bulkContactsLoading: false,
  bulkContactsSearch: "",
  bulkContactsPage: 1,
  bulkContactsPageSize: 30,
  bulkJobs: [],
  selectedBulkJobId: null,
  bulkJobDetailsMap: {},
  sectors: [],
  settingsUsers: [],
  settingsAdminUsers: [],
  agents: [],
  companies: [],
  companyBranding: null,
  currentUser: null,
  isAuthenticated: false,
  sessionToken: "",
  settingsTab: "perfil",
  realtimeCheckpointToken: "",
  products: [],
  companyMediaAssets: [],
  productsSearch: "",
  productOrders: [],
  productSchedules: [],
  productsTab: "store-info",
  scheduleWorkingDays: [],
  editingProductId: "",
  scheduleCalendarMonth: "",
  selectedScheduleDate: "",
  agentSettings: null,
  mobileChatPane: "list",
  conversationCache: {},
  currentMessagesHasOlder: false,
  currentMessagesOldestCursor: "",
  currentMessagesConversationId: "",
  loadingOlderMessages: false,
  typingConversations: {},
  expandedScheduleIds: {},
  expandedOrderIds: {},
};
const SESSION_TOKEN_KEY = "nschat_session_token";
const CONVERSATION_CACHE_TTL_MS = 12_000;
const INITIAL_MESSAGES_PAGE_SIZE = 50;
const OLDER_MESSAGES_PAGE_SIZE = 60;
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;

const layoutEl = document.querySelector(".layout");
const chatMainEl = document.querySelector(".chat-main");
const mobileTopbarEl = document.getElementById("mobileTopbar");
const mobileTopbarBackEl = document.getElementById("mobileTopbarBack");
const mobileTopbarBrandEl = document.getElementById("mobileTopbarBrand");
const mobileTopbarBrandLogoEl = document.getElementById("mobileTopbarBrandLogo");
const mobileTopbarTitleEl = document.getElementById("mobileTopbarTitle");
const mobileTopbarSubtitleEl = document.getElementById("mobileTopbarSubtitle");
const mobileBottomNavEl = document.getElementById("mobileBottomNav");
const loginScreenEl = document.getElementById("loginScreen");
const loginFormEl = document.getElementById("loginForm");
const loginUsernameEl = document.getElementById("loginUsername");
const loginPasswordEl = document.getElementById("loginPassword");
const loginErrorEl = document.getElementById("loginError");
const loginSubmitBtnEl = document.getElementById("loginSubmitBtn");
const chatSidebarEl = document.getElementById("chatSidebar");
const sidebarBrandLogoWrapEl = document.getElementById("sidebarBrandLogoWrap");
const sidebarBrandLogoEl = document.getElementById("sidebarBrandLogo");
const sidebarBrandNameEl = document.getElementById("sidebarBrandName");
const sidebarBrandSubtitleEl = document.getElementById("sidebarBrandSubtitle");
const conversationListEl = document.getElementById("conversationList");
const messagesAreaEl = document.getElementById("messagesArea");
const chatHeaderEl = document.getElementById("chatHeader");
const chatTypingDockEl = document.getElementById("chatTypingDock");
const searchInputEl = document.getElementById("searchInput");
const allChatsBtnEl = document.getElementById("allChatsBtn");
const sendFormEl = document.getElementById("sendForm");
const textComposerEl = document.getElementById("textComposer");
const audioComposerEl = document.getElementById("audioComposer");
const attachBtnEl = document.getElementById("attachBtn");
const attachMenuEl = document.getElementById("attachMenu");
const attachPhotoBtnEl = document.getElementById("attachPhotoBtn");
const attachFileBtnEl = document.getElementById("attachFileBtn");
const attachLibraryBtnEl = document.getElementById("attachLibraryBtn");
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
const finalizeConversationMenuBtnEl = document.getElementById("finalizeConversationMenuBtn");
const transferConversationBtnEl = document.getElementById("transferConversationBtn");
const conversationAIAgentToggleEl = document.getElementById("conversationAIAgentToggle");
const transferOverlayEl = document.getElementById("transferOverlay");
const transferModalEl = document.getElementById("transferModal");
const transferFormEl = document.getElementById("transferForm");
const transferUserSelectEl = document.getElementById("transferUserSelect");
const transferCancelEl = document.getElementById("transferCancel");
const accountSwitchOverlayEl = document.getElementById("accountSwitchOverlay");
const accountSwitchModalEl = document.getElementById("accountSwitchModal");
const accountSwitchTitleEl = document.getElementById("accountSwitchTitle");
const accountSwitchListEl = document.getElementById("accountSwitchList");
const accountSwitchCloseEl = document.getElementById("accountSwitchClose");
const orderConfirmOverlayEl = document.getElementById("orderConfirmOverlay");
const orderConfirmModalEl = document.getElementById("orderConfirmModal");
const orderConfirmFormEl = document.getElementById("orderConfirmForm");
const orderConfirmReadyTimeEl = document.getElementById("orderConfirmReadyTime");
const orderConfirmNoteEl = document.getElementById("orderConfirmNote");
const orderConfirmCancelEl = document.getElementById("orderConfirmCancel");
const conversationItemTpl = document.getElementById("conversationItemTpl");
const railChatsEl = document.getElementById("railChats");
const railInternalChatEl = document.getElementById("railInternalChat");
const railBulkCreateEl = document.getElementById("railBulkCreate");
const railBulkMonitorEl = document.getElementById("railBulkMonitor");
const railAgentEl = document.getElementById("railAgent");
const railProductsEl = document.getElementById("railProducts");
const settingsBtnEl = document.getElementById("settingsBtn");
const mobileNavChatsEl = document.getElementById("mobileNavChats");
const mobileNavBulkCreateEl = document.getElementById("mobileNavBulkCreate");
const mobileNavBulkMonitorEl = document.getElementById("mobileNavBulkMonitor");
const mobileNavAgentEl = document.getElementById("mobileNavAgent");
const mobileNavProductsEl = document.getElementById("mobileNavProducts");
const mobileNavSettingsEl = document.getElementById("mobileNavSettings");
const chatViewEl = document.getElementById("chatView");
const internalChatViewEl = document.getElementById("internalChatView");
const internalChatContactsListEl = document.getElementById("internalChatContactsList");
const internalChatRefreshBtnEl = document.getElementById("internalChatRefreshBtn");
const internalChatRoomHeaderEl = document.getElementById("internalChatRoomHeader");
const internalMessagesAreaEl = document.getElementById("internalMessagesArea");
const internalChatFormEl = document.getElementById("internalChatForm");
const internalMessageInputEl = document.getElementById("internalMessageInput");
const internalAudioBtnEl = document.getElementById("internalAudioBtn");
const internalSendBtnEl = document.getElementById("internalSendBtn");
const bulkCreateViewEl = document.getElementById("bulkCreateView");
const bulkMonitorViewEl = document.getElementById("bulkMonitorView");
const agentViewEl = document.getElementById("agentView");
const productsViewEl = document.getElementById("productsView");
const settingsViewEl = document.getElementById("settingsView");
const bulkCreateFormEl = document.getElementById("bulkCreateForm");
const bulkFileEl = document.getElementById("bulkFile");
const bulkIntervalMinEl = document.getElementById("bulkIntervalMin");
const bulkIntervalMaxEl = document.getElementById("bulkIntervalMax");
const bulkMessagesContainerEl = document.getElementById("bulkMessagesContainer");
const bulkAddMessageBtnEl = document.getElementById("bulkAddMessageBtn");
const bulkContactsCountEl = document.getElementById("bulkContactsCount");
const bulkEnableAiAgentEl = document.getElementById("bulkEnableAiAgent");
const bulkEnableAiAgentBtnEl = document.getElementById("bulkEnableAiAgentBtn");
const bulkEnableAiAgentStateEl = document.getElementById("bulkEnableAiAgentState");
const bulkLoadOpenChatsBtnEl = document.getElementById("bulkLoadOpenChatsBtn");
const bulkContactsPanelEl = document.getElementById("bulkContactsPanel");
const bulkContactsSearchEl = document.getElementById("bulkContactsSearch");
const bulkSelectAllBtnEl = document.getElementById("bulkSelectAllBtn");
const bulkClearAllBtnEl = document.getElementById("bulkClearAllBtn");
const bulkContactsListEl = document.getElementById("bulkContactsList");
const bulkContactsPaginationEl = document.getElementById("bulkContactsPagination");
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
const settingsTabCompaniesEl = document.getElementById("settingsTabCompanies");
const settingsTabAdminUsersEl = document.getElementById("settingsTabAdminUsers");
const settingsTabAccountsEl = document.getElementById("settingsTabAccounts");
const settingsPanelPerfilEl = document.getElementById("settingsPanelPerfil");
const settingsPanelCreateEl = document.getElementById("settingsPanelCreate");
const settingsPanelListEl = document.getElementById("settingsPanelList");
const settingsPanelSectorsEl = document.getElementById("settingsPanelSectors");
const settingsPanelCompaniesEl = document.getElementById("settingsPanelCompanies");
const settingsPanelAdminUsersEl = document.getElementById("settingsPanelAdminUsers");
const settingsPanelAccountsEl = document.getElementById("settingsPanelAccounts");
const settingsProfileAvatarEl = document.getElementById("settingsProfileAvatar");
const settingsProfileNameEl = document.getElementById("settingsProfileName");
const settingsProfileUsernameEl = document.getElementById("settingsProfileUsername");
const settingsProfileRoleEl = document.getElementById("settingsProfileRole");
const settingsProfileSectorEl = document.getElementById("settingsProfileSector");
const settingsProfileCompanyEl = document.getElementById("settingsProfileCompany");
const settingsSignatureToggleBtnEl = document.getElementById("settingsSignatureToggleBtn");
const settingsSignatureToggleLabelEl = document.getElementById("settingsSignatureToggleLabel");
const settingsAdminActionsEl = document.getElementById("settingsAdminActions");
const settingsFinalizePendingBtnEl = document.getElementById("settingsFinalizePendingBtn");
const settingsSwitchNumberBtnEl = document.getElementById("settingsSwitchNumberBtn");
const settingsAddNumberBtnEl = document.getElementById("settingsAddNumberBtn");
const settingsRemoveNumberBtnEl = document.getElementById("settingsRemoveNumberBtn");
const settingsAccountsTotalEl = document.getElementById("settingsAccountsTotal");
const settingsAccountsConnectedEl = document.getElementById("settingsAccountsConnected");
const settingsAccountsListMetaEl = document.getElementById("settingsAccountsListMeta");
const settingsAccountsListEl = document.getElementById("settingsAccountsList");
const createUserFormEl = document.getElementById("createUserForm");
const newUserNameEl = document.getElementById("newUserName");
const newUserUsernameEl = document.getElementById("newUserUsername");
const newUserPasswordEl = document.getElementById("newUserPassword");
const newUserRoleEl = document.getElementById("newUserRole");
const newUserSectorEl = document.getElementById("newUserSector");
const createSectorFormEl = document.getElementById("createSectorForm");
const newSectorNameEl = document.getElementById("newSectorName");
const settingsSectorsListEl = document.getElementById("settingsSectorsList");
const createCompanyFormEl = document.getElementById("createCompanyForm");
const companyCreateNameEl = document.getElementById("companyCreateName");
const companyCreateCnpjEl = document.getElementById("companyCreateCnpj");
const companyAdminNameEl = document.getElementById("companyAdminName");
const companyAdminUsernameEl = document.getElementById("companyAdminUsername");
const companyAdminPasswordEl = document.getElementById("companyAdminPassword");
const settingsCompaniesListEl = document.getElementById("settingsCompaniesList");
const settingsAdminUsersListEl = document.getElementById("settingsAdminUsersList");
const settingsLogoutBtnEl = document.getElementById("settingsLogoutBtn");
const agentStatusBadgeEl = document.getElementById("agentStatusBadge");
const agentConfiguredEl = document.getElementById("agentConfigured");
const agentModelEl = document.getElementById("agentModel");
const agentLastTestEl = document.getElementById("agentLastTest");
const agentTestBtnEl = document.getElementById("agentTestBtn");
const agentTestResultEl = document.getElementById("agentTestResult");
const agentSettingsFormEl = document.getElementById("agentSettingsForm");
const agentMoodInputEl = document.getElementById("agentMoodInput");
const agentNameInputEl = document.getElementById("agentNameInput");
const companyNameInputEl = document.getElementById("companyNameInput");
const agentGuidelinesInputEl = document.getElementById("agentGuidelinesInput");
const agentGuidelinesAddBtnEl = document.getElementById("agentGuidelinesAddBtn");
const agentGuidelinesListEl = document.getElementById("agentGuidelinesList");
const agentDefaultNewChatsEnabledEl = document.getElementById("agentDefaultNewChatsEnabled");
const agentDefaultNewChatsBtnEl = document.getElementById("agentDefaultNewChatsBtn");
const agentDefaultNewChatsStateEl = document.getElementById("agentDefaultNewChatsState");
const agentSettingsSaveBtnEl = document.getElementById("agentSettingsSaveBtn");
const productsFormEl = document.getElementById("productsForm");
const productIdEl = document.getElementById("productId");
const productActiveEl = document.getElementById("productActive");
const productNameEl = document.getElementById("productName");
const productGroupEl = document.getElementById("productGroup");
const productGroupOptionsEl = document.getElementById("productGroupOptions");
const productGroupSuggestionsEl = document.getElementById("productGroupSuggestions");
const productTypeEl = document.getElementById("productType");
const productPriceEl = document.getElementById("productPrice");
const productDiscountEnabledEl = document.getElementById("productDiscountEnabled");
const productDiscountPriceFieldEl = document.getElementById("productDiscountPriceField");
const productDiscountPriceEl = document.getElementById("productDiscountPrice");
const productStockEl = document.getElementById("productStock");
const productStockFieldEl = document.getElementById("productStockField");
const productScheduleToggleFieldEl = document.getElementById("productScheduleToggleField");
const productScheduleEnabledEl = document.getElementById("productScheduleEnabled");
const productScheduleDurationFieldEl = document.getElementById("productScheduleDurationField");
const productServiceDurationEl = document.getElementById("productServiceDuration");
const productDescriptionEl = document.getElementById("productDescription");
const productImageEl = document.getElementById("productImage");
const productImageSelectBtnEl = document.getElementById("productImageSelectBtn");
const productSubmitBtnEl = document.getElementById("productSubmitBtn");
const productCancelEditBtnEl = document.getElementById("productCancelEditBtn");
const productFormHeadingEl = document.getElementById("productFormHeading");
const productFormDescriptionEl = document.getElementById("productFormDescription");
const productPreviewImageEl = document.getElementById("productPreviewImage");
const productPreviewPlaceholderEl = document.getElementById("productPreviewPlaceholder");
const productPreviewNameEl = document.getElementById("productPreviewName");
const productPreviewPriceEl = document.getElementById("productPreviewPrice");
const productPreviewDiscountEl = document.getElementById("productPreviewDiscount");
const productPreviewStockEl = document.getElementById("productPreviewStock");
const productsListEl = document.getElementById("productsList");
const productsSearchInputEl = document.getElementById("productsSearchInput");
const productsSearchClearBtnEl = document.getElementById("productsSearchClearBtn");
const productsSearchMetaEl = document.getElementById("productsSearchMeta");
const ordersListEl = document.getElementById("ordersList");
const storeInfoFormEl = document.getElementById("storeInfoForm");
const storeNameInputEl = document.getElementById("storeNameInput");
const storeCnpjInputEl = document.getElementById("storeCnpjInput");
const storeAddressCityInputEl = document.getElementById("storeAddressCityInput");
const storeAddressStreetInputEl = document.getElementById("storeAddressStreetInput");
const storeAddressNumberInputEl = document.getElementById("storeAddressNumberInput");
const storeAddressNeighborhoodInputEl = document.getElementById("storeAddressNeighborhoodInput");
const storeAddressComplementInputEl = document.getElementById("storeAddressComplementInput");
const storeDescriptionInputEl = document.getElementById("storeDescriptionInput");
const companyLogoInputEl = document.getElementById("companyLogoInput");
const companyLogoSelectBtnEl = document.getElementById("companyLogoSelectBtn");
const companyLogoClearBtnEl = document.getElementById("companyLogoClearBtn");
const companyLogoPreviewEl = document.getElementById("companyLogoPreview");
const companyLogoPreviewImageEl = document.getElementById("companyLogoPreviewImage");
const companyLogoPreviewEmptyEl = document.getElementById("companyLogoPreviewEmpty");
const companyPaletteListEl = document.getElementById("companyPaletteList");
const storePaymentMethodsListEl = document.getElementById("storePaymentMethodsList");
const storeAddPaymentMethodBtnEl = document.getElementById("storeAddPaymentMethodBtn");
const storeDeliveryFeesListEl = document.getElementById("storeDeliveryFeesList");
const storeAddDeliveryFeeBtnEl = document.getElementById("storeAddDeliveryFeeBtn");
const storeInfoSaveBtnEl = document.getElementById("storeInfoSaveBtn");
const productsTabStoreInfoEl = document.getElementById("productsTabStoreInfo");
const productsTabMediaEl = document.getElementById("productsTabMedia");
const productsTabCreateEl = document.getElementById("productsTabCreate");
const productsTabListEl = document.getElementById("productsTabList");
const productsTabOrdersEl = document.getElementById("productsTabOrders");
const productsTabSchedulesEl = document.getElementById("productsTabSchedules");
const productsTabScheduleSettingsEl = document.getElementById("productsTabScheduleSettings");
const productsPanelStoreInfoEl = document.getElementById("productsPanelStoreInfo");
const productsPanelMediaEl = document.getElementById("productsPanelMedia");
const productsPanelCreateEl = document.getElementById("productsPanelCreate");
const productsPanelListEl = document.getElementById("productsPanelList");
const productsPanelOrdersEl = document.getElementById("productsPanelOrders");
const productsPanelSchedulesEl = document.getElementById("productsPanelSchedules");
const productsPanelScheduleSettingsEl = document.getElementById("productsPanelScheduleSettings");
const companyMediaFormEl = document.getElementById("companyMediaForm");
const companyMediaEditIdEl = document.getElementById("companyMediaEditId");
const companyMediaTitleEl = document.getElementById("companyMediaTitle");
const companyMediaFileEl = document.getElementById("companyMediaFile");
const companyMediaFileNameEl = document.getElementById("companyMediaFileName");
const companyMediaDescriptionEl = document.getElementById("companyMediaDescription");
const companyMediaUploadPreviewEl = document.getElementById("companyMediaUploadPreview");
const companyMediaSubmitBtnEl = document.getElementById("companyMediaSubmitBtn");
const companyMediaCancelEditBtnEl = document.getElementById("companyMediaCancelEditBtn");
const companyMediaMetaEl = document.getElementById("companyMediaMeta");
const companyMediaListEl = document.getElementById("companyMediaList");
const schedulePrevMonthBtnEl = document.getElementById("schedulePrevMonthBtn");
const scheduleNextMonthBtnEl = document.getElementById("scheduleNextMonthBtn");
const scheduleCurrentMonthLabelEl = document.getElementById("scheduleCurrentMonthLabel");
const scheduleCalendarGridEl = document.getElementById("scheduleCalendarGrid");
const scheduleSelectedDayLabelEl = document.getElementById("scheduleSelectedDayLabel");
const scheduleSelectedDayMetaEl = document.getElementById("scheduleSelectedDayMeta");
const schedulesListEl = document.getElementById("schedulesList");
const scheduleSettingsFormEl = document.getElementById("scheduleSettingsForm");
const scheduleWorkingDaysListEl = document.getElementById("scheduleWorkingDaysList");
const scheduleIntervalMinutesInputEl = document.getElementById("scheduleIntervalMinutesInput");
const scheduleReminderEnabledInputEl = document.getElementById("scheduleReminderEnabledInput");
const scheduleReminderMinutesFieldEl = document.getElementById("scheduleReminderMinutesField");
const scheduleReminderRulesListEl = document.getElementById("scheduleReminderRulesList");
const scheduleReminderAddBtnEl = document.getElementById("scheduleReminderAddBtn");
const scheduleSettingsSaveBtnEl = document.getElementById("scheduleSettingsSaveBtn");
const ALLOWED_PRODUCT_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
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
const conversationTypingTimers = new Map();
let qrPollTimer = null;
let lastQrText = "";
let composerMode = "text";
let recordedAudioBlob = null;
let recordedAudioUrl = "";
let healthTimer = null;
let bulkMonitorTimer = null;
let internalChatTimer = null;
let internalAudioRecorder = null;
let internalAudioStream = null;
let internalAudioChunks = [];
let editingUserId = "";
let transferConversationId = "";
let accountSwitchMode = "select";
let bulkMessagesDraft = [];
let bulkAudioRecorder = null;
let bulkAudioStream = null;
let bulkAudioChunks = [];
let bulkAudioRecordingTarget = null;
let pendingConversationRefresh = false;
let pendingMessagesRefresh = false;
let conversationRefreshTimer = null;
let messageRefreshTimer = null;
const PLAYER_PLAY_ICON = '<i class="bi bi-play-fill"></i>';
const PLAYER_PAUSE_ICON = '<i class="bi bi-pause-fill"></i>';
const PREVIEW_PLAY_ICON = '<i class="bi bi-play-fill"></i>';
const PREVIEW_PAUSE_ICON = '<i class="bi bi-pause-fill"></i>';
const SEARCH_DEBOUNCE_MS = 260;
const SUMMARY_CACHE_TTL_MS = 3_500;
const MIC_ICON_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-1 5.93V17.9a5 5 0 0 1-4-4.9H5a7 7 0 0 0 6 6.93ZM13 19.93A7 7 0 0 0 19 13h-2a5 5 0 0 1-4 4.9v2.03ZM11 22h2v-2h-2v2Z"/></svg>';
let searchDebounceTimer = null;
let conversationSummaryPromise = null;
let conversationSummaryCacheKey = "";
let conversationSummaryCacheAt = 0;
const conversationNodeCache = new Map();
const SCHEDULE_REMINDER_UNIT_OPTIONS = [
  { value: "minutes", label: "Minutos" },
  { value: "hours", label: "Horas" },
  { value: "days", label: "Dias" },
];

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
    year: "2-digit",
  });
}

function formatCompactBrDate(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1].slice(-2)}`;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
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

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

function parseCompactBrDateToIso(value) {
  const raw = String(value || "").trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return raw;
  }
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!brMatch) return raw;
  const day = Number(brMatch[1]);
  const month = Number(brMatch[2]);
  let year = Number(brMatch[3]);
  if (String(brMatch[3]).length === 2) {
    year += 2000;
  }
  if (!day || !month || !year) return raw;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function getSelectedWhatsAppAccount() {
  return state.whatsappAccounts.find((item) => item.id === state.selectedWhatsAppAccountId) || null;
}

function isPendingWhatsAppAccount(account) {
  return String(account?.wa_jid || "").startsWith("pending:");
}

function getProfileWhatsAppAccount() {
  return getSelectedWhatsAppAccount();
}

function formatWhatsAppAccountTitle(account) {
  if (!account) return "Nenhum número selecionado";
  if (isPendingWhatsAppAccount(account)) {
    return String(account.display_name || "").trim() || "Novo número";
  }
  const name = String(account.display_name || "").trim();
  const phone = formatPhone(account.phone || "");
  if (name && phone) return `${name} - ${phone}`;
  return name || phone || "Novo número";
}

function formatWhatsAppAccountMeta(account) {
  if (!account) return "";
  if (isPendingWhatsAppAccount(account)) {
    return "Número ainda não vinculado. Clique em Conectar para ler o QR code.";
  }
  return String(account.wa_jid || "").trim();
}

function formatWhatsAppConnectionStatus(account) {
  if (!account) return "Indisponível";
  if (isPendingWhatsAppAccount(account)) return "Aguardando conexão";
  return account.connected ? "Conectado" : "Desconectado";
}

function renderSettingsAccountsPanel() {
  if (!settingsAccountsListEl) return;
  const items = Array.isArray(state.whatsappAccounts) ? state.whatsappAccounts : [];
  const connectedItems = items.filter((item) => Boolean(item?.connected));

  if (settingsAccountsTotalEl) settingsAccountsTotalEl.textContent = String(items.length);
  if (settingsAccountsConnectedEl) settingsAccountsConnectedEl.textContent = String(connectedItems.length);

  if (settingsAccountsListMetaEl) {
    settingsAccountsListMetaEl.textContent = items.length
      ? `${connectedItems.length} conectado(s) de ${items.length} número(s)`
      : "Nenhum número vinculado";
  }

  settingsAccountsListEl.innerHTML = "";

  if (!items.length) {
    settingsAccountsListEl.innerHTML = '<div class="empty-state">Nenhum número vinculado à empresa ainda.</div>';
    return;
  }

  for (const account of items) {
    const card = document.createElement("div");
    const isSelected = account.id === state.selectedWhatsAppAccountId;
    const isConnected = Boolean(account.connected);
    const accountTitle = escapeHtml(formatWhatsAppAccountTitle(account));
    const phone = escapeHtml(formatPhone(account.phone || "") || "Número não identificado");
    const meta = escapeHtml(formatWhatsAppAccountMeta(account) || "Sem identificador");
    const status = escapeHtml(formatWhatsAppConnectionStatus(account));
    card.className = `settings-account-card${isSelected ? " is-selected" : ""}${isConnected ? " is-connected" : ""}${
      isPendingWhatsAppAccount(account) ? " is-pending" : ""
    }`;
    card.innerHTML = `
      <div class="settings-account-card-top">
        <div class="settings-account-card-id">
          <span class="settings-account-card-icon"><i class="bi bi-phone"></i></span>
          <div class="settings-account-card-copy">
            <strong>${accountTitle}</strong>
            <span>${phone}</span>
          </div>
        </div>
        <div class="settings-account-card-badges">
          <span class="settings-account-chip ${isConnected ? "is-online" : isPendingWhatsAppAccount(account) ? "is-pending" : "is-offline"}">${status}</span>
          ${isSelected ? '<span class="settings-account-chip is-selected">Ativo no painel</span>' : ""}
        </div>
      </div>
      <div class="settings-account-card-meta">
        <span><i class="bi bi-hash"></i> ${meta}</span>
      </div>
    `;
    settingsAccountsListEl.appendChild(card);
  }
}

function getActiveAccountJid() {
  const selected = getSelectedWhatsAppAccount();
  if (selected?.wa_jid) {
    return String(selected.wa_jid).trim();
  }
  return "";
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
  return digits.startsWith("55") ? digits : `55${digits}`;
}

function getConversationPhone(conv) {
  if (!conv) return "";
  const waJid = String(conv.wa_jid || "").trim();
  if (waJid.endsWith("@s.whatsapp.net")) {
    const digits = waJid.replace(/@s\.whatsapp\.net$/i, "").replace(/\D/g, "");
    if (digits) return digits;
  }
  return String(conv.phone || "").replace(/\D/g, "");
}

function conversationDisplayName(conv) {
  if (conv.display_name && conv.display_name.trim()) {
    return conv.display_name.trim();
  }

  if (String(conv.wa_jid || "").endsWith("@lid")) {
    return "Contato WhatsApp";
  }

  return getConversationPhone(conv) || "Contato";
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
  return ["administrador", "ceo"].includes(String(state.currentUser?.role || ""));
}

function isAdmin() {
  return canManageWhatsAppSession();
}

function isCEO() {
  return String(state.currentUser?.role || "") === "ceo";
}

function renderRoleOptions(selectEl, selectedRole = "operador") {
  if (!selectEl) return;
  const current = String(selectedRole || "operador").trim().toLowerCase();
  const options = [
    { value: "operador", label: "operador" },
    { value: "administrador", label: "administrador" },
  ];
  if (isCEO()) {
    options.push({ value: "ceo", label: "ceo" });
  }
  selectEl.innerHTML = options
    .map((item) => `<option value="${item.value}">${item.label}</option>`)
    .join("");
  selectEl.value = options.some((item) => item.value === current) ? current : "operador";
}

function syncProfilePanel() {
  const selectedAccount = getProfileWhatsAppAccount();
  const name = selectedAccount ? formatWhatsAppAccountTitle(selectedAccount) : state.connectedAccountName || "-";
  const phone = selectedAccount
    ? isPendingWhatsAppAccount(selectedAccount)
      ? "-"
      : formatPhone(selectedAccount.phone || "") || "-"
    : formatPhone(state.connectedAccountPhone) || "-";
  const jid = selectedAccount ? formatWhatsAppAccountMeta(selectedAccount) || "-" : state.connectedAccountJid || "-";
  const isOnline = selectedAccount ? Boolean(selectedAccount.connected) : waStatusEl.classList.contains("online");
  const canManageSession = canManageWhatsAppSession();

  profileAvatarEl.textContent = profileLabel(selectedAccount?.display_name || state.connectedAccountName, selectedAccount?.phone || state.connectedAccountPhone);
  profileNameEl.textContent = name;
  profileStatusEl.textContent = selectedAccount && isPendingWhatsAppAccount(selectedAccount) ? "Aguardando conexão" : isOnline ? "Conectado" : "Desconectado";
  profilePhoneEl.textContent = phone;
  profileJidEl.textContent = jid;
  disconnectBtnEl.hidden = !isOnline || !canManageSession;
  syncHistoryBtnEl.hidden = !isOnline || !canManageSession;
  connectBtnEl.hidden = isOnline || !selectedAccount;
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
    "Para puxar histórico antigo, desconecte este dispositivo no WhatsApp do celular e conecte novamente no app.";
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
    qrHintEl.textContent = "Gerador de QR indisponível.";
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
  const aiInCharge = isAiInChargeConversation(conv);
  const canTransfer =
    Boolean(state.currentUser) &&
    (isAdmin() || isMine || aiInCharge || status === "pending" || status === "finalized");
  transferConversationBtnEl.style.display = canTransfer ? "" : "none";
  finalizeConversationMenuBtnEl.style.display = isMine ? "" : "none";
  conversationAIAgentToggleEl.checked = Boolean(conv?.ai_agent_enabled);
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
  railInternalChatEl?.classList.toggle("active", view === "internal-chat");
  railBulkCreateEl.classList.toggle("active", view === "bulk-create");
  railBulkMonitorEl.classList.toggle("active", view === "bulk-monitor");
  railAgentEl.classList.toggle("active", view === "agent");
  railProductsEl.classList.toggle("active", view === "products");
  settingsBtnEl.classList.toggle("active", view === "settings");
  mobileNavChatsEl?.classList.toggle("active", view === "chats");
  mobileNavBulkCreateEl?.classList.toggle("active", view === "bulk-create");
  mobileNavBulkMonitorEl?.classList.toggle("active", view === "bulk-monitor");
  mobileNavAgentEl?.classList.toggle("active", view === "agent");
  mobileNavProductsEl?.classList.toggle("active", view === "products");
  mobileNavSettingsEl?.classList.toggle("active", view === "settings");
}

function isMobileViewport() {
  return window.innerWidth <= 980;
}

function getMobileTopbarCopy() {
  if (state.currentView === "internal-chat") {
    return { title: "Chat interno", subtitle: "Atendentes da empresa" };
  }
  if (state.currentView === "bulk-create") {
    return { title: "Disparo em massa", subtitle: "Criar campanha" };
  }
  if (state.currentView === "bulk-monitor") {
    return { title: "Monitorar envios", subtitle: "Acompanhar campanhas" };
  }
  if (state.currentView === "agent") {
    return { title: "Agente IA", subtitle: "Configuração e status" };
  }
  if (state.currentView === "products") {
      const subtitleMap = {
        "store-info": "Loja",
        media: "Mídias",
        create: "Cadastro",
        list: "Produtos",
      orders: "Pedidos",
      schedules: "Agendamento",
      "schedule-settings": "Configuração",
    };
    return { title: "Loja", subtitle: subtitleMap[state.productsTab] || "Catálogo" };
  }
  if (state.currentView === "settings") {
    return { title: "Configurações", subtitle: "Ajustes do sistema" };
  }
  if (state.mobileChatPane === "conversation" && state.selectedConversation) {
    return {
      title: "Conversa",
      subtitle: formatPhone(getConversationPhone(state.selectedConversation)) || "Voltar para os chats",
    };
  }
  return { title: getCompanyDisplayName(), subtitle: "Conversas" };
}

function renderMobileChrome() {
  const isMobile = isMobileViewport() && state.isAuthenticated;
  if (mobileTopbarEl) {
    mobileTopbarEl.hidden = !isMobile;
  }
  if (mobileBottomNavEl) {
    mobileBottomNavEl.hidden = !isMobile;
  }
  layoutEl.classList.remove("mobile-hide-topbar");
  if (!isMobile) return;

  const copy = getMobileTopbarCopy();
  if (mobileTopbarTitleEl) {
    mobileTopbarTitleEl.textContent = copy.title;
  }
  if (mobileTopbarSubtitleEl) {
    mobileTopbarSubtitleEl.textContent = copy.subtitle;
  }
  if (mobileTopbarBackEl) {
    mobileTopbarBackEl.hidden = !(state.currentView === "chats" && state.mobileChatPane === "conversation");
  }
}

function applyResponsiveLayoutState() {
  const isMobile = isMobileViewport();
  layoutEl.classList.toggle("mobile-mode", isMobile);

  if (!isMobile) {
    layoutEl.classList.remove("mobile-view-chats", "mobile-view-nonchat", "mobile-pane-list", "mobile-pane-conversation");
    const showSidebar = state.currentView === "chats";
    chatSidebarEl.style.display = showSidebar ? "" : "none";
    layoutEl.classList.toggle("no-sidebar", !showSidebar);
    chatMainEl.classList.toggle("global-scroll", state.currentView !== "chats");
    renderMobileChrome();
    return;
  }

  layoutEl.classList.toggle("mobile-view-chats", state.currentView === "chats");
  layoutEl.classList.toggle("mobile-view-nonchat", state.currentView !== "chats");
  layoutEl.classList.toggle("mobile-pane-list", state.currentView === "chats" && state.mobileChatPane === "list");
  layoutEl.classList.toggle("mobile-pane-conversation", state.currentView === "chats" && state.mobileChatPane === "conversation");
  chatSidebarEl.style.display = "";
  layoutEl.classList.remove("no-sidebar");
  chatMainEl.classList.toggle("global-scroll", state.currentView !== "chats");
  renderMobileChrome();
}

function switchView(view) {
  if (!state.isAuthenticated) return;
  state.currentView = view;
  if (view === "chats" && isMobileViewport()) {
    state.mobileChatPane = "list";
  }
  setRailActive(view);

  chatViewEl.classList.toggle("active", view === "chats");
  internalChatViewEl?.classList.toggle("active", view === "internal-chat");
  bulkCreateViewEl.classList.toggle("active", view === "bulk-create");
  bulkMonitorViewEl.classList.toggle("active", view === "bulk-monitor");
  agentViewEl.classList.toggle("active", view === "agent");
  productsViewEl.classList.toggle("active", view === "products");
  settingsViewEl.classList.toggle("active", view === "settings");

  applyResponsiveLayoutState();

  if (view === "bulk-monitor") {
    // Always open monitor focused on the latest dispatch.
    state.selectedBulkJobId = null;
    loadBulkJobs().catch((error) => console.error(error));
  } else if (view === "internal-chat") {
    loadInternalChatContacts({ showLoading: state.internalChatContacts.length === 0 }).catch((error) => console.error(error));
    loadInternalUnreadSummary().catch((error) => console.error(error));
  } else if (view === "agent") {
    loadAgentStatus().catch((error) => console.error(error));
    } else if (view === "products") {
      setProductsTab(state.productsTab || "store-info");
      loadAgentStatus().catch((error) => console.error(error));
      loadProducts().catch((error) => console.error(error));
      loadCompanyMediaAssets().catch((error) => console.error(error));
      loadAiOrders().catch((error) => console.error(error));
      loadAiSchedules().catch((error) => console.error(error));
  } else if (view === "settings") {
    renderSettingsHeader();
    setSettingsTab(state.settingsTab || "perfil");
    loadUsersForSettings().catch((error) => console.error(error));
  }
}

function renderAgentStatus(data = null) {
  const configured = Boolean(data?.configured);
  const model = String(data?.model || "-").trim() || "-";
  agentConfiguredEl.textContent = configured ? "Configurado" : "Não configurado";
  agentModelEl.textContent = model;
  if (data && typeof data.productsCount !== "undefined") {
    agentTestResultEl.textContent = `Catálogo disponível para o agente: ${Number(data.productsCount || 0)} produto(s).`;
  }
  agentStatusBadgeEl.textContent = configured ? "Pronto" : "Não configurado";
  agentStatusBadgeEl.className = `service-status-tag ${configured ? "in_progress" : "finalized"}`;
}

function renderAgentSettings() {
  const settings = state.agentSettings || {};
  agentMoodInputEl.value = String(settings.mood || "informal");
  agentNameInputEl.value = String(settings.agent_name || "");
  companyNameInputEl.value = String(settings.company_name || "");
  if (agentDefaultNewChatsEnabledEl) {
    agentDefaultNewChatsEnabledEl.checked = Boolean(settings.default_new_chats_ai_enabled);
  }
  renderAgentDefaultNewChatsToggle();
  if (agentGuidelinesInputEl) {
    agentGuidelinesInputEl.value = "";
  }
  renderAgentGuidelinesList(Array.isArray(settings.agent_guidelines) ? settings.agent_guidelines : []);
  if (storeNameInputEl) storeNameInputEl.value = String(settings.store_name || "");
  if (storeCnpjInputEl) storeCnpjInputEl.value = String(settings.store_cnpj || "");
  const parsedStoreAddress = parseStoreAddressParts(String(settings.store_address || ""));
  if (storeAddressCityInputEl) storeAddressCityInputEl.value = parsedStoreAddress.city;
  if (storeAddressStreetInputEl) storeAddressStreetInputEl.value = parsedStoreAddress.street;
  if (storeAddressNumberInputEl) storeAddressNumberInputEl.value = parsedStoreAddress.number;
  if (storeAddressNeighborhoodInputEl) storeAddressNeighborhoodInputEl.value = parsedStoreAddress.neighborhood;
  if (storeAddressComplementInputEl) storeAddressComplementInputEl.value = parsedStoreAddress.complement;
  if (storeDescriptionInputEl) storeDescriptionInputEl.value = String(settings.store_description || "");
  renderStorePaymentMethods(Array.isArray(settings.store_payment_methods) ? settings.store_payment_methods : []);
  renderStoreDeliveryFees(Array.isArray(settings.store_delivery_fees) ? settings.store_delivery_fees : []);
  state.scheduleWorkingDays = normalizeScheduleWorkingDays(Array.isArray(settings.schedule_working_days) ? settings.schedule_working_days : []);
  renderScheduleWorkingDays();
  if (scheduleIntervalMinutesInputEl) {
    scheduleIntervalMinutesInputEl.value = Number.isFinite(Number(settings.schedule_interval_minutes))
      ? String(Math.max(0, Math.round(Number(settings.schedule_interval_minutes))))
      : "";
  }
  const reminderRules = normalizeScheduleReminderRules(
    Array.isArray(settings.schedule_reminder_rules)
      ? settings.schedule_reminder_rules
      : Boolean(settings.schedule_reminder_enabled) && Number.isFinite(Number(settings.schedule_reminder_minutes))
        ? [{ value: Math.max(1, Math.round(Number(settings.schedule_reminder_minutes))), unit: "minutes" }]
        : [],
  );
  if (scheduleReminderEnabledInputEl) {
    scheduleReminderEnabledInputEl.checked = Boolean(settings.schedule_reminder_enabled) || reminderRules.length > 0;
  }
  renderScheduleReminderRules(reminderRules);
  updateScheduleReminderState();
  renderAppBranding();
  renderCompanyBranding();
}

function renderAgentDefaultNewChatsToggle() {
  if (!agentDefaultNewChatsBtnEl || !agentDefaultNewChatsEnabledEl) return;
  const enabled = Boolean(agentDefaultNewChatsEnabledEl.checked);
  agentDefaultNewChatsBtnEl.classList.toggle("is-enabled", enabled);
  agentDefaultNewChatsBtnEl.setAttribute("aria-pressed", enabled ? "true" : "false");
  if (agentDefaultNewChatsStateEl) {
    agentDefaultNewChatsStateEl.textContent = enabled ? "Ligado" : "Desligado";
  }
}

function normalizeAgentGuidelineLine(value) {
  return String(value || "").replace(/^\s*[-*•]\s*/, "").replace(/\s+/g, " ").trim();
}

function renderAgentGuidelinesList(guidelines = []) {
  if (!agentGuidelinesListEl) return;
  const normalized = Array.isArray(guidelines) ? guidelines.map((item) => normalizeAgentGuidelineLine(item)).filter(Boolean) : [];
  agentGuidelinesListEl.innerHTML = "";

  if (!normalized.length) {
    const empty = document.createElement("div");
    empty.className = "agent-guidelines-empty";
    empty.textContent = "Nenhuma diretriz adicionada ainda.";
    agentGuidelinesListEl.appendChild(empty);
    return;
  }

  normalized.forEach((guideline, index) => {
    const item = document.createElement("div");
    item.className = "agent-guideline-item";

    const text = document.createElement("div");
    text.className = "agent-guideline-text";
    text.textContent = guideline;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-secondary agent-guideline-remove-btn";
    removeBtn.setAttribute("aria-label", "Excluir diretriz");
    removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
    removeBtn.addEventListener("click", () => {
      const nextGuidelines = normalized.filter((_, itemIndex) => itemIndex !== index);
      if (!state.agentSettings) state.agentSettings = {};
      state.agentSettings.agent_guidelines = nextGuidelines;
      renderAgentGuidelinesList(nextGuidelines);
    });

    item.appendChild(text);
    item.appendChild(removeBtn);
    agentGuidelinesListEl.appendChild(item);
  });
}

function addAgentGuideline() {
  const nextGuideline = normalizeAgentGuidelineLine(agentGuidelinesInputEl?.value || "");
  if (!nextGuideline) return;
  const current = Array.isArray(state.agentSettings?.agent_guidelines) ? state.agentSettings.agent_guidelines : [];
  if (current.some((item) => normalizeAgentGuidelineLine(item) === nextGuideline)) {
    if (agentGuidelinesInputEl) agentGuidelinesInputEl.value = "";
    return;
  }
  const nextGuidelines = [...current, nextGuideline];
  if (!state.agentSettings) state.agentSettings = {};
  state.agentSettings.agent_guidelines = nextGuidelines;
  if (agentGuidelinesInputEl) {
    agentGuidelinesInputEl.value = "";
    agentGuidelinesInputEl.focus();
  }
  renderAgentGuidelinesList(nextGuidelines);
}

function collectAgentGuidelines() {
  const inputValue = normalizeAgentGuidelineLine(agentGuidelinesInputEl?.value || "");
  const current = Array.isArray(state.agentSettings?.agent_guidelines) ? state.agentSettings.agent_guidelines : [];
  return inputValue ? [...current, inputValue] : [...current];
}

if (agentGuidelinesAddBtnEl) {
  agentGuidelinesAddBtnEl.addEventListener("click", addAgentGuideline);
}

if (agentGuidelinesInputEl) {
  agentGuidelinesInputEl.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      addAgentGuideline();
    }
  });
}

const DEFAULT_COMPANY_THEME = {
  name: "Padrão",
  bg: "#0b141a",
  panel: "#111b21",
  panel_2: "#202c33",
  hover: "#2a3942",
  text: "#e9edef",
  muted: "#8696a0",
  accent: "#00a884",
  bubble_out: "#005c4b",
  bubble_in: "#202c33",
  line: "#2a3942",
};

function normalizeCompanyPalette(palette) {
  if (!palette || typeof palette !== "object") return null;
  const normalized = {
    name: String(palette.name || "Paleta").trim() || "Paleta",
    bg: String(palette.bg || "").trim(),
    panel: String(palette.panel || "").trim(),
    panel_2: String(palette.panel_2 || palette.panel2 || "").trim(),
    hover: String(palette.hover || "").trim(),
    text: String(palette.text || "").trim(),
    muted: String(palette.muted || "").trim(),
    accent: String(palette.accent || "").trim(),
    bubble_out: String(palette.bubble_out || palette.bubbleOut || "").trim(),
    bubble_in: String(palette.bubble_in || palette.bubbleIn || "").trim(),
    line: String(palette.line || "").trim(),
  };
  return Object.values(normalized).every((item) => String(item || "").trim()) ? normalized : null;
}

function normalizeCompanyBranding(branding) {
  const paletteOptions = Array.isArray(branding?.palette_options)
    ? branding.palette_options.map((item) => normalizeCompanyPalette(item)).filter(Boolean)
    : [];
  const rawSelectedIndex = Number(branding?.selected_palette_index);
  const selectedIndex = Number.isInteger(rawSelectedIndex)
    ? rawSelectedIndex === -1
      ? -1
      : Math.max(0, Math.min(rawSelectedIndex, Math.max(0, paletteOptions.length - 1)))
    : 0;
  return {
    company_id: String(branding?.company_id || "").trim() || null,
    logo_data_url: String(branding?.logo_data_url || "").trim() || null,
    palette_options: paletteOptions,
    selected_palette_index: selectedIndex,
    selected_palette:
      normalizeCompanyPalette(branding?.selected_palette) || (selectedIndex >= 0 ? paletteOptions[selectedIndex] || null : null),
  };
}

function getCompanyDisplayName() {
  const brandingName = String(state.agentSettings?.store_name || "").trim();
  const companyName = String(state.currentUser?.company_name || "").trim();
  const agentCompanyName = String(state.agentSettings?.company_name || "").trim();
  return brandingName || companyName || agentCompanyName || "NS Chat";
}

function renderAppBranding() {
  const branding = normalizeCompanyBranding(state.companyBranding || {});
  const logoUrl = String(branding.logo_data_url || "").trim();
  const companyName = getCompanyDisplayName();
  const isDefaultBrand = companyName === "NS Chat" && !logoUrl;

  if (sidebarBrandNameEl) {
    sidebarBrandNameEl.textContent = companyName;
  }
  if (sidebarBrandSubtitleEl) {
    sidebarBrandSubtitleEl.textContent = isDefaultBrand ? "Conversas" : "Painel da empresa";
  }
  if (sidebarBrandLogoWrapEl) {
    sidebarBrandLogoWrapEl.hidden = !logoUrl;
  }
  if (sidebarBrandLogoEl) {
    sidebarBrandLogoEl.hidden = !logoUrl;
    sidebarBrandLogoEl.src = logoUrl || "";
  }

  if (mobileTopbarBrandEl) {
    mobileTopbarBrandEl.hidden = !logoUrl;
  }
  if (mobileTopbarBrandLogoEl) {
    mobileTopbarBrandLogoEl.hidden = !logoUrl;
    mobileTopbarBrandLogoEl.src = logoUrl || "";
  }
}

function applyCompanyTheme(palette) {
  const theme = normalizeCompanyPalette(palette) || DEFAULT_COMPANY_THEME;
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-2", theme.panel_2);
  root.style.setProperty("--hover", theme.hover);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--muted", theme.muted);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-strong", mixHex(theme.accent, "#ffffff", 0.12));
  root.style.setProperty("--accent-soft", mixHex(theme.panel, theme.accent, 0.22));
  root.style.setProperty("--accent-ghost", mixHex(theme.bg, theme.accent, 0.14));
  root.style.setProperty("--accent-contrast", mixHex("#02110c", theme.accent, 0.18));
  root.style.setProperty("--panel-elevated", mixHex(theme.panel, "#ffffff", 0.04));
  root.style.setProperty("--panel-deep", mixHex(theme.bg, "#000000", 0.18));
  root.style.setProperty("--line-soft", mixHex(theme.line, theme.text, 0.08));
  root.style.setProperty("--bubble-out", theme.bubble_out);
  root.style.setProperty("--bubble-in", theme.bubble_in);
  root.style.setProperty("--line", theme.line);
  document.body.style.background = theme.panel;
}

function resetCompanyTheme() {
  applyCompanyTheme(DEFAULT_COMPANY_THEME);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

function rgbToHex(rgb) {
  const r = clamp(Math.round(Number(rgb?.r || 0)), 0, 255);
  const g = clamp(Math.round(Number(rgb?.g || 0)), 0, 255);
  const b = clamp(Math.round(Number(rgb?.b || 0)), 0, 255);
  return `#${[r, g, b].map((item) => item.toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(colorA, colorB, weight = 0.5) {
  const a = hexToRgb(colorA);
  const b = hexToRgb(colorB);
  if (!a || !b) return colorA || colorB || "#000000";
  const ratio = clamp(Number(weight), 0, 1);
  return rgbToHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

function rgbToHsl(rgb) {
  const r = clamp(Number(rgb?.r || 0), 0, 255) / 255;
  const g = clamp(Number(rgb?.g || 0), 0, 255) / 255;
  const b = clamp(Number(rgb?.b || 0), 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0);
      break;
    case g:
      h = (b - r) / d + 2;
      break;
    default:
      h = (r - g) / d + 4;
      break;
  }
  return { h: h / 6, s, l };
}

function hslToRgb(hsl) {
  const h = ((Number(hsl?.h || 0) % 1) + 1) % 1;
  const s = clamp(Number(hsl?.s || 0), 0, 1);
  const l = clamp(Number(hsl?.l || 0), 0, 1);
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p, q, t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

function adjustHex(color, { hueShift = 0, saturation = 0, lightness = 0 } = {}) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;
  const hsl = rgbToHsl(rgb);
  return rgbToHex(
    hslToRgb({
      h: hsl.h + hueShift,
      s: clamp(hsl.s + saturation, 0, 1),
      l: clamp(hsl.l + lightness, 0, 1),
    }),
  );
}

function buildThemePaletteFromAccent(accent, name) {
  const safeAccent = /^#[0-9a-f]{6}$/i.test(String(accent || "").trim()) ? accent : DEFAULT_COMPANY_THEME.accent;
  return {
    name,
    bg: mixHex("#081318", safeAccent, 0.16),
    panel: mixHex("#111b21", safeAccent, 0.18),
    panel_2: mixHex("#202c33", safeAccent, 0.22),
    hover: mixHex("#2a3942", safeAccent, 0.28),
    text: "#e9edef",
    muted: mixHex("#8696a0", safeAccent, 0.18),
    accent: safeAccent,
    bubble_out: mixHex("#005c4b", safeAccent, 0.56),
    bubble_in: mixHex("#202c33", safeAccent, 0.12),
    line: mixHex("#2a3942", safeAccent, 0.2),
  };
}

async function resizeImageToDataUrl(file, maxSize = 320) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler a imagem."));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao abrir a imagem."));
    img.src = dataUrl;
  });
  const ratio = Math.min(1, maxSize / Math.max(image.width || 1, image.height || 1));
  const width = Math.max(1, Math.round(image.width * ratio));
  const height = Math.max(1, Math.round(image.height * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/png", 0.92);
}

async function extractDominantColorsFromLogo(dataUrl) {
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao processar a logo."));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 48, 48);
  const { data } = ctx.getImageData(0, 0, 48, 48);
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 180) continue;
    const r = Math.round(data[i] / 24) * 24;
    const g = Math.round(data[i + 1] / 24) * 24;
    const b = Math.round(data[i + 2] / 24) * 24;
    const brightness = (r + g + b) / 3;
    if (brightness < 18 || brightness > 245) continue;
    const key = `${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const colors = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(",").map(Number);
      return rgbToHex({ r, g, b });
    });
  const unique = Array.from(new Set(colors));
  return unique.slice(0, 3);
}

async function generateThemePalettesFromLogo(dataUrl) {
  const dominant = await extractDominantColorsFromLogo(dataUrl);
  const base = dominant[0] || DEFAULT_COMPANY_THEME.accent;
  const secondary = dominant[1] || adjustHex(base, { saturation: -0.08, lightness: 0.08 });
  const tertiary = dominant[2] || adjustHex(base, { hueShift: 0.08, saturation: -0.04, lightness: -0.02 });
  return [
    buildThemePaletteFromAccent(base, "Paleta 1"),
    buildThemePaletteFromAccent(adjustHex(secondary, { saturation: 0.04, lightness: 0.02 }), "Paleta 2"),
    buildThemePaletteFromAccent(adjustHex(tertiary, { saturation: 0.02, lightness: -0.01 }), "Paleta 3"),
  ];
}

function renderCompanyBranding() {
  const branding = normalizeCompanyBranding(state.companyBranding || {});
  state.companyBranding = branding;
  const logoUrl = String(branding.logo_data_url || "").trim();
  if (companyLogoPreviewImageEl) {
    companyLogoPreviewImageEl.hidden = !logoUrl;
    companyLogoPreviewImageEl.src = logoUrl || "";
  }
  if (companyLogoPreviewEmptyEl) {
    companyLogoPreviewEmptyEl.hidden = Boolean(logoUrl);
  }
  if (companyLogoClearBtnEl) {
    companyLogoClearBtnEl.hidden = !logoUrl;
  }
  renderAppBranding();
  if (!companyPaletteListEl) return;
  companyPaletteListEl.innerHTML = "";
  const defaultButton = document.createElement("button");
  defaultButton.type = "button";
  defaultButton.className = `company-palette-card ${branding.selected_palette_index === -1 ? "active" : ""}`;
  defaultButton.innerHTML = `
    <div class="company-palette-card-head">
      <strong>Padrão</strong>
      ${branding.selected_palette_index === -1 ? '<span class="company-palette-active">Ativa</span>' : ""}
    </div>
    <div class="company-palette-swatches">
      <span style="background:${DEFAULT_COMPANY_THEME.accent}"></span>
      <span style="background:${DEFAULT_COMPANY_THEME.panel}"></span>
      <span style="background:${DEFAULT_COMPANY_THEME.panel_2}"></span>
      <span style="background:${DEFAULT_COMPANY_THEME.bubble_out}"></span>
    </div>
  `;
  defaultButton.addEventListener("click", () => {
    state.companyBranding = {
      ...branding,
      selected_palette_index: -1,
      selected_palette: null,
    };
    applyCompanyTheme(DEFAULT_COMPANY_THEME);
    renderCompanyBranding();
  });
  companyPaletteListEl.appendChild(defaultButton);

  if (!branding.palette_options.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "Envie uma logo para gerar as paletas.";
    companyPaletteListEl.appendChild(emptyState);
    return;
  }
  branding.palette_options.forEach((palette, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `company-palette-card ${index === branding.selected_palette_index ? "active" : ""}`;
    button.dataset.paletteIndex = String(index);
    button.innerHTML = `
      <div class="company-palette-card-head">
        <strong>${palette.name}</strong>
        ${index === branding.selected_palette_index ? '<span class="company-palette-active">Ativa</span>' : ""}
      </div>
      <div class="company-palette-swatches">
        <span style="background:${palette.accent}"></span>
        <span style="background:${palette.panel}"></span>
        <span style="background:${palette.panel_2}"></span>
        <span style="background:${palette.bubble_out}"></span>
      </div>
    `;
    button.addEventListener("click", () => {
      state.companyBranding = {
        ...branding,
        selected_palette_index: index,
        selected_palette: branding.palette_options[index] || null,
      };
      applyCompanyTheme(branding.palette_options[index] || DEFAULT_COMPANY_THEME);
      renderCompanyBranding();
    });
    companyPaletteListEl.appendChild(button);
  });
}

async function loadCompanyBranding() {
  if (!state.isAuthenticated) {
    state.companyBranding = null;
    resetCompanyTheme();
    renderCompanyBranding();
    return;
  }
  try {
    const result = await api("/auth/company-branding");
    state.companyBranding = normalizeCompanyBranding(result?.branding || {});
    applyCompanyTheme(state.companyBranding.selected_palette || DEFAULT_COMPANY_THEME);
    renderCompanyBranding();
  } catch {
    state.companyBranding = null;
    resetCompanyTheme();
    renderCompanyBranding();
  }
}

async function saveCompanyBranding() {
  const branding = normalizeCompanyBranding(state.companyBranding || {});
  const result = await api("/auth/company-branding", {
    method: "PUT",
    body: JSON.stringify({
      logo_data_url: branding.logo_data_url || null,
      palette_options: branding.palette_options,
      selected_palette_index: branding.selected_palette_index,
    }),
  });
  state.companyBranding = normalizeCompanyBranding(result?.branding || {});
  applyCompanyTheme(state.companyBranding.selected_palette || DEFAULT_COMPANY_THEME);
  renderCompanyBranding();
}

function setProductsTab(tab) {
  state.productsTab = tab;
  productsTabStoreInfoEl.classList.toggle("active", tab === "store-info");
  productsTabMediaEl.classList.toggle("active", tab === "media");
  productsTabCreateEl.classList.toggle("active", tab === "create");
  productsTabListEl.classList.toggle("active", tab === "list");
  productsTabOrdersEl.classList.toggle("active", tab === "orders");
  productsTabSchedulesEl.classList.toggle("active", tab === "schedules");
  productsTabScheduleSettingsEl.classList.toggle("active", tab === "schedule-settings");
  productsPanelStoreInfoEl.classList.toggle("active", tab === "store-info");
  productsPanelMediaEl.classList.toggle("active", tab === "media");
  productsPanelCreateEl.classList.toggle("active", tab === "create");
  productsPanelListEl.classList.toggle("active", tab === "list");
  productsPanelOrdersEl.classList.toggle("active", tab === "orders");
  productsPanelSchedulesEl.classList.toggle("active", tab === "schedules");
  productsPanelScheduleSettingsEl.classList.toggle("active", tab === "schedule-settings");
  renderMobileChrome();
}

function getCurrentScheduleMonth() {
  if (/^\d{4}-\d{2}$/.test(String(state.scheduleCalendarMonth || ""))) {
    return state.scheduleCalendarMonth;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDateIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function shiftMonth(month, offset) {
  const [year, monthNumber] = String(month || "").split("-").map((item) => Number(item));
  const base = new Date(year, Math.max(0, monthNumber - 1 + offset), 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function formatScheduleDateLabel(dateIso) {
  const [year, month, day] = String(dateIso || "").split("-").map((item) => Number(item));
  if (!year || !month || !day) return String(dateIso || "-");
  const date = new Date(year, month - 1, day);
  const weekday = date.toLocaleDateString("pt-BR", {
    weekday: "long",
  });
  const shortDate = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  return `${weekday}, ${shortDate}`;
}

function getDefaultScheduleWorkingDays() {
  return [
    {
      day_of_week: 0,
      label: "Domingo",
      enabled: false,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: false,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: false,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 1,
      label: "Segunda",
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: true,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 2,
      label: "Terça",
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: true,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 3,
      label: "Quarta",
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: true,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 4,
      label: "Quinta",
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: true,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 5,
      label: "Sexta",
      enabled: true,
      start_time: "08:00",
      end_time: "18:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: true,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
    {
      day_of_week: 6,
      label: "Sábado",
      enabled: false,
      start_time: "08:00",
      end_time: "12:00",
      morning_enabled: true,
      morning_start: "08:00",
      morning_end: "12:00",
      afternoon_enabled: false,
      afternoon_start: "13:00",
      afternoon_end: "18:00",
      night_enabled: false,
      night_start: "19:00",
      night_end: "22:00",
    },
  ];
}

function normalizeScheduleWorkingDays(values) {
  const byDay = new Map();
  for (const item of getDefaultScheduleWorkingDays()) {
    byDay.set(item.day_of_week, { ...item });
  }
  if (Array.isArray(values)) {
    values.forEach((item) => {
      const day = Number(item?.day_of_week);
      if (!byDay.has(day)) return;
      const current = byDay.get(day);
      byDay.set(day, {
        ...current,
        enabled: Boolean(item?.enabled),
        start_time: String(item?.start_time || current.start_time || "").trim() || current.start_time,
        end_time: String(item?.end_time || current.end_time || "").trim() || current.end_time,
        morning_enabled: item?.morning_enabled === undefined ? current.morning_enabled : Boolean(item?.morning_enabled),
        morning_start: String(item?.morning_start || current.morning_start || "").trim() || current.morning_start,
        morning_end: String(item?.morning_end || current.morning_end || "").trim() || current.morning_end,
        afternoon_enabled: item?.afternoon_enabled === undefined ? current.afternoon_enabled : Boolean(item?.afternoon_enabled),
        afternoon_start: String(item?.afternoon_start || current.afternoon_start || "").trim() || current.afternoon_start,
        afternoon_end: String(item?.afternoon_end || current.afternoon_end || "").trim() || current.afternoon_end,
        night_enabled: item?.night_enabled === undefined ? current.night_enabled : Boolean(item?.night_enabled),
        night_start: String(item?.night_start || current.night_start || "").trim() || current.night_start,
        night_end: String(item?.night_end || current.night_end || "").trim() || current.night_end,
      });
    });
  }
  return Array.from(byDay.values()).sort((a, b) => a.day_of_week - b.day_of_week);
}

function normalizeScheduleReminderRules(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const items = values
    .map((item) => {
      const rawUnit = String(item?.unit || "minutes").trim().toLowerCase();
      const unit = ["minutes", "hours", "days"].includes(rawUnit) ? rawUnit : "minutes";
      const value = Number(item?.value);
      const normalizedValue = Number.isFinite(value) ? Math.max(1, Math.round(value)) : null;
      if (!normalizedValue) return null;
      return { value: normalizedValue, unit };
    })
    .filter(Boolean);

  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.unit}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createScheduleReminderRuleRow(rule = {}) {
  const row = document.createElement("div");
  row.className = "schedule-reminder-rule-row";
  const normalized = normalizeScheduleReminderRules([rule])[0] || { value: 1, unit: "hours" };
  row.innerHTML = `
    <label>
      <span>Tempo antes</span>
      <input type="number" min="1" step="1" data-schedule-reminder-value value="${escapeHtml(String(normalized.value))}" />
    </label>
    <label>
      <span>Unidade</span>
      <select data-schedule-reminder-unit>
        ${SCHEDULE_REMINDER_UNIT_OPTIONS.map((option) => `<option value="${option.value}"${option.value === normalized.unit ? " selected" : ""}>${option.label}</option>`).join("")}
      </select>
    </label>
    <button type="button" class="btn-secondary schedule-reminder-remove-btn" data-action="remove-schedule-reminder">
      <i class="bi bi-trash3"></i>
    </button>
  `;
  return row;
}

function renderScheduleReminderRules(rules) {
  if (!scheduleReminderRulesListEl) return;
  const items = normalizeScheduleReminderRules(Array.isArray(rules) ? rules : []);
  scheduleReminderRulesListEl.innerHTML = "";
  if (!items.length) {
    scheduleReminderRulesListEl.appendChild(createScheduleReminderRuleRow({ value: 1, unit: "hours" }));
    return;
  }
  items.forEach((item) => scheduleReminderRulesListEl.appendChild(createScheduleReminderRuleRow(item)));
}

function readScheduleReminderRules() {
  if (!scheduleReminderRulesListEl) return [];
  const rows = Array.from(scheduleReminderRulesListEl.querySelectorAll(".schedule-reminder-rule-row"));
  return normalizeScheduleReminderRules(
    rows.map((row) => ({
      value: String(row.querySelector('[data-schedule-reminder-value]')?.value || "").trim(),
      unit: String(row.querySelector('[data-schedule-reminder-unit]')?.value || "minutes").trim(),
    })),
  );
}

function createScheduleWorkingDayRow(item) {
  const row = document.createElement("div");
  row.className = "schedule-working-day-row";
  row.innerHTML = `
    <div class="schedule-day-toggle-card">
      <label class="schedule-day-toggle">
        <input type="checkbox" data-schedule-day-enabled ${item.enabled ? "checked" : ""} />
        <strong>${escapeHtml(item.label)}</strong>
      </label>
    </div>
    <div class="schedule-day-periods">
      <div class="schedule-day-period">
        <label class="schedule-day-period-head">
          <input type="checkbox" data-schedule-morning-enabled ${item.morning_enabled ? "checked" : ""} />
          <span>Manhã</span>
        </label>
        <div class="schedule-day-period-times">
          <label>
            <span>Início</span>
            <input type="time" data-schedule-morning-start value="${escapeHtml(item.morning_start || "08:00")}" />
          </label>
          <label>
            <span>Fim</span>
            <input type="time" data-schedule-morning-end value="${escapeHtml(item.morning_end || "12:00")}" />
          </label>
        </div>
      </div>
      <div class="schedule-day-period">
        <label class="schedule-day-period-head">
          <input type="checkbox" data-schedule-afternoon-enabled ${item.afternoon_enabled ? "checked" : ""} />
          <span>Tarde</span>
        </label>
        <div class="schedule-day-period-times">
          <label>
            <span>Início</span>
            <input type="time" data-schedule-afternoon-start value="${escapeHtml(item.afternoon_start || "13:00")}" />
          </label>
          <label>
            <span>Fim</span>
            <input type="time" data-schedule-afternoon-end value="${escapeHtml(item.afternoon_end || "18:00")}" />
          </label>
        </div>
      </div>
      <div class="schedule-day-period">
        <label class="schedule-day-period-head">
          <input type="checkbox" data-schedule-night-enabled ${item.night_enabled ? "checked" : ""} />
          <span>Noite</span>
        </label>
        <div class="schedule-day-period-times">
          <label>
            <span>Início</span>
            <input type="time" data-schedule-night-start value="${escapeHtml(item.night_start || "19:00")}" />
          </label>
          <label>
            <span>Fim</span>
            <input type="time" data-schedule-night-end value="${escapeHtml(item.night_end || "22:00")}" />
          </label>
        </div>
      </div>
    </div>
  `;
  row.dataset.dayOfWeek = String(item.day_of_week);
  return row;
}

function renderScheduleWorkingDays() {
  if (!scheduleWorkingDaysListEl) return;
  const items = normalizeScheduleWorkingDays(state.scheduleWorkingDays);
  state.scheduleWorkingDays = items;
  scheduleWorkingDaysListEl.innerHTML = "";
  items.forEach((item) => scheduleWorkingDaysListEl.appendChild(createScheduleWorkingDayRow(item)));
}

function readScheduleWorkingDays() {
  if (!scheduleWorkingDaysListEl) return normalizeScheduleWorkingDays(state.scheduleWorkingDays);
  return Array.from(scheduleWorkingDaysListEl.querySelectorAll(".schedule-working-day-row"))
    .map((row) => {
      const morningEnabled = Boolean(row.querySelector("[data-schedule-morning-enabled]")?.checked);
      const morningStart = String(row.querySelector("[data-schedule-morning-start]")?.value || "").trim();
      const morningEnd = String(row.querySelector("[data-schedule-morning-end]")?.value || "").trim();
      const afternoonEnabled = Boolean(row.querySelector("[data-schedule-afternoon-enabled]")?.checked);
      const afternoonStart = String(row.querySelector("[data-schedule-afternoon-start]")?.value || "").trim();
      const afternoonEnd = String(row.querySelector("[data-schedule-afternoon-end]")?.value || "").trim();
      const nightEnabled = Boolean(row.querySelector("[data-schedule-night-enabled]")?.checked);
      const nightStart = String(row.querySelector("[data-schedule-night-start]")?.value || "").trim();
      const nightEnd = String(row.querySelector("[data-schedule-night-end]")?.value || "").trim();
      const starts = [morningEnabled ? morningStart : "", afternoonEnabled ? afternoonStart : "", nightEnabled ? nightStart : ""].filter(Boolean);
      const ends = [morningEnabled ? morningEnd : "", afternoonEnabled ? afternoonEnd : "", nightEnabled ? nightEnd : ""].filter(Boolean);
      return {
        day_of_week: Number(row.dataset.dayOfWeek),
        enabled: Boolean(row.querySelector("[data-schedule-day-enabled]")?.checked),
        start_time: starts.length ? starts[0] : "",
        end_time: ends.length ? ends[ends.length - 1] : "",
        morning_enabled: morningEnabled,
        morning_start: morningStart,
        morning_end: morningEnd,
        afternoon_enabled: afternoonEnabled,
        afternoon_start: afternoonStart,
        afternoon_end: afternoonEnd,
        night_enabled: nightEnabled,
        night_start: nightStart,
        night_end: nightEnd,
      };
    })
    .filter((item) => Number.isInteger(item.day_of_week));
}

function updateScheduleReminderState() {
  const enabled = Boolean(scheduleReminderEnabledInputEl?.checked);
  if (scheduleReminderMinutesFieldEl) {
    scheduleReminderMinutesFieldEl.hidden = !enabled;
  }
  if (!enabled && scheduleReminderRulesListEl) {
    scheduleReminderRulesListEl.innerHTML = "";
  } else if (enabled && scheduleReminderRulesListEl && !scheduleReminderRulesListEl.children.length) {
    renderScheduleReminderRules([{ value: 1, unit: "hours" }]);
  }
}

function createStorePaymentMethodRow(value = "") {
  const row = document.createElement("div");
  row.className = "store-repeat-row";
  row.innerHTML = `
    <input type="text" data-store-payment-method placeholder="Ex.: PIX" value="${escapeHtml(value)}" />
    <button type="button" class="btn-secondary" data-store-remove-row>
      <i class="bi bi-trash3"></i>
    </button>
  `;
  return row;
}

function createStoreDeliveryFeeRow(item = {}) {
  const label = String(item.label || "").trim();
  const price = String(item.price || "").trim();
  const row = document.createElement("div");
  row.className = "store-repeat-row store-repeat-row-double";
  row.innerHTML = `
    <input type="text" data-store-delivery-label placeholder="Ex.: Centro" value="${escapeHtml(label)}" />
    <input type="text" data-store-delivery-price placeholder="Ex.: R$ 10,00" value="${escapeHtml(price)}" />
    <button type="button" class="btn-secondary" data-store-remove-row>
      <i class="bi bi-trash3"></i>
    </button>
  `;
  return row;
}

function renderStorePaymentMethods(items = []) {
  if (!storePaymentMethodsListEl) return;
  storePaymentMethodsListEl.innerHTML = "";
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!values.length) {
    storePaymentMethodsListEl.appendChild(createStorePaymentMethodRow(""));
    return;
  }
  values.forEach((item) => storePaymentMethodsListEl.appendChild(createStorePaymentMethodRow(item)));
}

function renderStoreDeliveryFees(items = []) {
  if (!storeDeliveryFeesListEl) return;
  storeDeliveryFeesListEl.innerHTML = "";
  const values = Array.isArray(items) ? items.filter((item) => item && (item.label || item.price)) : [];
  if (!values.length) {
    storeDeliveryFeesListEl.appendChild(createStoreDeliveryFeeRow({}));
    return;
  }
  values.forEach((item) => storeDeliveryFeesListEl.appendChild(createStoreDeliveryFeeRow(item)));
}

function readStorePaymentMethods() {
  if (!storePaymentMethodsListEl) return [];
  return Array.from(storePaymentMethodsListEl.querySelectorAll("[data-store-payment-method]"))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

function readStoreDeliveryFees() {
  if (!storeDeliveryFeesListEl) return [];
  return Array.from(storeDeliveryFeesListEl.querySelectorAll(".store-repeat-row"))
    .map((row) => ({
      label: String(row.querySelector("[data-store-delivery-label]")?.value || "").trim(),
      price: String(row.querySelector("[data-store-delivery-price]")?.value || "").trim(),
    }))
    .filter((item) => item.label || item.price);
}

function parseStoreAddressParts(rawAddress) {
  const raw = String(rawAddress || "").trim();
  const parsed = {
    city: "",
    street: "",
    number: "",
    neighborhood: "",
    complement: "",
  };

  if (!raw) return parsed;

  const labeledParts = raw.split("|").map((item) => String(item || "").trim()).filter(Boolean);
  if (labeledParts.some((item) => item.includes(":"))) {
    labeledParts.forEach((item) => {
      const [label, ...rest] = item.split(":");
      const value = rest.join(":").trim();
      const normalizedLabel = String(label || "").trim().toLowerCase();
      if (normalizedLabel === "cidade") parsed.city = value;
      if (normalizedLabel === "rua") parsed.street = value;
      if (normalizedLabel === "número" || normalizedLabel === "numero" || normalizedLabel === "n?mero") parsed.number = value;
      if (normalizedLabel === "bairro") parsed.neighborhood = value;
      if (normalizedLabel === "complemento") parsed.complement = value;
    });
    return parsed;
  }

  parsed.complement = raw;
  return parsed;
}

function buildStoreAddressText() {
  const parts = [
    ["Cidade", String(storeAddressCityInputEl?.value || "").trim()],
    ["Rua", String(storeAddressStreetInputEl?.value || "").trim()],
    ["Numero", String(storeAddressNumberInputEl?.value || "").trim()],
    ["Bairro", String(storeAddressNeighborhoodInputEl?.value || "").trim()],
    ["Complemento", String(storeAddressComplementInputEl?.value || "").trim()],
  ].filter(([, value]) => value);

  return parts.map(([label, value]) => `${label}: ${value}`).join(" | ");
}

function normalizeProductGroupName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function getAvailableProductGroups() {
  const seen = new Map();
  for (const product of Array.isArray(state.products) ? state.products : []) {
    const rawGroup = normalizeProductGroupName(product?.group_name || "");
    if (!rawGroup) continue;
    const normalizedKey = rawGroup.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!seen.has(normalizedKey)) {
      seen.set(normalizedKey, rawGroup);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function renderProductGroupOptions() {
  if (!productGroupOptionsEl || !productGroupSuggestionsEl) return;
  const groups = getAvailableProductGroups();
  productGroupOptionsEl.innerHTML = groups.map((group) => `<option value="${escapeHtml(group)}"></option>`).join("");
  productGroupSuggestionsEl.innerHTML = "";
  productGroupSuggestionsEl.hidden = groups.length === 0;
  for (const group of groups) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-group-chip";
    button.textContent = group;
    button.dataset.groupName = group;
    productGroupSuggestionsEl.appendChild(button);
  }
}

function resetProductForm() {
  state.editingProductId = "";
  productIdEl.value = "";
  productsFormEl.reset();
  productActiveEl.checked = true;
  productGroupEl.value = "";
  productTypeEl.value = "product";
  productDiscountEnabledEl.checked = false;
  productScheduleEnabledEl.checked = false;
  productServiceDurationEl.value = "";
  productDiscountPriceEl.value = "";
  productStockEl.required = true;
  productStockFieldEl.hidden = false;
  productScheduleToggleFieldEl.hidden = true;
  productScheduleDurationFieldEl.hidden = true;
  productDiscountPriceFieldEl.hidden = true;
  productDiscountPriceEl.required = false;
  productServiceDurationEl.required = false;
  productSubmitBtnEl.innerHTML = '<i class="bi bi-check2-circle"></i> Cadastrar produto';
  productCancelEditBtnEl.hidden = true;
  if (productFormHeadingEl) {
    productFormHeadingEl.textContent = "Cadastrar produto";
  }
  if (productFormDescriptionEl) {
    productFormDescriptionEl.textContent = "Cadastre itens para o agente consultar e sugerir durante o atendimento.";
  }
  renderProductGroupOptions();
  updateProductPreview();
}

function fillProductForm(product) {
  state.editingProductId = String(product?.id || "").trim();
  productIdEl.value = state.editingProductId;
  productActiveEl.checked = product?.is_active !== false;
  productNameEl.value = String(product?.name || "");
  productGroupEl.value = String(product?.group_name || "");
  productTypeEl.value = String(product?.type || "product");
  productPriceEl.value = String(product?.price || "");
  productDiscountEnabledEl.checked = Boolean(product?.discount_enabled);
  productDiscountPriceEl.value = product?.discount_price != null ? String(product.discount_price) : "";
  productScheduleEnabledEl.checked = Boolean(product?.schedule_enabled);
  productServiceDurationEl.value = product?.service_duration_minutes != null ? String(product.service_duration_minutes) : "";
  productStockEl.value = String(product?.stock || 0);
  productDescriptionEl.value = String(product?.description || "");
  productImageEl.value = "";
  updateProductTypeState();
  productSubmitBtnEl.innerHTML = '<i class="bi bi-pencil-square"></i> Salvar altera??es';
  productCancelEditBtnEl.hidden = false;
  if (productFormHeadingEl) {
    productFormHeadingEl.textContent = "Editar produto";
  }
  if (productFormDescriptionEl) {
    productFormDescriptionEl.textContent = "Atualize as informações do item e mantenha o catálogo do agente sempre correto.";
  }
  renderProductGroupOptions();
  updateProductPreview(product);
  setProductsTab("create");
}

function updateProductPreview(product = null) {
  const currentProduct = product || findProductById(state.editingProductId) || null;
  const typedName = String(productNameEl?.value || "").trim();
  const typedGroup = normalizeProductGroupName(productGroupEl?.value || "");
  const typedType = String(productTypeEl?.value || "").trim();
  const typedPrice = String(productPriceEl?.value || "").trim();
  const typedDiscountPrice = String(productDiscountPriceEl?.value || "").trim();
  const typedStock = String(productStockEl?.value || "").trim();
  const typedDescription = String(productDescriptionEl?.value || "").trim();
  const file = productImageEl?.files?.[0] || null;
  const type = typedType || String(currentProduct?.type || "product");
  const discountEnabled = Boolean(productDiscountEnabledEl?.checked || currentProduct?.discount_enabled);
  const scheduleEnabled = Boolean(productScheduleEnabledEl?.checked || currentProduct?.schedule_enabled);
  const durationValue = String(productServiceDurationEl?.value || currentProduct?.service_duration_minutes || "").trim();

  const name = typedName || String(currentProduct?.name || "").trim() || "Novo produto";
  const groupName = typedGroup || normalizeProductGroupName(currentProduct?.group_name || "");
  const priceValue = typedPrice || String(currentProduct?.price || "").trim();
  const discountValue = typedDiscountPrice || String(currentProduct?.discount_price || "").trim();
  const stockValue = typedStock || String(currentProduct?.stock || "").trim();
  const descriptionValue = typedDescription || String(currentProduct?.description || "").trim();

  productPreviewNameEl.textContent = name;
  if (priceValue) {
    const priceNumber = Number(priceValue);
    productPreviewPriceEl.textContent = Number.isFinite(priceNumber)
      ? `Preço: ${priceNumber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      : `Preço: ${priceValue}`;
  } else {
    productPreviewPriceEl.textContent = "Preço ainda não informado";
  }

  if (discountEnabled && discountValue) {
    const discountNumber = Number(discountValue);
    productPreviewDiscountEl.textContent = Number.isFinite(discountNumber)
      ? `Desconto: ${discountNumber.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      : `Desconto: ${discountValue}`;
    productPreviewDiscountEl.hidden = false;
  } else {
    productPreviewDiscountEl.textContent = "";
    productPreviewDiscountEl.hidden = true;
  }

  const stockLabel =
    type === "service"
      ? scheduleEnabled && durationValue
        ? `Agendamento habilitado | Duração média: ${durationValue} min`
        : descriptionValue || "Serviço sem controle de estoque."
      : stockValue
        ? `Estoque: ${stockValue}`
        : "Estoque ainda não informado";
  productPreviewStockEl.textContent = groupName ? `Grupo: ${groupName} | ${stockLabel}` : stockLabel;

  const imageUrl = file ? URL.createObjectURL(file) : String(currentProduct?.image_url || "").trim();
  if (imageUrl) {
    productPreviewImageEl.src = imageUrl;
    productPreviewImageEl.hidden = false;
    productPreviewPlaceholderEl.hidden = true;
  } else {
    productPreviewImageEl.removeAttribute("src");
    productPreviewImageEl.hidden = true;
    productPreviewPlaceholderEl.hidden = false;
  }
}

function updateProductTypeState() {
  const isService = String(productTypeEl?.value || "product") === "service";
  productStockFieldEl.hidden = isService;
  productStockEl.required = !isService;
  productScheduleToggleFieldEl.hidden = !isService;
  productScheduleDurationFieldEl.hidden = !isService || !productScheduleEnabledEl.checked;
  productServiceDurationEl.required = isService && productScheduleEnabledEl.checked;
  if (isService) {
    productStockEl.value = "0";
  } else {
    productScheduleEnabledEl.checked = false;
    productServiceDurationEl.value = "";
  }
  updateProductPreview();
}

function updateProductDiscountState() {
  const enabled = Boolean(productDiscountEnabledEl?.checked);
  productDiscountPriceFieldEl.hidden = !enabled;
  productDiscountPriceEl.required = enabled;
  if (!enabled) {
    productDiscountPriceEl.value = "";
  }
  updateProductPreview();
}

function updateProductScheduleState() {
  const isService = String(productTypeEl?.value || "product") === "service";
  const enabled = isService && Boolean(productScheduleEnabledEl?.checked);
  productScheduleDurationFieldEl.hidden = !enabled;
  productServiceDurationEl.required = enabled;
  if (!enabled) {
    productServiceDurationEl.value = "";
  }
  updateProductPreview();
}

function findProductById(productId) {
  const targetId = String(productId || "").trim();
  return state.products.find((item) => String(item.id || "").trim() === targetId) || null;
}

function findOrderById(orderId) {
  const targetId = String(orderId || "").trim();
  return state.productOrders.find((item) => String(item.id || "").trim() === targetId) || null;
}

async function openConversationFromEntity(conversationId) {
  const targetId = String(conversationId || "").trim();
  if (!targetId) return;
  state.showAllChats = true;
  switchView("chats");
  await loadConversations({
    skipMessagesReload: true,
    preferCache: false,
    backgroundRefresh: false,
    deferMessagesReload: false,
  }).catch(() => undefined);
  await selectConversation(targetId).catch(() => undefined);
}

async function loadAgentStatus() {
  const result = await api("/ai/status", { cache: "no-store" });
  renderAgentStatus(result);
  const accountId = String(state.selectedWhatsAppAccountId || "").trim();
  if (!accountId) {
    state.agentSettings = {
      default_new_chats_ai_enabled: false,
      agent_name: "",
      company_name: "",
      mood: "informal",
      store_name: "",
      store_description: "",
      store_cnpj: "",
      store_address: "",
      store_payment_methods: [],
      store_delivery_fees: [],
      schedule_working_days: [],
      schedule_interval_minutes: null,
      schedule_reminder_enabled: false,
      schedule_reminder_minutes: null,
      schedule_reminder_rules: [],
    };
    renderAgentSettings();
    return;
  }
  const settings = await api(`/ai/settings?account_id=${encodeURIComponent(accountId)}`, { cache: "no-store" });
  state.agentSettings = {
    ...settings,
    default_new_chats_ai_enabled: Boolean(settings.default_new_chats_ai_enabled),
    agent_guidelines: Array.isArray(settings.agent_guidelines) ? settings.agent_guidelines : [],
  };
  renderAgentSettings();
}

function renderProducts() {
  productsListEl.innerHTML = "";
  if (productsSearchInputEl && productsSearchInputEl.value !== String(state.productsSearch || "")) {
    productsSearchInputEl.value = String(state.productsSearch || "");
  }
  const query = String(state.productsSearch || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  const filteredProducts = !query
    ? state.products
    : state.products.filter((product) => {
        const haystack = [
          product.name,
          product.group_name,
          product.description,
          product.type === "service" ? "servico serviço agendamento" : "produto mercadoria item",
          product.is_active === false ? "inativo desativado off" : "ativo habilitado on",
        ]
          .join(" ")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase();

        return query
          .split(/\s+/)
          .filter(Boolean)
          .every((term) => haystack.includes(term));
      });

  productsSearchClearBtnEl.hidden = !query;
  if (!state.products.length) {
    productsSearchMetaEl.textContent = "Nenhum produto cadastrado.";
    productsListEl.innerHTML = '<div class="empty-state">Nenhum produto cadastrado.</div>';
    return;
  }

  productsSearchMetaEl.textContent = query
    ? `${filteredProducts.length} produto(s) encontrado(s) para "${state.productsSearch}".`
    : `Mostrando ${state.products.length} produto(s) cadastrados.`;

  if (!filteredProducts.length) {
    productsListEl.innerHTML = '<div class="empty-state">Nenhum produto encontrado para essa busca.</div>';
    return;
  }

  let currentGroupHeading = "";
  for (const product of filteredProducts) {
    const groupLabel = normalizeProductGroupName(product.group_name || "") || "Sem grupo";
    if (groupLabel !== currentGroupHeading) {
      currentGroupHeading = groupLabel;
      const heading = document.createElement("div");
      heading.className = "products-group-heading";
      heading.textContent = currentGroupHeading;
      productsListEl.appendChild(heading);
    }

    const row = document.createElement("div");
    row.className = "product-item";
    row.classList.toggle("inactive", product.is_active === false);
    const price = Number(product.price || 0);
    const priceText = Number.isFinite(price)
      ? price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : String(product.price || "R$ 0,00");
    const scheduleText =
      product.type === "service"
        ? `Agendamento: ${product.schedule_enabled ? "habilitado" : "não habilitado"}${
            product.schedule_enabled && product.service_duration_minutes ? ` | ${Number(product.service_duration_minutes)} min` : ""
          }`
        : "";
    row.innerHTML = `
      <div class="product-item-media">
        ${product.image_url ? `<img src="${product.image_url}" alt="${escapeHtml(product.name || "")}" />` : '<div class="product-item-placeholder"><i class="bi bi-box-seam"></i></div>'}
      </div>
      <div class="product-item-main">
        <strong>${escapeHtml(product.name || "-")}</strong>
        <span>Status: ${product.is_active === false ? "Inativo" : "Ativo"}</span>
        <span>Tipo: ${escapeHtml(product.type === "service" ? "Serviço" : "Produto")}</span>
        <span>Preço: ${priceText}</span>
        ${product.discount_enabled && product.discount_price ? `<span>Desconto: ${Number(product.discount_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>` : ""}
        <span>${product.type === "service" ? "Estoque: não se aplica" : `Estoque: ${Number(product.stock || 0)}`}</span>
        ${scheduleText ? `<span>${escapeHtml(scheduleText)}</span>` : ""}
        ${product.description ? `<span>${escapeHtml(product.description)}</span>` : ""}
      </div>
      <div class="product-item-actions">
        <button type="button" class="${product.is_active === false ? "btn-secondary" : "btn-primary"} product-active-btn" data-action="toggle-product-active" data-product-id="${product.id}">
          <i class="bi ${product.is_active === false ? "bi-toggle-off" : "bi-toggle-on"}"></i> ${product.is_active === false ? "Off" : "On"}
        </button>
        <button type="button" class="btn-secondary" data-action="edit-product" data-product-id="${product.id}">
          <i class="bi bi-pencil-fill"></i> Editar
        </button>
        <button type="button" class="btn-danger" data-action="delete-product" data-product-id="${product.id}">
          <i class="bi bi-trash3-fill"></i> Apagar
        </button>
      </div>
    `;
    productsListEl.appendChild(row);
  }
}

function extractOrderDeliveryAddressLines(order) {
  const summary = String(order?.summary || "").replace(/\s+/g, " ").trim();
  const addresses = [];

  if (summary) {
    const segments = summary
      .split(/\s*;\s*(?=\d+x?\s|\d+\s*x\s|Entrega:|destinat[áa]ri[ao]?:)/i)
      .map((part) => part.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const recipientMatch = segment.match(/destinat[áa]ri[ao]?:\s*([^—;]+)/i);
      const deliveryMatch = segment.match(/entrega:\s*(.*?)(?=\s+—\s+(?:pagamento|total|taxa|respons[aá]vel|observa|pendente)|$)/i);
      if (!deliveryMatch) continue;

      const value = String(deliveryMatch[1] || "").trim();
      if (!value) continue;

      const normalizedValue = normalizeText(value);
      const isGenericMultipleSummary =
        normalizedValue.includes("multiplos enderecos") ||
        /^\d+\s+entregas?\b/i.test(value) ||
        /^taxa\b/i.test(value);

      if (isGenericMultipleSummary) continue;

      const recipient = String(recipientMatch?.[1] || "").trim();
      addresses.push(recipient ? `${recipient}: ${value}` : value);
    }
  }

  if (addresses.length) return addresses;

  const fallback = String(order?.delivery_address || "").trim();
  if (!fallback) return [];

  const fallbackLines = fallback
    .split(/\s*(?=\d+\)\s)|\n+/)
    .map((line) => line.trim().replace(/;$/, ""))
    .filter(Boolean);

  return fallbackLines.length > 1 ? fallbackLines : [fallback];
}

function renderOrders() {
  ordersListEl.innerHTML = "";
  if (!state.productOrders.length) {
    ordersListEl.innerHTML = '<div class="empty-state">Nenhum pedido gerado pelo agente.</div>';
    return;
  }

  for (const order of state.productOrders) {
    const item = document.createElement("div");
    item.className = "product-item order-item";
    const total = Number(order.total_estimate || 0);
    const totalText = Number.isFinite(total) && total > 0
      ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "-";
    const orderStatus = String(order.status || "").trim();
    const statusLabel =
      orderStatus === "confirmed"
        ? "Confirmado"
        : orderStatus === "cancelled"
          ? "Cancelado"
          : "Pendente";
    const orderCardClass =
      orderStatus === "confirmed"
        ? "confirmed"
        : orderStatus === "cancelled"
          ? "cancelled"
          : "pending";
    item.classList.add("order-card-compact", orderCardClass);
    const isExpanded = Boolean(state.expandedOrderIds[String(order.id || "").trim()]);
    item.classList.toggle("expanded", isExpanded);
    const itemsPreview = Array.isArray(order.items) && order.items.length
      ? order.items
          .map((entry) => {
            const name = String(entry.name || entry.product || "item").trim();
            const qty = String(entry.quantity || entry.qty || "1").trim();
            return `${qty} - ${name}`;
          })
          .join("\n")
      : "Sem itens detalhados";
    const deliveryAddressLines = extractOrderDeliveryAddressLines(order);
    const deliveryAddressLabel = deliveryAddressLines.length > 1 ? "Endereços/retirada" : "Endereço/retirada";
    const deliveryAddressHtml = deliveryAddressLines.length
      ? deliveryAddressLines.map((line) => escapeHtml(line)).join("<br />")
      : "-";
    item.innerHTML = `
      <div class="schedule-list-main">
        <div class="schedule-list-summary">
          <div class="schedule-list-summary-head">
            <div class="order-summary-head-inline">
              <strong class="schedule-list-summary-name">${escapeHtml(order.conversation_name || order.customer_phone || "Pedido sem cliente")}</strong>
              <span class="schedule-list-status ${orderCardClass}">${escapeHtml(statusLabel)}</span>
            </div>
          </div>
          <div class="schedule-list-summary-meta">
            <span><i class="bi bi-cash-stack"></i> ${escapeHtml(totalText)}</span>
          </div>
        </div>
        <div class="order-list-details"${isExpanded ? "" : ' hidden'}>
          <span><i class="bi bi-box-seam"></i> ${escapeHtml(itemsPreview).replace(/\n/g, "<br />")}</span>
          <span><i class="bi bi-person"></i> ${escapeHtml(order.responsible_name || "-")}</span>
          <span><i class="bi bi-truck"></i> ${escapeHtml(order.fulfillment_type ? `Entrega/retirada: ${order.fulfillment_type}` : "Entrega/retirada: -")}</span>
          <span><i class="bi bi-geo-alt"></i> ${escapeHtml(`${deliveryAddressLabel}: `)}${deliveryAddressHtml}</span>
          <span><i class="bi bi-wallet2"></i> ${escapeHtml(order.payment_method ? `Pagamento: ${order.payment_method}` : "Pagamento: -")}</span>
          ${order.notes ? `<span><i class="bi bi-card-text"></i> ${escapeHtml(order.notes)}</span>` : ""}
          ${order.ready_time_minutes ? `<span><i class="bi bi-hourglass-split"></i> ${escapeHtml(String(order.ready_time_minutes))} minuto(s)</span>` : ""}
          ${order.confirmation_note ? `<span><i class="bi bi-patch-check"></i> ${escapeHtml(order.confirmation_note)}</span>` : ""}
          ${order.cancel_reason ? `<span><i class="bi bi-x-octagon"></i> ${escapeHtml(order.cancel_reason)}</span>` : ""}
        </div>
      </div>
      <div class="schedule-list-actions">
        <button type="button" class="schedule-icon-btn pdf" data-action="open-order-pdf" data-order-id="${order.id}" title="Abrir PDF do pedido" aria-label="Abrir PDF do pedido">
          <i class="bi bi-file-earmark-pdf"></i>
        </button>
        ${
          order.conversation_id
            ? `<button type="button" class="schedule-icon-btn goto" data-action="open-order-chat" data-order-id="${order.id}" title="Ir para a conversa" aria-label="Ir para a conversa">
                <i class="bi bi-chat-dots"></i>
              </button>`
            : ""
        }
        ${
          orderStatus === "pending_confirmation"
            ? `<button type="button" class="schedule-icon-btn confirm" data-action="confirm-order" data-order-id="${order.id}" title="Confirmar pedido" aria-label="Confirmar pedido">
                <i class="bi bi-check2-circle"></i>
              </button>`
            : orderStatus === "confirmed"
              ? `<span class="schedule-icon-btn confirm order-status-icon" title="Confirmado" aria-label="Confirmado">
                  <i class="bi bi-check2-circle"></i>
                </span>`
              : `<span class="schedule-icon-btn cancel order-status-icon" title="Cancelado" aria-label="Cancelado">
                  <i class="bi bi-x-circle"></i>
                </span>`
        }
        ${
          orderStatus !== "cancelled"
            ? `<button type="button" class="schedule-icon-btn cancel" data-action="cancel-order" data-order-id="${order.id}" title="Cancelar pedido" aria-label="Cancelar pedido">
                <i class="bi bi-x-circle"></i>
              </button>`
            : ""
        }
        <button type="button" class="schedule-icon-btn delete" data-action="delete-order" data-order-id="${order.id}" title="Excluir pedido" aria-label="Excluir pedido">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    `;
    item.addEventListener("click", (event) => {
      if (event.target.closest(".schedule-list-actions")) {
        return;
      }
      const nextExpanded = !item.classList.contains("expanded");
      state.expandedOrderIds[String(order.id || "").trim()] = nextExpanded;
      item.classList.toggle("expanded", nextExpanded);
      const detailsEl = item.querySelector(".order-list-details");
      if (detailsEl) {
        detailsEl.hidden = !nextExpanded;
      }
    });
    ordersListEl.appendChild(item);
  }
}

function findScheduleById(scheduleId) {
  const targetId = String(scheduleId || "").trim();
  return state.productSchedules.find((item) => String(item.id || "").trim() === targetId) || null;
}

function formatScheduleAccountLabel(schedule) {
  if (!schedule) return "";
  const displayName = String(schedule.account_display_name || "").trim();
  const phone = formatPhone(String(schedule.account_phone || "").trim());
  const jid = String(schedule.account_wa_jid || "").trim();
  if (displayName && phone) return `${displayName} - ${phone}`;
  return displayName || phone || jid;
}

function renderSchedulesCalendar() {
  if (!scheduleCalendarGridEl || !scheduleCurrentMonthLabelEl) return;
  const month = getCurrentScheduleMonth();
  state.scheduleCalendarMonth = month;
  const [year, monthNumber] = month.split("-").map((item) => Number(item));
  const firstDay = new Date(year, monthNumber - 1, 1);
  const firstWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const todayIso = getCurrentDateIso();
  const countsByDay = state.productSchedules.reduce((acc, item) => {
    const key = String(item.scheduled_date || "").trim();
    if (!key || String(item.status || "").trim() === "cancelled") return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  scheduleCurrentMonthLabelEl.textContent = firstDay.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  scheduleCalendarGridEl.innerHTML = "";

  for (let index = 0; index < firstWeekday; index += 1) {
    const filler = document.createElement("div");
    filler.className = "schedule-day-cell schedule-day-cell-empty";
    scheduleCalendarGridEl.appendChild(filler);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateIso = `${month}-${String(day).padStart(2, "0")}`;
    const count = Number(countsByDay[dateIso] || 0);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "schedule-day-cell";
    if (dateIso === state.selectedScheduleDate) button.classList.add("active");
    if (dateIso === todayIso) button.classList.add("today");
    button.innerHTML = `
      <strong>${day}</strong>
      <span>${count ? `${count} ag.` : ""}</span>
    `;
    button.addEventListener("click", () => {
      state.selectedScheduleDate = dateIso;
      renderSchedulesCalendar();
      renderSchedulesList();
    });
    scheduleCalendarGridEl.appendChild(button);
  }
}

function renderSchedulesList() {
  if (!schedulesListEl || !scheduleSelectedDayLabelEl || !scheduleSelectedDayMetaEl) return;
  const selectedDate = String(state.selectedScheduleDate || "").trim();
  if (!selectedDate) {
    scheduleSelectedDayLabelEl.textContent = "Selecione um dia";
    scheduleSelectedDayMetaEl.textContent = "Nenhum dia selecionado";
    schedulesListEl.innerHTML = '<div class="empty-state">Selecione um dia no calendário para ver os serviços.</div>';
    return;
  }

  const items = state.productSchedules.filter((item) => String(item.scheduled_date || "").trim() === selectedDate);
  const activeItems = items.filter((item) => String(item.status || "").trim() !== "cancelled");
  scheduleSelectedDayLabelEl.textContent = formatScheduleDateLabel(selectedDate);
  scheduleSelectedDayMetaEl.textContent = activeItems.length ? `${activeItems.length} agendamento(s)` : "Nenhum agendamento neste dia";
  schedulesListEl.innerHTML = "";
  if (!items.length) {
    schedulesListEl.innerHTML = '<div class="empty-state">Nenhum serviço agendado para este dia.</div>';
    return;
  }

  for (const schedule of items) {
    const item = document.createElement("div");
    const scheduleStatus = String(schedule.status || "").trim();
    const statusLabel =
      scheduleStatus === "confirmed"
        ? "Confirmado"
        : scheduleStatus === "cancelled"
          ? "Cancelado"
          : "Pendente";
    const statusClass =
      scheduleStatus === "confirmed"
        ? "confirmed"
        : scheduleStatus === "cancelled"
          ? "cancelled"
          : "pending";
    item.className = `schedule-list-item ${statusClass}`;
    const isExpanded = Boolean(state.expandedScheduleIds[String(schedule.id || "").trim()]);
    const scheduleAccountLabel = formatScheduleAccountLabel(schedule);
    item.classList.toggle("expanded", isExpanded);
    item.innerHTML = `
      <div class="schedule-list-main">
        <div class="schedule-list-summary">
          <div class="schedule-list-summary-head">
            <strong class="schedule-list-summary-name">${escapeHtml(
              schedule.customer_name || schedule.conversation_name || schedule.customer_phone || "Agendamento sem cliente",
            )}</strong>
            <span class="schedule-list-status ${statusClass}">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="schedule-list-summary-meta">
            <span><i class="bi bi-briefcase"></i> ${escapeHtml(schedule.service_name || "-")}</span>
            <span><i class="bi bi-clock"></i> ${escapeHtml(schedule.scheduled_time || "-")}</span>
          </div>
        </div>
        <div class="schedule-list-details"${isExpanded ? "" : ' hidden'}>
          <span><i class="bi bi-calendar-event"></i> ${escapeHtml(formatCompactBrDate(schedule.scheduled_date || ""))}</span>
          ${scheduleAccountLabel ? `<span><i class="bi bi-whatsapp"></i> ${escapeHtml(scheduleAccountLabel)}</span>` : ""}
          ${schedule.duration_minutes ? `<span><i class="bi bi-hourglass-split"></i> ${escapeHtml(String(schedule.duration_minutes))} min</span>` : ""}
          ${schedule.notes ? `<span><i class="bi bi-card-text"></i> ${escapeHtml(schedule.notes)}</span>` : ""}
          ${schedule.confirmation_note ? `<span><i class="bi bi-patch-check"></i> ${escapeHtml(schedule.confirmation_note)}</span>` : ""}
          ${schedule.cancel_reason ? `<span><i class="bi bi-x-octagon"></i> ${escapeHtml(schedule.cancel_reason)}</span>` : ""}
        </div>
      </div>
      <div class="schedule-list-actions">
        ${
          schedule.conversation_id
            ? `<button type="button" class="schedule-icon-btn goto" data-action="open-schedule-chat" data-schedule-id="${schedule.id}" title="Ir para a conversa" aria-label="Ir para a conversa">
                <i class="bi bi-chat-dots"></i>
              </button>`
            : ""
        }
        ${
          scheduleStatus !== "cancelled"
            ? `<button type="button" class="schedule-icon-btn reschedule" data-action="reschedule-schedule" data-schedule-id="${schedule.id}" title="Reagendar" aria-label="Reagendar">
                <i class="bi bi-calendar2-event"></i>
              </button>`
            : ""
        }
        ${
          scheduleStatus === "pending_confirmation"
            ? `<button type="button" class="schedule-icon-btn confirm" data-action="confirm-schedule" data-schedule-id="${schedule.id}" title="Confirmar agendamento" aria-label="Confirmar agendamento">
                <i class="bi bi-check2-circle"></i>
              </button>`
            : ""
        }
        ${
          scheduleStatus !== "cancelled"
            ? `<button type="button" class="schedule-icon-btn cancel" data-action="cancel-schedule" data-schedule-id="${schedule.id}" title="Cancelar agendamento" aria-label="Cancelar agendamento">
                <i class="bi bi-x-circle"></i>
              </button>`
            : ""
        }
        <button type="button" class="schedule-icon-btn delete" data-action="delete-schedule" data-schedule-id="${schedule.id}" title="Excluir agendamento" aria-label="Excluir agendamento">
          <i class="bi bi-trash3"></i>
        </button>
      </div>
    `;
    item.addEventListener("click", (event) => {
      if (event.target.closest(".schedule-list-actions")) {
        return;
      }
      const nextExpanded = !item.classList.contains("expanded");
      state.expandedScheduleIds[String(schedule.id || "").trim()] = nextExpanded;
      item.classList.toggle("expanded", nextExpanded);
      const detailsEl = item.querySelector(".schedule-list-details");
      if (detailsEl) {
        detailsEl.hidden = !nextExpanded;
      }
    });
    schedulesListEl.appendChild(item);
  }
}

async function loadProducts() {
  const result = await api("/products");
  state.products = Array.isArray(result?.items) ? result.items : [];
  renderProductGroupOptions();
  renderProducts();
}

function getCompanyMediaKindLabel(kind) {
  if (kind === "image") return "Imagem";
  if (kind === "video") return "Vídeo";
  if (kind === "audio") return "Áudio";
  return "Documento";
}

function renderCompanyMediaUploadPreview(file) {
  if (!companyMediaUploadPreviewEl) return;
  if (!file) {
    companyMediaUploadPreviewEl.hidden = true;
    companyMediaUploadPreviewEl.innerHTML = "";
    return;
  }

  const url = URL.createObjectURL(file);
  const kind = String(file.type || "").startsWith("image/")
    ? "image"
    : String(file.type || "").startsWith("video/")
      ? "video"
      : String(file.type || "").startsWith("audio/")
        ? "audio"
        : "document";

  companyMediaUploadPreviewEl.hidden = false;
  companyMediaUploadPreviewEl.innerHTML = "";

  const card = document.createElement("div");
  card.className = "company-media-upload-card";

  const mediaWrap = document.createElement("div");
  mediaWrap.className = "company-media-upload-thumb";
  if (kind === "image") {
    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name || "Midia";
    mediaWrap.appendChild(img);
  } else if (kind === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.muted = true;
    mediaWrap.appendChild(video);
  } else if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.src = url;
    audio.controls = true;
    mediaWrap.appendChild(audio);
  } else {
    mediaWrap.innerHTML = `<div class="company-media-file-badge"><i class="bi bi-file-earmark-text"></i></div>`;
  }

  const meta = document.createElement("div");
  meta.className = "company-media-upload-meta";
  meta.innerHTML = `
    <strong>${file.name || "Arquivo"}</strong>
    <span>${getCompanyMediaKindLabel(kind)}</span>
    <small>${Math.max(1, Math.round((Number(file.size || 0) / 1024) * 10) / 10)} KB</small>
  `;

  card.appendChild(mediaWrap);
  card.appendChild(meta);
  companyMediaUploadPreviewEl.appendChild(card);
}

function resetCompanyMediaForm() {
  if (!companyMediaFormEl) return;
  companyMediaFormEl.reset();
  if (companyMediaEditIdEl) companyMediaEditIdEl.value = "";
  if (companyMediaFileEl) companyMediaFileEl.disabled = false;
  if (companyMediaSubmitBtnEl) {
    companyMediaSubmitBtnEl.innerHTML = '<i class="bi bi-cloud-arrow-up"></i> Salvar mídia';
  }
  if (companyMediaCancelEditBtnEl) {
    companyMediaCancelEditBtnEl.hidden = true;
  }
  renderCompanyMediaUploadPreview(null);
}

function startCompanyMediaEdit(asset) {
  if (!asset) return;
  if (companyMediaEditIdEl) companyMediaEditIdEl.value = String(asset.id || "");
  if (companyMediaTitleEl) companyMediaTitleEl.value = String(asset.title || "");
  if (companyMediaFileNameEl) companyMediaFileNameEl.value = String(asset.file_name || "");
  if (companyMediaDescriptionEl) companyMediaDescriptionEl.value = String(asset.description || "");
  if (companyMediaFileEl) {
    companyMediaFileEl.value = "";
    companyMediaFileEl.disabled = true;
  }
  if (companyMediaSubmitBtnEl) {
    companyMediaSubmitBtnEl.innerHTML = '<i class="bi bi-pencil-square"></i> Atualizar mídia';
  }
  if (companyMediaCancelEditBtnEl) {
    companyMediaCancelEditBtnEl.hidden = false;
  }
  renderCompanyMediaUploadPreview(null);
  companyMediaTitleEl?.focus();
}

function renderCompanyMediaAssets() {
  if (!companyMediaListEl) return;
  companyMediaListEl.innerHTML = "";
  const items = Array.isArray(state.companyMediaAssets) ? state.companyMediaAssets : [];
  companyMediaMetaEl.textContent =
    items.length === 0 ? "Nenhuma mídia cadastrada." : `${items.length} mídia(s) disponível(is) para o agente e os atendentes.`;

  if (!items.length) {
    companyMediaListEl.innerHTML = '<div class="empty-state">Nenhuma mídia cadastrada ainda.</div>';
    return;
  }

  for (const asset of items) {
    const card = document.createElement("article");
    card.className = "company-media-card";

    const preview = document.createElement("div");
    preview.className = `company-media-card-preview is-${asset.media_kind || "document"}`;
    const mediaUrl = String(asset.media_url || "").trim();
    if ((asset.media_kind || "") === "image" && mediaUrl) {
      preview.innerHTML = `<img src="${mediaUrl}" alt="${asset.title || "Midia"}" />`;
    } else if ((asset.media_kind || "") === "video" && mediaUrl) {
      preview.innerHTML = `<video src="${mediaUrl}" controls preload="metadata"></video>`;
    } else if ((asset.media_kind || "") === "audio" && mediaUrl) {
      preview.innerHTML = `<audio src="${mediaUrl}" controls preload="metadata"></audio>`;
    } else {
      preview.innerHTML = `<div class="company-media-file-badge"><i class="bi bi-file-earmark-richtext"></i></div>`;
    }

    const body = document.createElement("div");
    body.className = "company-media-card-body";
    body.innerHTML = `
      <div class="company-media-card-top">
        <strong>${asset.title || "Sem título"}</strong>
        <span class="company-media-kind">${getCompanyMediaKindLabel(asset.media_kind)}</span>
      </div>
      <div class="company-media-card-file">${asset.file_name || "Arquivo sem nome"}</div>
      <p>${asset.description || "Sem descrição."}</p>
    `;

    const actions = document.createElement("div");
    actions.className = "company-media-card-actions";
    actions.innerHTML = `
      <button type="button" class="btn-secondary" data-action="preview-company-media" data-id="${asset.id}">
        <i class="bi bi-eye"></i> Visualizar
      </button>
      <button type="button" class="btn-secondary" data-action="edit-company-media" data-id="${asset.id}">
        <i class="bi bi-pencil-square"></i> Editar
      </button>
      <button type="button" class="btn-danger" data-action="delete-company-media" data-id="${asset.id}">
        <i class="bi bi-trash3"></i> Excluir
      </button>
    `;

    card.appendChild(preview);
    card.appendChild(body);
    card.appendChild(actions);
    companyMediaListEl.appendChild(card);
  }
}

async function loadCompanyMediaAssets() {
  const result = await api("/company-media");
  state.companyMediaAssets = Array.isArray(result?.items) ? result.items : [];
  renderCompanyMediaAssets();
}

function openCompanyMediaPicker() {
  const items = Array.isArray(state.companyMediaAssets) ? state.companyMediaAssets : [];
  mediaModalBodyEl.innerHTML = "";
  const shell = document.createElement("div");
  shell.className = "company-media-picker";
  shell.innerHTML = `
    <div class="company-media-picker-head">
      <h3>Biblioteca da empresa</h3>
      <p>Escolha uma mídia já cadastrada para enviar nesta conversa.</p>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "company-media-picker-list";
  if (!items.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma mídia cadastrada para esta empresa.</div>';
  } else {
    items.forEach((asset) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "company-media-picker-item";
      item.dataset.assetId = asset.id;
      item.innerHTML = `
        <div class="company-media-picker-item-main">
          <strong>${asset.title || "Sem título"}</strong>
          <span>${getCompanyMediaKindLabel(asset.media_kind)} • ${asset.file_name || "Arquivo"}</span>
        </div>
        <small>${asset.description || "Sem descrição."}</small>
      `;
      list.appendChild(item);
    });
  }

  shell.appendChild(list);
  mediaModalBodyEl.appendChild(shell);
  mediaModalOverlayEl.hidden = false;
}

async function sendCompanyMediaAsset(assetId) {
  const asset = (state.companyMediaAssets || []).find((item) => item.id === assetId);
  if (!asset) {
    await showAlert("Mídia não encontrada.");
    return;
  }
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }

  await api("/messages/send-library-media", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: state.selectedConversation.id,
      phone: getConversationPhone(state.selectedConversation),
      client_id: state.selectedConversation.client_id || null,
      asset_id: asset.id,
    }),
  });

  closeMediaModal();
  invalidateConversationCache();
  invalidateConversationSummaryCache();
  await loadMessages({ refreshLatest: true });
  await loadConversations();
}

async function loadAiOrders() {
  const result = await api("/ai/orders");
  state.productOrders = Array.isArray(result?.items) ? result.items : [];
  state.expandedOrderIds = {};
  renderOrders();
}

async function loadAiSchedules() {
  const month = getCurrentScheduleMonth();
  const result = await api(`/ai/schedules?month=${encodeURIComponent(month)}`);
  state.productSchedules = Array.isArray(result?.items) ? result.items : [];
  state.expandedScheduleIds = {};
  const currentMonthPrefix = `${month}-`;
  if (!String(state.selectedScheduleDate || "").startsWith(currentMonthPrefix)) {
    const today = getCurrentDateIso();
    state.selectedScheduleDate = today.startsWith(currentMonthPrefix) ? today : `${month}-01`;
  }
  renderSchedulesCalendar();
  renderSchedulesList();
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
  renderMobileChrome();
}

function hideLoginScreen() {
  document.body.classList.remove("auth-lock");
  loginScreenEl.classList.add("hidden");
  renderMobileChrome();
}

function renderSettingsHeader() {
  const user = state.currentUser;
  if (!user) {
    settingsHeaderEl.textContent = "";
    settingsProfileAvatarEl.textContent = "NS";
    settingsProfileNameEl.textContent = "-";
    settingsProfileUsernameEl.textContent = "-";
    settingsProfileRoleEl.textContent = "-";
    settingsProfileSectorEl.textContent = "-";
    settingsProfileCompanyEl.textContent = "-";
    settingsSignatureToggleBtnEl?.classList.remove("is-enabled");
    settingsSignatureToggleBtnEl?.setAttribute("aria-pressed", "false");
    if (settingsSignatureToggleLabelEl) settingsSignatureToggleLabelEl.textContent = "Desligado";
    settingsAdminActionsEl.hidden = true;
    settingsTabCompaniesEl.hidden = true;
    if (settingsTabAdminUsersEl) settingsTabAdminUsersEl.hidden = true;
    renderSettingsAccountsPanel();
    return;
  }
  settingsHeaderEl.textContent = `Logado como ${user.name} (${user.role})`;
  settingsProfileAvatarEl.textContent = profileLabel(user.name || "", "");
  settingsProfileNameEl.textContent = user.name || "-";
  settingsProfileUsernameEl.textContent = user.username || "-";
  settingsProfileRoleEl.textContent = user.role || "-";
  settingsProfileSectorEl.textContent = user.sector_name || "-";
  settingsProfileCompanyEl.textContent = user.company_name || "-";
  const autoSignEnabled = Boolean(user.auto_sign_messages);
  settingsSignatureToggleBtnEl?.classList.toggle("is-enabled", autoSignEnabled);
  settingsSignatureToggleBtnEl?.setAttribute("aria-pressed", autoSignEnabled ? "true" : "false");
  if (settingsSignatureToggleLabelEl) settingsSignatureToggleLabelEl.textContent = autoSignEnabled ? "Ligado" : "Desligado";
  settingsAdminActionsEl.hidden = !isAdmin();
  settingsAddNumberBtnEl.hidden = !isAdmin();
  settingsRemoveNumberBtnEl.hidden = !isAdmin();
  settingsTabCompaniesEl.hidden = !isCEO();
  settingsTabCompaniesEl.style.display = isCEO() ? "inline-flex" : "none";
  if (settingsTabAdminUsersEl) {
    settingsTabAdminUsersEl.hidden = !isCEO();
    settingsTabAdminUsersEl.style.display = isCEO() ? "inline-flex" : "none";
  }
  if (!isCEO() && ["companies", "admin-users"].includes(state.settingsTab)) {
    state.settingsTab = "perfil";
  }
  renderRoleOptions(newUserRoleEl, newUserRoleEl.value || "operador");
  renderRoleOptions(editUserRoleEl, editUserRoleEl.value || "operador");
  renderSettingsAccountsPanel();
}

async function toggleCurrentUserMessageSignature() {
  if (!state.currentUser) return;
  const nextValue = !Boolean(state.currentUser.auto_sign_messages);
  settingsSignatureToggleBtnEl.disabled = true;
  try {
    const result = await api("/auth/me/signature", {
      method: "PUT",
      body: JSON.stringify({
        auto_sign_messages: nextValue,
      }),
    });
    state.currentUser = result.user || {
      ...state.currentUser,
      auto_sign_messages: nextValue,
    };
    renderSettingsHeader();
    showToast(nextValue ? "Assinatura automatica ativada." : "Assinatura automatica desativada.");
  } catch (error) {
    console.error(error);
    showToast("Nao foi possivel salvar a preferencia de assinatura.", "error");
  } finally {
    settingsSignatureToggleBtnEl.disabled = false;
  }
}

function renderWhatsAppAccountOptions() {
  const items = Array.isArray(state.whatsappAccounts) ? state.whatsappAccounts : [];
  if (!accountSwitchListEl) return;
  accountSwitchListEl.innerHTML = "";

  if (!items.length) {
    accountSwitchListEl.innerHTML = '<div class="empty-state">Nenhum número vinculado.</div>';
    return;
  }

  for (const account of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `account-switch-item${account.id === state.selectedWhatsAppAccountId ? " active" : ""}${
      isPendingWhatsAppAccount(account) ? " pending" : ""
    }`;
    item.dataset.accountId = account.id;
    const badges = [];
    if (account.connected) badges.push('<span class="account-switch-badge online"><i class="bi bi-wifi"></i>Online</span>');
    if (account.id === state.selectedWhatsAppAccountId) {
      badges.push('<span class="account-switch-badge selected"><i class="bi bi-check2-circle"></i>Selecionado</span>');
    }
    if (isPendingWhatsAppAccount(account)) {
      badges.push('<span class="account-switch-badge pending"><i class="bi bi-qr-code"></i>Aguardando QR</span>');
    }
    if (accountSwitchMode === "remove") {
      badges.push('<span class="account-switch-badge pending"><i class="bi bi-trash3"></i>Remover</span>');
    }
    item.innerHTML = `
      <div class="account-switch-item-head">
        <strong>${formatWhatsAppAccountTitle(account)}</strong>
        <span class="account-switch-badges">${badges.join("")}</span>
      </div>
      <small>${formatWhatsAppAccountMeta(account) || "-"}</small>
    `;
    accountSwitchListEl.appendChild(item);
  }
}

function setSettingsTab(tab) {
  const requestedTab = String(tab || "perfil");
  const safeTab = ["companies", "admin-users"].includes(requestedTab) && !isCEO() ? "perfil" : requestedTab;
  state.settingsTab = safeTab;

  settingsTabPerfilEl.classList.toggle("active", safeTab === "perfil");
  settingsTabCreateEl.classList.toggle("active", safeTab === "create");
  settingsTabListEl.classList.toggle("active", safeTab === "list");
  settingsTabSectorsEl.classList.toggle("active", safeTab === "sectors");
  settingsTabCompaniesEl.classList.toggle("active", safeTab === "companies");
  settingsTabAdminUsersEl?.classList.toggle("active", safeTab === "admin-users");
  settingsTabAccountsEl.classList.toggle("active", safeTab === "accounts");

  settingsPanelPerfilEl.classList.toggle("active", safeTab === "perfil");
  settingsPanelCreateEl.classList.toggle("active", safeTab === "create");
  settingsPanelListEl.classList.toggle("active", safeTab === "list");
  settingsPanelSectorsEl.classList.toggle("active", safeTab === "sectors");
  settingsPanelCompaniesEl.classList.toggle("active", safeTab === "companies");
  settingsPanelAdminUsersEl?.classList.toggle("active", safeTab === "admin-users");
  settingsPanelAccountsEl.classList.toggle("active", safeTab === "accounts");
  renderMobileChrome();
}

function openSettingsModal() {
  if (!state.isAuthenticated) return;
  renderSettingsHeader();
  setSettingsTab(state.settingsTab || "perfil");
  switchView("settings");
  renderMobileChrome();
}

function closeSettingsModal() {
  if (state.currentView === "settings") {
    switchView("chats");
  }
  renderMobileChrome();
}

function renderUsersList(users) {
  settingsUsersListEl.innerHTML = "";
  if (!users || !users.length) {
    settingsUsersListEl.innerHTML = '<div class="empty-state">Nenhum usuário cadastrado.</div>';
    return;
  }

  for (const user of users) {
    const row = document.createElement("div");
    row.className = "settings-user-item";
    row.dataset.userId = user.id;
    const showActions = isAdmin() && (isCEO() || user.role !== "ceo");
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

function renderCompaniesList(items) {
  settingsCompaniesListEl.innerHTML = "";
  if (!items || !items.length) {
    settingsCompaniesListEl.innerHTML = '<div class="empty-state">Nenhuma empresa cadastrada.</div>';
    return;
  }

  for (const company of items) {
    const row = document.createElement("div");
    row.className = "settings-user-item";
    row.innerHTML = `
      <div class="settings-user-main">
        <strong>${company.name}</strong><br />
        <small>${company.cnpj || "CNPJ não informado"}</small>
      </div>
      <div class="settings-user-right">
        <span class="settings-user-role">empresa</span>
      </div>
    `;
    settingsCompaniesListEl.appendChild(row);
  }
}

function renderAdminUsersList(items) {
  if (!settingsAdminUsersListEl) return;
  settingsAdminUsersListEl.innerHTML = "";
  if (!items || !items.length) {
    settingsAdminUsersListEl.innerHTML = '<div class="empty-state">Nenhum administrador cadastrado nas empresas.</div>';
    return;
  }

  for (const user of items) {
    const row = document.createElement("div");
    row.className = "settings-user-item";
    row.dataset.userId = user.id;
    row.innerHTML = `
      <div class="settings-user-main">
        <strong>${user.name || "-"}</strong><br />
        <small>Login: ${user.username || "-"} · Empresa: ${user.company_name || "-"}</small>
      </div>
      <div class="settings-user-right">
        <span class="settings-user-role">administrador</span>
        <div class="settings-user-actions">
          <button type="button" class="btn-secondary" data-action="reset-admin-password">Redefinir senha</button>
        </div>
      </div>
    `;
    settingsAdminUsersListEl.appendChild(row);
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
  if (!state.currentUser || !isAdmin()) {
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
  if (!state.currentUser || !isAdmin()) {
    state.settingsUsers = [];
    state.companies = [];
    settingsAdminSectionEl.hidden = true;
    settingsTabCreateEl.disabled = true;
    settingsTabListEl.disabled = true;
    settingsTabSectorsEl.disabled = true;
    settingsTabCompaniesEl.disabled = true;
    settingsTabCompaniesEl.hidden = true;
    if (settingsTabAdminUsersEl) {
      settingsTabAdminUsersEl.disabled = true;
      settingsTabAdminUsersEl.hidden = true;
    }
    settingsTabAccountsEl.disabled = false;
    if (state.settingsTab !== "perfil") {
      setSettingsTab("perfil");
    }
    settingsUsersListEl.innerHTML = '<div class="empty-state">Somente administrador ou CEO pode ver usuários.</div>';
    renderCompaniesList([]);
    renderAdminUsersList([]);
    return;
  }

  settingsAdminSectionEl.hidden = false;
  settingsTabCreateEl.disabled = false;
  settingsTabListEl.disabled = false;
  settingsTabSectorsEl.disabled = false;
  settingsTabCompaniesEl.disabled = !isCEO();
  settingsTabCompaniesEl.hidden = !isCEO();
  settingsTabCompaniesEl.style.display = isCEO() ? "inline-flex" : "none";
  if (settingsTabAdminUsersEl) {
    settingsTabAdminUsersEl.disabled = !isCEO();
    settingsTabAdminUsersEl.hidden = !isCEO();
    settingsTabAdminUsersEl.style.display = isCEO() ? "inline-flex" : "none";
  }
  settingsTabAccountsEl.disabled = false;
  if (!isCEO() && ["companies", "admin-users"].includes(state.settingsTab)) {
    setSettingsTab("perfil");
  }
  renderRoleOptions(newUserRoleEl, newUserRoleEl.value || "operador");
  await loadSectorsForSettings();
  const result = await api("/auth/users");
  state.settingsUsers = result.items || [];
  renderUsersList(state.settingsUsers);
  await loadCompaniesForSettings();
  await loadAdminUsersForSettings();
}

async function loadCompaniesForSettings() {
  if (!state.currentUser || !isCEO()) {
    state.companies = [];
    renderCompaniesList([]);
    return;
  }

  const result = await api("/auth/companies");
  state.companies = Array.isArray(result?.items) ? result.items : [];
  renderCompaniesList(state.companies);
}

async function loadAdminUsersForSettings() {
  if (!state.currentUser || !isCEO()) {
    state.settingsAdminUsers = [];
    renderAdminUsersList([]);
    return;
  }

  const result = await api("/auth/admin-users");
  state.settingsAdminUsers = Array.isArray(result?.items) ? result.items : [];
  renderAdminUsersList(state.settingsAdminUsers);
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

async function loadWhatsAppAccounts() {
  if (!state.isAuthenticated) {
    state.whatsappAccounts = [];
    state.selectedWhatsAppAccountId = "";
    renderWhatsAppAccountOptions();
    syncProfilePanel();
    return;
  }

  try {
    const result = await api("/whatsapp/accounts");
    state.whatsappAccounts = Array.isArray(result?.items) ? result.items : [];
    state.selectedWhatsAppAccountId = String(result?.selected_account_id || "").trim();

    renderWhatsAppAccountOptions();
    renderSettingsAccountsPanel();
    renderSettingsHeader();
    syncProfilePanel();
  } catch (error) {
    console.error(error);
    state.whatsappAccounts = [];
    state.selectedWhatsAppAccountId = "";
    renderWhatsAppAccountOptions();
    renderSettingsAccountsPanel();
    syncProfilePanel();
  }
}

function openAccountSwitchModal(mode = "select") {
  accountSwitchMode = mode;
  if (accountSwitchTitleEl) {
    accountSwitchTitleEl.textContent = mode === "remove" ? "Remover número" : "Selecionar número";
  }
  renderWhatsAppAccountOptions();
  accountSwitchOverlayEl.classList.add("open");
  accountSwitchModalEl.classList.add("open");
}

function closeAccountSwitchModal() {
  accountSwitchMode = "select";
  accountSwitchOverlayEl.classList.remove("open");
  accountSwitchModalEl.classList.remove("open");
}

function showOrderConfirmDialog() {
  return new Promise((resolve) => {
    let finished = false;
    const cleanup = () => {
      orderConfirmOverlayEl.classList.remove("open");
      orderConfirmModalEl.classList.remove("open");
      orderConfirmFormEl.removeEventListener("submit", handleSubmit);
      orderConfirmCancelEl.removeEventListener("click", handleCancel);
      orderConfirmOverlayEl.removeEventListener("click", handleOverlay);
    };
    const finish = (value) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(value);
    };
    const handleSubmit = (event) => {
      event.preventDefault();
      finish({
        readyTimeMinutes: String(orderConfirmReadyTimeEl.value || "").trim(),
        confirmationNote: String(orderConfirmNoteEl.value || "").trim(),
      });
    };
    const handleCancel = () => finish(null);
    const handleOverlay = (event) => {
      if (event.target === orderConfirmOverlayEl) {
        finish(null);
      }
    };

    orderConfirmReadyTimeEl.value = "";
    orderConfirmNoteEl.value = "";
    orderConfirmOverlayEl.classList.add("open");
    orderConfirmModalEl.classList.add("open");
    orderConfirmFormEl.addEventListener("submit", handleSubmit);
    orderConfirmCancelEl.addEventListener("click", handleCancel);
    orderConfirmOverlayEl.addEventListener("click", handleOverlay);
    setTimeout(() => orderConfirmReadyTimeEl.focus(), 10);
  });
}

async function switchSelectedWhatsAppAccount(accountId, options = {}) {
  const nextAccountId = String(accountId || "").trim();
  state.selectedWhatsAppAccountId = nextAccountId;
  renderWhatsAppAccountOptions();
  syncProfilePanel();

  try {
    await persistSelectedWhatsAppAccount(nextAccountId || null);
    await loadWhatsAppAccounts();
    await refreshHealth();
    await refreshConnectedAccountAvatar();
    syncProfilePanel();
    realtimeCursor = 0;
    state.realtimeCheckpointToken = "";
    closeRealtime();
    await loadConversations();
    if (state.currentView === "bulk-monitor") {
      await loadBulkJobs();
    } else if (state.currentView === "products") {
      await loadProducts();
      await loadCompanyMediaAssets();
      await loadAiOrders();
      await loadAiSchedules();
    } else if (state.currentView === "agent") {
      await loadAgentStatus();
    }
    connectRealtime().catch((error) => console.error(error));
    if (!options.keepOpen) {
      closeAccountSwitchModal();
    }
  } catch (error) {
    await showAlert(error.message || "Falha ao selecionar conta WhatsApp.");
    await loadWhatsAppAccounts();
    await loadConversations();
    if (state.currentView === "products") {
      await loadProducts().catch(() => undefined);
      await loadCompanyMediaAssets().catch(() => undefined);
      await loadAiOrders().catch(() => undefined);
      await loadAiSchedules().catch(() => undefined);
    }
    connectRealtime().catch((innerError) => console.error(innerError));
  }
}

async function handleProvisionWhatsAppAccount() {
  if (!isAdmin()) return;

  try {
    const result = await api("/whatsapp/accounts/provision", {
      method: "POST",
      body: JSON.stringify({
        display_name: "Novo número",
      }),
    });
    if (result?.item?.id) {
      await switchSelectedWhatsAppAccount(result.item.id);
    }
    openProfilePanel();
    await api("/whatsapp/connect", { method: "POST" });
    qrPanelEl.hidden = false;
    qrHintEl.textContent = "Escaneie o QR code para vincular o novo número.";
    clearQrCode();
    await pollQrCode();
    startQrPolling();
  } catch (error) {
    await showAlert(error.message || "Falha ao adicionar número.");
  }
}

async function handleRemoveWhatsAppAccount(accountId) {
  if (!isAdmin()) return;
  const selected = state.whatsappAccounts.find((item) => item.id === accountId) || null;
  if (!selected?.id) {
    await showAlert("Selecione um número para remover.");
    return;
  }

  const confirmed = await showConfirm(
    `Remover o número ${formatWhatsAppAccountTitle(selected)}?`,
    "Remover número",
    "Remover",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api(`/whatsapp/accounts/${selected.id}`, {
      method: "DELETE",
    });
    await loadWhatsAppAccounts();
    const fallbackAccount = state.whatsappAccounts[0] || null;
    await switchSelectedWhatsAppAccount(fallbackAccount?.id || "");
    closeAccountSwitchModal();
    await showAlert("Número removido com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao remover número.");
  }
}

function populateTransferUsers(selectedUserId = "") {
  transferUserSelectEl.innerHTML = "";
  const agents = state.agents.filter((item) => item?.id);
  if (!agents.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhum atendente disponível";
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
  renderRoleOptions(editUserRoleEl, user.role || "operador");
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
  if (user.role === "ceo" && !isCEO()) {
    await showAlert("Somente um CEO pode editar outro CEO.");
    return;
  }
  openEditUserModal(user);
}

async function handleDeleteUser(userId) {
  const user = state.settingsUsers.find((item) => item.id === userId);
  if (!user) return;
  if (user.role === "ceo" && !isCEO()) {
    await showAlert("Somente um CEO pode excluir outro CEO.");
    return;
  }

  const confirmed = await showConfirm(
    `Excluir o usuário ${user.name}?`,
    "Excluir usuário",
    "Excluir",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api(`/auth/users/${user.id}`, { method: "DELETE" });
    await loadUsersForSettings();
    await showAlert("Usuário excluído com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao excluir o usuário.");
  }
}

async function handleResetAdminPassword(userId) {
  const user = state.settingsAdminUsers.find((item) => item.id === userId);
  if (!user || !isCEO()) return;

  const nextPassword = await showPrompt(
    `Informe a nova senha para ${user.name} (${user.company_name || "empresa sem nome"}).`,
    "",
    {
      title: "Redefinir senha do administrador",
      confirmText: "Redefinir",
      placeholder: "Mínimo de 6 caracteres",
    },
  );
  if (nextPassword === null) return;
  if (String(nextPassword || "").trim().length < 6) {
    await showAlert("Senha deve ter pelo menos 6 caracteres.");
    return;
  }

  try {
    await api(`/auth/admin-users/${encodeURIComponent(user.id)}/password`, {
      method: "PUT",
      body: JSON.stringify({ password: String(nextPassword || "").trim() }),
    });
    await loadAdminUsersForSettings();
    await showAlert("Senha redefinida com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao redefinir a senha.");
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

function renderBulkAiToggleState() {
  const enabled = Boolean(bulkEnableAiAgentEl?.checked);
  if (bulkEnableAiAgentBtnEl) {
    bulkEnableAiAgentBtnEl.setAttribute("aria-pressed", enabled ? "true" : "false");
    bulkEnableAiAgentBtnEl.classList.toggle("is-enabled", enabled);
  }
  if (bulkEnableAiAgentStateEl) {
    bulkEnableAiAgentStateEl.textContent = enabled ? "Ligado" : "Desligado";
  }
}

function createBulkMessageAsset(type = "image") {
  return {
    id: `bulk-asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    file_base64: "",
    mimetype: "",
    file_name: "",
    caption: "",
  };
}

function createBulkMessageBlock() {
  return {
    id: `bulk-block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: "",
    assets: [],
    order: ["text"],
  };
}

function moveItem(array, fromIndex, toIndex) {
  if (!Array.isArray(array)) return;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= array.length || toIndex >= array.length) return;
  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
}

function normalizeBulkMessagesDraft() {
  if (!Array.isArray(bulkMessagesDraft)) {
    bulkMessagesDraft = [createBulkMessageBlock()];
  }
  if (!bulkMessagesDraft.length) {
    bulkMessagesDraft = [createBulkMessageBlock()];
  }
  bulkMessagesDraft = bulkMessagesDraft.map((block) => ({
    id: String(block?.id || createBulkMessageBlock().id),
    text: String(block?.text || ""),
    assets: Array.isArray(block?.assets)
      ? block.assets.map((asset) => ({
          id: String(asset?.id || createBulkMessageAsset().id),
          type: ["image", "video", "audio"].includes(String(asset?.type || "").toLowerCase())
            ? String(asset.type).toLowerCase()
            : "image",
          file_base64: String(asset?.file_base64 || ""),
          mimetype: String(asset?.mimetype || ""),
          file_name: String(asset?.file_name || ""),
          caption: String(asset?.caption || ""),
        }))
      : [],
    order: Array.isArray(block?.order) ? block.order.map((item) => String(item || "")) : ["text"],
  }));

  bulkMessagesDraft = bulkMessagesDraft.map((block) => {
    const validOrder = ["text", ...block.assets.map((asset) => asset.id)];
    const uniqueOrder = block.order.filter((item, index) => validOrder.includes(item) && block.order.indexOf(item) === index);
    for (const item of validOrder) {
      if (!uniqueOrder.includes(item)) {
        uniqueOrder.push(item);
      }
    }
    return {
      ...block,
      order: uniqueOrder,
    };
  });
}

function renderBulkMessagesBuilder() {
  normalizeBulkMessagesDraft();
  bulkMessagesContainerEl.innerHTML = "";

  bulkMessagesDraft.forEach((block, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "bulk-message-item";

    const head = document.createElement("div");
    head.className = "bulk-message-card-head";

    const title = document.createElement("div");
    title.textContent = `Bloco ${index + 1}`;
    head.appendChild(title);

    const badges = document.createElement("div");
    badges.className = "bulk-message-badges";
    if (String(block.text || "").trim()) {
      const textBadge = document.createElement("span");
      textBadge.className = "bulk-message-badge";
      textBadge.textContent = "Texto";
      badges.appendChild(textBadge);
    }
    for (const asset of block.assets) {
      const badge = document.createElement("span");
      badge.className = "bulk-message-badge";
      badge.textContent = asset.type === "image" ? "Imagem" : asset.type === "video" ? "Vídeo" : "Áudio";
      badges.appendChild(badge);
    }
    if (!badges.childElementCount) {
      const emptyBadge = document.createElement("span");
      emptyBadge.className = "bulk-message-badge is-muted";
      emptyBadge.textContent = "Vazio";
      badges.appendChild(emptyBadge);
    }
    head.appendChild(badges);
    wrapper.appendChild(head);

    const textarea = document.createElement("textarea");
    textarea.className = "bulk-message-input";
    textarea.rows = 4;
    textarea.placeholder = "Texto opcional deste bloco";
    textarea.value = String(block.text || "");
    textarea.addEventListener("input", () => {
      bulkMessagesDraft[index].text = textarea.value;
    });
    wrapper.appendChild(textarea);

    const orderCard = document.createElement("div");
    orderCard.className = "bulk-order-panel";

    const orderTitle = document.createElement("div");
    orderTitle.className = "bulk-order-title";
    orderTitle.textContent = "Ordem de envio deste bloco";
    orderCard.appendChild(orderTitle);

    const orderHint = document.createElement("small");
    orderHint.textContent = "Defina a sequência em que o texto e cada mídia serão enviados para o cliente.";
    orderCard.appendChild(orderHint);

    const orderList = document.createElement("div");
    orderList.className = "bulk-order-list";
    block.order.forEach((entryId, orderIndex) => {
      const orderItem = document.createElement("div");
      orderItem.className = "bulk-order-item";

      const label = document.createElement("span");
      label.className = "bulk-order-item-label";
      if (entryId === "text") {
        label.textContent = String(block.text || "").trim() ? "Texto do bloco" : "Texto do bloco (vazio)";
      } else {
        const linkedAsset = block.assets.find((asset) => asset.id === entryId);
        label.textContent = linkedAsset
          ? `${linkedAsset.type === "image" ? "Imagem" : linkedAsset.type === "video" ? "Vídeo" : "Áudio"}${linkedAsset.file_name ? ` · ${linkedAsset.file_name}` : ""}`
          : "Mídia";
      }
      orderItem.appendChild(label);

      const orderActions = document.createElement("div");
      orderActions.className = "bulk-order-item-actions";

      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "btn-secondary";
      upBtn.textContent = "↑";
      upBtn.disabled = orderIndex === 0;
      upBtn.addEventListener("click", () => {
        moveItem(bulkMessagesDraft[index].order, orderIndex, orderIndex - 1);
        renderBulkMessagesBuilder();
      });
      orderActions.appendChild(upBtn);

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "btn-secondary";
      downBtn.textContent = "↓";
      downBtn.disabled = orderIndex === block.order.length - 1;
      downBtn.addEventListener("click", () => {
        moveItem(bulkMessagesDraft[index].order, orderIndex, orderIndex + 1);
        renderBulkMessagesBuilder();
      });
      orderActions.appendChild(downBtn);

      orderItem.appendChild(orderActions);
      orderList.appendChild(orderItem);
    });
    orderCard.appendChild(orderList);
    wrapper.appendChild(orderCard);

    const assetsWrap = document.createElement("div");
    assetsWrap.className = "bulk-assets-list";

    block.assets.forEach((asset, assetIndex) => {
      const assetCard = document.createElement("div");
      assetCard.className = "bulk-asset-card";
      const isRecordingThisAsset =
        Boolean(bulkAudioRecordingTarget) &&
        bulkAudioRecordingTarget.blockIndex === index &&
        bulkAudioRecordingTarget.assetIndex === assetIndex &&
        bulkAudioRecorder &&
        bulkAudioRecorder.state === "recording";

      const assetHead = document.createElement("div");
      assetHead.className = "bulk-asset-head";

      const assetType = document.createElement("select");
      assetType.className = "bulk-message-input";
      assetType.innerHTML = `
        <option value="image">Imagem</option>
        <option value="video">Vídeo</option>
        <option value="audio">Áudio</option>
      `;
      assetType.value = asset.type;
      assetType.addEventListener("change", () => {
        const nextType = assetType.value;
        const current = bulkMessagesDraft[index].assets[assetIndex];
        if (isRecordingThisAsset && nextType !== "audio") {
          stopBulkAudioRecording();
        }
        bulkMessagesDraft[index].assets[assetIndex] = {
          ...current,
          type: nextType,
          caption: nextType === "audio" ? "" : current.caption || "",
        };
        renderBulkMessagesBuilder();
      });
      assetHead.appendChild(assetType);

      const removeAssetBtn = document.createElement("button");
      removeAssetBtn.type = "button";
      removeAssetBtn.className = "btn-secondary bulk-asset-remove-btn";
      removeAssetBtn.textContent = "Remover mídia";
      removeAssetBtn.addEventListener("click", () => {
        if (isRecordingThisAsset) {
          stopBulkAudioRecording();
        }
        const removedAssetId = bulkMessagesDraft[index].assets[assetIndex]?.id;
        bulkMessagesDraft[index].assets.splice(assetIndex, 1);
        bulkMessagesDraft[index].order = bulkMessagesDraft[index].order.filter((entry) => entry !== removedAssetId);
        renderBulkMessagesBuilder();
      });
      assetHead.appendChild(removeAssetBtn);
      assetCard.appendChild(assetHead);

      const uploadInput = document.createElement("input");
      uploadInput.className = "bulk-message-input";
      uploadInput.type = "file";
      uploadInput.accept =
        asset.type === "image"
          ? "image/*"
          : asset.type === "video"
            ? "video/*"
            : "audio/*";
      uploadInput.addEventListener("change", async () => {
        const file = uploadInput.files?.[0];
        if (!file) return;
        const dataUrl = await fileToDataUrl(file);
        bulkMessagesDraft[index].assets[assetIndex].file_base64 = dataUrl;
        bulkMessagesDraft[index].assets[assetIndex].mimetype = file.type || "";
        bulkMessagesDraft[index].assets[assetIndex].file_name = file.name || "";
        renderBulkMessagesBuilder();
      });
      assetCard.appendChild(uploadInput);

      if (asset.type === "audio") {
        const audioActions = document.createElement("div");
        audioActions.className = "bulk-asset-inline-actions";

        const recordBtn = document.createElement("button");
        recordBtn.type = "button";
        recordBtn.className = isRecordingThisAsset ? "btn-danger" : "btn-secondary";
        recordBtn.textContent = isRecordingThisAsset ? "Parar gravação" : "Gravar áudio";
        recordBtn.addEventListener("click", async () => {
          try {
            if (isRecordingThisAsset) {
              stopBulkAudioRecording();
            } else {
              await startBulkAudioRecording(index, assetIndex);
            }
          } catch (error) {
            await showAlert(error.message || "Falha ao gravar áudio.");
          }
        });
        audioActions.appendChild(recordBtn);

        if (isRecordingThisAsset) {
          const recordingBadge = document.createElement("span");
          recordingBadge.className = "bulk-recording-indicator";
          recordingBadge.textContent = "Gravando...";
          audioActions.appendChild(recordingBadge);
        }

        if (asset.file_base64) {
          const clearFileBtn = document.createElement("button");
          clearFileBtn.type = "button";
          clearFileBtn.className = "btn-secondary";
          clearFileBtn.textContent = "Excluir áudio";
          clearFileBtn.addEventListener("click", () => {
            clearBulkAssetFile(index, assetIndex);
            renderBulkMessagesBuilder();
          });
          audioActions.appendChild(clearFileBtn);
        }

        assetCard.appendChild(audioActions);
      } else if (asset.file_base64) {
        const clearFileBtn = document.createElement("button");
        clearFileBtn.type = "button";
        clearFileBtn.className = "btn-secondary bulk-clear-file-btn";
        clearFileBtn.textContent = asset.type === "video" ? "Excluir vídeo" : "Excluir imagem";
        clearFileBtn.addEventListener("click", () => {
          clearBulkAssetFile(index, assetIndex);
          renderBulkMessagesBuilder();
        });
        assetCard.appendChild(clearFileBtn);
      }

      if (asset.file_base64) {
        const preview = document.createElement("div");
        preview.className = "bulk-asset-preview";

        if (asset.type === "image") {
          const img = document.createElement("img");
          img.src = asset.file_base64;
          img.alt = asset.file_name || "Imagem do disparo";
          preview.appendChild(img);
        } else if (asset.type === "video") {
          const video = document.createElement("video");
          video.src = asset.file_base64;
          video.controls = true;
          video.preload = "metadata";
          preview.appendChild(video);
        } else {
          const audio = document.createElement("audio");
          audio.src = asset.file_base64;
          audio.controls = true;
          preview.appendChild(audio);
        }

        const meta = document.createElement("small");
        meta.textContent = `Arquivo: ${asset.file_name || "arquivo"}`;
        preview.appendChild(meta);
        assetCard.appendChild(preview);
      }

      if (asset.type === "image" || asset.type === "video") {
        const captionInput = document.createElement("textarea");
        captionInput.className = "bulk-message-input";
        captionInput.rows = 3;
        captionInput.placeholder = "Legenda opcional";
        captionInput.value = String(asset.caption || "");
        captionInput.addEventListener("input", () => {
          bulkMessagesDraft[index].assets[assetIndex].caption = captionInput.value;
        });
        assetCard.appendChild(captionInput);
      }

      assetsWrap.appendChild(assetCard);
    });

    wrapper.appendChild(assetsWrap);

    const actions = document.createElement("div");
    actions.className = "bulk-message-card-actions";

    const addImageBtn = document.createElement("button");
    addImageBtn.type = "button";
    addImageBtn.className = "btn-secondary";
    addImageBtn.textContent = "+ Imagem";
    addImageBtn.addEventListener("click", () => {
      const asset = createBulkMessageAsset("image");
      bulkMessagesDraft[index].assets.push(asset);
      bulkMessagesDraft[index].order.push(asset.id);
      renderBulkMessagesBuilder();
    });
    actions.appendChild(addImageBtn);

    const addVideoBtn = document.createElement("button");
    addVideoBtn.type = "button";
    addVideoBtn.className = "btn-secondary";
    addVideoBtn.textContent = "+ Vídeo";
    addVideoBtn.addEventListener("click", () => {
      const asset = createBulkMessageAsset("video");
      bulkMessagesDraft[index].assets.push(asset);
      bulkMessagesDraft[index].order.push(asset.id);
      renderBulkMessagesBuilder();
    });
    actions.appendChild(addVideoBtn);

    const addAudioBtn = document.createElement("button");
    addAudioBtn.type = "button";
    addAudioBtn.className = "btn-secondary";
    addAudioBtn.textContent = "+ Áudio";
    addAudioBtn.addEventListener("click", () => {
      const asset = createBulkMessageAsset("audio");
      bulkMessagesDraft[index].assets.push(asset);
      bulkMessagesDraft[index].order.push(asset.id);
      renderBulkMessagesBuilder();
    });
    actions.appendChild(addAudioBtn);

    wrapper.appendChild(actions);

    if (bulkMessagesDraft.length > 1) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn-danger bulk-remove-message-btn";
      removeBtn.textContent = "Remover bloco";
      removeBtn.addEventListener("click", () => {
        if (bulkAudioRecordingTarget?.blockIndex === index) {
          stopBulkAudioRecording();
        }
        bulkMessagesDraft.splice(index, 1);
        renderBulkMessagesBuilder();
      });
      wrapper.appendChild(removeBtn);
    }

    bulkMessagesContainerEl.appendChild(wrapper);
  });
}

function collectBulkMessages() {
  normalizeBulkMessagesDraft();
  const normalized = [];
  for (const block of bulkMessagesDraft) {
    const orderedEntries = Array.isArray(block.order) ? block.order : ["text"];
    for (const entryId of orderedEntries) {
      if (entryId === "text") {
        const text = String(block.text || "").trim();
        if (text) {
          normalized.push({ type: "text", text });
        }
        continue;
      }
      const asset = Array.isArray(block.assets) ? block.assets.find((item) => item.id === entryId) : null;
      if (!asset || !String(asset.file_base64 || "").trim()) continue;
      if (asset.type === "audio") {
        normalized.push({
          type: "audio",
          file_base64: asset.file_base64,
          mimetype: asset.mimetype || "audio/ogg",
          file_name: asset.file_name || "audio",
        });
      } else {
        normalized.push({
          type: asset.type,
          file_base64: asset.file_base64,
          mimetype: asset.mimetype || "",
          file_name: asset.file_name || "arquivo",
          caption: String(asset.caption || "").trim(),
        });
      }
    }
  }
  return normalized;
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
  onProgress?.(96, `${processed}/${total} linhas processadas`, "Finalizando importação...");
  return contacts;
}

async function parseContactsFromExcel(file, onProgress) {
  if (!window.XLSX) {
    throw new Error("Leitor de Excel não carregado. Recarregue a página.");
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
  if (state.bulkContactsLoading) {
    bulkContactsCountEl.textContent = state.bulkContactsSource === "open_chats" ? "Carregando chats da empresa..." : "Carregando contatos...";
    return;
  }
  const selected = state.bulkContacts.filter((item) => item.selected).length;
  const total = state.bulkContacts.length;
  const filtered = getFilteredBulkContacts().length;
  const searchLabel = state.bulkContactsSearch.trim() ? ` | ${filtered} na busca` : "";
  const noun = state.bulkContactsSource === "open_chats" ? "chats" : "contatos";
  bulkContactsCountEl.textContent = `${selected}/${total} ${noun} selecionados${searchLabel}`;
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

function getBulkContactsPageInfo() {
  const filteredContacts = getFilteredBulkContacts();
  const pageSize = Math.max(1, Number(state.bulkContactsPageSize || 30));
  const totalPages = Math.max(1, Math.ceil(filteredContacts.length / pageSize));
  const currentPage = Math.min(Math.max(1, Number(state.bulkContactsPage || 1)), totalPages);
  const start = (currentPage - 1) * pageSize;
  const items = filteredContacts.slice(start, start + pageSize);
  return {
    filteredContacts,
    items,
    currentPage,
    totalPages,
    totalItems: filteredContacts.length,
    pageSize,
  };
}

function renderBulkContacts() {
  if (bulkContactsPanelEl) {
    bulkContactsPanelEl.hidden =
      !state.bulkContactsLoading && state.bulkContacts.length === 0 && state.bulkContactsSource === "none";
  }
  bulkContactsListEl.innerHTML = "";
  if (bulkContactsPaginationEl) {
    bulkContactsPaginationEl.innerHTML = "";
    bulkContactsPaginationEl.hidden = true;
  }
  if (state.bulkContactsLoading) {
    bulkContactsListEl.innerHTML = '<div class="empty-state">Carregando chats da empresa...</div>';
    updateBulkContactsMeta();
    return;
  }
  if (!state.bulkContacts.length) {
    const emptyLabel =
      state.bulkContactsSource === "open_chats"
        ? "Nenhum chat encontrado para esta empresa."
        : "Nenhum contato carregado.";
    bulkContactsListEl.innerHTML = `<div class="empty-state">${emptyLabel}</div>`;
    updateBulkContactsMeta();
    return;
  }

  const { items, currentPage, totalPages, totalItems } = getBulkContactsPageInfo();
  state.bulkContactsPage = currentPage;
  if (!totalItems) {
    bulkContactsListEl.innerHTML = '<div class="empty-state">Nenhum contato encontrado na busca.</div>';
    updateBulkContactsMeta();
    return;
  }

  for (const contact of items) {
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

    if (contact.meta) {
      const metaEl = document.createElement("span");
      metaEl.className = "bulk-contact-phone";
      metaEl.textContent = contact.meta;
      phoneEl.appendChild(document.createTextNode(" "));
      phoneEl.appendChild(metaEl);
    }

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

  if (bulkContactsPaginationEl && totalPages > 1) {
    bulkContactsPaginationEl.hidden = false;

    const info = document.createElement("span");
    info.className = "bulk-pagination-info";
    const startItem = (currentPage - 1) * state.bulkContactsPageSize + 1;
    const endItem = Math.min(currentPage * state.bulkContactsPageSize, totalItems);
    info.textContent = `Mostrando ${startItem}-${endItem} de ${totalItems}`;
    bulkContactsPaginationEl.appendChild(info);

    const controls = document.createElement("div");
    controls.className = "bulk-pagination-actions";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn-secondary";
    prevBtn.textContent = "Anterior";
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener("click", () => {
      state.bulkContactsPage = Math.max(1, currentPage - 1);
      renderBulkContacts();
      bulkContactsPanelEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    controls.appendChild(prevBtn);

    const pageLabel = document.createElement("span");
    pageLabel.className = "bulk-pagination-page";
    pageLabel.textContent = `Página ${currentPage} de ${totalPages}`;
    controls.appendChild(pageLabel);

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn-secondary";
    nextBtn.textContent = "Próxima";
    nextBtn.disabled = currentPage >= totalPages;
    nextBtn.addEventListener("click", () => {
      state.bulkContactsPage = Math.min(totalPages, currentPage + 1);
      renderBulkContacts();
      bulkContactsPanelEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    controls.appendChild(nextBtn);

    bulkContactsPaginationEl.appendChild(controls);
  }

  updateBulkContactsMeta();
}

async function loadBulkContactsFromOpenChats() {
  state.bulkContactsSource = "open_chats";
  state.bulkContactsLoading = true;
  renderBulkContacts();
  bulkContactsPanelEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  try {
    const result = await api(`/conversations/open-for-bulk?limit=500`);
    const items = Array.isArray(result.items) ? result.items : [];
    state.bulkContacts = items.map((item) => ({
      name: item.display_name || item.phone || "Sem nome",
      phone: item.phone || "",
      selected: true,
      conversationId: item.id || null,
      meta:
        String(item.service_status || "").trim() === "in_progress"
          ? "Em atendimento"
          : String(item.service_status || "").trim() === "pending"
            ? "Pendente"
            : String(item.service_status || "").trim() === "finalized"
              ? "Finalizado"
              : String(item.service_status || "").trim()
                ? String(item.service_status || "").trim()
                : "",
    }));
    state.bulkContactsSearch = "";
    state.bulkContactsPage = 1;
    bulkContactsSearchEl.value = "";
  } finally {
    state.bulkContactsLoading = false;
    renderBulkContacts();
  }
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
    "Excluir este disparo do histórico?",
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
  const activeAccountJid = getActiveAccountJid();
  if (!activeAccountJid) {
    state.bulkJobs = [];
    state.selectedBulkJobId = null;
    renderBulkJobs();
    renderBulkJobDetails(null);
    return;
  }
  const result = await api("/bulk-dispatch/jobs?limit=20");
  state.bulkJobs = (result.items || []).filter((job) => job.account_wa_jid === activeAccountJid);
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
  state.whatsappAccounts = [];
  state.selectedWhatsAppAccountId = "";
  state.search = "";
    state.agents = [];
    state.companies = [];
    state.products = [];
    state.companyMediaAssets = [];
    state.productOrders = [];
  state.productSchedules = [];
  state.productsTab = "store-info";
  state.editingProductId = "";
  state.scheduleCalendarMonth = "";
  state.selectedScheduleDate = "";
  state.agentSettings = null;
  state.currentView = "chats";
  writeSessionToken("");
  searchInputEl.value = "";
  clearChatStateForDisconnected();
  renderHeader();
  resetProductForm();
  setProductsTab("store-info");
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

  const isFormData = typeof FormData !== "undefined" && fetchOptions.body instanceof FormData;
  const baseHeaders = isFormData ? {} : { "Content-Type": "application/json" };

  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { ...baseHeaders, ...authHeaders, ...customHeaders },
    ...fetchOptions,
  });

  if (response.status === 401 && !skipAuthRedirect) {
    handleUnauthorized();
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    if (response.status === 413) {
      throw new Error(err.error || "Arquivo muito grande. Envie arquivos de ate 40 MB.");
    }
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
    renderAppBranding();
    settingsBtnEl.style.display = "";
    hideLoginScreen();
    applyResponsiveLayoutState();
    await loadCompanyBranding();
    return true;
  } catch {
    state.currentUser = null;
    state.isAuthenticated = false;
    settingsBtnEl.style.display = "none";
    showLoginScreen();
    return false;
  }
}

async function persistSelectedWhatsAppAccount(accountId) {
  if (!state.isAuthenticated) return;
  await api("/whatsapp/selected-account", {
    method: "POST",
    body: JSON.stringify({ account_id: accountId || null }),
  });
}

async function performLogout() {
  try {
    await api("/auth/logout", { method: "POST", skipAuthRedirect: true });
  } catch {
    // no-op
  }
  resetAppAfterLogout();
  state.companyBranding = null;
  state.currentUser = null;
  state.isAuthenticated = false;
  resetCompanyTheme();
  renderAppBranding();
  renderCompanyBranding();
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

function validateUploadFileSize(file) {
  if (!file) return;
  if (Number(file.size || 0) > MAX_UPLOAD_BYTES) {
    throw new Error("Arquivo muito grande. Envie arquivos de ate 40 MB.");
  }
}

function clearBulkAssetFile(blockIndex, assetIndex) {
  const block = bulkMessagesDraft[blockIndex];
  const asset = block?.assets?.[assetIndex];
  if (!asset) return;
  asset.file_base64 = "";
  asset.mimetype = "";
  asset.file_name = "";
  asset.caption = asset.type === "audio" ? "" : asset.caption || "";
}

function stopBulkAudioStream() {
  if (bulkAudioStream) {
    bulkAudioStream.getTracks().forEach((track) => track.stop());
    bulkAudioStream = null;
  }
}

function resetBulkAudioRecorderState() {
  bulkAudioRecorder = null;
  bulkAudioChunks = [];
  bulkAudioRecordingTarget = null;
  stopBulkAudioStream();
}

async function startBulkAudioRecording(blockIndex, assetIndex) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Seu navegador nao suporta gravacao de audio.");
  }
  if (bulkAudioRecorder && bulkAudioRecorder.state === "recording") {
    throw new Error("Ja existe uma gravacao em andamento.");
  }

  bulkAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
    ? "audio/ogg;codecs=opus"
    : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
  bulkAudioRecorder = mimeType ? new MediaRecorder(bulkAudioStream, { mimeType }) : new MediaRecorder(bulkAudioStream);
  bulkAudioChunks = [];
  bulkAudioRecordingTarget = { blockIndex, assetIndex };

  bulkAudioRecorder.addEventListener("dataavailable", (event) => {
    if (event.data && event.data.size > 0) {
      bulkAudioChunks.push(event.data);
    }
  });

  bulkAudioRecorder.addEventListener("stop", async () => {
    const target = bulkAudioRecordingTarget;
    const recorder = bulkAudioRecorder;
    const chunks = [...bulkAudioChunks];
    resetBulkAudioRecorderState();
    if (!target || !chunks.length) {
      renderBulkMessagesBuilder();
      return;
    }
    const blob = new Blob(chunks, { type: recorder?.mimeType || "audio/webm" });
    const file = new File([blob], `audio-${Date.now()}.${blob.type.includes("ogg") ? "ogg" : "webm"}`, {
      type: blob.type || "audio/webm",
    });
    const dataUrl = await fileToDataUrl(file);
    const asset = bulkMessagesDraft[target.blockIndex]?.assets?.[target.assetIndex];
    if (asset) {
      asset.file_base64 = dataUrl;
      asset.mimetype = file.type || blob.type || "audio/webm";
      asset.file_name = file.name;
    }
    renderBulkMessagesBuilder();
  });

  bulkAudioRecorder.start();
  renderBulkMessagesBuilder();
}

function stopBulkAudioRecording() {
  if (bulkAudioRecorder && bulkAudioRecorder.state === "recording") {
    bulkAudioRecorder.stop();
  }
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
      const allAudios = document.querySelectorAll(".msg-audio-native");
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
    validateUploadFileSize(file);
    const dataUrl = await fileToDataUrl(file);
    await api("/messages/send-media", {
      method: "POST",
      body: JSON.stringify({
        conversation_id: state.selectedConversation.id,
        phone: getConversationPhone(state.selectedConversation),
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

function getConversationRenderSignature(conv) {
  return JSON.stringify({
    id: conv.id,
    selected: conv.id === state.selectedConversationId,
    displayName: conversationDisplayName(conv),
    avatar: String(conv.avatar_url || ""),
    preview: String(conv.last_message_preview || ""),
    time: String(conv.last_message_at || conv.updated_at || ""),
    unread: Number(conv.unread_count || 0),
    bulk: Boolean(conv.bulk_initiated) && String(conv.service_status || "") !== "in_progress",
    serviceStatus: String(conv.service_status || ""),
    assignedUserId: String(conv.assigned_user_id || ""),
    assignedUserName: String(conv.assigned_user_name || ""),
    aiAgentEnabled: Boolean(conv.ai_agent_enabled),
    aiTransferPending: Boolean(conv.ai_transfer_pending),
    aiTransferReason: String(conv.ai_transfer_reason || ""),
  });
}

function buildConversationNode(conv) {
  const node = conversationItemTpl.content.firstElementChild.cloneNode(true);
  node.dataset.id = conv.id;
  node.addEventListener("click", () => selectConversation(conv.id));
  node.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openConversationMenu(conv.id, event.clientX, event.clientY);
  });
  return node;
}

function patchConversationNode(node, conv) {
  node.dataset.id = conv.id;
  node.classList.toggle("active", conv.id === state.selectedConversationId);

  const displayName = conversationDisplayName(conv);
  applyAvatar(node.querySelector(".avatar"), conv);
  const nameEl = node.querySelector(".name");
  nameEl.textContent = displayName;

  const showBulkAlert = Boolean(conv.bulk_initiated) && String(conv.service_status || "") !== "in_progress";
  const showAiTransferAlert = Boolean(conv.ai_transfer_pending) && String(conv.service_status || "") === "pending";
  if (showBulkAlert) {
    node.classList.add("bulk-chat");
    const icon = document.createElement("span");
    icon.className = "bulk-alert-icon";
    icon.textContent = "!";
    nameEl.prepend(icon);
  } else {
    node.classList.remove("bulk-chat");
  }
  node.classList.toggle("ai-transfer-chat", showAiTransferAlert);
  if (showAiTransferAlert) {
    const icon = document.createElement("span");
    icon.className = "bulk-alert-icon ai-transfer-icon";
    icon.textContent = "!";
    nameEl.prepend(icon);
  }

  node.querySelector(".time").textContent = fmtDateShort(conv.last_message_at || conv.updated_at);
  const previewEl = node.querySelector(".preview");
  previewEl.textContent = conv.last_message_preview || "Sem mensagens";
  if (showAiTransferAlert) {
    previewEl.textContent = String(conv.ai_transfer_reason || "").trim() || previewEl.textContent;
  }

  const oldAttendant = node.querySelector(".conversation-attendant");
  if (oldAttendant) oldAttendant.remove();
  node.classList.remove("conversation-item-ai", "conversation-item-human");

  const aiInCharge =
    Boolean(conv.ai_agent_enabled) &&
    String(conv.service_status || "") === "in_progress" &&
    !String(conv.assigned_user_id || "").trim();
  const attendantName = aiInCharge ? "Agente IA" : String(conv.assigned_user_name || "").trim();
  if (String(conv.service_status || "") === "in_progress" && attendantName) {
    const attendant = document.createElement("div");
    attendant.className = "conversation-attendant";
    attendant.innerHTML = aiInCharge
      ? '<i class="bi bi-robot"></i><span>Agente IA</span>'
      : `<i class="bi bi-person-workspace"></i><span>${attendantName}</span>`;
    attendant.classList.toggle("is-ai", aiInCharge);
    attendant.classList.toggle("is-human", !aiInCharge);
    node.classList.toggle("conversation-item-ai", aiInCharge);
    node.classList.toggle("conversation-item-human", !aiInCharge && String(conv.service_status || "") === "in_progress");
    node.querySelector(".conversation-body").appendChild(attendant);
  }

  const badge = node.querySelector(".badge");
  if (Number(conv.unread_count) > 0) {
    badge.textContent = String(conv.unread_count);
    badge.classList.add("show");
  } else {
    badge.textContent = "";
    badge.classList.remove("show");
  }
}

function renderConversations() {
  const orderedConversations = [...state.conversations].sort((a, b) => {
    const aTime = new Date(a.last_message_at || a.updated_at || a.created_at || 0).getTime();
    const bTime = new Date(b.last_message_at || b.updated_at || b.created_at || 0).getTime();
    if (aTime !== bTime) {
      return bTime - aTime;
    }

    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  if (orderedConversations.length === 0) {
    conversationNodeCache.clear();
    conversationListEl.innerHTML = '<div class="empty-state">Nenhuma conversa encontrada.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  const visibleIds = new Set();

  for (const conv of orderedConversations) {
    visibleIds.add(conv.id);
    const signature = getConversationRenderSignature(conv);
    let cached = conversationNodeCache.get(conv.id);
    if (!cached) {
      cached = { node: buildConversationNode(conv), signature: "" };
      conversationNodeCache.set(conv.id, cached);
    }
    if (cached.signature !== signature) {
      patchConversationNode(cached.node, conv);
      cached.signature = signature;
    }
    fragment.appendChild(cached.node);
  }

  for (const id of Array.from(conversationNodeCache.keys())) {
    if (!visibleIds.has(id)) {
      conversationNodeCache.delete(id);
    }
  }

  conversationListEl.replaceChildren(fragment);
}

function getConversationQueryState() {
  return {
    accountJid: getActiveAccountJid(),
    search: String(state.search || "").trim(),
    showAllChats: Boolean(state.showAllChats),
    serviceTab: String(state.serviceTab || "pending"),
  };
}

function getConversationCacheKey(queryState = getConversationQueryState()) {
  return JSON.stringify(queryState);
}

function getCachedConversations(queryState = getConversationQueryState()) {
  const key = getConversationCacheKey(queryState);
  const entry = state.conversationCache[key];
  if (!entry) return null;
  if (Date.now() - Number(entry.at || 0) > CONVERSATION_CACHE_TTL_MS) {
    delete state.conversationCache[key];
    return null;
  }
  return Array.isArray(entry.items) ? entry.items.map((item) => ({ ...item })) : null;
}

function setCachedConversations(items, queryState = getConversationQueryState()) {
  const key = getConversationCacheKey(queryState);
  state.conversationCache[key] = {
    at: Date.now(),
    items: Array.isArray(items) ? items.map((item) => ({ ...item })) : [],
  };
}

function invalidateConversationCache() {
  state.conversationCache = {};
}

function invalidateConversationSummaryCache() {
  conversationSummaryPromise = null;
  conversationSummaryCacheKey = "";
  conversationSummaryCacheAt = 0;
}

function renderMessagesLoading() {
  messagesAreaEl.innerHTML = '<div class="empty-state">Carregando mensagens...</div>';
}

function getMessageCursor(message) {
  return String(message?.sent_at || message?.created_at || "").trim();
}

function updateCurrentMessagesPagination(messages, limit, conversationId) {
  const orderedMessages = getOrderedMessages(messages);
  state.currentMessagesConversationId = String(conversationId || state.selectedConversationId || "").trim();
  state.currentMessagesOldestCursor = orderedMessages.length ? getMessageCursor(orderedMessages[0]) : "";
  state.currentMessagesHasOlder = orderedMessages.length >= Number(limit || INITIAL_MESSAGES_PAGE_SIZE);
}

function mergeMessages(existingItems, incomingItems) {
  const mergedMap = new Map();
  for (const item of Array.isArray(existingItems) ? existingItems : []) {
    if (item?.id) mergedMap.set(item.id, item);
  }
  for (const item of Array.isArray(incomingItems) ? incomingItems : []) {
    if (!item?.id) continue;
    const previous = mergedMap.get(item.id) || {};
    mergedMap.set(item.id, { ...previous, ...item });
  }
  return getOrderedMessages(Array.from(mergedMap.values()));
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

async function loadConversationSummary(options = {}) {
  const force = Boolean(options.force);
  const activeAccountJid = getActiveAccountJid();
  if (!state.isAuthenticated || !activeAccountJid) {
    state.serviceCounts = { pending: 0, in_progress: 0, finalized: 0, bulk: 0 };
    renderServiceTabs();
    return;
  }

  const summaryKey = String(activeAccountJid || "").trim();
  const withinCacheTtl =
    !force &&
    conversationSummaryCacheKey === summaryKey &&
    Date.now() - conversationSummaryCacheAt < SUMMARY_CACHE_TTL_MS;
  if (withinCacheTtl) {
    renderServiceTabs();
    return;
  }
  if (conversationSummaryPromise && !force && conversationSummaryCacheKey === summaryKey) {
    await conversationSummaryPromise;
    renderServiceTabs();
    return;
  }

  conversationSummaryCacheKey = summaryKey;
  conversationSummaryPromise = (async () => {
    const query = new URLSearchParams();
    query.set("account_jid", activeAccountJid);
    const result = await api(`/conversations/summary?${query.toString()}`);
    state.serviceCounts = {
      pending: Number(result?.pending_count || 0),
      in_progress: Number(result?.in_progress_count || 0),
      finalized: Number(result?.finalized_count || 0),
      bulk: Number(result?.bulk_count || 0),
    };
    conversationSummaryCacheAt = Date.now();
  })().finally(() => {
    conversationSummaryPromise = null;
  });

  await conversationSummaryPromise;
  renderServiceTabs();
}

function canCurrentUserSendInConversation(conv) {
  if (!state.currentUser || !conv) return false;
  return conv.service_status === "in_progress" && conv.assigned_user_id === state.currentUser.id;
}

function isAiInChargeConversation(conv) {
  if (!conv) return false;
  return (
    String(conv.service_status || "pending") === "in_progress" &&
    Boolean(conv.ai_agent_enabled) &&
    !String(conv.assigned_user_id || "").trim()
  );
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
    if (isAiInChargeConversation(state.selectedConversation)) {
      await maybeClaimSelectedConversation();
      const refreshedAfterClaim =
        state.conversations.find((item) => item.id === state.selectedConversationId) || state.selectedConversation;
      state.selectedConversation = refreshedAfterClaim;
      renderHeader();
      return canCurrentUserSendInConversation(state.selectedConversation);
    }
    const responsible =
      state.selectedConversation.ai_agent_enabled && !state.selectedConversation.assigned_user_id
        ? "Agente IA"
        : state.selectedConversation.assigned_user_name || "outro atendente";
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
    updateChatTypingIndicator();
    renderMobileChrome();
    updateComposerLock();
    return;
  }

  const name = conversationDisplayName(state.selectedConversation);
  const resolvedConversationPhone = getConversationPhone(state.selectedConversation);
  const phone = formatPhone(resolvedConversationPhone) || resolvedConversationPhone || "-";
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

  const isTyping = Boolean(state.typingConversations?.[String(state.selectedConversation.id || "").trim()]);
  if (isTyping) {
    const typingEl = document.createElement("div");
    typingEl.className = "chat-contact-typing";
    typingEl.textContent = "digitando...";
    info.appendChild(typingEl);
  }
  wrap.appendChild(avatar);
  wrap.appendChild(info);
  chatHeaderEl.appendChild(wrap);

  const actions = document.createElement("div");
  actions.className = "chat-header-actions";

  const status = String(state.selectedConversation.service_status || "pending");
  const aiInCharge = isAiInChargeConversation(state.selectedConversation);
  const assignedName = aiInCharge ? "Agente IA" : state.selectedConversation.assigned_user_name || "";
  const isMobileHeader = isMobileViewport();
  const isMine = canCurrentUserSendInConversation(state.selectedConversation);
  const canTransfer = Boolean(
    state.currentUser &&
      (isAdmin() || isMine || aiInCharge) &&
      status === "in_progress",
  );

  const statusText =
      status === "in_progress"
      ? assignedName
        ? `Atendente: ${assignedName}`
        : "Em atendimento"
      : status === "finalized"
        ? "Finalizado"
        : "Pendente";

  if (isMobileHeader) {
    const attendantEl = document.createElement("div");
    attendantEl.className = "chat-contact-attendant";
    attendantEl.textContent = statusText;
    info.appendChild(attendantEl);
  } else {
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
  }

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
  updateChatTypingIndicator();
  renderMobileChrome();
  updateComposerLock();
}

function updateChatTypingIndicator() {
  if (!chatTypingDockEl) return;

  const selectedConversationId = String(state.selectedConversation?.id || state.selectedConversationId || "").trim();
  const isTyping = Boolean(selectedConversationId && state.typingConversations?.[selectedConversationId]);

  chatTypingDockEl.hidden = !isTyping;
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

function isMessagesAreaNearBottom(threshold = 80) {
  const distance = messagesAreaEl.scrollHeight - messagesAreaEl.scrollTop - messagesAreaEl.clientHeight;
  return distance <= threshold;
}

function scheduleStickMessagesToBottom() {
  requestAnimationFrame(() => {
    messagesAreaEl.scrollTop = messagesAreaEl.scrollHeight;
  });
}

function getOrderedMessages(messages) {
  return [...(Array.isArray(messages) ? messages : [])].sort((a, b) => {
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
}

function getMessageDateKey(message) {
  const messageDate = new Date(message?.sent_at || message?.created_at || Date.now());
  if (Number.isNaN(messageDate.getTime())) return "";
  return `${messageDate.getFullYear()}-${messageDate.getMonth()}-${messageDate.getDate()}`;
}

function createMessageDateDivider(message) {
  const dividerRow = document.createElement("div");
  dividerRow.className = "msg-date-divider-row";
  dividerRow.dataset.dateKey = getMessageDateKey(message);

  const divider = document.createElement("div");
  divider.className = "msg-date-divider";
  divider.textContent = fmtDateDivider(message.sent_at || message.created_at);

  dividerRow.appendChild(divider);
  return dividerRow;
}

function createMessageRow(message, options = {}) {
  const preservedAudio = options.preservedAudio || null;
  const shouldStickToBottom = Boolean(options.shouldStickToBottom);
  const row = document.createElement("div");
  row.className = `msg-row ${message.from_me ? "outbound" : "inbound"}`;
  row.dataset.messageId = String(message.id || "");

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  const mediaType = String(message?.metadata?.media_type || "");
  const mimeType = String(message?.metadata?.mime_type || "");
  const imageUrl =
    message?.metadata?.image_preview_url ||
    ((mediaType === "image" || mimeType.startsWith("image/")) ? message?.metadata?.file_url || "" : "");
  const videoUrl =
    message?.metadata?.video_url || ((mediaType === "video" || mimeType.startsWith("video/")) ? message?.metadata?.file_url || "" : "");
  const videoPreviewUrl = message?.metadata?.video_preview_url || message?.metadata?.image_preview_url || "";
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
  const quotedBody = String(message?.metadata?.quoted_body || "").trim();

  if (quotedBody) {
    const quoted = document.createElement("div");
    quoted.className = "msg-quoted";

    const quotedTitle = document.createElement("div");
    quotedTitle.className = "msg-quoted-title";
    quotedTitle.textContent = message.from_me ? "Você respondeu" : "Mensagem marcada";

    const quotedText = document.createElement("div");
    quotedText.className = "msg-quoted-text";
    quotedText.textContent = quotedBody.length > 180 ? `${quotedBody.slice(0, 177)}...` : quotedBody;

    quoted.appendChild(quotedTitle);
    quoted.appendChild(quotedText);
    bubble.appendChild(quoted);
  }

  if (imageUrl) {
    const img = document.createElement("img");
    img.className = "msg-image";
    img.src = imageUrl;
    img.alt = "Imagem recebida";
    img.loading = "lazy";
    if (shouldStickToBottom) {
      img.addEventListener("load", scheduleStickMessagesToBottom, { once: true });
    }
    img.addEventListener("click", () => {
      openMediaModal("image", imageUrl);
    });
    bubble.appendChild(img);
  }

  if (videoUrl) {
    const videoWrap = document.createElement("button");
    videoWrap.type = "button";
    videoWrap.className = "msg-video-wrap";
    const preview = document.createElement(videoPreviewUrl ? "img" : "div");
    preview.className = "msg-video";
    if (videoPreviewUrl) {
      preview.src = videoPreviewUrl;
      preview.alt = "Video recebido";
      preview.loading = "lazy";
      if (shouldStickToBottom) {
        preview.addEventListener("load", scheduleStickMessagesToBottom, { once: true });
      }
    } else {
      preview.classList.add("is-placeholder");
    }

    const playBadge = document.createElement("span");
    playBadge.className = "msg-video-play";
    playBadge.innerHTML = '<i class="bi bi-play-fill"></i>';

    videoWrap.appendChild(preview);
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
  return row;
}

function appendMessageToDOM(message, previousLastMessage = null) {
  const shouldStickToBottom = isMessagesAreaNearBottom();
  const emptyState = messagesAreaEl.querySelector(".empty-state");
  if (emptyState) {
    messagesAreaEl.innerHTML = "";
  }

  const previousDateKey = previousLastMessage ? getMessageDateKey(previousLastMessage) : "";
  const nextDateKey = getMessageDateKey(message);
  if (nextDateKey && nextDateKey !== previousDateKey) {
    messagesAreaEl.appendChild(createMessageDateDivider(message));
  }

  const row = createMessageRow(message, {
    preservedAudio: captureActiveAudioState(),
    shouldStickToBottom,
  });
  messagesAreaEl.appendChild(row);

  if (shouldStickToBottom) {
    messagesAreaEl.scrollTop = messagesAreaEl.scrollHeight;
  }
}

function renderMessages(messages) {
  const preservedAudio = captureActiveAudioState();
  const previousScrollHeight = messagesAreaEl.scrollHeight;
  const previousScrollTop = messagesAreaEl.scrollTop;
  const distanceFromBottom = previousScrollHeight - previousScrollTop - messagesAreaEl.clientHeight;
  const shouldStickToBottom = isMessagesAreaNearBottom();
  messagesAreaEl.innerHTML = "";

  if (!messages || messages.length === 0) {
    messagesAreaEl.innerHTML = '<div class="empty-state">Sem mensagens nesta conversa.</div>';
    return;
  }

  const orderedMessages = getOrderedMessages(messages);

  let lastDateKey = "";
  for (const message of orderedMessages) {
    const messageDateKey = getMessageDateKey(message);

    if (messageDateKey && messageDateKey !== lastDateKey) {
      lastDateKey = messageDateKey;
      messagesAreaEl.appendChild(createMessageDateDivider(message));
    }

    messagesAreaEl.appendChild(
      createMessageRow(message, {
        preservedAudio,
        shouldStickToBottom,
      }),
    );
  }

  if (shouldStickToBottom) {
    messagesAreaEl.scrollTop = messagesAreaEl.scrollHeight;
  } else if (previousScrollHeight > 0) {
    const nextScrollTop = Math.max(0, messagesAreaEl.scrollHeight - messagesAreaEl.clientHeight - distanceFromBottom);
    messagesAreaEl.scrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : previousScrollTop;
  }
}

function renderInternalChatContacts() {
  if (!internalChatContactsListEl) return;
  const contacts = Array.isArray(state.internalChatContacts) ? state.internalChatContacts : [];
  internalChatContactsListEl.innerHTML = "";

  if (state.internalChatLoading) {
    internalChatContactsListEl.innerHTML = '<div class="empty-state">Carregando atendentes...</div>';
    return;
  }

  if (!contacts.length) {
    internalChatContactsListEl.innerHTML = '<div class="empty-state">Nenhum outro atendente cadastrado nesta empresa.</div>';
    return;
  }

  for (const contact of contacts) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `internal-contact-item${contact.thread_id === state.selectedInternalThreadId ? " active" : ""}`;
    const initials = String(contact.name || contact.username || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "?";
    const metaParts = [contact.sector_name, contact.role].filter(Boolean);
    const preview = String(contact.last_message_preview || "").trim() || "Clique para conversar internamente";
    item.innerHTML = `
      <span class="internal-contact-avatar">${escapeHtml(initials)}</span>
      <span class="internal-contact-main">
        <strong>${escapeHtml(contact.name || contact.username || "Atendente")}</strong>
        <small>${escapeHtml(metaParts.join(" · ") || contact.username || "Atendente")}</small>
        <em>${escapeHtml(preview)}</em>
      </span>
      <span class="internal-contact-time">${escapeHtml(fmtTime(contact.last_message_at || ""))}</span>
    `;
    item.addEventListener("click", () => selectInternalContact(contact.user_id).catch((error) => console.error(error)));
    internalChatContactsListEl.appendChild(item);
  }
}

function renderInternalUnreadBadge() {
  if (!railInternalChatEl) return;
  let badge = railInternalChatEl.querySelector(".rail-badge");
  const count = Number(state.internalUnreadCount || 0);
  if (count <= 0) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "rail-badge";
    railInternalChatEl.appendChild(badge);
  }
  badge.textContent = count > 99 ? "99+" : String(count);
}

async function loadInternalUnreadSummary() {
  if (!state.isAuthenticated) return;
  const data = await api("/internal-chat/unread-summary");
  state.internalUnreadCount = Number(data?.unread_count || 0);
  renderInternalUnreadBadge();
}

function renderInternalChatHeader() {
  if (!internalChatRoomHeaderEl || !internalMessageInputEl || !internalSendBtnEl) return;
  const contact = state.selectedInternalContact;
  if (!contact) {
    internalChatRoomHeaderEl.innerHTML = `
      <div>
        <strong>Selecione um atendente</strong>
        <span>As mensagens ficam somente dentro da empresa.</span>
      </div>
    `;
    internalMessageInputEl.disabled = true;
    internalSendBtnEl.disabled = true;
    if (internalAudioBtnEl) internalAudioBtnEl.disabled = true;
    return;
  }

  internalChatRoomHeaderEl.innerHTML = `
    <div class="internal-chat-peer">
      <span class="internal-contact-avatar small">${escapeHtml(
        String(contact.name || contact.username || "?")
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() || "")
          .join("") || "?",
      )}</span>
      <div>
        <strong>${escapeHtml(contact.name || contact.username || "Atendente")}</strong>
        <span>${escapeHtml([contact.sector_name, contact.role].filter(Boolean).join(" · ") || "Chat interno")}</span>
      </div>
    </div>
  `;
  internalMessageInputEl.disabled = false;
  internalSendBtnEl.disabled = false;
  if (internalAudioBtnEl) internalAudioBtnEl.disabled = false;
}

function renderInternalMessages() {
  if (!internalMessagesAreaEl) return;
  internalMessagesAreaEl.innerHTML = "";

  if (!state.selectedInternalContact) {
    internalMessagesAreaEl.innerHTML = '<div class="empty-state">Escolha um atendente para iniciar uma conversa interna.</div>';
    return;
  }

  const messages = Array.isArray(state.internalMessages) ? state.internalMessages : [];
  if (!messages.length) {
    internalMessagesAreaEl.innerHTML = '<div class="empty-state">Nenhuma mensagem interna ainda. Envie a primeira.</div>';
    return;
  }

  let lastDateKey = "";
  for (const message of getOrderedMessages(messages)) {
    const normalized = {
      ...message,
      from_me: String(message.sender_user_id || "") === String(state.currentUser?.id || ""),
      body: message.body || "",
      sent_at: message.created_at,
      metadata: message.metadata || {},
    };
    const messageDateKey = getMessageDateKey(normalized);
    if (messageDateKey && messageDateKey !== lastDateKey) {
      lastDateKey = messageDateKey;
      internalMessagesAreaEl.appendChild(createMessageDateDivider(normalized));
    }
    internalMessagesAreaEl.appendChild(createMessageRow(normalized));
  }
  internalMessagesAreaEl.scrollTop = internalMessagesAreaEl.scrollHeight;
  loadInternalUnreadSummary().catch((error) => console.error(error));
}

async function loadInternalChatContacts(options = {}) {
  if (!internalChatContactsListEl) return;
  const showLoading = options.showLoading !== false;
  if (showLoading) {
    state.internalChatLoading = true;
    renderInternalChatContacts();
  }
  try {
    const data = await api("/internal-chat/contacts");
    state.internalChatContacts = Array.isArray(data.items) ? data.items : [];
    if (state.selectedInternalThreadId) {
      state.selectedInternalContact =
        state.internalChatContacts.find((contact) => contact.thread_id === state.selectedInternalThreadId) || state.selectedInternalContact;
    }
  } finally {
    if (showLoading) {
      state.internalChatLoading = false;
    }
    renderInternalChatContacts();
    renderInternalChatHeader();
  }
}

async function selectInternalContact(userId) {
  const contact = state.internalChatContacts.find((item) => item.user_id === userId);
  if (!contact) return;
  state.selectedInternalContact = contact;
  const data = await api(`/internal-chat/threads/with/${encodeURIComponent(userId)}`, { method: "POST" });
  state.selectedInternalThreadId = data.thread?.id || contact.thread_id || "";
  state.selectedInternalContact = { ...contact, thread_id: state.selectedInternalThreadId };
  renderInternalChatContacts();
  renderInternalChatHeader();
  await loadInternalMessages();
  internalMessageInputEl?.focus();
}

async function loadInternalMessages() {
  if (!state.selectedInternalThreadId) {
    state.internalMessages = [];
    renderInternalMessages();
    return;
  }
  const data = await api(`/internal-chat/threads/${encodeURIComponent(state.selectedInternalThreadId)}/messages?limit=120`);
  state.internalMessages = Array.isArray(data.items) ? data.items : [];
  renderInternalMessages();
}

async function sendInternalMessage(body) {
  const message = String(body || "").trim();
  if (!message || !state.selectedInternalThreadId) return;
  const data = await api(`/internal-chat/threads/${encodeURIComponent(state.selectedInternalThreadId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: message }),
  });
  if (data.message) {
    state.internalMessages = [...(state.internalMessages || []), data.message];
    renderInternalMessages();
    await loadInternalChatContacts({ showLoading: false }).catch((error) => console.error(error));
    await loadInternalUnreadSummary().catch((error) => console.error(error));
  }
}

function resetInternalAudioButton() {
  if (!internalAudioBtnEl) return;
  internalAudioBtnEl.classList.remove("recording");
  internalAudioBtnEl.innerHTML = '<i class="bi bi-mic-fill"></i>';
  internalAudioBtnEl.title = "Gravar audio";
  internalAudioBtnEl.disabled = !state.selectedInternalThreadId;
}

function stopInternalAudioTracks() {
  if (internalAudioStream) {
    internalAudioStream.getTracks().forEach((track) => track.stop());
    internalAudioStream = null;
  }
}

async function startInternalAudioRecording() {
  if (!state.selectedInternalThreadId || !internalAudioBtnEl) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    await showAlert("Este navegador nao liberou gravacao de audio.");
    return;
  }
  internalAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  internalAudioChunks = [];
  internalAudioRecorder = new MediaRecorder(internalAudioStream);
  internalAudioRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      internalAudioChunks.push(event.data);
    }
  };
  internalAudioRecorder.onstop = () => {
    const mimeType = internalAudioRecorder?.mimeType || "audio/webm";
    const blob = new Blob(internalAudioChunks, { type: mimeType });
    internalAudioChunks = [];
    stopInternalAudioTracks();
    resetInternalAudioButton();
    if (blob.size > 0) {
      sendInternalAudioBlob(blob, mimeType).catch((error) => {
        console.error(error);
        showAlert(error.message || "Falha ao enviar audio interno.").catch(() => undefined);
      });
    }
  };
  internalAudioRecorder.start();
  internalAudioBtnEl.classList.add("recording");
  internalAudioBtnEl.innerHTML = '<i class="bi bi-stop-fill"></i>';
  internalAudioBtnEl.title = "Parar e enviar audio";
}

function stopInternalAudioRecording() {
  if (internalAudioRecorder && internalAudioRecorder.state === "recording") {
    internalAudioRecorder.stop();
    return true;
  }
  return false;
}

async function sendInternalAudioBlob(blob, mimeType = "audio/webm") {
  if (!blob || !state.selectedInternalThreadId) return;
  const extension = String(mimeType || "").includes("ogg") ? "ogg" : String(mimeType || "").includes("mp4") ? "m4a" : "webm";
  const audioBase64 = await fileToDataUrl(new File([blob], `audio-interno.${extension}`, { type: mimeType }));
  const data = await api(`/internal-chat/threads/${encodeURIComponent(state.selectedInternalThreadId)}/audio`, {
    method: "POST",
    body: JSON.stringify({
      audio_base64: audioBase64,
      mimetype: mimeType,
      file_name: `audio-interno.${extension}`,
    }),
  });
  if (data.message) {
    state.internalMessages = [...(state.internalMessages || []), data.message];
    renderInternalMessages();
    await loadInternalChatContacts({ showLoading: false }).catch((error) => console.error(error));
    await loadInternalUnreadSummary().catch((error) => console.error(error));
  }
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
    loadConversations({ skipMessagesReload: true }).catch((error) => console.error(error));
  }, 120);
}

function queueMessageRefresh() {
  if (messageRefreshTimer) return;
  messageRefreshTimer = setTimeout(() => {
    messageRefreshTimer = null;
    loadMessages({ refreshLatest: true }).catch((error) => console.error(error));
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
  const orderedBefore = getOrderedMessages(current);
  const lastBefore = orderedBefore.length ? orderedBefore[orderedBefore.length - 1] : null;
  const index = current.findIndex((item) => item.id === message.id);
  if (index >= 0) {
    current[index] = { ...current[index], ...message };
    state.currentMessages = getOrderedMessages(current);
    renderMessages(state.currentMessages);
    return;
  }

  current.push(message);
  const orderedAfter = getOrderedMessages(current);
  state.currentMessages = orderedAfter;

  const newLast = orderedAfter.length ? orderedAfter[orderedAfter.length - 1] : null;
  const canAppendOnly =
    Boolean(newLast) &&
    newLast.id === message.id &&
    orderedBefore.length + 1 === orderedAfter.length &&
    orderedAfter.slice(0, -1).every((item, idx) => item.id === orderedBefore[idx]?.id);

  if (canAppendOnly) {
    appendMessageToDOM(message, lastBefore);
    return;
  }

  renderMessages(state.currentMessages);
}

function handleRealtimePayload(payload, eventType = "message_saved") {
  if (!payload) return;

  if (eventType === "conversation_typing") {
    const conversationId = String(payload.conversationId || "").trim();
    if (!conversationId) return;
    const active = Boolean(payload.active);
    if (conversationTypingTimers.has(conversationId)) {
      clearTimeout(conversationTypingTimers.get(conversationId));
      conversationTypingTimers.delete(conversationId);
    }
    if (active) {
      state.typingConversations[conversationId] = true;
      conversationTypingTimers.set(
        conversationId,
        setTimeout(() => {
          delete state.typingConversations[conversationId];
          conversationTypingTimers.delete(conversationId);
          if (state.selectedConversationId === conversationId) {
            renderHeader();
            updateChatTypingIndicator();
          }
        }, 6000),
      );
    } else {
      delete state.typingConversations[conversationId];
    }
    if (state.selectedConversationId === conversationId) {
      renderHeader();
      updateChatTypingIndicator();
    }
    return;
  }

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
      if (payload.message && eventType === "message_saved") {
        upsertRealtimeMessage(payload.message);
      } else {
        queueMessageRefresh();
      }
    }
    queueConversationRefresh();
  }
}

function clearChatStateForDisconnected() {
  invalidateConversationCache();
  invalidateConversationSummaryCache();
  state.conversations = [];
  state.currentMessages = [];
  state.currentMessagesHasOlder = false;
  state.currentMessagesOldestCursor = "";
  state.currentMessagesConversationId = "";
  state.loadingOlderMessages = false;
  state.selectedConversationId = null;
  state.selectedConversation = null;
  state.loadingConversations = false;
  state.loadingMessages = false;
  state.typingConversations = {};
  state.serviceCounts = { pending: 0, in_progress: 0, finalized: 0, bulk: 0 };
  for (const timer of conversationTypingTimers.values()) {
    clearTimeout(timer);
  }
  conversationTypingTimers.clear();
  realtimeCursor = 0;
  state.realtimeCheckpointToken = "";
  closeConversationMenu();
  closeRealtime();
  renderConversations();
  renderServiceTabs();
  renderHeader();
  updateChatTypingIndicator();
  messagesAreaEl.innerHTML = '<div class="empty-state">Conecte o WhatsApp para ver conversas.</div>';
  updateComposerAction();
  updateComposerLock();
}

function ensureRealtimeWatchdog() {
  if (realtimeWatchdogTimer) return;
  realtimeWatchdogTimer = setInterval(() => {
    if (!realtimePolling || !state.isAuthenticated || !getActiveAccountJid()) return;
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
    const activeAccountJid = getActiveAccountJid();
    if (!state.isAuthenticated || !activeAccountJid || state.currentView !== "chats") return;
    try {
      const query = new URLSearchParams({
        account_jid: activeAccountJid,
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
  if (!getActiveAccountJid()) {
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

  while (realtimePolling && pollToken === realtimePollToken && state.isAuthenticated && getActiveAccountJid()) {
    const activeAccountJid = getActiveAccountJid();
    const query = new URLSearchParams({
      account_jid: activeAccountJid,
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

async function loadConversations(options = {}) {
  const skipMessagesReload = Boolean(options.skipMessagesReload);
  const preferCache = Boolean(options.preferCache);
  const backgroundRefresh = Boolean(options.backgroundRefresh);
  const deferMessagesReload = Boolean(options.deferMessagesReload);
  if (!state.isAuthenticated) return;
  const activeAccountJid = getActiveAccountJid();
  if (!activeAccountJid) {
    clearChatStateForDisconnected();
    return;
  }

  if (state.loadingConversations) return;

  const queryState = getConversationQueryState();
  const cachedItems = preferCache ? getCachedConversations(queryState) : null;
  if (cachedItems) {
    state.conversations = cachedItems;
    const selectedExists = state.conversations.find((item) => item.id === state.selectedConversationId) || null;

    if (selectedExists) {
      state.selectedConversation = selectedExists;
      if (!skipMessagesReload && deferMessagesReload) {
        state.currentMessages = [];
        state.currentMessagesHasOlder = false;
        state.currentMessagesOldestCursor = "";
        state.currentMessagesConversationId = String(state.selectedConversationId || "").trim();
        renderMessagesLoading();
        void loadMessages().catch((error) => console.error(error));
      } else if (!skipMessagesReload) {
        await loadMessages();
      }
    } else if (state.conversations.length > 0) {
      state.selectedConversationId = state.conversations[0].id;
      state.selectedConversation = state.conversations[0];
      if (deferMessagesReload) {
        state.currentMessages = [];
        state.currentMessagesHasOlder = false;
        state.currentMessagesOldestCursor = "";
        state.currentMessagesConversationId = String(state.selectedConversationId || "").trim();
        renderMessagesLoading();
        void loadMessages().catch((error) => console.error(error));
      } else {
        await loadMessages();
      }
    } else {
      state.selectedConversationId = null;
      state.selectedConversation = null;
      state.currentMessages = [];
      renderMessages([]);
    }

    renderConversations();
    renderHeader();
    renderServiceTabs();

    if (backgroundRefresh) {
      setTimeout(() => {
        loadConversations({
          skipMessagesReload: true,
          preferCache: false,
          backgroundRefresh: false,
          deferMessagesReload: false,
        }).catch((error) => console.error(error));
      }, 0);
    }
    return;
  }

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
    if (activeAccountJid) {
      query.set("account_jid", activeAccountJid);
    }

    const result = await api(`/conversations?${query.toString()}`);
    state.conversations = result.items || [];
    setCachedConversations(state.conversations, queryState);
    await loadConversationSummary();

    const selectedExists = state.conversations.find((item) => item.id === state.selectedConversationId) || null;

    if (selectedExists) {
      state.selectedConversation = selectedExists;
      if (!skipMessagesReload) {
        if (deferMessagesReload) {
          state.currentMessages = [];
          state.currentMessagesHasOlder = false;
          state.currentMessagesOldestCursor = "";
          state.currentMessagesConversationId = String(state.selectedConversationId || "").trim();
          renderMessagesLoading();
          void loadMessages().catch((error) => console.error(error));
        } else {
          await loadMessages();
        }
      }
    } else if (state.conversations.length > 0) {
      state.selectedConversationId = state.conversations[0].id;
      state.selectedConversation = state.conversations[0];
      if (deferMessagesReload) {
        state.currentMessages = [];
        state.currentMessagesHasOlder = false;
        state.currentMessagesOldestCursor = "";
        state.currentMessagesConversationId = String(state.selectedConversationId || "").trim();
        renderMessagesLoading();
        void loadMessages().catch((error) => console.error(error));
      } else {
        await loadMessages();
      }
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

async function loadMessages(options = {}) {
  if (typeof options === "string") {
    options = { conversationId: options, refreshLatest: true };
  }
  if (!state.isAuthenticated || !getActiveAccountJid() || !state.selectedConversationId) return;

  const appendOlder = Boolean(options.appendOlder);
  const refreshLatest = Boolean(options.refreshLatest);
  const targetConversationId = String(options.conversationId || state.selectedConversationId || "").trim();
  if (!targetConversationId) return;

  if (appendOlder) {
    if (state.loadingOlderMessages || !state.currentMessagesHasOlder) {
      return;
    }
  } else if (state.loadingMessages) {
    pendingMessagesRefresh = true;
    return;
  }

  if (appendOlder) {
    state.loadingOlderMessages = true;
  } else {
    state.loadingMessages = true;
  }

  const previousScrollHeight = messagesAreaEl.scrollHeight;
  const previousScrollTop = messagesAreaEl.scrollTop;

  try {
    const query = new URLSearchParams();
    const limit = appendOlder ? OLDER_MESSAGES_PAGE_SIZE : INITIAL_MESSAGES_PAGE_SIZE;
    query.set("limit", String(limit));
    if (appendOlder && state.currentMessagesOldestCursor) {
      query.set("before", state.currentMessagesOldestCursor);
    }

    const result = await api(`/conversations/${targetConversationId}/messages?${query.toString()}`);
    if (targetConversationId !== state.selectedConversationId) {
      return;
    }

    const incomingItems = Array.isArray(result.items) ? result.items : [];

    if (appendOlder) {
      const merged = mergeMessages(incomingItems, state.currentMessages);
      state.currentMessages = merged;
      state.currentMessagesConversationId = targetConversationId;
      state.currentMessagesOldestCursor = merged.length ? getMessageCursor(merged[0]) : "";
      state.currentMessagesHasOlder = incomingItems.length >= limit;
      renderMessages(state.currentMessages);

      requestAnimationFrame(() => {
        const nextScrollTop = messagesAreaEl.scrollHeight - previousScrollHeight + previousScrollTop;
        messagesAreaEl.scrollTop = Number.isFinite(nextScrollTop) ? nextScrollTop : previousScrollTop;
      });
      return;
    }

    if (refreshLatest && state.currentMessagesConversationId === targetConversationId && state.currentMessages.length) {
      const merged = mergeMessages(state.currentMessages, incomingItems);
      state.currentMessages = merged;
      updateCurrentMessagesPagination(merged, limit, targetConversationId);
    } else {
      state.currentMessages = incomingItems;
      updateCurrentMessagesPagination(incomingItems, limit, targetConversationId);
    }

    renderMessages(state.currentMessages);
  } catch (error) {
    console.error(error);
  } finally {
    if (appendOlder) {
      state.loadingOlderMessages = false;
      return;
    }

    state.loadingMessages = false;
    if (pendingMessagesRefresh && targetConversationId === state.selectedConversationId) {
      pendingMessagesRefresh = false;
      loadMessages({ refreshLatest: true }).catch((error) => console.error(error));
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
    if (isMobileViewport() && state.currentView === "chats") {
      state.mobileChatPane = "conversation";
      applyResponsiveLayoutState();
    }
    state.selectedConversation = state.conversations.find((item) => item.id === conversationId) || state.selectedConversation;
    renderConversations();
    renderHeader();
    await loadMessages({ refreshLatest: true });
    markSelectedConversationRead();
    refreshConversationAvatar(conversationId);
    return;
  }

  state.selectedConversationId = conversationId;
  state.selectedConversation = state.conversations.find((item) => item.id === conversationId) || null;
  if (isMobileViewport() && state.currentView === "chats") {
    state.mobileChatPane = "conversation";
    applyResponsiveLayoutState();
  }
  renderConversations();
  renderHeader();
  await loadMessages({ refreshLatest: true });
  markSelectedConversationRead();
  refreshConversationAvatar(conversationId);
  queueConversationRefresh();
}

async function maybeClaimSelectedConversation() {
  if (!state.selectedConversation || !state.currentUser) return;
  const conv = state.selectedConversation;
  const status = String(conv.service_status || "pending");
  const isMine = canCurrentUserSendInConversation(conv);
  if (isMine) return;

  const canClaim = status === "pending" || status === "finalized" || isAiInChargeConversation(conv);
  if (!canClaim) return;

  const confirmed = await showConfirm(
    isAiInChargeConversation(conv)
      ? "Esta conversa está com o Agente IA. Deseja assumir o atendimento agora?"
      : "Deseja iniciar este atendimento agora?",
    isAiInChargeConversation(conv) ? "Assumir atendimento" : "Iniciar atendimento",
    isAiInChargeConversation(conv) ? "Assumir" : "Atender",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api(`/conversations/${conv.id}/claim`, { method: "PATCH" });
    invalidateConversationCache();
    invalidateConversationSummaryCache();
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
          phone: getConversationPhone(state.selectedConversation),
        message: text,
        client_id: state.selectedConversation.client_id || null,
      }),
    });

    invalidateConversationCache();
    invalidateConversationSummaryCache();
    await loadMessages({ refreshLatest: true });
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
          phone: getConversationPhone(state.selectedConversation),
        client_id: state.selectedConversation.client_id || null,
        audio_base64: dataUrl,
        mimetype: blob.type || "audio/webm",
        file_name: fileName,
      }),
    });
    invalidateConversationCache();
    invalidateConversationSummaryCache();
    await loadMessages({ refreshLatest: true });
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
    await showAlert("Seu navegador não suporta gravação de áudio.");
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
    await showAlert(error.message || "Não foi possível iniciar a gravação.");
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

    invalidateConversationCache();
    invalidateConversationSummaryCache();
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
    `Confirma excluir a conversa de ${contactName}?\n\nIsso também remove o contato salvo no app (se ele não estiver em outra conversa).`,
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
    invalidateConversationCache();
    invalidateConversationSummaryCache();

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
    invalidateConversationCache();
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

async function finalizeContextConversation() {
  const conversationId = String(state.contextConversationId || "").trim();
  if (!conversationId) return;
  const conv = state.conversations.find((item) => item.id === conversationId) || null;
  if (!canCurrentUserSendInConversation(conv)) {
    closeConversationMenu();
    return;
  }

  const confirmed = await showConfirm(
    "Deseja concluir este atendimento agora?",
    "Concluir atendimento",
    "Concluir",
    "Cancelar",
  );
  if (!confirmed) {
    closeConversationMenu();
    return;
  }

  try {
    await api(`/conversations/${conversationId}/finalize`, { method: "PATCH" });
    invalidateConversationCache();
    invalidateConversationSummaryCache();
    closeConversationMenu();
    await loadConversations();
  } catch (error) {
    await showAlert(error.message || "Falha ao concluir atendimento.");
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
    const previousSelectedAccountId = String(state.selectedWhatsAppAccountId || "").trim();
    const previousActiveAccountJid = getActiveAccountJid();
    const statusResult = await api("/whatsapp/status");
    const wa = statusResult?.whatsapp || {};
    const online = Boolean(wa.connected);
    const phone = wa.userPhone || "";
    const name = wa.userName || "";
    const jid = wa.userId || "";
    const previousAccountJid = state.connectedAccountJid;

    await loadWhatsAppAccounts();
    const selectedAccountChanged = previousSelectedAccountId !== String(state.selectedWhatsAppAccountId || "").trim();
    const activeAccountChanged = previousActiveAccountJid !== getActiveAccountJid();
    const hasAnyConnectedAccount = state.whatsappAccounts.some((item) => item.connected);

    waStatusEl.textContent = online ? "Online" : "Offline";
    waStatusEl.classList.toggle("online", online);

    state.connectedAccountJid = online && String(state.selectedWhatsAppAccountId || "").trim() ? jid : "";
    state.connectedAccountPhone = online && String(state.selectedWhatsAppAccountId || "").trim() ? phone : "";
    state.connectedAccountName = online && String(state.selectedWhatsAppAccountId || "").trim() ? name : "";

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
    if (selectedAccountChanged || activeAccountChanged) {
      realtimeCursor = 0;
      state.realtimeCheckpointToken = "";
      closeRealtime();
      await loadConversations();
    }
    if (online) {
      qrPanelEl.hidden = true;
      stopQrPolling();
      clearQrCode();
    } else if (!hasAnyConnectedAccount) {
      clearChatStateForDisconnected();
    }
    connectRealtime();
  } catch (error) {
    await loadWhatsAppAccounts();
    const hasAnyConnectedAccount = state.whatsappAccounts.some((item) => item.connected);
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
    if (!hasAnyConnectedAccount) {
      clearChatStateForDisconnected();
    }
    connectRealtime();
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  if (loginErrorEl) {
    loginErrorEl.hidden = true;
    loginErrorEl.textContent = "";
  }
  const username = String(loginUsernameEl.value || "").trim();
  const password = String(loginPasswordEl.value || "").trim();
  if (!username || !password) {
    const message = "Informe usuário e senha.";
    if (loginErrorEl) {
      loginErrorEl.textContent = message;
      loginErrorEl.hidden = false;
    }
    await showAlert(message);
    return;
  }

  loginSubmitBtnEl.disabled = true;
  loginSubmitBtnEl.textContent = "Entrando...";
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), 15000)
    : null;
  try {
    const result = await api("/auth/login", {
      method: "POST",
      skipAuthRedirect: true,
      signal: controller?.signal,
      body: JSON.stringify({ username, password }),
    });

    writeSessionToken(result.session_token || "");
    state.currentUser = result.user || null;
    state.isAuthenticated = Boolean(state.currentUser);
    renderSettingsHeader();
    settingsBtnEl.style.display = "";
    hideLoginScreen();
    applyResponsiveLayoutState();
    loginPasswordEl.value = "";
    const postLoginTasks = [
      loadCompanyBranding(),
      loadAgents(),
      refreshHealth(),
      loadConversations(),
      loadUsersForSettings(),
    ];
    void Promise.allSettled(postLoginTasks).then((results) => {
      const rejected = results.filter((item) => item.status === "rejected");
      if (rejected.length > 0) {
        console.error("Falhas em tarefas pós-login:", rejected.map((item) => item.reason));
      }
    });
  } catch (error) {
    const isAbort = error?.name === "AbortError";
    const message = isAbort
      ? "Tempo esgotado ao tentar entrar. Verifique a conexão e tente novamente."
      : error.message || "Falha no login.";
    if (loginErrorEl) {
      loginErrorEl.textContent = message;
      loginErrorEl.hidden = false;
    }
    showAlert(message).catch(() => undefined);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
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
    await showAlert("Preencha nome, usuário, senha e setor.");
    return;
  }

  try {
    await api("/auth/users", {
      method: "POST",
      body: JSON.stringify({ name, username, password, role, sector_id: sectorId }),
    });
    createUserFormEl.reset();
    renderRoleOptions(newUserRoleEl, "operador");
    renderSectorOptions();
    await loadUsersForSettings();
    await showAlert("Usuário cadastrado com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao cadastrar o usuário.");
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

async function handleCreateCompanySubmit(event) {
  event.preventDefault();
  const companyName = String(companyCreateNameEl.value || "").trim();
  const companyCnpj = String(companyCreateCnpjEl.value || "").trim();
  const adminName = String(companyAdminNameEl.value || "").trim();
  const adminUsername = String(companyAdminUsernameEl.value || "").trim().toLowerCase();
  const adminPassword = String(companyAdminPasswordEl.value || "").trim();

  if (!companyName || !adminName || !adminUsername || !adminPassword) {
    await showAlert("Preencha empresa, administrador, login e senha.");
    return;
  }

  try {
    await api("/auth/companies", {
      method: "POST",
      body: JSON.stringify({
        company_name: companyName,
        company_cnpj: companyCnpj,
        admin_name: adminName,
        admin_username: adminUsername,
        admin_password: adminPassword,
      }),
    });
    createCompanyFormEl.reset();
    await loadCompaniesForSettings();
    await showAlert("Empresa cadastrada com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao cadastrar empresa.");
  }
}

function refreshConversationTabsOptimized() {
  renderServiceTabs();
  return loadConversations({
    skipMessagesReload: false,
    preferCache: true,
    backgroundRefresh: true,
    deferMessagesReload: true,
  });
}

loginFormEl.addEventListener("submit", handleLoginSubmit);

searchInputEl.addEventListener("input", async () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
  }
  searchDebounceTimer = setTimeout(() => {
    state.search = searchInputEl.value.trim();
    loadConversations().catch((error) => console.error(error));
  }, SEARCH_DEBOUNCE_MS);
});
allChatsBtnEl.addEventListener("click", async () => {
  if (state.showAllChats) return;
  state.showAllChats = true;
  await refreshConversationTabsOptimized();
});
tabPendingBtnEl.addEventListener("click", async () => {
  if (!state.showAllChats && state.serviceTab === "pending") return;
  state.showAllChats = false;
  state.serviceTab = "pending";
  await refreshConversationTabsOptimized();
});
tabInProgressBtnEl.addEventListener("click", async () => {
  if (!state.showAllChats && state.serviceTab === "in_progress") return;
  state.showAllChats = false;
  state.serviceTab = "in_progress";
  await refreshConversationTabsOptimized();
});
tabFinalizedBtnEl.addEventListener("click", async () => {
  if (!state.showAllChats && state.serviceTab === "finalized") return;
  state.showAllChats = false;
  state.serviceTab = "finalized";
  await refreshConversationTabsOptimized();
});
tabBulkBtnEl.addEventListener("click", async () => {
  if (!state.showAllChats && state.serviceTab === "bulk") return;
  state.showAllChats = false;
  state.serviceTab = "bulk";
  await refreshConversationTabsOptimized();
});
messageInputEl.addEventListener("input", updateComposerAction);
messageInputEl.addEventListener("focus", async () => {
  if (messageInputEl.dataset.locked !== "true") return;
  messageInputEl.blur();
  await ensureConversationReadyForCompose();
});

railChatsEl.addEventListener("click", () => switchView("chats"));
railInternalChatEl?.addEventListener("click", () => switchView("internal-chat"));
railBulkCreateEl.addEventListener("click", () => switchView("bulk-create"));
railBulkMonitorEl.addEventListener("click", () => switchView("bulk-monitor"));
railAgentEl.addEventListener("click", () => switchView("agent"));
railProductsEl.addEventListener("click", () => switchView("products"));
mobileNavChatsEl?.addEventListener("click", () => switchView("chats"));
mobileNavBulkCreateEl?.addEventListener("click", () => switchView("bulk-create"));
mobileNavBulkMonitorEl?.addEventListener("click", () => switchView("bulk-monitor"));
mobileNavAgentEl?.addEventListener("click", () => switchView("agent"));
mobileNavProductsEl?.addEventListener("click", () => switchView("products"));
mobileNavSettingsEl?.addEventListener("click", async () => {
  if (!state.currentUser) return;
  renderSettingsHeader();
  openSettingsModal();
});
settingsBtnEl.addEventListener("click", async () => {
  if (!state.currentUser) return;
  renderSettingsHeader();
  openSettingsModal();
});
mobileTopbarBackEl?.addEventListener("click", () => {
  if (state.currentView === "chats" && state.mobileChatPane === "conversation") {
    state.mobileChatPane = "list";
    applyResponsiveLayoutState();
    renderHeader();
  }
});
settingsTabPerfilEl.addEventListener("click", () => setSettingsTab("perfil"));
settingsTabCreateEl.addEventListener("click", () => setSettingsTab("create"));
settingsTabListEl.addEventListener("click", () => setSettingsTab("list"));
settingsTabSectorsEl.addEventListener("click", () => setSettingsTab("sectors"));
settingsTabCompaniesEl.addEventListener("click", () => setSettingsTab("companies"));
settingsTabAdminUsersEl?.addEventListener("click", () => setSettingsTab("admin-users"));
settingsTabAccountsEl.addEventListener("click", () => setSettingsTab("accounts"));
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

internalChatRefreshBtnEl?.addEventListener("click", () => {
  loadInternalChatContacts()
    .then(() => loadInternalMessages())
    .then(() => loadInternalUnreadSummary())
    .catch((error) => console.error(error));
});

internalChatFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = String(internalMessageInputEl?.value || "").trim();
  if (!message) return;
  if (internalMessageInputEl) {
    internalMessageInputEl.value = "";
  }
  try {
    await sendInternalMessage(message);
  } catch (error) {
    if (internalMessageInputEl) {
      internalMessageInputEl.value = message;
    }
    await showAlert(error.message || "Falha ao enviar mensagem interna.");
  }
});

internalAudioBtnEl?.addEventListener("click", async () => {
  if (stopInternalAudioRecording()) return;
  try {
    await startInternalAudioRecording();
  } catch (error) {
    stopInternalAudioTracks();
    resetInternalAudioButton();
    await showAlert(error.message || "Nao foi possivel gravar o audio interno.");
  }
});
settingsAdminUsersListEl?.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const row = target.closest(".settings-user-item");
  const userId = String(row?.dataset?.userId || "").trim();
  if (!userId || target.dataset.action !== "reset-admin-password") return;
  await handleResetAdminPassword(userId);
});
settingsLogoutBtnEl.addEventListener("click", async () => {
  const confirmed = await showConfirm("Deseja encerrar sua sessão neste navegador?", "Encerrar sessão", "Sair", "Cancelar");
  if (!confirmed) return;
  closeSettingsModal();
  await performLogout();
});
settingsFinalizePendingBtnEl.addEventListener("click", async () => {
  if (!isAdmin()) return;
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
        account_jid: getActiveAccountJid() || "",
      }),
    });
    invalidateConversationSummaryCache();
    await loadConversations();
    await showAlert(`${Number(result.finalized_count || 0)} conversa(s) pendente(s) finalizada(s).`);
  } catch (error) {
    await showAlert(error.message || "Falha ao finalizar pendentes.");
  }
});
createUserFormEl.addEventListener("submit", handleCreateUserSubmit);
createSectorFormEl.addEventListener("submit", handleCreateSectorSubmit);
createCompanyFormEl?.addEventListener("submit", handleCreateCompanySubmit);
bulkAddMessageBtnEl.addEventListener("click", () => {
  normalizeBulkMessagesDraft();
  bulkMessagesDraft.push(createBulkMessageBlock());
  renderBulkMessagesBuilder();
});

bulkFileEl.addEventListener("change", async () => {
  const file = bulkFileEl.files?.[0];
  if (!file) {
    state.bulkContacts = [];
    state.bulkContactsSource = "none";
    state.bulkContactsLoading = false;
    state.bulkContactsSearch = "";
    state.bulkContactsPage = 1;
    bulkContactsSearchEl.value = "";
    renderBulkContacts();
    hideBulkImportProgress();
    return;
  }

  showBulkImportProgress();
  try {
    const contacts = await parseContactsFromExcel(file, updateBulkImportProgress);
    state.bulkContacts = contacts;
    state.bulkContactsSource = "excel";
    state.bulkContactsLoading = false;
    state.bulkContactsSearch = "";
    state.bulkContactsPage = 1;
    bulkContactsSearchEl.value = "";
    renderBulkContacts();
    updateBulkImportProgress(100, `${contacts.length} contatos carregados`, "Concluido com sucesso.");
    setTimeout(() => {
      hideBulkImportProgress();
    }, 450);
  } catch (error) {
    state.bulkContacts = [];
    state.bulkContactsSource = "none";
    state.bulkContactsLoading = false;
    state.bulkContactsPage = 1;
    renderBulkContacts();
    hideBulkImportProgress();
    await showAlert(error.message || "Falha ao ler Excel.");
  }
});

bulkLoadOpenChatsBtnEl?.addEventListener("click", async () => {
  try {
    await loadBulkContactsFromOpenChats();
  } catch (error) {
    await showAlert(error.message || "Falha ao carregar chats abertos.");
  }
});

bulkEnableAiAgentBtnEl?.addEventListener("click", () => {
  if (!bulkEnableAiAgentEl) return;
  bulkEnableAiAgentEl.checked = !bulkEnableAiAgentEl.checked;
  renderBulkAiToggleState();
});

bulkEnableAiAgentEl?.addEventListener("change", () => {
  renderBulkAiToggleState();
});

bulkContactsSearchEl.addEventListener("input", () => {
  state.bulkContactsSearch = bulkContactsSearchEl.value || "";
  state.bulkContactsPage = 1;
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
  const messageBlocks = collectBulkMessages();
  const textMessages = messageBlocks.filter((item) => item.type === "text").map((item) => item.text);
  const message = textMessages[0] || "";
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
  if (!messageBlocks.length) {
    await showAlert("Adicione ao menos 1 bloco de mensagem no disparo.");
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
        messages: textMessages,
        message_blocks: messageBlocks,
        enable_ai_agent: Boolean(bulkEnableAiAgentEl?.checked),
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
settingsSwitchNumberBtnEl.addEventListener("click", () => openAccountSwitchModal("select"));
settingsAddNumberBtnEl.addEventListener("click", () => {
  handleProvisionWhatsAppAccount().catch((error) => console.error(error));
});
settingsRemoveNumberBtnEl.addEventListener("click", () => {
  openAccountSwitchModal("remove");
});
settingsSignatureToggleBtnEl?.addEventListener("click", () => {
  toggleCurrentUserMessageSignature().catch((error) => console.error(error));
});
agentTestBtnEl.addEventListener("click", async () => {
  agentTestBtnEl.disabled = true;
  agentTestResultEl.textContent = "Testando conexão com a OpenAI...";
  try {
    const result = await api("/ai/test", {
      method: "POST",
      cache: "no-store",
    });
    renderAgentStatus(result);
    agentLastTestEl.textContent = `${fmtDateShort(new Date().toISOString())} ${fmtTime(new Date().toISOString())}`.trim();
    agentTestResultEl.textContent = `Catálogo disponível para o agente: ${Number(data.productsCount || 0)} produto(s).`;
  } catch (error) {
    agentLastTestEl.textContent = `${fmtDateShort(new Date().toISOString())} ${fmtTime(new Date().toISOString())}`.trim();
    agentTestResultEl.textContent = error.message || "Falha ao testar a conexão com a OpenAI.";
    await showAlert(error.message || "Falha ao testar a conexão com a OpenAI.");
  } finally {
    agentTestBtnEl.disabled = false;
  }
});
agentDefaultNewChatsBtnEl?.addEventListener("click", () => {
  if (!agentDefaultNewChatsEnabledEl) return;
  agentDefaultNewChatsEnabledEl.checked = !agentDefaultNewChatsEnabledEl.checked;
  renderAgentDefaultNewChatsToggle();
});
agentSettingsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const accountId = String(state.selectedWhatsAppAccountId || "").trim();
  if (!accountId) {
    await showAlert("Selecione um número para configurar o agente.");
    return;
  }

  agentSettingsSaveBtnEl.disabled = true;
  try {
    const result = await api("/ai/settings", {
      method: "PUT",
      body: JSON.stringify({
        account_id: accountId,
        default_new_chats_ai_enabled: Boolean(agentDefaultNewChatsEnabledEl?.checked),
        mood: String(agentMoodInputEl.value || "informal").trim(),
        agent_name: String(agentNameInputEl.value || "").trim(),
        company_name: String(companyNameInputEl.value || "").trim(),
        agent_guidelines: collectAgentGuidelines(),
        store_name: String(storeNameInputEl?.value || state.agentSettings?.store_name || "").trim(),
        store_cnpj: String(storeCnpjInputEl?.value || state.agentSettings?.store_cnpj || "").trim(),
        store_address: buildStoreAddressText() || String(state.agentSettings?.store_address || "").trim(),
        store_description: String(storeDescriptionInputEl?.value || state.agentSettings?.store_description || "").trim(),
        store_payment_methods: readStorePaymentMethods(),
        store_delivery_fees: readStoreDeliveryFees(),
      }),
    });
    state.agentSettings = result.settings || null;
    renderAgentSettings();
    await showAlert("Configurações do agente salvas com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao salvar as configurações do agente.");
  } finally {
    agentSettingsSaveBtnEl.disabled = false;
  }
});
storeInfoFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const accountId = String(state.selectedWhatsAppAccountId || "").trim();
  if (!accountId) {
    await showAlert("Selecione um número para configurar a loja.");
    return;
  }

  storeInfoSaveBtnEl.disabled = true;
  try {
    const result = await api("/ai/settings", {
      method: "PUT",
      body: JSON.stringify({
        account_id: accountId,
        default_new_chats_ai_enabled: Boolean(agentDefaultNewChatsEnabledEl?.checked),
        mood: String(agentMoodInputEl.value || state.agentSettings?.mood || "informal").trim(),
        agent_name: String(agentNameInputEl.value || state.agentSettings?.agent_name || "").trim(),
        company_name: String(companyNameInputEl.value || state.agentSettings?.company_name || "").trim(),
        agent_guidelines: collectAgentGuidelines(),
        store_name: String(storeNameInputEl.value || "").trim(),
        store_cnpj: String(storeCnpjInputEl.value || "").trim(),
        store_address: buildStoreAddressText(),
        store_description: String(storeDescriptionInputEl.value || "").trim(),
        store_payment_methods: readStorePaymentMethods(),
        store_delivery_fees: readStoreDeliveryFees(),
      }),
    });
    await saveCompanyBranding();
    state.agentSettings = result.settings || null;
    renderAgentSettings();
    await showAlert("Informações da loja salvas com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao salvar as informações da loja.");
  } finally {
    storeInfoSaveBtnEl.disabled = false;
  }
});

companyMediaFileEl?.addEventListener("change", () => {
  const file = companyMediaFileEl.files?.[0] || null;
  if (file && companyMediaFileNameEl && !String(companyMediaFileNameEl.value || "").trim()) {
    companyMediaFileNameEl.value = file.name || "";
  }
  renderCompanyMediaUploadPreview(file);
});

companyMediaFormEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const editId = String(companyMediaEditIdEl?.value || "").trim();
  const title = String(companyMediaTitleEl?.value || "").trim();
  const fileName = String(companyMediaFileNameEl?.value || "").trim();
  const description = String(companyMediaDescriptionEl?.value || "").trim();
  const file = companyMediaFileEl?.files?.[0] || null;

  if (!title) {
    await showAlert("Informe o nome da mídia.");
    return;
  }
  if (!description) {
    await showAlert("Informe a descrição da mídia.");
    return;
  }
  if (!fileName) {
    await showAlert("Informe o nome do arquivo exibido.");
    return;
  }
  if (!editId && !file) {
    await showAlert("Selecione o arquivo da mídia.");
    return;
  }

  companyMediaSubmitBtnEl.disabled = true;
  companyMediaCancelEditBtnEl && (companyMediaCancelEditBtnEl.disabled = true);
  try {
    if (editId) {
      await api(`/company-media/${encodeURIComponent(editId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          description,
          file_name: fileName,
        }),
      });
    } else {
      validateUploadFileSize(file);
      const form = new FormData();
      form.append("title", title);
      form.append("description", description);
      form.append("file_name", fileName);
      form.append("file", file);
      await api("/company-media", {
        method: "POST",
        body: form,
      });
    }
    resetCompanyMediaForm();
    await loadCompanyMediaAssets();
    await showAlert(editId ? "Mídia atualizada com sucesso." : "Mídia cadastrada com sucesso.");
  } catch (error) {
    await showAlert(error.message || (editId ? "Falha ao atualizar a mídia." : "Falha ao cadastrar a mídia."));
  } finally {
    companyMediaSubmitBtnEl.disabled = false;
    companyMediaCancelEditBtnEl && (companyMediaCancelEditBtnEl.disabled = false);
  }
});

companyMediaCancelEditBtnEl?.addEventListener("click", () => {
  resetCompanyMediaForm();
});

companyMediaListEl?.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = String(actionTarget.dataset.action || "");
  const assetId = String(actionTarget.dataset.id || "");
  const asset = (state.companyMediaAssets || []).find((item) => item.id === assetId);
  if (!asset) return;

  if (action === "preview-company-media") {
    if (asset.media_kind === "image" || asset.media_kind === "video") {
      openMediaModal(asset.media_kind, asset.media_url, asset.mime_type || "");
      return;
    }
    if (asset.media_kind === "audio") {
      mediaModalBodyEl.innerHTML = `<div class="company-media-audio-preview"><h3>${asset.title}</h3><audio src="${asset.media_url}" controls autoplay></audio><p>${asset.description || ""}</p></div>`;
      mediaModalOverlayEl.hidden = false;
      return;
    }
    window.open(asset.media_url, "_blank", "noopener");
    return;
  }

  if (action === "edit-company-media") {
    startCompanyMediaEdit(asset);
    return;
  }

  if (action === "delete-company-media") {
    const confirmed = await showConfirm("Excluir mídia", `Excluir a mídia "${asset.title}"?`);
    if (!confirmed) return;
    try {
      await api(`/company-media/${asset.id}`, { method: "DELETE" });
      if (String(companyMediaEditIdEl?.value || "").trim() === String(asset.id || "").trim()) {
        resetCompanyMediaForm();
      }
      await loadCompanyMediaAssets();
    } catch (error) {
      await showAlert(error.message || "Falha ao excluir a mídia.");
    }
  }
});

companyLogoSelectBtnEl?.addEventListener("click", () => companyLogoInputEl?.click());
companyLogoInputEl?.addEventListener("change", async (event) => {
  const file = event.target?.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file);
    const palettes = await generateThemePalettesFromLogo(dataUrl);
    state.companyBranding = normalizeCompanyBranding({
      ...(state.companyBranding || {}),
      logo_data_url: dataUrl,
      palette_options: palettes,
      selected_palette_index: 0,
      selected_palette: palettes[0] || null,
    });
    applyCompanyTheme(state.companyBranding.selected_palette || DEFAULT_COMPANY_THEME);
    renderCompanyBranding();
  } catch (error) {
    await showAlert(error.message || "Falha ao processar a logo.");
  } finally {
    if (companyLogoInputEl) companyLogoInputEl.value = "";
  }
});
companyLogoClearBtnEl?.addEventListener("click", () => {
  state.companyBranding = normalizeCompanyBranding({
    company_id: state.currentUser?.company_id || null,
    logo_data_url: null,
    palette_options: [],
    selected_palette_index: -1,
    selected_palette: null,
  });
  resetCompanyTheme();
  renderCompanyBranding();
});
scheduleSettingsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const accountId = String(state.selectedWhatsAppAccountId || "").trim();
  if (!accountId) {
    await showAlert("Selecione um número para configurar o agendamento.");
    return;
  }

  const scheduleWorkingDays = normalizeScheduleWorkingDays(readScheduleWorkingDays());
  const enabledDays = scheduleWorkingDays.filter((item) => item.enabled);
  for (const item of enabledDays) {
    const activePeriods = [
      item.morning_enabled && item.morning_start && item.morning_end ? { label: "manhã", start: item.morning_start, end: item.morning_end } : null,
      item.afternoon_enabled && item.afternoon_start && item.afternoon_end ? { label: "tarde", start: item.afternoon_start, end: item.afternoon_end } : null,
      item.night_enabled && item.night_start && item.night_end ? { label: "noite", start: item.night_start, end: item.night_end } : null,
    ].filter(Boolean);
    if (!activePeriods.length) {
      await showAlert(`Ative pelo menos um período em ${item.label}.`);
      return;
    }
    for (const period of activePeriods) {
      if (period.start >= period.end) {
        await showAlert(`O horário da ${period.label} em ${item.label} precisa terminar depois do início.`);
        return;
      }
    }
  }

  const intervalMinutesRaw = String(scheduleIntervalMinutesInputEl?.value || "").trim();
  const reminderEnabled = Boolean(scheduleReminderEnabledInputEl?.checked);
  const intervalMinutes = intervalMinutesRaw ? Number(intervalMinutesRaw) : null;
  const reminderRules = reminderEnabled ? readScheduleReminderRules() : [];

  if (intervalMinutesRaw && (!Number.isFinite(intervalMinutes) || intervalMinutes < 0)) {
    await showAlert("Informe um intervalo válido entre atendimentos.");
    return;
  }
  if (reminderEnabled && !reminderRules.length) {
    await showAlert("Adicione pelo menos um lembrete.");
    return;
  }

  scheduleSettingsSaveBtnEl.disabled = true;
  try {
    const result = await api("/ai/settings", {
      method: "PUT",
      body: JSON.stringify({
        account_id: accountId,
        default_new_chats_ai_enabled: Boolean(agentDefaultNewChatsEnabledEl?.checked),
        mood: String(agentMoodInputEl.value || state.agentSettings?.mood || "informal").trim(),
        agent_name: String(agentNameInputEl.value || state.agentSettings?.agent_name || "").trim(),
        company_name: String(companyNameInputEl.value || state.agentSettings?.company_name || "").trim(),
        agent_guidelines: collectAgentGuidelines(),
        store_name: String(storeNameInputEl?.value || state.agentSettings?.store_name || "").trim(),
        store_cnpj: String(storeCnpjInputEl?.value || state.agentSettings?.store_cnpj || "").trim(),
        store_address: buildStoreAddressText() || String(state.agentSettings?.store_address || "").trim(),
        store_description: String(storeDescriptionInputEl?.value || state.agentSettings?.store_description || "").trim(),
        store_payment_methods: readStorePaymentMethods(),
        store_delivery_fees: readStoreDeliveryFees(),
        schedule_working_days: scheduleWorkingDays.map((item) => ({
          day_of_week: item.day_of_week,
          enabled: Boolean(item.enabled),
          start_time: String(item.start_time || "").trim(),
          end_time: String(item.end_time || "").trim(),
          morning_enabled: Boolean(item.morning_enabled),
          morning_start: String(item.morning_start || "").trim(),
          morning_end: String(item.morning_end || "").trim(),
          afternoon_enabled: Boolean(item.afternoon_enabled),
          afternoon_start: String(item.afternoon_start || "").trim(),
          afternoon_end: String(item.afternoon_end || "").trim(),
          night_enabled: Boolean(item.night_enabled),
          night_start: String(item.night_start || "").trim(),
          night_end: String(item.night_end || "").trim(),
        })),
        schedule_interval_minutes: Number.isFinite(intervalMinutes) ? Math.max(0, Math.round(intervalMinutes)) : null,
        schedule_reminder_enabled: reminderEnabled,
        schedule_reminder_minutes:
          reminderEnabled && reminderRules.length && reminderRules[0].unit === "minutes"
            ? Math.max(1, Math.round(Number(reminderRules[0].value)))
            : null,
        schedule_reminder_rules: reminderRules,
      }),
    });
    state.agentSettings = result.settings || null;
    renderAgentSettings();
    await showAlert("Configuração de agendamento salva com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao salvar a configuração de agendamento.");
  } finally {
    scheduleSettingsSaveBtnEl.disabled = false;
  }
});
productsTabStoreInfoEl.addEventListener("click", () => setProductsTab("store-info"));
productsTabMediaEl.addEventListener("click", () => {
  setProductsTab("media");
  loadCompanyMediaAssets().catch((error) => console.error(error));
});
productsTabCreateEl.addEventListener("click", () => setProductsTab("create"));
productsTabListEl.addEventListener("click", () => setProductsTab("list"));
productsTabOrdersEl.addEventListener("click", () => setProductsTab("orders"));
productsTabSchedulesEl.addEventListener("click", () => {
  setProductsTab("schedules");
  loadAiSchedules().catch((error) => console.error(error));
});
productsTabScheduleSettingsEl?.addEventListener("click", () => {
  setProductsTab("schedule-settings");
  renderAgentSettings();
});
scheduleReminderEnabledInputEl?.addEventListener("change", () => updateScheduleReminderState());
scheduleReminderAddBtnEl?.addEventListener("click", () => {
  if (!scheduleReminderRulesListEl) return;
  scheduleReminderRulesListEl.appendChild(createScheduleReminderRuleRow({ value: 1, unit: "hours" }));
});
scheduleReminderRulesListEl?.addEventListener("click", (event) => {
  const target = event.target.closest('[data-action="remove-schedule-reminder"]');
  if (!target) return;
  const row = target.closest(".schedule-reminder-rule-row");
  row?.remove();
  if (scheduleReminderEnabledInputEl?.checked && scheduleReminderRulesListEl && !scheduleReminderRulesListEl.children.length) {
    renderScheduleReminderRules([{ value: 1, unit: "hours" }]);
  }
});
storeAddPaymentMethodBtnEl.addEventListener("click", () => {
  storePaymentMethodsListEl.appendChild(createStorePaymentMethodRow(""));
});
storeAddDeliveryFeeBtnEl.addEventListener("click", () => {
  storeDeliveryFeesListEl.appendChild(createStoreDeliveryFeeRow({}));
});
storePaymentMethodsListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-store-remove-row]");
  if (!button) return;
  const row = button.closest(".store-repeat-row");
  if (!row) return;
  row.remove();
  if (!storePaymentMethodsListEl.children.length) {
    storePaymentMethodsListEl.appendChild(createStorePaymentMethodRow(""));
  }
});
storeDeliveryFeesListEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-store-remove-row]");
  if (!button) return;
  const row = button.closest(".store-repeat-row");
  if (!row) return;
  row.remove();
  if (!storeDeliveryFeesListEl.children.length) {
    storeDeliveryFeesListEl.appendChild(createStoreDeliveryFeeRow({}));
  }
});
productCancelEditBtnEl.addEventListener("click", () => {
  resetProductForm();
  setProductsTab("list");
});
productNameEl.addEventListener("input", () => updateProductPreview());
productGroupEl.addEventListener("input", () => updateProductPreview());
productTypeEl.addEventListener("change", () => updateProductTypeState());
productPriceEl.addEventListener("input", () => updateProductPreview());
productDiscountEnabledEl.addEventListener("change", () => updateProductDiscountState());
productScheduleEnabledEl.addEventListener("change", () => updateProductScheduleState());
productDiscountPriceEl.addEventListener("input", () => updateProductPreview());
productStockEl.addEventListener("input", () => updateProductPreview());
productServiceDurationEl.addEventListener("input", () => updateProductPreview());
productDescriptionEl.addEventListener("input", () => updateProductPreview());
productImageSelectBtnEl?.addEventListener("click", () => productImageEl?.click());
productImageEl.addEventListener("change", async () => {
  const file = productImageEl.files?.[0] || null;
  if (file && !ALLOWED_PRODUCT_IMAGE_TYPES.has(String(file.type || "").toLowerCase())) {
    productImageEl.value = "";
    updateProductPreview();
    await showAlert("A imagem do produto deve estar em JPG, JPEG ou PNG.");
    return;
  }
  updateProductPreview();
});
productGroupSuggestionsEl?.addEventListener("click", (event) => {
  const button = event.target.closest(".product-group-chip");
  if (!button) return;
  productGroupEl.value = String(button.dataset.groupName || "");
  updateProductPreview();
});
updateProductPreview();
updateProductDiscountState();
updateProductScheduleState();
productsSearchInputEl?.addEventListener("input", (event) => {
  state.productsSearch = String(event.target.value || "");
  renderProducts();
});
productsSearchClearBtnEl?.addEventListener("click", () => {
  state.productsSearch = "";
  if (productsSearchInputEl) productsSearchInputEl.value = "";
  renderProducts();
  productsSearchInputEl?.focus();
});
productsListEl.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = String(target.getAttribute("data-action") || "").trim();
  const product = findProductById(target.getAttribute("data-product-id"));
  if (!product) return;
  if (action === "edit-product") {
    fillProductForm(product);
    return;
  }

  if (action === "toggle-product-active") {
    void (async () => {
      const nextActive = product.is_active === false;
      const confirmed = await showConfirm(
        nextActive
          ? `Ativar ${product.name || "este produto"} para o agente voltar a recomendar?`
          : `Desativar ${product.name || "este produto"} para o agente parar de recomendar?`,
        nextActive ? "Ativar produto" : "Desativar produto",
        nextActive ? "Ativar" : "Desativar",
        "Cancelar",
      );
      if (!confirmed) return;
      try {
        await api(`/products/${encodeURIComponent(product.id)}/active`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: nextActive ? "true" : "false" }),
        });
        await loadProducts();
        await loadAgentStatus().catch(() => undefined);
      } catch (error) {
        await showAlert(error.message || "Falha ao atualizar o status do produto.");
      }
    })();
    return;
  }

  if (action === "delete-product") {
    void (async () => {
      const confirmed = await showConfirm(
        `Apagar ${product.name || "este produto"} do catálogo?`,
        "Apagar produto",
        "Apagar",
        "Cancelar",
      );
      if (!confirmed) return;
      try {
        await api(`/products/${encodeURIComponent(product.id)}`, {
          method: "DELETE",
        });
        if (String(state.editingProductId || "") === String(product.id || "")) {
          resetProductForm();
        }
        await loadProducts();
        await loadAgentStatus().catch(() => undefined);
      } catch (error) {
        await showAlert(error.message || "Falha ao apagar produto.");
      }
    })();
  }
});
ordersListEl.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = String(actionTarget.getAttribute("data-action") || "").trim();
  const orderId = String(actionTarget.getAttribute("data-order-id") || "").trim();
  const order = findOrderById(orderId);
  if (!orderId || !order) return;

  if (action === "open-order-chat") {
    await openConversationFromEntity(order.conversation_id);
    return;
  }

  if (action === "open-order-pdf") {
    const pdfUrl = `/ai/orders/${encodeURIComponent(orderId)}/pdf`;
    window.open(pdfUrl, "_blank", "noopener,noreferrer");
    return;
  }

  if (action === "confirm-order") {
    const confirmData = await showOrderConfirmDialog();
    if (!confirmData) return;
    const readyTimeMinutes = Number(confirmData.readyTimeMinutes);
    if (!Number.isFinite(readyTimeMinutes) || readyTimeMinutes <= 0) {
      await showAlert("Informe um tempo mínimo válido em minutos.");
      return;
    }
    const confirmationNote = String(confirmData.confirmationNote || "").trim();
    const confirmed = await showConfirm(
      `Confirmar o pedido de ${order.conversation_name || order.customer_phone || "cliente"}?`,
      "Confirmar pedido",
      "Confirmar",
      "Cancelar"
    );
    if (!confirmed) return;

    actionTarget.disabled = true;
    try {
      await api(`/ai/orders/${encodeURIComponent(orderId)}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          ready_time_minutes: Math.round(readyTimeMinutes),
          confirmation_note: confirmationNote || "",
        }),
      });
      invalidateConversationSummaryCache();
      await loadAiOrders();
      await loadConversations().catch(() => undefined);
      if (state.selectedConversationId && String(order.conversation_id || "").trim() === String(state.selectedConversationId || "").trim()) {
        await loadMessages(state.selectedConversationId).catch(() => undefined);
      }
      await showAlert("Pedido confirmado com sucesso. O cliente foi avisado.");
    } catch (error) {
      await showAlert(error.message || "Falha ao confirmar pedido.");
    } finally {
      actionTarget.disabled = false;
    }
    return;
  }

  if (action === "cancel-order") {
    const reason = await showPrompt("Informe o motivo do cancelamento:", "", {
      title: "Cancelar pedido",
      confirmText: "Cancelar pedido",
      cancelText: "Voltar",
      placeholder: "Ex.: item sem estoque, valor desatualizado...",
    });
    if (!reason) return;

    actionTarget.disabled = true;
    try {
      await api(`/ai/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      invalidateConversationSummaryCache();
      await loadAiOrders();
      await loadConversations().catch(() => undefined);
      if (state.selectedConversationId && String(order.conversation_id || "").trim() === String(state.selectedConversationId || "").trim()) {
        await loadMessages(state.selectedConversationId).catch(() => undefined);
      }
      await showAlert("Pedido cancelado. O cliente foi avisado com o motivo do cancelamento.");
    } catch (error) {
      await showAlert(error.message || "Falha ao cancelar pedido.");
    } finally {
      actionTarget.disabled = false;
    }
    return;
  }

  if (action === "delete-order") {
    const confirmed = await showConfirm(
      `Excluir o pedido de ${order.conversation_name || order.customer_phone || "cliente"}?`,
      "Excluir pedido",
      "Excluir",
      "Cancelar"
    );
    if (!confirmed) return;

    actionTarget.disabled = true;
    try {
      await api(`/ai/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      invalidateConversationSummaryCache();
      await loadAiOrders();
      await showAlert("Pedido excluído com sucesso.");
    } catch (error) {
      await showAlert(error.message || "Falha ao excluir pedido.");
    } finally {
      actionTarget.disabled = false;
    }
  }
});
schedulesListEl.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (!actionTarget) return;
  const action = String(actionTarget.getAttribute("data-action") || "").trim();
  const scheduleId = String(actionTarget.getAttribute("data-schedule-id") || "").trim();
  const schedule = findScheduleById(scheduleId);
  if (!scheduleId || !schedule) return;

  if (action === "open-schedule-chat") {
    await openConversationFromEntity(schedule.conversation_id);
    return;
  }

  if (action === "reschedule-schedule") {
    const useAi = await showConfirm(
      "Quer que a IA converse com o cliente sobre o reagendamento? Se escolher cancelar, vamos abrir o chat para você assumir o atendimento.",
      "Reagendar",
      "IA conversar",
      "Assumir atendimento",
    );
    if (!useAi) {
      if (!schedule.conversation_id) {
        await showAlert("Esse agendamento não tem conversa vinculada para atendimento manual.");
        return;
      }
      await openConversationFromEntity(schedule.conversation_id);
      await ensureConversationReadyForCompose();
      await showAlert("Chat aberto para você assumir o atendimento do reagendamento.");
      return;
    }

    const reason = await showPrompt("Qual o motivo do reagendamento?", "", {
      title: "Reagendar com IA",
      confirmText: "Continuar",
      cancelText: "Cancelar",
      placeholder: "Ex.: tivemos um ajuste interno na agenda",
    });
    if (reason === null) return;
    const nextDate = await showPrompt(
      "Qual data disponível a IA pode sugerir primeiro para o cliente?",
      formatCompactBrDate(String(schedule.scheduled_date || "")),
      {
        title: "Reagendar com IA",
        confirmText: "Continuar",
        cancelText: "Cancelar",
        placeholder: "DD/MM/AA",
      },
    );
    if (nextDate === null) return;
    const nextTime = await showPrompt("Qual horário disponível a IA pode sugerir primeiro?", String(schedule.scheduled_time || ""), {
      title: "Reagendar com IA",
      confirmText: "Enviar para a IA",
      cancelText: "Cancelar",
      placeholder: "HH:mm",
    });
    if (nextTime === null) return;
    actionTarget.disabled = true;
    try {
      await api(`/ai/schedules/${encodeURIComponent(scheduleId)}/reschedule-assistant`, {
        method: "POST",
        body: JSON.stringify({
          mode: "ai",
          reason: String(reason || "").trim(),
          suggested_date: parseCompactBrDateToIso(nextDate),
          suggested_time: String(nextTime || "").trim(),
        }),
      });
      await loadAiSchedules();
      await showAlert("A IA iniciou a conversa de reagendamento com o cliente.");
    } catch (error) {
      await showAlert(error.message || "Falha ao reagendar agendamento.");
    } finally {
      actionTarget.disabled = false;
    }
    return;
  }

  if (action === "confirm-schedule") {
    const confirmationNote = await showPrompt("Observação da confirmação (opcional):", "", {
      title: "Confirmar agendamento",
      confirmText: "Confirmar",
      cancelText: "Cancelar",
      placeholder: "Ex.: chegar com 10 min de antecedência",
    });
    if (confirmationNote === null) return;
    actionTarget.disabled = true;
    try {
      await api(`/ai/schedules/${encodeURIComponent(scheduleId)}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          confirmation_note: String(confirmationNote || "").trim(),
        }),
      });
      await loadAiSchedules();
      await showAlert("Agendamento confirmado com sucesso. O cliente foi avisado.");
    } catch (error) {
      await showAlert(error.message || "Falha ao confirmar agendamento.");
    } finally {
      actionTarget.disabled = false;
    }
    return;
  }

  if (action === "cancel-schedule") {
    const reason = await showPrompt("Informe o motivo do cancelamento:", "", {
      title: "Cancelar agendamento",
      confirmText: "Cancelar agendamento",
      cancelText: "Voltar",
      placeholder: "Ex.: horário indisponível, agenda cheia...",
    });
    if (!reason) return;
    actionTarget.disabled = true;
    try {
      await api(`/ai/schedules/${encodeURIComponent(scheduleId)}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await loadAiSchedules();
      await showAlert("Agendamento cancelado com sucesso. O cliente foi avisado.");
    } catch (error) {
      await showAlert(error.message || "Falha ao cancelar agendamento.");
    } finally {
      actionTarget.disabled = false;
    }
    return;
  }

  if (action === "delete-schedule") {
    const confirmed = await showConfirm(
      `Excluir o agendamento de ${schedule.customer_name || schedule.conversation_name || "cliente"}?`,
      "Excluir agendamento",
      "Excluir",
      "Cancelar"
    );
    if (!confirmed) return;
    actionTarget.disabled = true;
    try {
      await api(`/ai/schedules/${encodeURIComponent(scheduleId)}`, {
        method: "DELETE",
      });
      await loadAiSchedules();
      await showAlert("Agendamento excluído com sucesso.");
    } catch (error) {
      await showAlert(error.message || "Falha ao excluir agendamento.");
    } finally {
      actionTarget.disabled = false;
    }
  }
});
schedulePrevMonthBtnEl.addEventListener("click", () => {
  state.scheduleCalendarMonth = shiftMonth(getCurrentScheduleMonth(), -1);
  state.selectedScheduleDate = "";
  loadAiSchedules().catch((error) => console.error(error));
});
scheduleNextMonthBtnEl.addEventListener("click", () => {
  state.scheduleCalendarMonth = shiftMonth(getCurrentScheduleMonth(), 1);
  state.selectedScheduleDate = "";
  loadAiSchedules().catch((error) => console.error(error));
});
productsFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();
  const productId = String(productIdEl.value || state.editingProductId || "").trim();
  const isActive = Boolean(productActiveEl.checked);
  const name = String(productNameEl.value || "").trim();
  const groupName = normalizeProductGroupName(productGroupEl.value || "");
  const type = String(productTypeEl.value || "product").trim() === "service" ? "service" : "product";
  const price = String(productPriceEl.value || "").trim();
  const discountEnabled = Boolean(productDiscountEnabledEl.checked);
  const discountPrice = String(productDiscountPriceEl.value || "").trim();
  const scheduleEnabled = type === "service" && Boolean(productScheduleEnabledEl.checked);
  const serviceDurationMinutes = String(productServiceDurationEl.value || "").trim();
  const stock = type === "service" ? "0" : String(productStockEl.value || "").trim();
  const description = String(productDescriptionEl.value || "").trim();
  const image = productImageEl.files?.[0] || null;

  if (!name) {
    await showAlert("Informe o nome do produto.");
    return;
  }
  if (image && !ALLOWED_PRODUCT_IMAGE_TYPES.has(String(image.type || "").toLowerCase())) {
    await showAlert("A imagem do produto deve estar em JPG, JPEG ou PNG.");
    return;
  }
  if (discountEnabled) {
    if (!discountPrice) {
      await showAlert("Informe o preço com desconto.");
      return;
    }
    if (Number(discountPrice) >= Number(price || 0)) {
      await showAlert("O preço com desconto deve ser menor que o preço base.");
      return;
    }
  }

  if (scheduleEnabled) {
    if (!serviceDurationMinutes || !Number.isFinite(Number(serviceDurationMinutes)) || Number(serviceDurationMinutes) <= 0) {
      await showAlert("Informe o tempo médio do serviço em minutos.");
      return;
    }
  }

  productSubmitBtnEl.disabled = true;
  try {
    const form = new FormData();
    form.append("name", name);
    form.append("is_active", isActive ? "true" : "false");
    form.append("group_name", groupName);
    form.append("type", type);
    form.append("description", description);
    form.append("price", price || "0");
    form.append("discount_enabled", discountEnabled ? "true" : "false");
    form.append("discount_price", discountEnabled ? (discountPrice || "0") : "");
    form.append("schedule_enabled", scheduleEnabled ? "true" : "false");
    form.append("service_duration_minutes", scheduleEnabled ? serviceDurationMinutes : "");
    form.append("stock", stock || "0");
    if (image) {
      form.append("image", image);
    }

    await api(productId ? `/products/${encodeURIComponent(productId)}` : "/products", {
      method: productId ? "PUT" : "POST",
      body: form,
    });

    resetProductForm();
    await loadProducts();
    await loadAgentStatus().catch(() => undefined);
    setProductsTab("list");
    await showAlert(productId ? "Produto atualizado com sucesso." : "Produto cadastrado com sucesso.");
  } catch (error) {
    await showAlert(error.message || (productId ? "Falha ao atualizar produto." : "Falha ao cadastrar produto."));
  } finally {
    productSubmitBtnEl.disabled = false;
  }
});
conversationAIAgentToggleEl.addEventListener("change", async () => {
  const conversationId = String(state.contextConversationId || "").trim();
  if (!conversationId) return;

  const enabled = Boolean(conversationAIAgentToggleEl.checked);
  try {
    const result = await api(`/conversations/${conversationId}/ai-agent`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    });
    invalidateConversationCache();
    invalidateConversationSummaryCache();
    const conv = state.conversations.find((item) => item.id === conversationId);
    if (conv) {
      conv.ai_agent_enabled = enabled;
      if (!enabled && !String(conv.assigned_user_id || "").trim() && String(conv.service_status || "") === "in_progress") {
        conv.service_status = "pending";
        conv.assigned_user_name = "";
      }
    }
    if (state.selectedConversationId === conversationId && state.selectedConversation) {
      state.selectedConversation.ai_agent_enabled = enabled;
      if (!enabled && (
        !String(state.selectedConversation.assigned_user_id || "").trim() &&
        String(state.selectedConversation.service_status || "") === "in_progress"
      )) {
        state.selectedConversation.service_status = "pending";
        state.selectedConversation.assigned_user_name = "";
      }
    }
    if (enabled && result?.automation?.replied) {
      state.showAllChats = false;
      state.serviceTab = "in_progress";
    }
    renderConversations();
    renderHeader();
    renderServiceTabs();
    await loadConversations();
    await loadConversationSummary({ force: true }).catch(() => undefined);
    if (enabled && result?.automation && !result.automation.replied) {
      const reason = String(result.automation.reason || "").trim();
      const reasonMap = {
        busy: "O agente já está processando esta conversa.",
        conversation_not_found: "Conversa não encontrada para o agente.",
        disabled: "O agente ainda está desabilitado neste chat.",
        human_in_charge: "Existe um atendente humano em atendimento neste chat.",
        missing_account_or_phone: "Falta conta WhatsApp ou telefone válido para o agente responder.",
        no_messages: "Não há mensagens suficientes nesta conversa para o agente responder.",
        last_message_from_company: "A última mensagem ainda é da empresa. O agente vai responder na próxima mensagem do cliente.",
        model_chose_not_to_reply: "O agente analisou a conversa e decidiu não responder agora.",
      };
      if (reason && reasonMap[reason]) {
        await showAlert(reasonMap[reason]);
      } else if (reason) {
        await showAlert(`O agente não respondeu agora: ${reason}`);
      }
    }
  } catch (error) {
    conversationAIAgentToggleEl.checked = !enabled;
    await showAlert(error.message || "Falha ao atualizar o agente de venda no chat.");
  }
});
finalizeConversationMenuBtnEl.addEventListener("click", () => {
  finalizeContextConversation().catch((error) => console.error(error));
});
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
    qrHintEl.textContent = "Gerando QR code. Depois da leitura, a sincronização será iniciada automaticamente.";
    clearQrCode();
    await pollQrCode();
    startQrPolling();
  } catch (error) {
    await showAlert(error.message || "Falha ao iniciar a conexão.");
  }
});
syncHistoryBtnEl.addEventListener("click", async () => {
  const confirmed = await showConfirm(
    "O app vai remover a conexão atual, gerar um novo QR code e, depois da leitura, sincronizar automaticamente as mensagens pendentes.\n\nSe não houver sincronização pendente, nada será importado.",
    "Sincronizar histórico",
    "Sincronizar",
    "Cancelar",
  );
  if (!confirmed) return;

  try {
    await api("/whatsapp/sync-history", { method: "POST" });
    qrPanelEl.hidden = false;
    qrHintEl.textContent = "Leia o novo QR code. Depois da leitura, a sincronização vai iniciar automaticamente.";
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
messagesAreaEl.addEventListener("scroll", () => {
  if (
    messagesAreaEl.scrollTop <= 120 &&
    state.selectedConversationId &&
    !state.loadingOlderMessages &&
    state.currentMessagesHasOlder
  ) {
    loadMessages({ appendOlder: true }).catch((error) => console.error(error));
  }
});
accountSwitchOverlayEl.addEventListener("click", closeAccountSwitchModal);
accountSwitchCloseEl.addEventListener("click", closeAccountSwitchModal);
accountSwitchListEl.addEventListener("click", (event) => {
  const button = event.target.closest(".account-switch-item");
  if (!button) return;
  const accountId = String(button.dataset.accountId || "").trim();
  if (!accountId) return;
  if (accountSwitchMode === "remove") {
    handleRemoveWhatsAppAccount(accountId).catch((error) => console.error(error));
    return;
  }
  switchSelectedWhatsAppAccount(accountId).catch((error) => console.error(error));
});
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
    invalidateConversationSummaryCache();
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
    await showAlert("Preencha nome, usuário, cargo e setor.");
    return;
  }
  if (!["ceo", "administrador", "operador"].includes(role)) {
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
    await showAlert("Usuário atualizado com sucesso.");
  } catch (error) {
    await showAlert(error.message || "Falha ao editar o usuário.");
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
    closeAccountSwitchModal();
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

mediaModalBodyEl?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-asset-id]");
  if (!button) return;
  sendCompanyMediaAsset(String(button.dataset.assetId || "")).catch((error) => {
    console.error(error);
    showAlert(error.message || "Falha ao enviar a mídia.").catch(() => undefined);
  });
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

attachLibraryBtnEl?.addEventListener("click", async () => {
  closeAttachMenu();
  if (!(await ensureConversationReadyForCompose())) {
    return;
  }
  await loadCompanyMediaAssets().catch((error) => console.error(error));
  openCompanyMediaPicker();
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
  applyResponsiveLayoutState();
  renderServiceTabs();
  renderBulkContacts();
  renderBulkMessagesBuilder();
  renderBulkAiToggleState();
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
    await loadInternalUnreadSummary().catch((error) => console.error(error));
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
  if (!internalChatTimer) {
    internalChatTimer = setInterval(() => {
      if (!state.isAuthenticated) return;
      loadInternalUnreadSummary().catch((error) => console.error(error));
      if (state.currentView === "internal-chat" && state.selectedInternalThreadId) {
        loadInternalMessages().catch((error) => console.error(error));
      }
    }, 5000);
  }
}

boot().catch((error) => {
  console.error(error);
});

window.addEventListener("resize", () => {
  if (!state.isAuthenticated) {
    renderMobileChrome();
    return;
  }
  if (!isMobileViewport()) {
    state.mobileChatPane = "list";
  }
  applyResponsiveLayoutState();
  renderHeader();
});


