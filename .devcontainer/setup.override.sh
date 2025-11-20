git config --global user.name "Tetsuo Kitamura"
git config --global user.email kitamura.tetsuo@gmail.com
git config --global pull.ff only

curl -LsSf https://astral.sh/uv/install.sh | sh

sudo apt update && sudo apt install -y pipx gh docker-compose-plugin pre-commit
pipx ensurepath
pipx install git+https://github.com/kitamura-tetsuo/auto-coder.git
auto-coder --help

pipx install git+https://github.com/kitamura-tetsuo/github-sub-issue.git --force

cd ~ && rm -rf gemini-cli && git clone https://github.com/kitamura-tetsuo/gemini-cli ; cd gemini-cli && git pull && npm install && npm run bundle && npm link && gemini -h

npm install -g @anthropic-ai/claude-code
npm install -g @augmentcode/auggie
npm install -g @openai/codex
npm install -g @qwen-code/qwen-code

cd /workspace
pre-commit install
cd /workspaces/auto-coder
pre-commit install

# /workspace/scripts/setup.sh

