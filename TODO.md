# Changes

- Make the temp control range configurable eg +-0.5 +-1 +-2     Less convinced that this is necessary
- Add call to monitor to pull room temp from an api and plot on graph
- Write some analysis functions for the history file (indicate that some freq & core voltage are problem settings)
- Write some notification method to alert remotely
- Method for switching dashboard & history to view other stabilised bitaxes in the same deviceData folder. Stabiliser On and Manual Control would need to be unavailable in this mode
- Add a power profile switch (eg. low, medium & high) which has independent settings stored. Will need a method of copying the current settings to these profiles. Clicking the button should change the active settings

## Bugs

- Changing values for frequency or core voltage "confuse" the step. The step value will need verified it is correct after changing it.
