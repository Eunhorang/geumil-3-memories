#!/bin/zsh
# 원본 사진 비밀번호를 이 맥의 키체인에 저장한다. 입력한 글자는 화면에 보이지 않는다.
# 처음 정할 때와 바꿀 때 모두 이 파일을 실행한다. 바꾼 뒤에는 node tools/build.mjs --rekey 로 원본을 다시 잠근다.
echo "원본 사진 비밀번호를 두 번 입력하세요(글자가 보이지 않아도 입력되고 있어요)."
security add-generic-password -U -s geumil-3-memories -a originals -l "금일초 3학년의 추억 원본 비밀번호" -w && echo "저장했어요."
