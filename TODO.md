# Changes

- **Server**: Add call to monitor to pull room temp from an api and plot on graph
- **Server**: Write some notification method to alert remotely

- **Monitor**: Autotune the corevoltage +=20mv maximum for each frequency setting after the step value has been stable and reassess every 15(?) loops (~30 secs). The aim would be to get a core voltage that provides a toexpected value of 0% or more for each frequency. When a suitable corevoltage is detected, record the data for core voltage / frequency in a file voltages.json in the data directory and store it in a variable for use by the monitor when it needs to adjust the step frequency. If toExpected is <0 increase the corevoltage by 5mv. if toExpected>1 then decrease coreVOltage by 5mv. voltages.json would need loaded at server startup. If there is no values present in the voltages.json for a frequency then it should continue with the currently applied core voltage.

to the current existing voltageOffset calculation as a starting point based upon step level. Once sweep mode has ran it should obtain more accurate values.

- **Dashboard**: Method for switching dashboard & history to view other stabilised bitaxes in the same deviceData folder. Stabiliser On and Manual Control would need to be unavailable in this mode
- **Dashboard**: Add a power profile series of buttons to Manual Control (eg. low, medium & high button in a button group like the duration buttons for the graph). Each button would have an independent series of settings (target asic, max vr, corevoltage, and frequency) stored in settings. A profile is activated by clicking on a profile button. If profile settings are not already stored in the settings file then the current settings should be copied in and saved the first time that the profile is used. Will need a "Save Profile Settings" button to stored the current values into the profile settings. Changing one of the existing inputs should not automatically save to the profile setting but it should act as it currently does. If the current applied settings differ from the saved profile settings the Save Profile button should be clickable and not disabled.
- **Dashboard**: When hovering on the graph it shows the step value. Would be nice to see the actual frequency value & step value as well. Not sure if this is recorded in the graph data so may not be possible.

- **History**: Write some analysis functions for the history file (indicate that some freq & core voltage are problem settings)

## Bugs

- **BUG**:Changing values for frequency or core voltage sometimes "confuses" the step. The step value will need verified it is correct after changing it.
