#!/bin/zsh
# 두 번 눌러 실행한다.
# '금일초 3학년 학급 사진' 폴더에 새로 넣은 사진을 찾아 원본을 잠그고, 그림으로 바꿔 전시에 더한 뒤 GitHub에 올린다.
cd "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:$PATH"

stop() { echo; echo "$1"; echo "창을 닫으려면 Enter를 누르세요."; read; exit 1; }

echo "[1/4] 새 사진을 찾고 원본을 잠그는 중이에요."
node tools/build.mjs || stop "사진 준비 중에 문제가 생겼어요."

echo
echo "[2/4] 그림으로 바꾸는 중이에요. 한 장에 몇 분씩 걸려요."
zsh tools/convert.sh || stop "그림 변환 중에 문제가 생겼어요."

echo
echo "[3/4] 전시 파일을 만드는 중이에요."
node tools/build.mjs || stop "전시 파일을 만들다 문제가 생겼어요."

echo
echo "[4/4] 바뀐 파일"
git status --short
if [[ -z "$(git status --porcelain)" ]]; then
  echo "새로 더할 사진이 없어요."
else
  echo
  echo "제목은 파일 이름에서 가져왔어요. 고치려면 data/gallery.json의 title을 바꾸세요."
  read "answer?GitHub에 올릴까요? (y를 누르고 Enter) "
  if [[ "$answer" == [yY]* ]]; then
    git add -A && git commit -q -m "사진 추가" && git push && echo "올렸어요. 1~2분 뒤 사이트에 반영돼요."
  else
    echo "올리지 않았어요. 나중에 다시 실행하면 이어서 올릴 수 있어요."
  fi
fi
echo
echo "창을 닫으려면 Enter를 누르세요."
read
