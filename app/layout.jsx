import { Chakra_Petch, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const chakra = Chakra_Petch({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-chakra',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata = {
  title: 'Tongdaeng — 방탈출 예약',
  description: '방탈출 예약 자동화 도구 모음',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={`${chakra.variable} ${plexMono.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
