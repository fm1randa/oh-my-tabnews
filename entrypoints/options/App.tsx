import { useEffect, useState } from 'react';
import { FEATURES, featureEnabledItems } from '@/utils/features';
import { readContents } from '@/utils/reels';

export default function App() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        FEATURES.map(async (feature) => [feature.id, await featureEnabledItems[feature.id].getValue()] as const),
      );
      setEnabled(Object.fromEntries(entries));
      setReadCount(Object.keys(await readContents.getValue()).length);
    })();
  }, []);

  async function toggle(id: string) {
    const next = !enabled[id];
    setEnabled((current) => ({ ...current, [id]: next }));
    await featureEnabledItems[id].setValue(next);
  }

  async function clearRead() {
    if (!confirm('Limpar todos os Lidos? O Modo Reels voltará a mostrar tudo desde o topo.')) return;
    await readContents.setValue({});
    setReadCount(0);
  }

  return (
    <main>
      <h1>Oh My TabNews</h1>

      <section>
        <h2>Funcionalidades</h2>
        {FEATURES.map((feature) => (
          <label key={feature.id} className="feature">
            <input
              type="checkbox"
              checked={enabled[feature.id] ?? true}
              onChange={() => toggle(feature.id)}
            />
            <span>
              <strong>{feature.title}</strong>
              <br />
              {feature.description}
            </span>
          </label>
        ))}
      </section>

      <section>
        <h2>Modo Reels</h2>
        <p>
          {readCount} Conteúdo{readCount === 1 ? '' : 's'} marcado{readCount === 1 ? '' : 's'} como
          lido nesta máquina.
        </p>
        <button onClick={clearRead}>Limpar Lidos</button>
      </section>
    </main>
  );
}
