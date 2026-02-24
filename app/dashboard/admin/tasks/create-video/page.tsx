// File: ThinkMart/app/dashboard/admin/tasks/create-video/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminTask } from '@/services/adminService';
import { Video, Save, Loader2, ArrowLeft, Info, Youtube, Clock, Coins, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import Link from 'next/link';

// Helper to extract YouTube ID from various URL formats
function extractYouTubeId(url: string): string | null {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
        /^([a-zA-Z0-9_-]{11})$/ // Direct ID
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

export default function CreateVideoTaskPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Form State
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [videoInput, setVideoInput] = useState('');
    const [minDuration, setMinDuration] = useState(60); // seconds
    const [reward, setReward] = useState(200);

    // Derived State
    const youtubeId = extractYouTubeId(videoInput);
    const isValidVideo = !!youtubeId || videoInput.startsWith('http');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setNotice(null);

        try {
            // Validate
            if (!title.trim()) throw new Error("Task title is required");
            if (!videoInput.trim()) throw new Error("Video URL or YouTube link is required");
            if (minDuration < 10) throw new Error("Minimum duration must be at least 10 seconds");

            const payload: {
                title: string;
                description: string;
                rewardAmount: number;
                rewardType: 'coins';
                type: 'video';
                duration: number;
                minDuration: number;
                requestId: string;
                youtubeId?: string;
                videoUrl: string;
            } = {
                title: title.trim(),
                description: description.trim() || `Watch this video to earn ${reward} coins`,
                rewardAmount: Number(reward),
                rewardType: 'coins',
                type: 'video',
                duration: Number(minDuration),
                minDuration: Number(minDuration),
                requestId: `task_video_${Date.now()}`,
                videoUrl: videoInput.trim(),
            };

            // Add video source
            if (youtubeId) {
                payload.youtubeId = youtubeId;
                payload.videoUrl = videoInput.trim();
            } else {
                payload.videoUrl = videoInput.trim();
            }

            await createAdminTask(payload);

            setNotice({ type: 'success', text: 'Video task created successfully. Redirecting...' });
            router.push('/dashboard/admin/tasks');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create video task';
            setNotice({ type: 'error', text: message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link
                        href="/dashboard/admin/tasks"
                        className="p-2 hover:bg-gray-100 rounded-lg transition"
                        aria-label="Back to tasks list"
                    >
                        <ArrowLeft size={20} className="text-gray-600" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Video className="text-red-500" /> Create Video Task
                        </h1>
                        <p className="text-gray-500 text-sm">Users will watch your video to earn coins</p>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={loading || !isValidVideo}
                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                    {loading ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    Publish Task
                </button>
            </div>

            {notice && (
                <div className={`p-4 rounded-lg border flex items-center justify-between gap-3 ${notice.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                    }`}>
                    <div className="flex items-center gap-2">
                        {notice.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                        <span className="text-sm font-medium">{notice.text}</span>
                    </div>
                    <button onClick={() => setNotice(null)} className="p-1 rounded hover:bg-black/5" aria-label="Dismiss notice">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 space-y-6">
                    {/* Title */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Task Title *
                        </label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                            placeholder="e.g. Watch Product Demo Video"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Description (Optional)
                        </label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none transition"
                            placeholder="Brief description shown to users..."
                        />
                    </div>

                    {/* Video Input */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                            <Youtube className="text-red-500" size={18} />
                            Video URL or YouTube Link *
                        </label>
                        <input
                            type="text"
                            value={videoInput}
                            onChange={(e) => setVideoInput(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                            placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or just the video ID"
                        />
                        <div className="mt-2 flex items-center gap-2 text-sm">
                            {youtubeId ? (
                                <span className="text-green-600 flex items-center gap-1">
                                    YouTube ID detected: <code className="bg-gray-100 px-2 py-0.5 rounded">{youtubeId}</code>
                                </span>
                            ) : videoInput && !isValidVideo ? (
                                <span className="text-red-500">Invalid URL format</span>
                            ) : (
                                <span className="text-gray-400 flex items-center gap-1">
                                    <Info size={14} /> Paste YouTube link, embed URL, or video ID
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Preview */}
                    {youtubeId && (
                        <div className="rounded-xl overflow-hidden border border-gray-200 aspect-video bg-black">
                            <iframe
                                src={`https://www.youtube.com/embed/${youtubeId}`}
                                className="w-full h-full"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    )}

                    {/* Settings Grid */}
                    <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                        {/* Min Duration */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <Clock size={16} className="text-gray-500" />
                                Minimum Watch Time (seconds)
                            </label>
                            <input
                                type="number"
                                min={10}
                                value={minDuration}
                                onChange={(e) => setMinDuration(Number(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Users must watch for at least {minDuration} seconds to claim reward
                            </p>
                        </div>

                        {/* Reward */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                                <Coins size={16} className="text-yellow-500" />
                                Reward (Coins)
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={reward}
                                onChange={(e) => setReward(Number(e.target.value))}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                            />
                            <p className="text-xs text-gray-400 mt-1">
                                Users earn this amount after watching
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Info */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Info size={16} />
                        <span>Video tasks support YouTube embeds. The timer tracks actual watch time before reward can be claimed.</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
