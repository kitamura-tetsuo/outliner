// Test-only Fcitx5 addon. Observe the very CandidateList that classicui renders;
// never modify the engine, candidate list, preedit, or application under test.
#include <fcitx/addonfactory.h>
#include <fcitx/addonmanager.h>
#include <fcitx/event.h>
#include <fcitx/inputcontext.h>
#include <fcitx/inputpanel.h>
#include <fcitx/instance.h>
#include <nlohmann/json.hpp>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <unistd.h>

class SelectionObserver : public fcitx::AddonInstance {
public:
    explicit SelectionObserver(fcitx::Instance *instance) {
        watcher_ = instance->watchEvent(
            fcitx::EventType::InputContextFlushUI,
            fcitx::EventWatcherPhase::PostInputMethod, [this](fcitx::Event &event) {
                auto &update = static_cast<fcitx::InputContextFlushUIEvent &>(event);
                if (update.component() != fcitx::UserInterfaceComponent::InputPanel) return;
                auto *ic = update.inputContext();
                auto list = ic->inputPanel().candidateList();
                const auto &preedit = ic->inputPanel().clientPreedit();
                nlohmann::json pieces = nlohmann::json::array();
                for (size_t i = 0; i < preedit.size(); ++i) {
                    pieces.push_back({{"text", preedit.stringAt(i)},
                                      {"highlight", preedit.formatAt(i).test(fcitx::TextFormatFlag::HighLight)}});
                }
                int cursor = list ? list->cursorIndex() : -1;
                nlohmann::json result = {
                    {"source", "fcitx5-candidate-list"}, {"pid", getpid()},
                    {"sequence", ++sequence_}, {"context", ic->uuid()},
                    {"focused", ic->hasFocus()}, {"pieces", pieces},
                    {"cursor", cursor}, {"size", list ? list->size() : 0},
                    {"display", list && cursor >= 0 && cursor < list->size()
                                    ? list->candidate(cursor).text().toString() : ""},
                    {"selected", list && cursor >= 0 && cursor < list->size()
                                     ? list->candidate(cursor).text().toStringForCommit() : ""}};
                const char *path = std::getenv("IME_SELECTION_FILE");
                if (!path) return;
                std::string temporary = std::string(path) + ".tmp";
                std::ofstream stream(temporary);
                stream << result.dump() << '\n';
                stream.close();
                if (stream) std::rename(temporary.c_str(), path);
            });
    }
private:
    uint64_t sequence_ = 0;
    std::unique_ptr<fcitx::HandlerTableEntry<fcitx::EventHandler>> watcher_;
};

class SelectionObserverFactory : public fcitx::AddonFactory {
    fcitx::AddonInstance *create(fcitx::AddonManager *manager) override {
        return new SelectionObserver(manager->instance());
    }
};
FCITX_ADDON_FACTORY(SelectionObserverFactory)
