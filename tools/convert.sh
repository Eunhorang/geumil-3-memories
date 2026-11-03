#!/bin/zsh
# 사진을 그림으로 바꾼다(MLX-Serve + FLUX.2 klein). 옵션은 tools/convert.mjs 머리말을 보세요.
cd "${0:A:h}/.." || exit 1
export PATH="/opt/homebrew/bin:$PATH"
exec node tools/convert.mjs "$@"
