"use client";

import NextError from "next/error";

export default function GlobalError(_props: {
  error: Error & { digest?: string };
}) {
  return (
    <html>
      <body>
        {/* The App Router does not expose status codes for errors, so pass 0
            to render Next's generic error page. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
