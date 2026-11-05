#!/data/data/com.termux/files/usr/bin/bash
cd ~/systep && git add -A && git commit -m "${1:-mise a jour}" && git push
