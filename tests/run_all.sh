#!/bin/sh
for f in tests/*.txt; do for a in FCFS PRIORITY SJF; do echo "== $f $a"; ./restaurant "$f" "$a"; done; done
