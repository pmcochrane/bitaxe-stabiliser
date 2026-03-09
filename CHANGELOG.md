# Changelog

## Version 1.4.4 Changelog

- fixed to expected colour when >-1 & <0


## Version 1.4.3 Changelog

- NPM Package Updates to latest versions - express, tailwind, vite, react
- Added a condition to step up voltage if we are at stable temps but not meeting expectations.

## Version 1.4.2 Changelog

- Added a new release available banner to the UI
- Fixed the stable badge in the dshboard to match the state at the server.
- show the expected efficiency in the dashboard ui  
- Updated docker to latest alpine image (was 3.21 which was older)
- Dashboard was showing average hash rate instead of the instantaneous one.

## Version 1.4.1 Changelog

- Docker image is now based upon alpine to reduce the size of the image file & remove bloat

## Version 1.4.0 Changelog

### Changes

- **Monitor**: Added autotune logic to alter the core voltage to control the temperatures at a particular frequency. The coreVoltage specified in the settings is used as a guide and over time, the step level (frequency) will change to try and settle on a a better frequency to obtain stable temperatures whilst maintaining a steady hash rate.
- **Monitor**: The frequency stepping is now not used as the main method of keeping the bitaxe at a constant temperature as it was previously. The stepping is still there but is mainly used to cater for handling over temperature conditions.
- **Monitor**: Make the temp control range configurable via an environment variable. This should be a low value floating point and defaults to 0.25. Larger values may prevent the temperatures from stabilising.
- **Monitor**: Removed sweep mode as it is not necessary with autotune as well as the hashrange modal.

- **Dashboard**: Step graph is now a filled line chart instead of a bar chart.
- **Dashboard**: Added another line to graph corresponding to the max VR temp.
- **Dashboard**: Added another line to graph corresponding to the target ASIC temp.
- **Dashboard**: Added another line to graph corresponding to the core voltage.
- **Dashboard**: Remove repetitive duplicates from graph plots where the VR Temp, ASIC temp and step is the same for sucessive timestamps. First timestamp will be preserved in the data. Hash rate is not compared
- **Dashboard**: An alert will show if the bitaxe hashrate falls off and drops to 25% below the median hash rate value.
- **Dashboard**: Added a modal to allow viewing of the autotuned core voltages that will be applied at each frequency level.

- **Navbar**: Show the version number in a badge.

### Bug Fixes

- **BUG**: localstorage limits are being hit for storing graphdata and cannot store 2 days worth of data.
`_Fixed by renaming properties, changing how timestamps were stored & deduplicating data where there was consecutive values for ASIC temp, VR Temp and Step present._`

## Version 1.3.6 Changelog

This was the initial released version
