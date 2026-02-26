# Version 1.3.7 Changelog

## Changes

- Dashboard: Step graph is now a filled line chart instead of a bar chart.
- Dashboard: Remove repetitive duplicates from graph plots where the VR Temp, ASIC temp and step is the same for sucessive timestamps. First timestamp will be preserved in the data. Hash rate is not compared

## Bug Fixes

- BUG: localstorage limits are being hit for storing graphdata and cannot store 2 days worth of data.
`_Fixed by renaming properties, changing how timestamps were stored & deduplicating data where there was consecutive values for ASIC temp, VR Temp and Step present._`
