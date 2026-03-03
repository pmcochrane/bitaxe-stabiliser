#!/bin/bash
#
echo -e "timestamp\toldStepDown\tstepDown\thashRate\ttemp\tvrTemp\tpower\tvoltage"
jq -r '.[-1000:-1] | .[] | [.timestamp, .oldStepDown, .stepDown, .hashRate, .temp, .vrTemp, .power, .voltage] | @tsv' deviceData/bitaxe-g1/history.json 2>/dev/null | tail -10 | column -ts$'\t'
