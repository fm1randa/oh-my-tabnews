import { useEffect, useRef } from 'react';
import breaksPlugin from '@bytemd/plugin-breaks';
import gemojiPlugin from '@bytemd/plugin-gemoji';
import gfmPlugin from '@bytemd/plugin-gfm';
import highlightSsrPlugin from '@bytemd/plugin-highlight-ssr';
import { Viewer as BytemdViewer } from 'bytemd';
import 'bytemd/dist/index.css';
import 'highlight.js/styles/github.css';

// Mesmo dialeto do site (@tabnews/ui usa ByteMD com estes plugins).
// math e mermaid ficam de fora da v1: raros em posts e pesados no bundle.
const plugins = [gfmPlugin(), breaksPlugin(), gemojiPlugin(), highlightSsrPlugin()];

// O Viewer é um componente Svelte 3 compilado; os tipos publicados não expõem
// a API de instância ($set/$destroy), então declaramos o contrato usado aqui.
interface ViewerInstance {
  $set(props: { value: string }): void;
  $destroy(): void;
}
const Viewer = BytemdViewer as unknown as new (options: {
  target: HTMLElement;
  props: { value: string; plugins: unknown[] };
}) => ViewerInstance;

export default function Markdown({ value }: { value: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ViewerInstance | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    viewerRef.current = new Viewer({
      target: hostRef.current,
      props: { value, plugins },
    });
    return () => {
      viewerRef.current?.$destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    viewerRef.current?.$set({ value });
  }, [value]);

  return <div className="omtn-markdown" ref={hostRef} />;
}
