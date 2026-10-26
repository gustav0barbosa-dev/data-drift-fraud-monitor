import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="pt-BR" data-theme="dark">
      <Head>
        <meta name="theme-color" content="#060a12" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta
          name="description"
          content="Plataforma de monitoramento de Data Drift para detecção de fraudes financeiras — dashboard experimental E1–E4."
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
