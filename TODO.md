# Changes

- **Server**: Add call to monitor to pull room temp from an api and plot on graph

- **Server**: Write some notification method to alert remotely

- **Dashboard**: Method for switching dashboard & history to view other stabilised bitaxes in the same deviceData folder. Stabiliser On and Manual Control would need to be unavailable in this mode
- **Dashboard**: Add a power profile switch (eg. low, medium & high) which has independent settings stored. Will need a method of copying the current settings to these profiles. Clicking the button should change the active settings
- **Dashboard**: When hovering on the graph it shows the step value. Would be nice to see the actual frequency value & step value as well. Not sure if this is recorded in the graph data so may not be possible.

- **History**: Write some analysis functions for the history file (indicate that some freq & core voltage are problem settings)

## Bugs

- **BUG**:Changing values for frequency or core voltage sometimes "confuses" the step. The step value will need verified it is correct after changing it.
