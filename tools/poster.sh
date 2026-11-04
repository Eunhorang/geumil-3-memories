#!/bin/zsh
# A4 QR 안내문(qr/poster.html)을 PDF와 미리보기 PNG로 뽑는다. 크롬과 이 맥의 도현체가 필요하다.
cd "${0:A:h}/.." || exit 1
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SRC="file://$PWD/qr/poster.html"
"$CH" --headless=new --disable-gpu --allow-file-access-from-files --no-pdf-header-footer \
  --virtual-time-budget=15000 --print-to-pdf="$PWD/qr/QR-안내문.pdf" "$SRC" >/dev/null 2>&1
"$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=2 \
  --window-size=794,1123 --virtual-time-budget=15000 --screenshot="$PWD/qr/QR-안내문.png" "$SRC" >/dev/null 2>&1
echo "만들었어요: qr/QR-안내문.pdf, qr/QR-안내문.png"
