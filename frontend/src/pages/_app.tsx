import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import '@/styles/globals.css';
import { AppProvider } from '@/context/AppContext';
import { AppShell, PAGE_META } from '@/components/layout/AppShell';

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const meta = PAGE_META[router.pathname];
  const title = meta
    ? `${meta.title} · Data Drift Monitor`
    : 'Data Drift Monitor · Detecção de fraude com drift';

  return (
    <AppProvider>
      <Head>
        <title>{title}</title>
        <meta property="og:title" content={title} />
        <meta
          property="og:description"
          content="Dashboard experimental de monitoramento de Data Drift, performance de modelo e alertas para detecção de fraude."
        />
      </Head>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </AppProvider>
  );
}
