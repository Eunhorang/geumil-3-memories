#!/bin/zsh
# 홈 화면 아이콘(icons/*.png)을 tools/icon.html에서 찍는다. 크롬과 이 맥의 도현체가 필요하다.
cd "${0:A:h}/.." || exit 1
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for s in 512 192 180; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 \
    --window-size=$s,$s --virtual-time-budget=4000 --screenshot="$PWD/icons/tmp-$s.png" "file://$PWD/tools/icon.html" >/dev/null 2>&1
done
mv icons/tmp-512.png icons/icon-512.png
mv icons/tmp-192.png icons/icon-192.png
mv icons/tmp-180.png icons/apple-touch-icon.png
echo "아이콘을 만들었어요: icons/"
