git config --global user.name "Tetsuo Kitamura"
git config --global user.email kitamura.tetsuo@gmail.com


sudo apt update && sudo apt install -y pipx gh  docker-compose-plugin
pipx ensurepath   # 必要に応じてシェルを再起動/再ログイン
pipx install git+https://github.com/kitamura-tetsuo/auto-coder.git
auto-coder --help

npm install -g @qwen-code/qwen-code
cd ~ && git clone https://github.com/kitamura-tetsuo/gemini-cli && cd gemini-cli && npm install && npm run build && npm install -g .
npm install -g @openai/codex
npm install -g @augmentcode/auggie

gh extension install yahsan2/gh-sub-issue

/workspace/scripts/setup.sh

