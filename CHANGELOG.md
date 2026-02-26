# Version 1.3.7

## Changes

- Dashboard: Step graph is now a filled line

## Bug Fixes

- BUG: localstorage limits are being hit for storing graphdata and cannot store 2 days worth of data.
`_Fixed by renaming properties, changing how timestamps were stored & deduplicating data where there was consecutive values for ASIC temp, VR Temp and Step present._`
