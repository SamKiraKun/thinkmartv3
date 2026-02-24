'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Play, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Task } from '@/types/task';
import { completeTask, fetchTask } from '@/services/taskService';

type VideoTask = Task & { youtubeId?: string; videoUrl?: string };

// Ad Placeholder Component (Same as Survey)
function AdPlaceholder({ position, className }: { position: string, className?: string }) {
    return (
        <div className={`bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 text-gray-400 rounded-lg ${className}`}>
            <span className="font-bold text-xs uppercase tracking-widest">Advertisement ({position})</span>
            <div className="w-full h-16 flex items-center justify-center bg-gray-50 mt-2 rounded">
                Mock Ad Content
            </div>
        </div>
    );
}

export default function VideoTaskPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();

    const taskId = params.taskId as string;
    const sessionId = searchParams.get('sessionId');

    const [task, setTask] = useState<VideoTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Video State
    const [watchTime, setWatchTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [hasStarted, setHasStarted] = useState(false); // NEW: Track if user has started playing
    const [completed, setCompleted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    // Min watch time (in seconds) - will be overridden by task.minDuration
    const requiredWatchTime = task?.minDuration || 30;

    // 1. Fetch Task Details
    useEffect(() => {
        const init = async () => {
            if (authLoading) return;
            if (!user) {
                router.push('/auth/login');
                return;
            }

            if (!taskId) {
                setError("Invalid Link. Missing Task ID.");
                setLoading(false);
                return;
            }

            try {
                const taskDoc = await fetchTask(taskId);
                if (!taskDoc) {
                    setError("Task not found.");
                } else {
                    const data = taskDoc as unknown as VideoTask;
                    const taskType = String(data.type || '').toUpperCase();
                    if (taskType !== 'WATCH_VIDEO' && taskType !== 'VIDEO') {
                        setError("This page is for video tasks only.");
                    } else {
                        setTask(data);
                    }
                }
            } catch (error: unknown) {
                setError(getErrorMessage(error, "Failed to load task."));
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [taskId, user, authLoading, router]);

    // 2. Track Watch Time
    useEffect(() => {
        if (isPlaying && !completed) {
            timerRef.current = setInterval(() => {
                setWatchTime(prev => {
                    const newTime = prev + 1;
                    if (newTime >= requiredWatchTime) {
                        // Auto-pause isn't needed, just enable claim
                    }
                    return newTime;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isPlaying, completed, requiredWatchTime]);

    // 3. Handle Video Events
    const handlePlay = () => {
        setIsPlaying(true);
        setHasStarted(true); // Mark that user has started the video
    };
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    // 4. Claim Reward
    const handleClaim = async () => {
        if (watchTime < requiredWatchTime || isSubmitting || completed) return;

        setIsSubmitting(true);
        setNotice(null);
        try {
            await completeTask(taskId, { sessionId: sessionId || null });
            setCompleted(true);
        } catch (error: unknown) {
            setNotice(getErrorMessage(error, "Failed to claim reward."));
        } finally {
            setIsSubmitting(false);
        }
    };

    // Format time as MM:SS
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const progress = Math.min((watchTime / requiredWatchTime) * 100, 100);
    const canClaim = watchTime >= requiredWatchTime && !completed;

    // Loading & Error States
    if (loading || authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="animate-spin text-indigo-600" size={48} />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center">
                <AlertTriangle className="text-red-500 mb-4" size={48} />
                <h2 className="text-xl font-bold text-gray-900 mb-2">Error</h2>
                <p className="text-gray-600 mb-4">{error}</p>
                <Button onClick={() => router.push('/dashboard/user/tasks')}>Back to Tasks</Button>
            </div>
        );
    }

    if (completed) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen p-6 text-center bg-gradient-to-b from-green-50 to-white">
                <CheckCircle className="text-green-500 mb-4" size={64} />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Video Task Complete!</h2>
                <p className="text-gray-600 mb-1">You&apos;ve earned:</p>
                <p className="text-4xl font-bold text-indigo-600 mb-6">{task?.reward || 0} Coins</p>
                <Button onClick={() => router.push('/dashboard/user/tasks')}>Back to Tasks</Button>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
            {/* Header */}
            <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900">{task?.title || 'Watch Video'}</h1>
                <p className="text-gray-500 mt-1">{task?.description || 'Watch the video to earn coins.'}</p>
            </div>

            {/* Ad Banner (Top) */}
            <AdPlaceholder position="Top Banner" />

            {/* Instructional Banner - Shows when video not started */}
            {!hasStarted && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Play className="text-amber-600" size={20} />
                    </div>
                    <div>
                        <p className="font-medium text-amber-800">Play the video to start your task timer</p>
                        <p className="text-sm text-amber-600">The timer will begin once you start watching. Complete the required time to claim your reward.</p>
                    </div>
                </div>
            )}

            {/* Video Player */}
            <div className="relative bg-black rounded-2xl overflow-hidden shadow-xl aspect-video">
                {task?.youtubeId ? (
                    // YouTube Embed with JS API for play detection
                    <>
                        <iframe
                            id="youtube-player"
                            src={`https://www.youtube.com/embed/${task.youtubeId}?enablejsapi=1&autoplay=0&rel=0&origin=${typeof window !== 'undefined' ? window.location.origin : ''}`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        />
                        {/* Overlay for YouTube - detects click to start timer */}
                        {!hasStarted && (
                            <div
                                className="absolute inset-0 bg-transparent cursor-pointer"
                                onClick={() => {
                                    setHasStarted(true);
                                    setIsPlaying(true);
                                }}
                            />
                        )}
                    </>
                ) : task?.videoUrl ? (
                    // Direct Video File
                    <video
                        ref={videoRef}
                        src={task.videoUrl}
                        className="w-full h-full object-contain"
                        controls
                        onPlay={handlePlay}
                        onPause={handlePause}
                        onEnded={handleEnded}
                        playsInline
                    />
                ) : (
                    // No Video Configured
                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                        <Play size={64} className="opacity-30" />
                        <p className="mt-4 text-center px-4">No video configured for this task.</p>
                    </div>
                )}

                {/* Overlay Timer Badge */}
                <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-sm font-mono flex items-center gap-2 ${hasStarted ? 'bg-green-600 text-white' : 'bg-black/70 text-white'}`}>
                    <Clock size={14} />
                    {formatTime(watchTime)} / {formatTime(requiredWatchTime)}
                </div>

                {/* Playing Indicator */}
                {isPlaying && hasStarted && (
                    <div className="absolute top-4 left-4 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1 animate-pulse">
                        <div className="w-2 h-2 bg-white rounded-full" />
                        Timer Running
                    </div>
                )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Watch Progress</span>
                    <span className={`font-medium ${canClaim ? 'text-green-600' : 'text-gray-600'}`}>
                        {Math.floor(progress)}%
                    </span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ${canClaim ? 'bg-green-500' : 'bg-indigo-600'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {notice && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {notice}
                </div>
            )}

            {/* Claim Button */}
            <Button
                onClick={handleClaim}
                disabled={!canClaim || isSubmitting}
                className={`w-full h-14 text-lg font-bold transition-all ${canClaim
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
            >
                {isSubmitting ? (
                    <><Loader2 className="animate-spin mr-2" /> Claiming...</>
                ) : canClaim ? (
                    <><CheckCircle className="mr-2" /> Claim {task?.reward || 0} Coins</>
                ) : (
                    <>Watch {formatTime(requiredWatchTime - watchTime)} more</>
                )}
            </Button>

            {/* Ad Banner (Bottom) */}
            <AdPlaceholder position="Bottom Banner" className="mt-4" />
        </div>
    );
}
