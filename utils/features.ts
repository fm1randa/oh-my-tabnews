import { storage } from '#imports';

export interface FeatureModule {
  id: string;
  title: string;
  description: string;
}

export const FEATURES: FeatureModule[] = [
  {
    id: 'reels',
    title: 'Modo Reels',
    description:
      'Percorra o feed um Conteúdo por vez, em tela cheia, na ordem do site até acabar.',
  },
];

export const featureEnabledItems = Object.fromEntries(
  FEATURES.map((feature) => [
    feature.id,
    storage.defineItem<boolean>(`local:feature:${feature.id}:enabled`, { fallback: true }),
  ]),
);

export const TOGGLE_REELS_MESSAGE = 'oh-my-tabnews:toggle-reels';
