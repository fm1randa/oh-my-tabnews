import { TOGGLE_REELS_MESSAGE } from '@/utils/features';

export default defineBackground(() => {
  browser.commands.onCommand.addListener(async (command) => {
    if (command !== 'toggle-reels') return;

    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (tab?.id == null) return;

    try {
      await browser.tabs.sendMessage(tab.id, { type: TOGGLE_REELS_MESSAGE });
    } catch {
      // Aba sem content script (fora do TabNews) — nada a fazer.
    }
  });
});
