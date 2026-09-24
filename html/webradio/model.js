/**
 * model.js - Model layer (Observable)
 *
 * OHItem   - a single openHAB item: name, last known state,
 *            list of subscribers (observer pattern).
 * ItemStore - Registry of all items used in the dashboard. Creates a
 *             new OHItem as needed, loads the initial state, and
 *             handles incoming ItemStateChangedEvents.
 *
 * Knows neither DOM nor openHAB connection details - only the objects
 * "api" (with getItemState/sendCommand) and optionally "notify" (e.g., Toast)
 * are injected from the outside (Dependency Injection).
 */
(function () {
  "use strict";

  class OHItem {
    constructor(name, api, notify) {
      this.name = name;
      this.state = undefined;
      this.pattern = null; // stateDescription.pattern from openHAB (e.g., “%.3f kWh”, “%1$tH:%1$tM”)
      this._api = api;
      this._notify = notify || function () {};
      this._observers = new Set();
    }

    /** The view subscribes to changes. If a state is already known, it is immediately
     *  called once with the current state. Returns an unsubscribe function. */
    subscribe(fn) {
      this._observers.add(fn);
      if (this.state !== undefined) fn(this.state, this);
      return () => this._observers.delete(fn);
    }

    /** Sets the state and notifies all subscribers - regardless of whether the new
     *  value comes from the initial load or a live event (SSE). */
    setState(newState) {
      this.state = newState;
      this._observers.forEach((fn) => fn(newState, this));
    }

    /** Sends a command to the actual item (POST /rest/items/{name}). */
    sendCommand(command) {
      if (!this._api) return Promise.resolve();
      return this._api
        .sendCommand(this.name, command)
        .then(() => this._notify(`${this.name} → ${command}`))
        .catch((err) => {
          console.error("sendCommand", this.name, err);
          this._notify(`Error sending to ${this.name}`);
        });
    }

    /** Loads the current state once via REST (GET /rest/items/{name}/state). */
    refresh() {
      if (!this._api) return Promise.resolve();
      return this._api
        .getItemState(this.name)
        .then((state) => {
          // If the response body is empty, openhab.js returns a {status:...} object
          // instead of a string (e.g., for string items with no current value, such as
          // Sonos track/artist when nothing is currently playing). This is a
          // valid empty state, not an error.
          this.setState(typeof state === "string" ? state : "");
        })
        .catch((err) => console.warn("No state for", this.name, err));
    }
  }

  class ItemStore {
    constructor(api, notify) {
      this._api = api;
      this._notify = notify;
      this._items = new Map();
    }

    get(name) {
      if (!this._items.has(name)) {
        this._items.set(name, new OHItem(name, this._api, this._notify));
      }
      return this._items.get(name);
    }

    /** Loads the initial state of all referenced items in a single
     *  REST call (GET /rest/items?fields=name,state), instead of querying each item individually.
     *  With hundreds of items, many parallel individual requests
     *  would otherwise overwhelm the browser (connection limit) or the server - leading to
     *  regularly missing/empty displays without a clear error. */
    async loadInitial() {
      if (!this._api || this._items.size === 0) return;
      try {
        const list = await this._api.getItems({ fields: "name,state,stateDescription" });
        const byName = new Map(list.map((it) => [it.name, it]));
        for (const [name, item] of this._items) {
          if (byName.has(name)) {
            const it = byName.get(name);
            item.pattern = (it.stateDescription && it.stateDescription.pattern) || null;
            const raw = it.state;
            item.setState(typeof raw === "string" ? raw : String(raw ?? ""));
          } else {
            console.warn("Item does not exist in /rest/items:", name);
          }
        }
      } catch (err) {
        console.error("Could not load item list in one go, falling back to individual queries:", err);
        await Promise.all(Array.from(this._items.values()).map((item) => item.refresh()));
      }
    }

    /** Called by the SSE handler for every incoming ItemStateChangedEvent. */
    applyEvent(name, state) {
      if (this._items.has(name)) this._items.get(name).setState(state);
      // We intentionally ignore items that are not bound on this page.
    }
  }

  window.OHModel = { OHItem, ItemStore };
})();

/**
 * Web radio extension of the model layer
 *
 * StationList - List of stations from stations.json. Each station is a
 *               switch item in the ItemStore; the active station is the item
 *               whose state is “ON.” When switching, the old station is
 *               set to OFF via sendCommand, and then the new one is set to ON
 *               (the openHAB rule handles playback on the Sonos).
 */
(function () {
  "use strict";

  class StationList {
    /**
     * @param {Array<{itemname:string,label:string}>} stations
     * @param {ItemStore} store
     */
    constructor(stations, store) {
      this.stations = stations
        .filter((s) => s && s.itemname)
        .map((s) => ({ itemname: s.itemname, label: s.label || s.itemname }));
      this._store = store;
      this._observers = new Set();
      this._scheduled = false;

      // Register and subscribe to each sender item in the store. Changes
      // are bundled (microtask) because loadInitial() sets all items at once.
      this.stations.forEach((s) => {
        this._store.get(s.itemname).subscribe(() => this._schedule());
      });
    }

    item(itemname) {
      return this._store.get(itemname);
    }

    find(itemname) {
      return this.stations.find((s) => s.itemname === itemname) || null;
    }

    /** The first channel whose item is set to ON (or zero). */
    active() {
      return this.stations.find((s) => this.item(s.itemname).state === "ON") || null;
    }

    /** Observe changes to the active station. */
    subscribe(fn) {
      this._observers.add(fn);
      fn(this.active());
      return () => this._observers.delete(fn);
    }

    _schedule() {
      if (this._scheduled) return;
      this._scheduled = true;
      queueMicrotask(() => {
        this._scheduled = false;
        const a = this.active();
        this._observers.forEach((fn) => fn(a));
      });
    }

    /** Case-insensitive search in the label (and item names). */
    filter(query) {
      const q = (query || "").trim().toLowerCase();
      if (!q) return this.stations;
      return this.stations.filter(
        (s) => s.label.toLowerCase().includes(q) || s.itemname.toLowerCase().includes(q)
      );
    }

    /** Turn off all other active stations, then turn on the selected one. */
    async select(itemname) {
      const others = this.stations.filter(
        (s) => s.itemname !== itemname && this.item(s.itemname).state === "ON"
      );
      await Promise.all(others.map((s) => this.item(s.itemname).sendCommand("OFF")));
      await this.item(itemname).sendCommand("ON");
    }
  }

  window.OHModel.StationList = StationList;
})();
