const MATCH_SAVE_STORE_KEY = "super-ttt-match-saves-v1";

const canUseStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

export const loadLocalMatchSaves = () => {
  if (!canUseStorage()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(MATCH_SAVE_STORE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeLocalMatchSaves = (saveMap) => {
  if (!canUseStorage()) {
    return;
  }
  window.localStorage.setItem(MATCH_SAVE_STORE_KEY, JSON.stringify(saveMap));
};

export const upsertLocalMatchSave = (save) => {
  const current = loadLocalMatchSaves();
  const next = { ...current, [save.matchId]: save };
  writeLocalMatchSaves(next);
  return next;
};
