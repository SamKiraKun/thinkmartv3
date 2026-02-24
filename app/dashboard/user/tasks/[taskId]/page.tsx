'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import { Loader2, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Task } from '@/types/task';
import { completeTask, fetchTask } from '@/services/taskService';

// Placeholder Ad Component
function AdPlaceholder({ position, className }: { position: string, className?: string }) {
    return (
        <div className={`bg-gray-100 border-2 border-dashed border-gray-300 flex flex-col items-center justify-center p-4 text-gray-400 ${className}`}>
            <span className="font-bold text-xs uppercase tracking-widest">Advertisement ({position})</span>
            <div className="w-full h-full min-h-[100px] flex items-center justify-center bg-gray-50 mt-2 rounded">
                Mock Ad Content
            </div>
        </div>
    );
}

// Interstitial Component
function InterstitialAd({ onComplete }: { onComplete: () => void }) {
    const [timer, setTimer] = useState(30);

    useEffect(() => {
        const interval = setInterval(() => {
            setTimer((prev) => {
                if (prev <= 1) {
                    clearInterval(interval);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center text-white p-6">
            <div className="max-w-md w-full text-center space-y-8">
                <h2 className="text-2xl font-bold text-yellow-500">Ad Break</h2>
                <div className="aspect-video bg-gray-800 rounded-xl flex items-center justify-center border border-gray-700">
                    <span className="text-gray-500">Video / Full Screen Ad Placeholder</span>
                </div>

                <div className="text-center">
                    <p className="text-gray-400 mb-4">You can continue in...</p>
                    <div className="relative w-20 h-20 mx-auto flex items-center justify-center rounded-full border-4 border-yellow-500 text-2xl font-bold bg-gray-900">
                        {timer}
                    </div>
                </div>

                <Button
                    onClick={onComplete}
                    className="w-full bg-green-600 hover:bg-green-700 text-lg py-6"
                    disabled={timer > 0}
                >
                    {timer > 0 ? "Please Wait..." : "Next Question"}
                </Button>
            </div>
        </div>
    );
}

export default function SurveyRunnerPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();

    const { user, loading: authLoading } = useAuth(); // Assuming useAuth provides loading state, or we check !user
    const taskId = params.taskId as string;
    const sessionId = searchParams.get('sessionId');

    const [task, setTask] = useState<Task | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // Runner State
    const [currentStep, setCurrentStep] = useState(0);
    const [selectedOption, setSelectedOption] = useState<number | null>(null);
    const [pageTimer, setPageTimer] = useState(30);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showInterstitial, setShowInterstitial] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const getErrorMessage = (error: unknown, fallback: string) => {
        return error instanceof Error ? error.message : fallback;
    };

    // 1. Fetch Task & Session Details
    useEffect(() => {
        const init = async () => {
            if (authLoading) return; // Wait for Auth
            if (!user) {
                // Not logged in? Redirect or show error
                router.push('/auth/login');
                return;
            }

            if (!taskId) {
                setError("Invalid Link. Missing Task ID.");
                setLoading(false);
                return;
            }

            try {
                const taskData = await fetchTask(taskId);
                if (!taskData) {
                    setError("Task not found.");
                    setLoading(false);
                    return;
                }
                if (String(taskData.type || '').toUpperCase() !== 'SURVEY') {
                    setError("This page is for survey tasks only.");
                    setLoading(false);
                    return;
                }

                setTask(taskData as unknown as Task);
                setCurrentStep(0);

            } catch (error: unknown) {
                setError("Failed to load task data: " + getErrorMessage(error, 'Unknown error'));
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [taskId, user, authLoading, router]);

    // 2. Page Timer Logic
    useEffect(() => {
        if (!loading && !showInterstitial && !completed && pageTimer > 0) {
            const interval = setInterval(() => setPageTimer(t => t - 1), 1000);
            return () => clearInterval(interval);
        }
    }, [loading, showInterstitial, completed, pageTimer]);

    // 3. Handlers
    const handleOptionSelect = (index: number) => {
        setActionError(null);
        setSelectedOption(index);
    };

    const handleSubmitAnswer = async () => {
        if (selectedOption === null) return;
        setIsSubmitting(true);
        setActionError(null);

        try {
            const nextAnswers = { ...answers, [currentStep]: selectedOption };
            setAnswers(nextAnswers);

            // Check if last question
            const questions = task?.questions || [];
            if (currentStep >= questions.length - 1) {
                // Finish Flow
                await handleClaimReward(nextAnswers);
            } else {
                // Show Interstitial -> Then Next
                setShowInterstitial(true);
            }

        } catch (error: unknown) {
            console.error(error);
            setActionError(getErrorMessage(error, "Failed to submit answer. Please try again."));
            setIsSubmitting(false); // Only reset if failed
        }
    };

    const handleNextStep = () => {
        setActionError(null);
        setShowInterstitial(false);
        setCurrentStep(prev => prev + 1);
        setPageTimer(30); // Reset Timer
        setSelectedOption(null);
        setIsSubmitting(false);
        window.scrollTo(0, 0);
    };

    const handleClaimReward = async (payloadAnswers: Record<number, number> = answers) => {
        try {
            await completeTask(taskId, {
                sessionId: sessionId || null,
                answers: payloadAnswers,
            });
            setCompleted(true);
        } catch (error: unknown) {
            console.error(error);
            setActionError("Failed to claim reward: " + getErrorMessage(error, 'Unknown error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin" /></div>;
    if (error) return <div className="p-8 text-center text-red-500 font-bold">{error}</div>;
    if (completed) {
        return (
            <div className="h-screen flex flex-col items-center justify-center bg-green-50 space-y-4">
                <CheckCircle className="text-green-600 w-16 h-16" />
                <h1 className="text-2xl font-bold text-gray-900">Survey Completed!</h1>
                <p className="text-gray-600">Your reward has been added to your wallet.</p>
                <Button onClick={() => router.push('/dashboard/user/tasks')} className="mt-4">Back to Tasks</Button>
            </div>
        );
    }

    // Current Question
    const questions = task?.questions || [];
    const question = questions[currentStep];

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {showInterstitial && <InterstitialAd onComplete={handleNextStep} />}

            {/* TOP AD */}
            <div className="bg-white p-4 shadow-sm z-10 sticky top-0">
                <div className="max-w-2xl mx-auto flex justify-between items-center mb-4">
                    <span className="font-bold text-gray-500 text-sm">Question {currentStep + 1} of {questions.length}</span>
                    <div className={`px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2 ${pageTimer > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                        <Clock size={16} />
                        {pageTimer > 0 ? `${pageTimer}s Wait` : 'Time OK'}
                    </div>
                </div>
                <div className="max-w-2xl mx-auto">
                    <AdPlaceholder position="Top Banner" className="h-32" />
                </div>
            </div>

            {/* CONTENT */}
            <main className="flex-1 max-w-2xl w-full mx-auto p-6">
                {actionError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {actionError}
                    </div>
                )}
                <div className="bg-white rounded-xl shadow-lg p-8 relative overflow-hidden">
                    {/* Visual Timer Progress Bar */}
                    {pageTimer > 0 && (
                        <div className="absolute top-0 left-0 h-1 bg-orange-500 transition-all duration-1000 ease-linear"
                            style={{ width: `${(pageTimer / 30) * 100}%` }}
                        />
                    )}

                    <h2 className="text-xl font-bold text-gray-900 mb-8 leading-relaxed">{question?.text || "Loading Question..."}</h2>

                    <div className="space-y-4">
                        {question?.options?.map((opt: string, idx: number) => (
                            <button
                                key={idx}
                                onClick={() => handleOptionSelect(idx)}
                                disabled={pageTimer > 0} // Optional: Can user select while waiting? The prompt says "free to read... and select". OK.
                                className={`w-full text-left p-4 rounded-lg border-2 transition-all ${selectedOption === idx
                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedOption === idx ? 'border-indigo-600' : 'border-gray-300'}`}>
                                        {selectedOption === idx && <div className="w-3 h-3 bg-indigo-600 rounded-full" />}
                                    </div>
                                    <span>{opt}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </main>

            {/* BOTTOM AD & SUBMIT */}
            <div className="bg-white p-4 border-t border-gray-100 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                <div className="max-w-2xl mx-auto space-y-4">
                    <AdPlaceholder position="Bottom Banner" className="h-32" />

                    <Button
                        onClick={handleSubmitAnswer}
                        className="w-full h-14 text-lg font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={pageTimer > 0 || selectedOption === null || isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="animate-spin mr-2" /> Processing...
                            </>
                        ) : (
                            <>
                                {pageTimer > 0 ? (
                                    <span>Please Wait {pageTimer}s...</span>
                                ) : (
                                    currentStep < questions.length - 1 ? "Submit & Continue" : "Submit & Finish"
                                )}
                            </>
                        )}
                    </Button>

                    {pageTimer > 0 && (
                        <p className="text-center text-xs text-gray-400">
                            Please view the ads for {pageTimer} more seconds to continue.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
