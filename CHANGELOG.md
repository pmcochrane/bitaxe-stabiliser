# Changelog

## Version 1.3.7 Changelog

### Changes

- **Dashboard**: Step graph is now a filled line chart instead of a bar chart.
- **Dashboard**: Added another line to graph corresponding to the max VR temp.
- **Dashboard**: Added another line to graph corresponding to the target ASIC temp.
- **Dashboard**: Remove repetitive duplicates from graph plots where the VR Temp, ASIC temp and step is the same for sucessive timestamps. First timestamp will be preserved in the data. Hash rate is not compared
- **Dashboard**: An alert will show if the bitaxe hashrate falls off and drops to 25% below the median hash rate value.
- **Dashboard**: Added a modal to allow viewing of the autotuned core voltages that will be applied at each frequency level.

- **Monitor**: Added autotune logic to try and make sure the coreVoltage is approriate to achieve the expected hash rate at a particular frequency. The coreVoltage specified in the settings is used as a guide and over time, each step level (frequency) will adjust the core voltage + or - 30mv to that value. The last good value is persistent so when you revisit that frequency it loads the last best core voltage found at that frequency.
- **Monitor**: Make the temp control range configurable via an environment variable. This should be a low value floating point and defaults to 0.25. Larger values may prevent the temperatures from stabilising.

- **Navbar**: Show the version number in a badge.

### Bug Fixes

- **BUG**: localstorage limits are being hit for storing graphdata and cannot store 2 days worth of data.
`_Fixed by renaming properties, changing how timestamps were stored & deduplicating data where there was consecutive values for ASIC temp, VR Temp and Step present._`

## Version 1.3.6 Changelog

This was the initial released version
