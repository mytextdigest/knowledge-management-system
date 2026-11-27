'use client';
import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import AssetEditor from '@/components/assets/AssetEditor';

// EKP E14.2 (E-16): New from template. /org/[orgId]/assets/new?template=<id>
function NewAsset() {
  const { orgId } = useParams();
  const templateId = useSearchParams().get('template');
  const [template, setTemplate] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!templateId) { setError('Choose a template from the repository (New from template).'); return; }
    fetch(`/api/org/${orgId}/templates/${templateId}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error === 'Not found' ? "That template isn't available any more." : d.error || "Couldn't load the template.");
        setTemplate(d.template);
      })
      .catch((e) => setError(e.message));
  }, [orgId, templateId]);

  if (error) return <p role="alert" className="text-red-600">{error} <Link className="underline" href={`/org/${orgId}/repository`}>Back to the repository</Link></p>;
  if (!template) return <p className="text-sm text-gray-500">Loading the template…</p>;
  return <AssetEditor orgId={orgId} template={template} templateId={template.id} />;
}

export default function NewAssetPage() {
  return <Layout><main className="mx-auto max-w-3xl p-6"><Suspense fallback={null}><NewAsset /></Suspense></main></Layout>;
}
