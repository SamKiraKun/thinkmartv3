// File: ThinkMart/app/dashboard/admin/tasks/create/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createAdminTask } from '@/services/adminService';
import { Plus, Trash2, Save, Loader2, CheckSquare, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface Question {
  id: string;
  text: string;
  options: string[];
  type: 'multiple-choice' | 'checkbox'; // Future proofing
}

export default function CreateSurveyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [title, setTitle] = useState('');
  const [reward, setReward] = useState(2000);
  const [questions, setQuestions] = useState<Question[]>([
    { id: '1', text: '', options: ['', ''], type: 'multiple-choice' }
  ]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { id: Date.now().toString(), text: '', options: ['', ''], type: 'multiple-choice' }
    ]);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const updateQuestionText = (index: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[index].text = text;
    setQuestions(newQuestions);
  };

  const addOption = (qIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options.push('');
    setQuestions(newQuestions);
  };

  const updateOption = (qIndex: number, oIndex: number, text: string) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options[oIndex] = text;
    setQuestions(newQuestions);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    const newQuestions = [...questions];
    newQuestions[qIndex].options = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
    setQuestions(newQuestions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNotice(null);

    try {
      // Validate
      if (!title.trim()) throw new Error("Survey title is required");
      if (questions.length === 0) throw new Error("Add at least one question");

      const cleanQuestions = questions.map(q => ({
        text: q.text,
        options: q.options.filter(o => o.trim() !== ''),
        timeLimit: 30 // Hardcoded requirement from user query
      }));

      await createAdminTask({
        title,
        description: `${questions.length} Question Survey`,
        rewardAmount: Number(reward),
        rewardType: 'coins',
        type: 'survey',
        questions: cleanQuestions,
        requestId: `task_survey_${Date.now()}`
      });

      setNotice({ type: 'success', text: 'Survey created successfully. Redirecting...' });
      router.push('/dashboard/admin/tasks');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create survey task';
      setNotice({ type: 'error', text: message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Create New Survey</h1>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
          Publish Survey
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
        {/* Survey Meta */}
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Survey Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
              placeholder="e.g. Daily User Preference Survey"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total Reward (Coins)</label>
            <input
              type="number"
              value={reward}
              onChange={(e) => setReward(Number(e.target.value))}
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-indigo-600 outline-none"
            />
          </div>
        </div>

        {/* Questions Builder */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-xl font-bold text-gray-800">Questions</h2>
            <button
              type="button"
              onClick={addQuestion}
              className="text-sm text-indigo-600 font-bold hover:bg-indigo-50 px-3 py-1 rounded transition flex items-center gap-1"
            >
              <Plus size={16} /> Add Question
            </button>
          </div>

          {questions.map((q, qIndex) => (
            <div key={q.id} className="p-4 bg-gray-50 rounded-xl border border-gray-200 relative group">
              <button
                onClick={() => removeQuestion(qIndex)}
                className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                title="Delete Question"
                aria-label={`Delete question ${qIndex + 1}`}
              >
                <Trash2 size={18} />
              </button>

              <div className="mb-4 pr-8">
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Question {qIndex + 1}</label>
                <input
                  type="text"
                  value={q.text}
                  onChange={(e) => updateQuestionText(qIndex, e.target.value)}
                  className="w-full p-2 bg-white border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="Enter question text..."
                />
              </div>

              <div className="space-y-2 pl-4 border-l-2 border-indigo-200">
                <label className="block text-xs font-bold text-gray-500 uppercase">Options (Checkbox Select)</label>
                {q.options.map((opt, oIndex) => (
                  <div key={oIndex} className="flex items-center gap-2">
                    <CheckSquare size={16} className="text-gray-400" />
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => updateOption(qIndex, oIndex, e.target.value)}
                      className="flex-1 p-2 text-sm bg-white border border-gray-300 rounded focus:border-indigo-500 outline-none"
                      placeholder={`Option ${oIndex + 1}`}
                    />
                    {q.options.length > 2 && (
                      <button
                        onClick={() => removeOption(qIndex, oIndex)}
                        className="text-gray-400 hover:text-red-500"
                        aria-label={`Remove option ${oIndex + 1} from question ${qIndex + 1}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => addOption(qIndex)}
                  className="text-xs text-indigo-600 font-bold hover:underline mt-2 flex items-center gap-1"
                >
                  <Plus size={12} /> Add Option
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
