## Changes

- Convert the step plot to a line graph removing duplicates and showing points
- Remove duplicates from lines for VR Temp and ASIC temp. Less effect on ASIC Temp
- Make the temp control range configurable eg +-0.5 +-1 +-2     Less convinced that this is necessary
- Add call to monitor to pull room temp from an api and plot on graph
- Write some analysis functions for the history file (indicate that some freq & core voltage are problem settings)
- Write some notification method to alert remotely
- Method for switching dashboard & history to view other stabilised bitaxes in the same deviceData folder. Stabiliser On and Manual Control would need to be unavailable in this mode

## bugs

- Changing values for frequency or core voltage "confuse" the step. The step value will need verified it is correct after changing it.
- If bitaxe hashrate falls off due to too high a freq for core voltage then stepping goes crazy and drifts to max. Maybe add a warning banner if hash rate plummets & stays below median-10%