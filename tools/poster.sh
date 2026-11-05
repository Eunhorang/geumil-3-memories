#!/bin/zsh
# A4 QR 안내문(qr/poster.html)을 PDF와 미리보기 PNG로 뽑는다. 크롬과 이 맥의 도현체가 필요하다.
cd "${0:A:h}/.." || exit 1
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="file://$PWD/qr/poster.html"
# 안내문의 그림 수를 data/gallery.json에 맞춘다(사진을 더하거나 뺀 뒤 다시 뽑으면 저절로 맞음).
N=$(/usr/bin/python3 -c 'import json;print(len(json.load(open("data/gallery.json"))["photos"]))')
/usr/bin/sed -i '' -E "s#(<span data-count>)[0-9]+#\\1$N#" qr/poster.html
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --no-pdf-header-footer \
  --virtual-time-budget=15000 --print-to-pdf="$PWD/qr/QR-안내문.pdf" "$SRC" >/dev/null 2>&1
"$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=2 \
  --window-size=794,1123 --virtual-time-budget=15000 --screenshot="$PWD/qr/QR-안내문.png" "$SRC" >/dev/null 2>&1
echo "만들었어요: qr/QR-안내문.pdf, qr/QR-안내문.png"
