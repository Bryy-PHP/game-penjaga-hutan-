const pages = document.querySelectorAll(".page");
const navItems = document.querySelectorAll(".nav-item");
const ecoPointsEl = document.getElementById("ecoPoints");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const storageKey = "penjagaHutan.progress.v1";
const player = { x: 100, y: 110, speed: 3.2 };
const missions = [
  {
    title: "Tanam Pohon",
    eyebrow: "LEVEL 1 · MISI MENANAM",
    instructions: "Jelajahi rimba dan kumpulkan bibit pohon untuk memulihkan hutan.",
    itemName: "bibit",
    completeText: "Bibit berhasil ditanam! Teruskan petualanganmu.",
    items: [[260, 210], [440, 300], [650, 190], [180, 410], [760, 420]]
  },
  {
    title: "Bersihkan Sungai",
    eyebrow: "LEVEL 2 · MISI MEMBERSIHKAN",
    instructions: "Bantu sungai kembali jernih dengan mengumpulkan sampah di tepiannya.",
    itemName: "sampah",
    completeText: "Sampah berhasil dibersihkan! Sungai berterima kasih padamu.",
    items: [[260, 210], [440, 300], [650, 190], [180, 410], [760, 420]]
  },
  {
    title: "Selamatkan Satwa",
    eyebrow: "LEVEL 3 · MISI PENYELAMATAN",
    instructions: "Temukan satwa yang membutuhkan bantuan dan dekati untuk menolongnya.",
    itemName: "satwa",
    completeText: "Satwa berhasil ditolong! Kamu sahabat sejati rimba.",
    items: [[260, 210], [440, 300], [650, 190]]
  }
];
const goal = mission => mission.items.length;
const treePositions = [
  [100, 300], [220, 120], [370, 360], [540, 110],
  [760, 300], [820, 100], [600, 410], [280, 420],
  [55, 180], [350, 80], [710, 365], [500, 220]
];
const keysDown = Object.create(null);
let ecoPoints = 0;
let totalXp = 0;
let completedLevels = [false, false, false];
let currentLevel = 1;
let items = [];
let collected = 0;
let missionCompleted = false;
let runInProgress = false;
let running = false;
let paused = false;
let pickupEffect = null;
let messageTimer = null;
let lastSaveAt = 0;

function loadProgress() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      makeItems();
      return;
    }
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1) {
      makeItems();
      return;
    }

    if (Number.isSafeInteger(saved.ecoPoints) && saved.ecoPoints >= 0) ecoPoints = saved.ecoPoints;
    if (Number.isSafeInteger(saved.totalXp) && saved.totalXp >= 0) totalXp = saved.totalXp;
    if (Array.isArray(saved.completedLevels) && saved.completedLevels.length === missions.length) {
      completedLevels = saved.completedLevels.map(value => value === true);
    }

    const availableLevel = firstAvailableLevel();
    currentLevel = Number.isInteger(saved.currentLevel) &&
      saved.currentLevel >= 1 && saved.currentLevel <= missions.length &&
      (saved.currentLevel === 1 || completedLevels[saved.currentLevel - 2])
      ? saved.currentLevel : availableLevel;
    runInProgress = saved.runInProgress === true;
    makeItems();

    if (Number.isInteger(saved.collected) && saved.collected >= 0 && saved.collected < goal(missions[currentLevel - 1])) {
      collected = saved.collected;
      items.forEach((item, index) => {
        item.taken = index < collected;
      });
    }
    if (saved.player && Number.isFinite(saved.player.x) && Number.isFinite(saved.player.y)) {
      player.x = Math.max(25, Math.min(canvas.width - 25, saved.player.x));
      player.y = Math.max(45, Math.min(canvas.height - 25, saved.player.y));
    }
  } catch (error) {
    console.error("Progres Penjaga Hutan gagal dimuat dari penyimpanan lokal.", error);
    makeItems();
  }
}

function saveProgress() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({
      version: 1,
      ecoPoints,
      totalXp,
      completedLevels,
      currentLevel,
      runInProgress,
      collected,
      player: { x: player.x, y: player.y }
    }));
    return true;
  } catch (error) {
    console.error("Progres Penjaga Hutan gagal disimpan ke penyimpanan lokal.", error);
    return false;
  }
}

function playerLevel() {
  return Math.floor(totalXp / 100) + 1;
}

function xpIntoLevel() {
  return totalXp % 100;
}

function showPage(pageId) {
  if (pageId !== "game" && document.getElementById("game").classList.contains("active") &&
      !missionCompleted && !paused) {
    setPaused(true);
  }
  pages.forEach(page => page.classList.toggle("active", page.id === pageId));
  navItems.forEach(item => item.classList.toggle("active", item.dataset.page === pageId));
  if (pageId === "game") startGameLoop();
}

function firstAvailableLevel() {
  const nextLevel = completedLevels.findIndex(done => !done);
  return nextLevel === -1 ? 1 : nextLevel + 1;
}

function startMission(level, shouldResume = false) {
  if (level < 1 || level > missions.length || (level > 1 && !completedLevels[level - 2])) {
    return;
  }
  currentLevel = level;
  if (shouldResume && runInProgress && !missionCompleted) {
    updateGameLabels();
    setMessage(`Progres tersimpan dipulihkan: ${collected}/${goal(missions[currentLevel - 1])}.`);
    showPage("game");
    return;
  }
  resetGame();
  showPage("game");
}

document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");
  const actionButton = event.target.closest("[data-action]");
  const levelButton = event.target.closest("[data-level]");

  if (levelButton) {
    startMission(Number(levelButton.dataset.level));
  } else if (pageButton) {
    event.preventDefault();
    showPage(pageButton.dataset.page);
  } else if (actionButton?.dataset.action === "start") {
    startMission(firstAvailableLevel(), true);
  } else if (actionButton?.dataset.action === "replay") {
    startMission(currentLevel);
  }
});

function makeItems() {
  items = missions[currentLevel - 1].items.map(([x, y], index) => ({
    x, y, index, taken: false
  }));
}

function resetGame() {
  paused = false;
  runInProgress = true;
  document.getElementById("pauseOverlay").hidden = true;
  document.getElementById("pauseGame").setAttribute("aria-pressed", "false");
  player.x = 100;
  player.y = 110;
  collected = 0;
  missionCompleted = false;
  makeItems();
  updateGameLabels();
  setMessage(`Ayo kumpulkan ${goal(missions[currentLevel - 1])} ${missions[currentLevel - 1].itemName} untuk menyelesaikan misi!`);
  drawGame();
  saveProgress();
}

function updateGameLabels() {
  const mission = missions[currentLevel - 1];
  document.getElementById("levelEyebrow").textContent = mission.eyebrow;
  document.getElementById("gameTitle").textContent = mission.title;
  document.getElementById("gameInstructions").textContent = mission.instructions;
  document.getElementById("canvasLevel").textContent = `LEVEL ${currentLevel}`;
  document.getElementById("seedCount").textContent = `${collected}/${goal(mission)}`;
  document.getElementById("gamePoints").textContent = collected * 20;
  document.getElementById("playerLevel").textContent = playerLevel();
  document.getElementById("xpValue").textContent = xpIntoLevel();
  document.getElementById("xpBar").style.width = `${xpIntoLevel()}%`;
  document.getElementById("mapProgress").textContent = `${completedLevels.filter(Boolean).length} / 3`;
  document.getElementById("mapProgressBar").style.width = `${completedLevels.filter(Boolean).length / 3 * 100}%`;
  updateMapNodes();
}

function updateMapNodes() {
  document.querySelectorAll(".map-node").forEach(node => {
    const level = Number(node.dataset.level);
    const unlocked = level === 1 || completedLevels[level - 2];
    const completed = completedLevels[level - 1];
    node.classList.toggle("locked", !unlocked);
    node.classList.toggle("completed", completed);
    node.setAttribute("aria-disabled", String(!unlocked));
    node.disabled = !unlocked;
    node.querySelector(".node-state").textContent = completed
      ? "MISI SELESAI"
      : unlocked ? "MISI TERSEDIA" : "TERKUNCI";
  });
}

function startGameLoop() {
  if (running || paused) return;
  running = true;
  loop();
}

function loop() {
  if (!document.getElementById("game").classList.contains("active")) {
    running = false;
    return;
  }
  if (paused) {
    running = false;
    return;
  }
  updatePlayer();
  drawGame();
  requestAnimationFrame(loop);
}

function updatePlayer() {
  if (keysDown.arrowup || keysDown.w) player.y -= player.speed;
  if (keysDown.arrowdown || keysDown.s) player.y += player.speed;
  if (keysDown.arrowleft || keysDown.a) player.x -= player.speed;
  if (keysDown.arrowright || keysDown.d) player.x += player.speed;
  player.x = Math.max(25, Math.min(canvas.width - 25, player.x));
  player.y = Math.max(45, Math.min(canvas.height - 25, player.y));
  if (Date.now() - lastSaveAt > 1000) {
    saveProgress();
    lastSaveAt = Date.now();
  }
}

document.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  const isGameActive = document.getElementById("game").classList.contains("active");
  if (isGameActive && ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }
  if (isGameActive && (key === "escape" || key === "p")) {
    event.preventDefault();
    setPaused(!paused);
    return;
  }
  if (paused) return;
  keysDown[key] = true;
  if (event.code === "Space" && isGameActive) {
    collectItem();
  }
});

document.addEventListener("keyup", event => {
  keysDown[event.key.toLowerCase()] = false;
});

function setMessage(text) {
  const message = document.getElementById("gameMessage");
  message.textContent = text;
  window.clearTimeout(messageTimer);
  messageTimer = window.setTimeout(() => {
    if (!missionCompleted && document.getElementById("game").classList.contains("active")) {
      message.textContent = missions[currentLevel - 1].instructions;
    }
  }, 3000);
}

function collectItem() {
  if (missionCompleted || paused) return;
  const item = items.find(candidate => !candidate.taken &&
    Math.hypot(player.x - candidate.x, player.y - candidate.y) < 55);
  if (!item) {
    setMessage(`Dekati ${missions[currentLevel - 1].itemName} terlebih dahulu, lalu tekan SPACE.`);
    return;
  }
  item.taken = true;
  collected++;
  pickupEffect = { x: item.x, y: item.y, startedAt: performance.now() };
  ecoPoints += 20;
  ecoPointsEl.textContent = ecoPoints;
  updateGameLabels();
  saveProgress();
  const mission = missions[currentLevel - 1];
  if (collected === goal(mission)) {
    completeMission();
  } else {
    setMessage(mission.completeText);
  }
}

function completeMission() {
  missionCompleted = true;
  runInProgress = false;
  completedLevels[currentLevel - 1] = true;
  totalXp += 50;
  const reward = collected * 20;
  updateGameLabels();

  const itemName = missions[currentLevel - 1].itemName;
  const count = goal(missions[currentLevel - 1]);
  document.getElementById("successMessage").textContent =
    currentLevel < missions.length
      ? "Terima kasih sudah membantu menjaga hutan. Wilayah berikutnya kini terbuka!"
      : "Terima kasih sudah membantu menjaga hutan dan seluruh penghuninya.";
  document.getElementById("successObjective").textContent =
    `${count} / ${count} ${itemName.charAt(0).toUpperCase()}${itemName.slice(1)} terkumpul`;
  document.getElementById("successReward").textContent = `+${reward} Eco Point`;
  document.getElementById("successLevel").textContent = playerLevel();
  document.getElementById("successXp").textContent = `${xpIntoLevel()}/100 XP`;
  document.getElementById("successXpBar").style.width = `${xpIntoLevel()}%`;
  saveProgress();
  setMessage("Hebat! Misi berhasil diselesaikan.");
  window.setTimeout(() => showPage("success"), 650);
}

function setPaused(value) {
  if (missionCompleted && value) return;
  paused = value;
  keysDown.w = false;
  keysDown.a = false;
  keysDown.s = false;
  keysDown.d = false;
  keysDown.arrowup = false;
  keysDown.arrowdown = false;
  keysDown.arrowleft = false;
  keysDown.arrowright = false;
  document.getElementById("pauseOverlay").hidden = !paused;
  document.getElementById("pauseGame").setAttribute("aria-pressed", String(paused));
  document.getElementById("pauseGame").setAttribute("aria-label", paused ? "Lanjutkan permainan" : "Jeda permainan");
  document.getElementById("pauseGame").innerHTML = paused ? "<span>▶</span> LANJUT" : "<span>Ⅱ</span> JEDA";
  if (paused) {
    saveProgress();
  } else {
    startGameLoop();
  }
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawGame() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#a9d77c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 12; x < canvas.width; x += 34) {
    for (let y = 12; y < canvas.height; y += 31) {
      const shade = ((x * 7 + y * 3) % 4);
      ctx.fillStyle = shade === 0 ? "#c2e38c" : "#b6df86";
      ctx.beginPath();
      ctx.ellipse(x + (y % 3), y, 2, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRiver();
  drawEnvironment();
  items.forEach(item => {
    if (!item.taken) drawMissionItem(item);
  });
  drawPickupEffect();
  const isWalking = keysDown.w || keysDown.a || keysDown.s || keysDown.d ||
    keysDown.arrowup || keysDown.arrowdown || keysDown.arrowleft || keysDown.arrowright;
  drawRanger(player.x, player.y, isWalking);
  drawInteractionHint();
  const miniPlayer = document.querySelector(".mini-player");
  miniPlayer.style.left = `${player.x / canvas.width * 100}%`;
  miniPlayer.style.top = `${player.y / canvas.height * 100}%`;

  ctx.fillStyle = "#f4e3a8";
  ctx.font = "800 10px Nunito, Arial";
  ctx.textAlign = "right";
  ctx.fillText("RIMBA NUSANTARA · JAGA ALAM", canvas.width - 18, canvas.height - 15);
  ctx.textAlign = "left";
}

function drawPickupEffect() {
  if (!pickupEffect) return;
  const elapsed = performance.now() - pickupEffect.startedAt;
  if (elapsed > 500) {
    pickupEffect = null;
    return;
  }
  const progress = elapsed / 500;
  ctx.save();
  ctx.translate(pickupEffect.x, pickupEffect.y);
  ctx.globalAlpha = 1 - progress;
  ctx.strokeStyle = "#ffe17b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 12 + progress * 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#fff3ad";
  for (let index = 0; index < 6; index++) {
    const angle = index * Math.PI / 3;
    const distance = 10 + progress * 24;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawRiver() {
  ctx.beginPath();
  ctx.moveTo(0, 350);
  ctx.quadraticCurveTo(250, 290, 430, 390);
  ctx.quadraticCurveTo(620, 470, 900, 330);
  ctx.lineTo(900, 410);
  ctx.quadraticCurveTo(620, 540, 400, 440);
  ctx.quadraticCurveTo(210, 340, 0, 410);
  ctx.closePath();
  ctx.fillStyle = "#d8c58d";
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 365);
  ctx.quadraticCurveTo(250, 305, 430, 405);
  ctx.quadraticCurveTo(620, 485, 900, 345);
  ctx.lineTo(900, 390);
  ctx.quadraticCurveTo(620, 525, 400, 425);
  ctx.quadraticCurveTo(210, 325, 0, 395);
  ctx.closePath();
  ctx.fillStyle = "#63c2df";
  ctx.fill();
  ctx.strokeStyle = "#a9e3e1";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(30, 375);
  ctx.quadraticCurveTo(245, 329, 425, 410);
  ctx.stroke();
}

function drawEnvironment() {
  treePositions.forEach(([x, y], index) => drawTree(x, y, index % 3 === 0 ? 1.08 : 0.9));

  [[155, 250], [330, 250], [700, 270], [120, 450], [830, 230]].forEach(([x, y], index) => {
    ctx.fillStyle = index % 2 ? "#57874b" : "#6b9b53";
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 12, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 10, y + 3, 13, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 11, y + 3, 14, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f2d879";
    ctx.beginPath();
    ctx.arc(x + 4, y - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  [[315, 180], [590, 330], [80, 260], [815, 450], [500, 205]].forEach(([x, y], index) => {
    ctx.fillStyle = index % 2 ? "#8b9877" : "#9ca383";
    ctx.beginPath();
    ctx.ellipse(x, y, 12, 8, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8b99a";
    ctx.beginPath();
    ctx.ellipse(x - 3, y - 3, 5, 2, -0.2, 0, Math.PI * 2);
    ctx.fill();
  });

  [[475, 145], [845, 245], [345, 460]].forEach(([x, y]) => {
    ctx.fillStyle = "#79583b";
    ctx.beginPath();
    ctx.ellipse(x, y, 15, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#bb9662";
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6f8f50";
    ctx.beginPath();
    ctx.arc(x + 13, y + 3, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  [[705, 255], [380, 435], [75, 435]].forEach(([x, y], index) => drawTrash(index, x, y, 0.62));
}

function drawTree(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "#704c32";
  roundedRect(-5, 4, 10, 22, 4);
  ctx.fill();
  ctx.fillStyle = "#397548";
  ctx.beginPath();
  ctx.arc(-11, -7, 17, 0, Math.PI * 2);
  ctx.arc(8, -11, 19, 0, Math.PI * 2);
  ctx.arc(0, -21, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#57924f";
  ctx.beginPath();
  ctx.arc(-10, -13, 8, 0, Math.PI * 2);
  ctx.arc(5, -24, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#315f3d";
  ctx.beginPath();
  ctx.ellipse(0, 12, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMissionItem(item) {
  const type = currentLevel;
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.fillStyle = "#31533c28";
  ctx.beginPath();
  ctx.ellipse(0, 14, 18, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  if (type === 1) {
    ctx.strokeStyle = "#775532";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 12);
    ctx.lineTo(0, -5);
    ctx.stroke();
    ctx.fillStyle = "#5e9d45";
    ctx.beginPath();
    ctx.ellipse(-6, -7, 8, 4, -0.6, 0, Math.PI * 2);
    ctx.ellipse(7, -13, 8, 4, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9bc66b";
    ctx.beginPath();
    ctx.ellipse(-7, -8, 3, 1.5, -0.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 2) {
    drawTrash(item.index);
  } else {
    drawRescueAnimal(item.index);
  }
  ctx.restore();
}

function drawTrash(index, x = 0, y = 0, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (index % 2 === 0) {
    ctx.fillStyle = "#6ab6ca";
    roundedRect(-7, -14, 14, 26, 5);
    ctx.fill();
    ctx.fillStyle = "#43899b";
    roundedRect(-4, -19, 8, 6, 2);
    ctx.fill();
    ctx.fillStyle = "#c4ecdc";
    roundedRect(-4, -8, 3, 11, 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "#e9c75f";
    ctx.beginPath();
    ctx.moveTo(-11, -10);
    ctx.lineTo(7, -13);
    ctx.lineTo(11, 7);
    ctx.lineTo(-8, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#a98039";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, -6);
    ctx.lineTo(5, -7);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRescueAnimal(index) {
  ctx.fillStyle = index === 1 ? "#be7644" : index === 2 ? "#d6a64c" : "#92714c";
  ctx.beginPath();
  ctx.ellipse(0, 1, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(10, -7, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2e7ca";
  ctx.beginPath();
  ctx.arc(12, -8, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#604833";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-7, 7);
  ctx.lineTo(-8, 13);
  ctx.moveTo(5, 7);
  ctx.lineTo(6, 13);
  ctx.stroke();
  if (index === 1) {
    ctx.strokeStyle = "#5d452f";
    ctx.beginPath();
    ctx.moveTo(12, -13);
    ctx.lineTo(8, -20);
    ctx.moveTo(12, -13);
    ctx.lineTo(16, -20);
    ctx.stroke();
  }
}

function drawRanger(x, y, walking = false) {
  ctx.save();
  const step = walking ? Math.sin(performance.now() / 75) * 2.5 : 0;
  ctx.translate(x, y + (walking ? Math.abs(step) * 0.3 : 0));
  ctx.fillStyle = "#31533c38";
  ctx.beginPath();
  ctx.ellipse(0, 15, 17, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5d432f";
  ctx.lineWidth = 6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-7, 10);
  ctx.lineTo(-9 + step, 19);
  ctx.moveTo(7, 10);
  ctx.lineTo(9 - step, 19);
  ctx.stroke();
  ctx.fillStyle = "#447d50";
  roundedRect(-12, -5, 24, 21, 7);
  ctx.fill();
  ctx.fillStyle = "#795338";
  roundedRect(-16, -5, 6, 15, 3);
  ctx.fill();
  ctx.strokeStyle = "#c9834c";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(-11, 0);
  ctx.lineTo(-15 - step, 9);
  ctx.moveTo(11, 0);
  ctx.lineTo(15 + step, 8);
  ctx.stroke();
  ctx.fillStyle = "#efc45c";
  ctx.fillRect(-3, -3, 6, 17);
  ctx.fillStyle = "#c9834c";
  ctx.beginPath();
  ctx.arc(0, -14, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e7c365";
  ctx.beginPath();
  ctx.ellipse(0, -23, 16, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#956039";
  roundedRect(-10, -30, 20, 8, 4);
  ctx.fill();
  ctx.fillStyle = "#49352a";
  ctx.beginPath();
  ctx.arc(-3, -14, 1.3, 0, Math.PI * 2);
  ctx.arc(4, -14, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawInteractionHint() {
  const nearby = items.find(item => !item.taken &&
    Math.hypot(player.x - item.x, player.y - item.y) < 62);
  if (!nearby) return;
  ctx.fillStyle = "#173d2be8";
  roundedRect(player.x - 55, player.y - 57, 110, 22, 8);
  ctx.fill();
  ctx.fillStyle = "#fff5d5";
  ctx.font = "800 10px Nunito, Arial";
  ctx.textAlign = "center";
  ctx.fillText("SPACE  ·  BANTU!", player.x, player.y - 42);
  ctx.textAlign = "left";
}

document.getElementById("restartGame").addEventListener("click", resetGame);
document.getElementById("pauseGame").addEventListener("click", () => setPaused(!paused));
document.getElementById("resumeGame").addEventListener("click", () => setPaused(false));
document.getElementById("pauseRestart").addEventListener("click", resetGame);

loadProgress();
updateGameLabels();
ecoPointsEl.textContent = ecoPoints;
document.getElementById("successLevel").textContent = playerLevel();
document.getElementById("successXp").textContent = `${xpIntoLevel()}/100 XP`;
document.getElementById("successXpBar").style.width = `${xpIntoLevel()}%`;
drawGame();
