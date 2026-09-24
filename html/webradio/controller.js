/**
 * controller.js - Web radio controller layer
 *
 * Links the Model (model.js) and View (view.js):
 *  - Creates the openHAB client (openhab.js, unchanged)
 *  - loads stations.json and creates the StationList
 *  - binds the Player, Mute, and Volume items from WEBRADIO_CONFIG
 *  - loads the initial states and keeps the SSE stream (ItemStateChangedEvent) open
 */
(function () {
  "use strict";

  const { ItemStore, StationList } = window.OHModel;
  const View = window.RadioView;

  const App = {
    store: null,
    api: null,
    itemEvents: null,
    stations: null,
    player: null,
    mute: null,
    volume: null,
    current: null,
    pending: null, // Selected channel until openHAB confirms the change via SSE

    async init() {
      const oh = window.OPENHAB_CONFIG || {};
      const cfg = window.WEBRADIO_CONFIG || {};
      View.setTitle(cfg.title);

      const missing = ["playerItem", "muteItem", "volumeItem"].filter((k) => !cfg[k]);
      if (missing.length) {
        View.setStatus("config.js: " + missing.join(", ") + " is missing", true);
        return;
      }
      if (typeof openHAB === "undefined") {
        View.setStatus("openhab.js not loaded", true);
        return;
      }

      const url = oh.url || window.location.origin;
      const client = new openHAB.OpenHABClient(url, oh.username, oh.password, oh.token);
      this.api = new openHAB.Items(client);
      this.itemEvents = new openHAB.ItemEvents(client);
      this.store = new ItemStore(this.api, (msg) => {
        if (/^Error/.test(msg)) View.toast(msg);
      });

      // Sonos items from the config
      this.player = this.store.get(cfg.playerItem);
      this.mute = this.store.get(cfg.muteItem);
      this.volume = this.store.get(cfg.volumeItem);

      // Channel list load
      let list;
      try {
        const res = await fetch(cfg.stationsFile || "stations.json", { cache: "no-cache" });
        list = await res.json();
      } catch (err) {
        console.error(err);
        View.setStatus("Error at loading " + (cfg.stationsFile || "stations.json"), true);
        return;
      }
      this.stations = new StationList(Array.isArray(list) ? list : [], this.store);
      View.renderStationList(this.stations.stations);

      // Model -> View
      this.stations.subscribe((station) => {
        if (this.pending) {
          if (station && station.itemname === this.pending.itemname) {
            this.pending = null; // Change confirmed
          } else {
            return; // Intermediate state (old station OFF, new station not yet ON) not to be displayed
          }
        }
        this.current = station;
        View.renderStation(station);
        this.renderStatus();
      });
      this.player.subscribe((state) => {
        View.renderPlayer(state);
        this.renderStatus();
      });
      this.mute.subscribe((state) => View.renderMute(state));
      this.volume.subscribe((state) => View.renderVolume(state));

      // View -> Model
      View.bindActions({
        onSearch: (q) => View.renderStationList(this.stations.filter(q)),
        onSelect: (itemname) => this.selectStation(itemname),
        onTogglePlay: () => {
          const cmd = this.player.state === "PLAY" ? "PAUSE" : "PLAY";
          View.renderPlayer(cmd); // optimistic, confirmed/corrected via SSE
          this.player.sendCommand(cmd);
        },
        onToggleMute: () => {
          const cmd = this.mute.state === "ON" ? "OFF" : "ON";
          View.renderMute(cmd);
          this.mute.sendCommand(cmd);
        },
        onVolume: (value) => this.volume.sendCommand(String(value)),
      });

      View.setStatus("Connecting to openHAB...");
      await this.store.loadInitial();
      this.renderStatus();

      this.connectEventStream();
    },

    async selectStation(itemname) {
      const station = this.stations.find(itemname);
      if (!station) return;
      this.pending = station;
      View.renderStation(station); // optimistic
      View.setStatus("Switching to " + station.label + " ...");
      await this.stations.select(itemname);

      // If no confirmation is received (e.g., the item was already ON -> no state change)
      setTimeout(() => {
        if (this.pending !== station) return;
        this.pending = null;
        this.current = this.stations.active();
        View.renderStation(this.current);
        this.renderStatus();
      }, 3000);
    },

    renderStatus() {
      if (!this.current) {
        View.setStatus("No station active");
        return;
      }
      const st = this.player && this.player.state;
      View.setStatus(st === "PLAY" ? "Live" : st === "PAUSE" ? "Paused" : "Ready");
    },

    async connectEventStream() {
      try {
        const response = await this.itemEvents.ItemStateChangedEvent("*");
        if (!response.ok) throw new Error("HTTP " + response.status);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              this.handleItemEvent(JSON.parse(line.slice(6)));
            } catch (e) {
              /* Ignore unknown event format */
            }
          }
        }
        throw new Error("Stream ended");
      } catch (err) {
        console.error("openHAB SSE connection lost; retrying in 5 seconds", err);
        setTimeout(() => {
          this.store.loadInitial(); // Catch up on missed changes
          this.connectEventStream();
        }, 5000);
      }
    },

    handleItemEvent(evt) {
      const match = /openhab\/items\/([^/]+)\/statechanged$/.exec(evt.topic || "");
      if (!match) return;
      try {
        const payload = JSON.parse(evt.payload);
        const state = payload.value !== undefined ? payload.value : payload;
        this.store.applyEvent(match[1], String(state));
      } catch (e) {
        /* Payload not parseable - ignore */
      }
    },
  };

  window.RadioController = { App };

  window.addEventListener("load", () => App.init());
})();
