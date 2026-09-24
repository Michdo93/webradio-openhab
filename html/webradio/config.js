/**
 * config.js
 * The only file that needs to be customized for your specific environment.
 * Read by controller.js—the rest of the code works exclusively
 * with the names defined here.
 */

// Connection to the openHAB instance (same structure as in the dashboard)
window.OPENHAB_CONFIG = {
  // Base URL, e.g., “http://192.168.1.10:8080”.
  // null = same origin as the page (if it is served by openHAB from the conf/html/ directory)
  url: "http://192.168.0.X:8080",

  // Option A: Basic Authentication
  username: null,
  password: null,

  // Option B (recommended): API-Token - MUST be enclosed in quotation marks
  token: "oh.XXXXXX.YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
};

// Web radio control: Items on the Sonos device where the rules are played
window.WEBRADIO_CONFIG = {
  // Player-Item: PLAY / PAUSE
  playerItem: "Sonos_Controller",

  // Switch item: ON = mute, OFF = sound on
  muteItem: "Sonos_Mute",

  // Dimmer item: 0-100
  volumeItem: "Sonos_Volume",

  // Channel list (array of { itemname, label })
  stationsFile: "stations.json",

  // Title at the top of the page
  title: "WebRadio",
};
