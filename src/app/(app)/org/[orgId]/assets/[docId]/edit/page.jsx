'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import AssetEditor from '@/components/assets/AssetEditor';

// EKP E14.2 / E14.4 (E-16): edit a draft asset, in the template version it
// was written from (a newer version of the template doesn't change it).
export default function EditAssetPage() {
  const { orgId, docId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/documents/${docId}/asset`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Couldn't load the asset.");
        if (!d.canEdit) throw new Error(d.asset.lifecycle === 'draft' ? "You can't edit this asset." : 'Only a draft can be edited. Withdraw it from review first.');
        setData(d);
      })
      .catch((e) => setError(e.message));
  }, [docId]);

  return <Layout><main className="mx-auto max-w-3xl p-6">
    {error ? <p role="alert" className="text-red-600">{error} <Link className="underline" href={`/document?id=${encodeURIComponent(docId)}`}>Back to the document</Link></p>
      : !data ? <p className="text-sm text-gray-500">Loading…</p>
      : <AssetEditor orgId={orgId} template={data.template} assetId={docId} initial={data.asset} />}
  </main></Layout>;
}
