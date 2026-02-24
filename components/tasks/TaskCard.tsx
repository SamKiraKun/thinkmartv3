
import { useState, useEffect } from 'react';
import { Task } from '@/types/task';
import { Button } from '@/components/ui/Button';
import { PlayCircle, Clock, Video, Globe, Gift } from 'lucide-react';

function TaskIcon({ type }: { type: string }) {
    switch (type) {
        case 'VIDEO': return <Video className="text-blue-500" />;
        case 'SURVEY': return <Clock className="text-purple-500" />;
        case 'WEBSITE': return <Globe className="text-green-500" />;
        default: return <Gift className="text-yellow-500" />;
    }
}

interface TaskCardProps {
    task: Task;
    onStart: (task: Task) => void;
    disabled: boolean;
    lastCompletedAt?: number; // Timestamp in MS (legacy fallback)
    serverCooldownSeconds?: number; // Server-authoritative cooldown (preferred)
}

export function TaskCard({ task, onStart, disabled, lastCompletedAt, serverCooldownSeconds }: TaskCardProps) {
    const [cooldownLeft, setCooldownLeft] = useState(0);

    useEffect(() => {
        // Prefer server-provided cooldown over client-side calculation
        if (typeof serverCooldownSeconds === 'number' && serverCooldownSeconds > 0) {
            const targetTime = Date.now() + serverCooldownSeconds * 1000;
            const tick = () => {
                const remaining = Math.max(0, targetTime - Date.now());
                setCooldownLeft(remaining);
            };
            tick();
            const timer = setInterval(tick, 1000);
            return () => clearInterval(timer);
        }

        // Legacy fallback: use lastCompletedAt with 2h hardcoded cooldown
        if (!lastCompletedAt) {
            setCooldownLeft(0);
            return;
        }

        const checkCooldown = () => {
            const now = Date.now();
            const cooldownDuration = 2 * 60 * 60 * 1000; // 2 Hours
            const unlockTime = lastCompletedAt + cooldownDuration;
            const remaining = Math.max(0, unlockTime - now);
            setCooldownLeft(remaining);
        };

        checkCooldown();
        const timer = setInterval(checkCooldown, 1000);

        return () => clearInterval(timer);
    }, [lastCompletedAt, serverCooldownSeconds]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const isLocked = cooldownLeft > 0;

    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition p-6 flex flex-col gap-4 ${isLocked ? 'opacity-75' : ''}`}>
            <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl ${isLocked ? 'bg-gray-100' : 'bg-indigo-50'}`}>
                    <TaskIcon type={task.type} />
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${isLocked ? 'bg-gray-200 text-gray-500' : 'bg-yellow-100 text-yellow-700'}`}>
                    {isLocked ? 'Locked' : `+${task.reward} ${task.rewardType || 'COIN'}`}
                </span>
            </div>

            <div>
                <h3 className="font-bold text-gray-900">{task.title}</h3>
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{task.description}</p>
            </div>

            <div className="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                <div className="text-xs text-gray-400 flex items-center gap-1">
                    {isLocked ? (
                        <span className="text-red-500 font-mono font-medium">{formatTime(cooldownLeft)}</span>
                    ) : (
                        <><Clock size={12} /> {task.minDuration || '30'}s</>
                    )}
                </div>

                <Button
                    size="sm"
                    onClick={() => onStart(task)}
                    disabled={disabled || isLocked}
                    className={isLocked ? 'bg-gray-300 hover:bg-gray-300 cursor-not-allowed text-gray-500' : ''}
                >
                    {isLocked ? 'Cooldown' : 'Start'}
                    {!isLocked && <PlayCircle size={14} className="ml-1" />}
                </Button>
            </div>
        </div>
    );
}
