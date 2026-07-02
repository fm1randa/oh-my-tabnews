import './style.css';
import ReactDOM from 'react-dom/client';
import App from './App';
import { featureEnabledItems } from '@/utils/features';

export default defineContentScript({
  matches: ['*://tabnews.com.br/*', '*://www.tabnews.com.br/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    const enabled = await featureEnabledItems.reels.getValue();
    if (!enabled) return;

    const ui = await createShadowRootUi(ctx, {
      name: 'oh-my-tabnews-reels',
      position: 'inline',
      anchor: 'body',
      onMount: (container) => {
        const app = document.createElement('div');
        container.append(app);

        const root = ReactDOM.createRoot(app);
        root.render(<App ctx={ctx} />);
        return root;
      },
      onRemove: (root) => {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
