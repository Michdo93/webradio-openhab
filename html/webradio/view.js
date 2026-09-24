/**
 * view.js - View layer of the web radio
 *
 * Interacts only with the DOM. Renders states provided by the controller and
 * reports user actions to the controller via callbacks (bindActions).
 * No direct communication with openHAB.
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const el = {
    title: $("radioTitle"),
    trigger: $("stationTrigger"),
    status: $("statusMsg"),
    playBtn: $("playBtn"),
    muteBtn: $("muteBtn"),
    volume: $("volumeSlider"),
    volumeValue: $("volumeValue"),
    modal: $("modalOverlay"),
    closeBtn: $("closeBtn"),
    search: $("searchInput"),
    list: $("stationList"),
    count: $("stationCount"),
    toast: $("toast"),
  };

  let activeItem = null;     // item name of the active station
  let draggingVolume = false; // do not apply live updates while drawing
  let toastTimer = null;
  let actions = {};

  function setTitle(text) {
    if (!text) return;
    el.title.innerText = text;
    document.title = text;
  }

  function setStatus(msg, isError = false) {
    el.status.innerText = msg;
    el.status.classList.toggle("error", isError);
  }

  function toast(msg) {
    el.toast.innerText = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2500);
  }

  function renderStation(station) {
    activeItem = station ? station.itemname : null;
    el.trigger.innerText = station ? station.label : "Select station";
    el.trigger.classList.toggle("idle", !station);
    el.list.querySelectorAll(".station-item").forEach((div) => {
      div.classList.toggle("active", div.dataset.item === activeItem);
    });
  }

  function renderPlayer(state) {
    const playing = state === "PLAY";
    el.playBtn.innerText = playing ? "Pause" : "Play";
    el.playBtn.classList.toggle("on", playing);
    el.playBtn.setAttribute("aria-pressed", String(playing));
  }

  function renderMute(state) {
    const muted = state === "ON";
    el.muteBtn.innerText = muted ? "Unmute" : "Mute";
    el.muteBtn.classList.toggle("on", muted);
    el.muteBtn.setAttribute("aria-pressed", String(muted));
    el.volume.classList.toggle("muted", muted);
  }

  function renderVolume(state) {
    if (draggingVolume) return;
    const v = Math.round(parseFloat(state));
    if (isNaN(v)) return;
    el.volume.value = Math.max(0, Math.min(100, v));
    el.volumeValue.innerText = el.volume.value + "%";
  }

  function renderStationList(stations) {
    const frag = document.createDocumentFragment();
    stations.forEach((s) => {
      const div = document.createElement("div");
      div.className = "station-item";
      div.dataset.item = s.itemname;
      div.tabIndex = 0;
      div.setAttribute("role", "option");
      div.innerText = s.label;
      if (s.itemname === activeItem) div.classList.add("active");
      frag.appendChild(div);
    });
    el.list.innerHTML = "";
    el.list.appendChild(frag);
    el.count.innerText = stations.length + " stations";
  }

  function openModal() {
    el.modal.classList.add("open");
    el.search.value = "";
    if (actions.onSearch) actions.onSearch("");
    el.search.focus();
    const act = el.list.querySelector(".station-item.active");
    if (act) act.scrollIntoView({ block: "center" });
  }

  function closeModal() {
    el.modal.classList.remove("open");
    el.trigger.focus();
  }

  /** Links DOM events to controller callbacks. */
  function bindActions(cb) {
    actions = cb;

    el.trigger.addEventListener("click", openModal);
    el.trigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(); }
    });
    el.closeBtn.addEventListener("click", closeModal);
    el.modal.addEventListener("click", (e) => { if (e.target === el.modal) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.modal.classList.contains("open")) closeModal();
    });

    el.search.addEventListener("input", () => cb.onSearch(el.search.value));

    const pick = (target) => {
      const div = target.closest(".station-item");
      if (!div) return;
      cb.onSelect(div.dataset.item);
      closeModal();
    };
    el.list.addEventListener("click", (e) => pick(e.target));
    el.list.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pick(e.target);
    });

    el.playBtn.addEventListener("click", () => cb.onTogglePlay());
    el.muteBtn.addEventListener("click", () => cb.onToggleMute());

    el.volume.addEventListener("input", () => {
      draggingVolume = true;
      el.volumeValue.innerText = el.volume.value + "%";
    });
    el.volume.addEventListener("change", () => {
      draggingVolume = false;
      cb.onVolume(el.volume.value);
    });
  }

  window.RadioView = {
    setTitle,
    setStatus,
    toast,
    renderStation,
    renderPlayer,
    renderMute,
    renderVolume,
    renderStationList,
    bindActions,
  };
})();
