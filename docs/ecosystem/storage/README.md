# Cloud Object Storage & File Management

Modern full-stack web applications frequently handle user file uploads, avatar images, PDF invoices, and large media assets. 

In **Ranu.js**, file storage is handled using standard **S3-compatible Object Storage APIs** (e.g., AWS S3, Cloudflare R2, MinIO, Google Cloud Storage, Supabase Storage) without binding your code to proprietary storage SDKs.

---

## 1. Architecture Overview

There are two primary patterns for handling uploads in Ranu.js:

```
[Pattern A: Pre-Signed Direct Upload (Recommended)]
Browser Client ─── (1) Request Upload URL ───▶ Ranu API Route
Browser Client ◀── (2) Pre-Signed S3 URL  ─── Ranu API Route
Browser Client ─── (3) Direct PUT to Bucket ─▶ Cloudflare R2 / AWS S3

[Pattern B: Streaming Server Upload]
Browser Client ─── (1) POST Multipart ──────▶ Ranu Route Handler
Ranu Server    ─── (2) Stream to Bucket ────▶ Storage Service
```

> [!TIP]
> **Pattern A (Pre-Signed Direct Upload)** is strongly recommended for production applications because files stream directly between the client browser and storage provider, consuming zero server RAM or bandwidth.

---

## 2. Installation

Install the lightweight, modular AWS S3 client:

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## 3. Storage Client Setup (`lib/storage.ts`)

Encapsulate your storage configuration behind `@ranujs/core/server-only`:

```typescript
// lib/storage.ts
import '@ranujs/core/server-only';
import { S3Client } from '@aws-sdk/client-s3';

export const storageClient = new S3Client({
  region: process.env.STORAGE_REGION ?? 'auto',
  endpoint: process.env.STORAGE_ENDPOINT, // e.g. https://<account_id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

export const STORAGE_BUCKET_NAME = process.env.STORAGE_BUCKET_NAME!;
```

---

## 4. Pattern A: Generating Pre-Signed Upload URLs

Implement an authenticated API route (`app/api/upload/presign/route.ts`) that generates temporary, signed PUT URLs:

```typescript
// app/api/upload/presign/route.ts
import { cookies } from '@ranujs/core/server';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { storageClient, STORAGE_BUCKET_NAME } from '@/lib/storage';

export async function POST(request: Request): Promise<Response> {
  // 1. Verify user authentication
  const sessionToken = cookies().get('session_id');
  if (!sessionToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { filename, contentType } = (await request.json()) as {
    filename: string;
    contentType: string;
  };

  // 2. Validate file type and extension
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
  if (!allowedTypes.includes(contentType)) {
    return Response.json({ error: 'Unsupported file type.' }, { status: 400 });
  }

  // 3. Generate unique object key
  const fileKey = `uploads/${crypto.randomUUID()}-${filename}`;

  // 4. Create pre-signed command with short expiration (5 minutes)
  const command = new PutObjectCommand({
    Bucket: STORAGE_BUCKET_NAME,
    Key: fileKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(storageClient, command, { expiresIn: 300 });

  return Response.json({
    uploadUrl,
    fileKey,
    publicUrl: `${process.env.STORAGE_PUBLIC_CDN}/${fileKey}`,
  });
}
```

---

## 5. Client-Side Upload Implementation

Upload directly from the browser using standard `fetch`:

```tsx
// app/components/AvatarUpload.tsx
'use client';

import { useState } from 'react';

export function AvatarUpload() {
  const [uploading, setUploading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // Step 1: Request pre-signed URL from Ranu backend
      const presignRes = await fetch('/api/upload/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      const { uploadUrl, publicUrl } = await presignRes.json();

      // Step 2: Upload file directly to S3 / Cloudflare R2
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (uploadRes.ok) {
        setImageUrl(publicUrl);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <input type="file" accept="image/*" onChange={handleFileChange} disabled={uploading} />
      {uploading && <p>Uploading to storage...</p>}
      {imageUrl && <img src={imageUrl} alt="Uploaded Avatar" width={100} />}
    </div>
  );
}
```

---

## 6. Pattern B: Streaming Download / Proxying

For private assets requiring dynamic access verification before download:

```typescript
// app/api/files/[key]/route.ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { storageClient, STORAGE_BUCKET_NAME } from '@/lib/storage';
import { type Readable } from 'node:stream';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
): Promise<Response> {
  const { key } = await params;

  try {
    const response = await storageClient.send(
      new GetObjectCommand({
        Bucket: STORAGE_BUCKET_NAME,
        Key: `uploads/${key}`,
      })
    );

    // Convert Node.js readable stream to standard W3C ReadableStream
    const webStream = (response.Body as Readable).toWeb();

    return new Response(webStream, {
      headers: {
        'Content-Type': response.ContentType ?? 'application/octet-stream',
        'Content-Length': String(response.ContentLength ?? ''),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('File not found', { status: 404 });
  }
}
```
