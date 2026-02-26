#!/bin/bash
#
echo -e "timestamp\toldStepDown\tstepDown\thashRate\ttemp"
jq -r '.[-10:] | .[] | [.timestamp, .oldStepDown, .stepDown, .coreVoltage, .coreVoltage2, .frequency, .desiredFreq, .hashRate, .temp] | @tsv' deviceData/bitaxe-g1/history.json | column -t