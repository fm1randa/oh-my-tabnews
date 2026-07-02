import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Oh My TabNews',
    description: 'Funcionalidades complementares para power users do TabNews',
    permissions: ['storage'],
    commands: {
      'toggle-reels': {
        suggested_key: { default: 'Alt+R' },
        description: 'Abrir/fechar o Modo Reels',
      },
    },
  },
});
