import { auth, db } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot, addDoc, query, where, getDocs, Timestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Application State
const state = {
  currentUser: null,
  userProfile: null,
  rooms: {},
  catalogs: { amenities: [], linen: [], tcm: [] },
  activeRoomId: null
};

// Floor Mapping
const ROOM_FLOORS = {
  "3rd Floor": ["301","302","303","304","305","306","307","308"],
  "4th Floor": ["401","402","403","404","405","406","407","408"],
  "5th Floor": ["501","502","503","504","505","506","507","508"],
  "6th Floor": ["601","602","603","604","605"]
};

const INITIAL_CHECKLIST = {
  stripBed: false,
  replaceTowels: false,
  sanitizeBathroom: false,
  vacuumFloor: false,
  restockMinibar: false,
  checkAppliances: false,
  emptyTrash: false,
  finalInspection: false
};

// --- AUTHENTICATION LISTENERS ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    state.currentUser = user;
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (userDoc.exists()) {
      state.userProfile = userDoc.data();
      document.getElementById("userDisplay").textContent = `${state.userProfile.name} (${state.userProfile.role.toUpperCase()})`;
      
      toggleUIByRole(state.userProfile.role);
      showView("appView");
      initDataListeners();
    } else {
      alert("No profile role found for user.");
    }
  } else {
    showView("authView");
  }
});

// LOGIN FORM
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    document.getElementById("authError").textContent = err.message;
  }
});

// UI ROUTING & RBAC
function showView(viewId) {
  document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
  document.getElementById(viewId).classList.remove("hidden");
}

function toggleUIByRole(role) {
  const adminBtn = document.getElementById("adminTabBtn");
  const reportControls = document.getElementById("reportControls");
  
  if (role === "admin") {
    adminBtn.classList.remove("hidden");
    reportControls.classList.remove("hidden");
  } else if (role === "reception") {
    adminBtn.classList.add("hidden");
    reportControls.classList.remove("hidden");
  } else {
    adminBtn.classList.add("hidden");
    reportControls.classList.add("hidden");
  }
}

// --- FIRESTORE REAL-TIME SUBSCRIPTIONS ---
function initDataListeners() {
  // Listen to Rooms Collection
  onSnapshot(collection(db, "rooms"), (snapshot) => {
    snapshot.forEach(docSnap => {
      state.rooms[docSnap.id] = docSnap.data();
    });
    renderDashboard();
  });

  // Listen to Catalogs
  ["amenities", "linen", "tcm"].forEach(cat => {
    onSnapshot(doc(db, "catalogs", cat), (docSnap) => {
      if (docSnap.exists()) {
        state.catalogs[cat] = docSnap.data().items || [];
      }
    });
  });
}

// --- DASHBOARD RENDER ---
function renderDashboard() {
  const container = document.getElementById("floorContainer");
  container.innerHTML = "";

  let counts = { empty: 0, occupied: 0, maintenance: 0, cleaning: 0 };

  Object.entries(ROOM_FLOORS).forEach(([floorName, roomList]) => {
    const floorSec = document.createElement("div");
    floorSec.className = "floor-section";
    floorSec.innerHTML = `<h3>${floorName}</h3>`;

    const grid = document.createElement("div");
    grid.className = "room-grid";

    roomList.forEach(rNum => {
      const room = state.rooms[rNum] || { status: "empty" };
      counts[room.status] = (counts[room.status] || 0) + 1;

      const card = document.createElement("div");
      card.className = `room-card status-${room.status}`;
      card.innerHTML = `
        <div class="room-number">${rNum}</div>
        <div class="room-status">${room.status}</div>
      `;
      card.onclick = () => handleRoomClick(rNum);
      grid.appendChild(card);
    });

    floorSec.appendChild(grid);
    container.appendChild(floorSec);
  });

  // Update Summary Counts
  document.getElementById("countEmpty").textContent = counts.empty;
  document.getElementById("countOccupied").textContent = counts.occupied;
  document.getElementById("countMaintenance").textContent = counts.maintenance;
  document.getElementById("countCleaning").textContent = counts.cleaning;
}

// --- INTERACTION HANDLING ---
function handleRoomClick(roomId) {
  state.activeRoomId = roomId;
  const role = state.userProfile.role;

  if (role === "housekeeping") {
    openHousekeepingModal(roomId);
  } else {
    openReceptionModal(roomId);
  }
}

// --- RECEPTION MODAL LOGIC ---
function openReceptionModal(roomId) {
  const room = state.rooms[roomId] || {};
  const stay = room.currentStay || {};

  document.getElementById("recModalTitle").textContent = `Room ${roomId} - Guest & Billing`;
  document.getElementById("recGuestName").value = stay.guestName || "";
  document.getElementById("recCompanyName").value = stay.companyName || "";
  document.getElementById("recBillType").value = stay.billType || "";
  document.getElementById("recTariff").value = stay.tariff || 0;
  document.getElementById("recRoomPlan").value = stay.roomPlan || "";
  document.getElementById("recStatus").value = room.status || "empty";
  document.getElementById("recCheckIn").value = stay.checkInDate || "";
  document.getElementById("recCheckOut").value = stay.checkOutDate || "";
  document.getElementById("recFoodBill").value = stay.foodBill || 0;
  document.getElementById("recLaundryBill").value = stay.laundryBill || 0;

  // Render Amenities Section
  const amenSec = document.getElementById("amenitiesSection");
  if (room.status === "occupied") {
    amenSec.classList.remove("hidden");
    const container = document.getElementById("amenitiesChecklist");
    container.innerHTML = "";
    
    state.catalogs.amenities.forEach(item => {
      const existing = (stay.amenities || []).find(a => a.name === item);
      const qty = existing ? existing.qty : 0;
      container.innerHTML += `
        <div>
          <label>${item}</label>
          <input type="number" min="0" data-amenity="${item}" value="${qty}">
        </div>
      `;
    });
  } else {
    amenSec.classList.add("hidden");
  }

  document.getElementById("receptionModal").classList.remove("hidden");
}

async function saveReceptionData() {
  const roomId = state.activeRoomId;
  const status = document.getElementById("recStatus").value;

  // Gather Amenities
  const amenities = [];
  document.querySelectorAll("[data-amenity]").forEach(input => {
    const qty = parseInt(input.value);
    if (qty > 0) amenities.push({ name: input.dataset.amenity, qty });
  });

  const payload = {
    roomNumber: roomId,
    status: status,
    currentStay: {
      guestName: document.getElementById("recGuestName").value,
      companyName: document.getElementById("recCompanyName").value,
      billType: document.getElementById("recBillType").value,
      tariff: parseFloat(document.getElementById("recTariff").value) || 0,
      roomPlan: document.getElementById("recRoomPlan").value,
      checkInDate: document.getElementById("recCheckIn").value,
      checkOutDate: document.getElementById("recCheckOut").value,
      foodBill: parseFloat(document.getElementById("recFoodBill").value) || 0,
      laundryBill: parseFloat(document.getElementById("recLaundryBill").value) || 0,
      amenities: amenities
    }
  };

  await setDoc(doc(db, "rooms", roomId), payload, { merge: true });
  closeModals();
}

async function processCheckout() {
  const roomId = state.activeRoomId;
  const room = state.rooms[roomId];
  if (!room || !room.currentStay) return;

  const stay = room.currentStay;
  const totalAmount = (stay.tariff || 0) + (stay.foodBill || 0) + (stay.laundryBill || 0);

  // Archive to pending_bills
  await addDoc(collection(db, "pending_bills"), {
    roomNumber: roomId,
    guestName: stay.guestName || "N/A",
    checkOutDate: new Date().toISOString(),
    pendingAmount: totalAmount,
    pendingBillNumber: "PEND-" + Math.floor(1000 + Math.random() * 9000),
    paymentStatus: "unpaid",
    remarks: "Auto-generated at checkout",
    updatedBy: state.currentUser.uid,
    updatedAt: Timestamp.now()
  });

  // Reset Room State
  await updateDoc(doc(db, "rooms", roomId), {
    status: "cleaning",
    currentStay: {},
    "housekeeping.checklist": INITIAL_CHECKLIST
  });

  closeModals();
}

// --- HOUSEKEEPING MODAL LOGIC ---
function openHousekeepingModal(roomId) {
  const room = state.rooms[roomId] || {};
  const hk = room.housekeeping || { checklist: INITIAL_CHECKLIST };

  document.getElementById("hkModalTitle").textContent = `Room ${roomId} - Housekeeping`;
  document.getElementById("hkAssignedStaff").textContent = hk.assignedStaff || state.userProfile.name;
  document.getElementById("hkLastUpdated").textContent = hk.lastUpdated ? hk.lastUpdated.toDate().toLocaleString() : "N/A";

  // Render Checklist
  const tasksList = document.getElementById("hkTasksList");
  tasksList.innerHTML = "";
  const checklist = hk.checklist || INITIAL_CHECKLIST;
  
  let doneCount = 0;
  const keys = Object.keys(INITIAL_CHECKLIST);

  keys.forEach(key => {
    const isDone = checklist[key] || false;
    if (isDone) doneCount++;

    const div = document.createElement("div");
    div.innerHTML = `
      <label>
        <input type="checkbox" ${isDone ? "checked" : ""} onchange="app.toggleHkTask('${key}', this.checked)">
        ${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
      </label>
    `;
    tasksList.appendChild(div);
  });

  const pct = Math.round((doneCount / keys.length) * 100);
  document.getElementById("hkProgressPct").textContent = `${pct}%`;
  document.getElementById("hkProgressBar").style.width = `${pct}%`;

  // Render Linen & TCM Catalog Grids
  renderQuantityGrid("hkLinenList", state.catalogs.linen, "linen");
  renderQuantityGrid("hkTcmList", state.catalogs.tcm, "tcm");

  document.getElementById("housekeepingModal").classList.remove("hidden");
}

function renderQuantityGrid(targetId, items, typeKey) {
  const grid = document.getElementById(targetId);
  grid.innerHTML = "";
  items.forEach(item => {
    grid.innerHTML += `
      <div>
        <label>${item}</label>
        <input type="number" min="0" value="0" data-${typeKey}="${item}">
      </div>
    `;
  });
}

async function toggleHkTask(taskKey, isChecked) {
  const roomId = state.activeRoomId;
  const room = state.rooms[roomId];
  const checklist = (room.housekeeping && room.housekeeping.checklist) ? { ...room.housekeeping.checklist } : { ...INITIAL_CHECKLIST };
  
  checklist[taskKey] = isChecked;

  const total = Object.keys(INITIAL_CHECKLIST).length;
  const done = Object.values(checklist).filter(Boolean).length;
  
  let updates = {
    "housekeeping.checklist": checklist,
    "housekeeping.assignedStaff": state.userProfile.name,
    "housekeeping.lastUpdated": Timestamp.now()
  };

  if (done === total) {
    updates["status"] = "empty"; // Auto Ready
  }

  await updateDoc(doc(db, "rooms", roomId), updates);
  openHousekeepingModal(roomId); // Refresh modal view
}

async function recordLinenChange() {
  const items = [];
  document.querySelectorAll("[data-linen]").forEach(inp => {
    const qty = parseInt(inp.value);
    if (qty > 0) items.push({ item: inp.dataset.linen, qty, timestamp: new Date().toISOString(), staff: state.userProfile.name });
  });

  if (items.length === 0) return;
  
  const roomRef = doc(db, "rooms", state.activeRoomId);
  const roomSnap = await getDoc(roomRef);
  const currentLinen = roomSnap.data()?.housekeeping?.linenChanges || [];

  await updateDoc(roomRef, {
    "housekeeping.linenChanges": [...currentLinen, ...items]
  });
  alert("Linen logged successfully!");
}

async function recordTcmChange() {
  const items = [];
  document.querySelectorAll("[data-tcm]").forEach(inp => {
    const qty = parseInt(inp.value);
    if (qty > 0) items.push({ item: inp.dataset.tcm, qty, timestamp: new Date().toISOString(), staff: state.userProfile.name });
  });

  if (items.length === 0) return;

  const roomRef = doc(db, "rooms", state.activeRoomId);
  const roomSnap = await getDoc(roomRef);
  const currentTcm = roomSnap.data()?.housekeeping?.tcmConsumption || [];

  await updateDoc(roomRef, {
    "housekeeping.tcmConsumption": [...currentTcm, ...items]
  });
  alert("TCM logged successfully!");
}

// --- ADMIN CONTROL PANEL LOGIC ---
async function loadAdminPanel() {
  loadCatalogToAdmin();
  
  // Load Pending Bills
  const q = query(collection(db, "pending_bills"));
  const snap = await getDocs(q);
  const tbody = document.getElementById("pendingBillsTableBody");
  tbody.innerHTML = "";

  snap.forEach(docSnap => {
    const data = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${data.roomNumber}</td>
      <td>${data.guestName}</td>
      <td>${new Date(data.checkOutDate).toLocaleDateString()}</td>
      <td>$${data.pendingAmount}</td>
      <td><input type="text" value="${data.pendingBillNumber}" id="billNo-${docSnap.id}"></td>
      <td>
        <select id="status-${docSnap.id}">
          <option value="unpaid" ${data.paymentStatus === "unpaid" ? "selected" : ""}>Unpaid</option>
          <option value="paid" ${data.paymentStatus === "paid" ? "selected" : ""}>Paid</option>
        </select>
      </td>
      <td><button class="btn primary" onclick="app.updatePendingBill('${docSnap.id}')">Save</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function updatePendingBill(billId) {
  const billNo = document.getElementById(`billNo-${billId}`).value;
  const status = document.getElementById(`status-${billId}`).value;

  await updateDoc(doc(db, "pending_bills", billId), {
    pendingBillNumber: billNo,
    paymentStatus: status,
    updatedBy: state.currentUser.uid,
    updatedAt: Timestamp.now()
  });
  alert("Pending bill updated!");
}

async function loadCatalogToAdmin() {
  const type = document.getElementById("catalogTypeSelect").value;
  const list = document.getElementById("adminCatalogList");
  list.innerHTML = "";

  (state.catalogs[type] || []).forEach((item, index) => {
    list.innerHTML += `
      <li>
        ${item}
        <button class="btn danger" style="width:auto; padding: 2px 6px;" onclick="app.removeCatalogItem('${type}', ${index})">Delete</button>
      </li>
    `;
  });
}

async function addCatalogItem() {
  const type = document.getElementById("catalogTypeSelect").value;
  const input = document.getElementById("newCatalogItemText");
  if (!input.value) return;

  const current = state.catalogs[type] || [];
  await setDoc(doc(db, "catalogs", type), { items: [...current, input.value] });
  input.value = "";
  loadCatalogToAdmin();
}

async function removeCatalogItem(type, index) {
  const current = [...(state.catalogs[type] || [])];
  current.splice(index, 1);
  await setDoc(doc(db, "catalogs", type), { items: current });
  loadCatalogToAdmin();
}

// User Creation
document.getElementById("createUserForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("newUserEmail").value;
  const name = document.getElementById("newUserName").value;
  const role = document.getElementById("newUserRole").value;

  alert("Note: Creating users via Client SDK switches active session. In production, use Admin SDK / Cloud Function. Creating Firestore entry directly.");

  // Pre-seed user record
  await addDoc(collection(db, "users"), { email, name, role });
  alert("User profile record created!");
});

// --- EXCEL REPORTS (ExcelJS Integration) ---
async function exportDailyRevenue() {
  const dateVal = document.getElementById("revenueDateFilter").value;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Daily Revenue");

  sheet.columns = [
    { header: "Room No", key: "room", width: 15 },
    { header: "Food Bill", key: "food", width: 15 },
    { header: "Laundry Bill", key: "laundry", width: 15 },
    { header: "Total", key: "total", width: 15 }
  ];

  Object.values(state.rooms).forEach(r => {
    const stay = r.currentStay || {};
    sheet.addRow({
      room: r.roomNumber,
      food: stay.foodBill || 0,
      laundry: stay.laundryBill || 0,
      total: (stay.foodBill || 0) + (stay.laundryBill || 0)
    });
  });

  downloadWorkbook(workbook, `Daily_Revenue_${dateVal || "All"}.xlsx`);
}

async function exportOccupiedReport() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Occupied Rooms");

  sheet.columns = [
    { header: "Room No", key: "room" },
    { header: "Guest Name", key: "guest" },
    { header: "Check-in Date", key: "checkIn" },
    { header: "Expected Check-out", key: "checkOut" },
    { header: "Tariff", key: "tariff" },
    { header: "Food Bill", key: "food" },
    { header: "Laundry Bill", key: "laundry" }
  ];

  Object.values(state.rooms)
    .filter(r => r.status === "occupied")
    .forEach(r => {
      const stay = r.currentStay || {};
      sheet.addRow({
        room: r.roomNumber,
        guest: stay.guestName,
        checkIn: stay.checkInDate,
        checkOut: stay.checkOutDate,
        tariff: stay.tariff,
        food: stay.foodBill,
        laundry: stay.laundryBill
      });
    });

  downloadWorkbook(workbook, "Occupied_Rooms_Report.xlsx");
}

async function exportPendingBillsReport() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Pending Bills");

  sheet.columns = [
    { header: "Room No", key: "room" },
    { header: "Guest Name", key: "guest" },
    { header: "Check-out Date", key: "checkOut" },
    { header: "Pending Amount", key: "amount" },
    { header: "Bill Number", key: "billNo" },
    { header: "Status", key: "status" }
  ];

  const snap = await getDocs(collection(db, "pending_bills"));
  snap.forEach(d => {
    const data = d.data();
    sheet.addRow({
      room: data.roomNumber,
      guest: data.guestName,
      checkOut: data.checkOutDate,
      amount: data.pendingAmount,
      billNo: data.pendingBillNumber,
      status: data.paymentStatus
    });
  });

  downloadWorkbook(workbook, "Pending_Bills_Report.xlsx");
}

async function exportHousekeepingReport(type) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`${type.toUpperCase()} Report`);

  sheet.columns = [
    { header: "Room No", key: "room" },
    { header: "Item", key: "item" },
    { header: "Quantity", key: "qty" },
    { header: "Staff", key: "staff" },
    { header: "Timestamp", key: "time" }
  ];

  Object.values(state.rooms).forEach(r => {
    const logs = type === "linen" ? r.housekeeping?.linenChanges : r.housekeeping?.tcmConsumption;
    (logs || []).forEach(entry => {
      sheet.addRow({
        room: r.roomNumber,
        item: entry.item,
        qty: entry.qty,
        staff: entry.staff,
        time: entry.timestamp
      });
    });
  });

  downloadWorkbook(workbook, `${type.toUpperCase()}_Consumption_Report.xlsx`);
}

async function downloadWorkbook(workbook, filename) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

// SYSTEM UTILS
function switchTab(tab) {
  document.getElementById("dashboardTab").classList.add("hidden");
  document.getElementById("adminTab").classList.add("hidden");
  
  if (tab === "admin") {
    document.getElementById("adminTab").classList.remove("hidden");
    loadAdminPanel();
  } else {
    document.getElementById("dashboardTab").classList.remove("hidden");
  }
}

function closeModals() {
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
}

function logout() {
  signOut(auth);
}

// Global Namespace Export for Inline HTML Handler Bindings
window.app = {
  switchTab,
  logout,
  closeModals,
  saveReceptionData,
  processCheckout,
  toggleHkTask,
  recordLinenChange,
  recordTcmChange,
  loadCatalogToAdmin,
  addCatalogItem,
  removeCatalogItem,
  updatePendingBill,
  exportDailyRevenue,
  exportOccupiedReport,
  exportPendingBillsReport,
  exportHousekeepingReport
};