"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrendingUp, Archive } from "lucide-react";
import Layout from "@/components/layout/Layout";
import TopicTrendModal from "@/components/topics/TopicTrendModal";

export default function TopicTrendsPage() {
  const { orgId } = useParams();
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTopicRef, setSelectedTopicRef] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    setLoading(true);
    fetch(`/api/org/${orgId}/topics/trend`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Unable to load topic trends");
        setTopics(Array.isArray(data.topics) ? data.topics : []);
      })
      .catch((e) => setError(e.message || "Unable to load topic trends"))
      .finally(() => setLoading(false));
  }, [orgId]);

  return (
    <Layout orgId={orgId}>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div>
          <div className="flex items-center gap-2"><TrendingUp className="h-6 w-6 text-primary-600" /><h1 className="text-2xl font-bold">Topic Evolution</h1></div>
          <p className="mt-1 text-sm text-gray-500">How organizational topics have changed over time — volume, vocabulary, and contributors.</p>
        </div>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {loading ? <p className="text-sm text-gray-500">Loading topics...</p> : topics.length === 0 ? (
          <p className="text-sm text-gray-500">No topic history is accessible yet. Snapshots are captured weekly — check back after the first capture run.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {topics.map((topic) => (
              <button
                key={topic.topicRef}
                type="button"
                onClick={() => setSelectedTopicRef(topic.topicRef)}
                className="rounded-xl border border-gray-200 bg-white p-4 text-left hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{topic.topicName}</h2>
                  {topic.retired && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                      <Archive className="h-3 w-3" />Retired
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-gray-500">{topic.documentCount} docs · {topic.expertCount} experts</p>
              </button>
            ))}
          </div>
        )}
      </div>

      <TopicTrendModal orgId={orgId} topicRef={selectedTopicRef} onClose={() => setSelectedTopicRef(null)} />
    </Layout>
  );
}
