'use client';

import { useState, useEffect } from 'react';
import {
  getGeminiModels,
  getGeminiPrompts,
  getGeminiKeyPreference,
  updateGeminiKeyPreferenceAction,
  setDefaultGeminiModel,
  setDefaultGeminiPrompt
} from '@/lib/db';
import { cn } from '@/lib/utils';
import { showToast } from '@/components/Toast';

interface GeminiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: 'youtube' | 'report' | 'blog';
  onSaved?: () => void;
}

export default function GeminiSettingsModal({
  isOpen,
  onClose,
  category,
  onSaved
}: GeminiSettingsModalProps) {
  const [keyIndex, setKeyIndex] = useState<number>(1);
  const [models, setModels] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [selectedPromptId, setSelectedPromptId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, category]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prefKey, dbModels, dbPrompts] = await Promise.all([
        getGeminiKeyPreference(),
        getGeminiModels(),
        getGeminiPrompts()
      ]);
      setKeyIndex(prefKey);
      setModels(dbModels);
      setPrompts(dbPrompts);

      const defaultModel = dbModels.find(m => {
        if (category === 'report') return m.report_default;
        if (category === 'blog') return m.blog_default;
        return m.youtube_default;
      }) || dbModels[0];

      if (defaultModel) {
        setSelectedModelId(defaultModel.id);
      }

      const defaultPrompt = dbPrompts.find(p => {
        if (category === 'report') return p.report_default;
        if (category === 'blog') return p.blog_default;
        return p.youtube_default;
      }) || dbPrompts[0];

      if (defaultPrompt) {
        setSelectedPromptId(defaultPrompt.id);
      }
    } catch (err) {
      console.error('GeminiSettingsModal load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleApply = async () => {
    setSaving(true);
    try {
      const results = await Promise.all([
        updateGeminiKeyPreferenceAction(keyIndex),
        selectedModelId ? setDefaultGeminiModel(selectedModelId, category) : Promise.resolve({ success: true }),
        selectedPromptId ? setDefaultGeminiPrompt(selectedPromptId, category) : Promise.resolve({ success: true })
      ]);

      const hasError = results.some(r => !r.success);
      if (hasError) {
        showToast('설정 저장 중 일부 오류가 발생했습니다.', 'error');
      } else {
        showToast(`API 키 ${keyIndex}번, 모델 및 프롬프트 설정이 변경되었습니다.`);
        if (onSaved) onSaved();
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      showToast('설정 저장 실패', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-primary/10 space-y-5 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">settings_suggest</span>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Gemini API 키, 모델 & 프롬프트 설정
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-medium">설정을 불러오는 중...</p>
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto pr-1 no-scrollbar flex-1">
            {/* Key Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-primary">key</span>
                Gemini API 키 선택 (1~5번)
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setKeyIndex(idx)}
                    className={cn(
                      "flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all gap-0.5",
                      keyIndex === idx
                        ? "bg-primary text-white border-primary shadow-md font-bold"
                        : "bg-slate-50 dark:bg-black/20 text-slate-600 dark:text-slate-400 border-slate-100 dark:border-primary/5 hover:border-primary/30"
                    )}
                  >
                    <span className="text-xs font-bold">{idx}번</span>
                    <span className="text-[9px] opacity-70">{idx === 1 ? '기본' : '보조'}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Model Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-primary">robot_2</span>
                Gemini 모델 선택
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                {models.map((m) => {
                  const isSelected = selectedModelId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedModelId(m.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-2.5 rounded-xl border text-left text-xs font-bold transition-all",
                        isSelected
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-slate-50 dark:bg-black/20 border-slate-100 dark:border-primary/5 text-slate-700 dark:text-slate-300 hover:border-primary/30"
                      )}
                    >
                      <span>{m.name}</span>
                      {isSelected && (
                        <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Prompt Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                <span className="material-symbols-outlined text-sm text-primary">chat</span>
                Gemini 프롬프트 선택
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 no-scrollbar">
                {prompts.map((p) => {
                  const isSelected = selectedPromptId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPromptId(p.id)}
                      className={cn(
                        "w-full flex flex-col p-2.5 rounded-xl border text-left transition-all gap-1",
                        isSelected
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-slate-50 dark:bg-black/20 border-slate-100 dark:border-primary/5 text-slate-700 dark:text-slate-300 hover:border-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between w-full text-xs font-bold">
                        <span>{p.name}</span>
                        {isSelected && (
                          <span className="material-symbols-outlined text-sm text-primary">check_circle</span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1 font-normal">
                        {p.content}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-xs active:scale-95 transition-all"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={saving || loading}
            className="flex-1 py-3 bg-primary text-white font-bold rounded-xl text-xs shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {saving ? (
              <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span className="material-symbols-outlined text-sm">check</span>
                적용하기
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
