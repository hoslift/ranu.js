import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Ranu Build Basic</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
