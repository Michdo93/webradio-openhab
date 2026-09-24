from openhab import rule, Registry
from openhab.triggers import when
import scope

# --- CONFIGURATION ---
METADATA_NAMESPACE = "stream_uri"

# Direct target item for the stream URL
SONOS_PLAY_URI_ITEM = "Sonos_PlayUri"
# Player control for stopping/pausing playback
SONOS_CONTROLLER_ITEM = "Sonos_Controller"

@rule()
@when("Member of gWebradio received command")
@when("Member of gWebradio_Antenne1 received command")
@when("Member of gWebradio_RTL received command")
@when("Member of gWebradio_Antenne_Bayern received command")
@when("Member of gWebradio_Bayerischer_Rundfunk received command")
@when("Member of gWebradio_bigFM received command")
@when("Member of gWebradio_detektor_fm received command")
@when("Member of gWebradio_Deutschlandfunk received command")
@when("Member of gWebradio_egoFM received command")
@when("Member of gWebradio_Energy received command")
@when("Member of gWebradio_FluxFM received command")
@when("Member of gWebradio_Freies_Radio received command")
@when("Member of gWebradio_Hessischer_Rundfunk received command")
@when("Member of gWebradio_Hit_Radio_FFH received command")
@when("Member of gWebradio_JAM_FM received command")
@when("Member of gWebradio_Hitradio_RT1 received command")
@when("Member of gWebradio_Mitteldeutscher_Rundfunk received command")
@when("Member of gWebradio_Norddeutscher_Rundfunk received command")
@when("Member of gWebradio_Suedwestrundfunk received command")
@when("Member of gWebradio_Ostseewelle_Hit_Radio_MecklenburgVorpommern received command")
@when("Member of gWebradio_R_SA_Sachsen received command")
@when("Member of gWebradio_Radio_Arabella received command")
@when("Member of gWebradio_Radio_Bob received command")
@when("Member of gWebradio_Radio_Bremen received command")
@when("Member of gWebradio_Radio_Charivari received command")
@when("Member of gWebradio_Radio_Galaxy received command")
@when("Member of gWebradio_Radio_Lausitz received command")
@when("Member of gWebradio_Radio_NRW received command")
@when("Member of gWebradio_Radio_Regenbogen received command")
@when("Member of gWebradio_radio_TOP_40 received command")
@when("Member of gWebradio_Rock_Antenne received command")
@when("Member of gWebradio_rbb received command")
@when("Member of gWebradio_Sunshine_Live received command")
@when("Member of gWebradio_Saarlaendischer_Rundfunk received command")
@when("Member of gWebradio_Westdeutscher_Rundfunk received command")
def webradio_control_rule(module, input):
    event = input.get('event')
    if not event:
        return

    trigger_name = event.getItemName()
    command = str(event.getItemCommand())

    if command == "ON":
        # 1. Retrieve an item from the registry
        item = Registry.getItem(trigger_name)
        
        # 2. Retrieve metadata for the stream URI
        meta_proxy = item.getMetadata()
        meta_entry = meta_proxy.get(METADATA_NAMESPACE)
        
        if meta_entry and meta_entry.getValue():
            url = meta_entry.getValue()
            webradio_control_rule.logger.info("Starting stream for {}: {}".format(trigger_name, url))
            
            # Send the URI directly to the ‘Sonos_PlayUri’ item
            Registry.getItem(SONOS_PLAY_URI_ITEM).sendCommand(url)
            
            # Exclusive: Set all other web radio switches globally to OFF
            for other_item in Registry.getItems():
                if "_Webradio_" in other_item.getName() and other_item.getName() != trigger_name:
                    if str(other_item.getState()) == "ON":
                        other_item.postUpdate(scope.OFF)
        else:
            webradio_control_rule.logger.error("No stream_uri metadata found for {}!".format(trigger_name))
            
    elif command == "OFF":
        # Stop streaming using the Sonos Player Controller
        Registry.getItem(SONOS_CONTROLLER_ITEM).sendCommand("PAUSE")

@rule()
@when("System reached start level 100")
def webradio_init_rule(module, input):
    webradio_init_rule.logger.info("Web Radio Initialization: Set all switches to OFF")
    for item in Registry.getItems():
        if "_Webradio_" in item.getName():
            item.postUpdate(scope.OFF)