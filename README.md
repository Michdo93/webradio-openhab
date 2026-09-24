# 📻 WebRadio for openHAB

Static control page for the web radio in openHAB. The page itself does not play anything:
It sets the switch item for the selected station to `ON`, and an openHAB rule then
starts the stream on the Sonos device.

## File Structure (MVC)

```text
├── index.html     # Markup + Styling
├── config.js      # openHAB Connection + Sonos Items (the only file that needs to be modified)
├── openhab.js     # REST Client Library (unchanged, DO NOT edit)
├── model.js       # OHItem / ItemStore (like Dashboard) + StationList
├── view.js        # DOM rendering, reports actions to the controller
├── controller.js  # Model <-> View Integration, SSE Live Updates
└── stations.json  # Channel List: itemname + label
```

## Configuration (`config.js`)

```js
window.WEBRADIO_CONFIG = {
  playerItem: "Sonos_Controller", // Player: PLAY / PAUSE
  muteItem:   "Sonos_Mute",         // Switch: ON / OFF
  volumeItem: "Sonos_Volume",   // Dimmer: 0-100
  stationsFile: "stations.json",
  title: "WebRadio",
};
```

## List of Channels (`stations.json`)

```json
[
  { "itemname": "iWebradio_88vier", "label": "88vier" }
]
```

`itemname` is the name of the switch item, and `label` is the text that appears.

## Procedure

| Action        | REST command                                                     |
|---------------|-----------------------------------------------------------------|
| Select Channel | All other channel items that are `ON` → `OFF`, then the new one → `ON` |
| Play/Pause    | `playerItem` → `PLAY` or `PAUSE`                              |
| Mute/Unmute   | `muteItem` → `ON` or `OFF`                                    |
| Volume    | `volumeItem` → `0`…`100` (when the slider is released)            |

All states (active station, player, mute, volume) are updated in real time via
`ItemStateChangedEvent` (SSE)—even when they are changed via Rules,
the Sitemap, or the Sonos app.

## Deployment

Copy the folder to `$OPENHAB_CONF/html/webradio/` → accessible at
`http://<openhab>:8080/static/webradio/index.html`. If the page is served by openHAB
itself, `url: null` can be set (same origin).
