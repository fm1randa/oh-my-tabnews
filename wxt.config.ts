import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => ({
    name: 'Oh My TabNews',
    description: 'Funcionalidades complementares para power users do TabNews',
    permissions: ['storage'],
    commands: {
      'toggle-reels': {
        suggested_key: { default: 'Alt+R' },
        description: 'Abrir/fechar o Modo Reels',
      },
    },
    // Exigido pela assinatura da AMO (Firefox, incl. Android).
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: { id: 'oh-my-tabnews@fm1randa' },
        gecko_android: {},
      },
    }),
  }),
});
