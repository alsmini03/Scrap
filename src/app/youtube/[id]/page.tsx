'use client';

import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import {
  getYoutubeVideoById,
  deleteYoutubeVideo,
  updateYoutubeVideo,
  toggleLikeAction,
  getGeminiModels,
  getGeminiPrompts,
  sendYoutubeEmailAction,
  getAdjacentYoutubeVideoIdsAction,
  getQueueItems,
  retryGeminiTaskAction,
  processYoutubeSummaryImmediatelyAction
} from '@/lib/db';
import { notFound, useRouter, useParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import GeminiSettingsModal from '@/components/GeminiSettingsModal';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { cn } from '@/lib/utils';
import he from 'he';
import { useState, useEffect } from 'react';
import { showToast } from '@/components/Toast';

interface YoutubeVideo {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  duration: string;
  published_at: string;
  summary: string;
  gemini_model?: string;
  description: string;
  added_at: string;
  user_id: string;
  is_liked: boolean;
}

const SkeletonYoutubeDetail = () => (
  <div className="font-display min-h-screen pb-24 bg-background-light dark:bg-background-dark overflow-x-hidden">
    <Header title="유튜브 (저장)" showBack onBack={() => {}} />
    <main className="p-4 space-y-6">
      <div className="flex justify-between items-center bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
        <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-2" />
        <div className="h-8 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
      </div>
      <div className="w-full aspect-video rounded-2xl bg-slate-100 dark:bg-slate-800 animate-skeleton" />
      <div className="space-y-4">
        <div className="h-8 w-3/4 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="flex gap-3">
          <div className="h-4 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
          <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        </div>
        <div className="flex gap-3">
          <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
          <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-6 w-32 bg-slate-100 dark:bg-slate-800 rounded animate-skeleton" />
        <div className="h-64 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl animate-skeleton" />
      </div>
    </main>
    <BottomNav activeTab="library" />
  </div>
);

export default function YoutubeDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const [video, setVideo] = useState<YoutubeVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('seokmin.kwon@samsung.com');

  // Edit states
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedSummary, setEditedSummary] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  // Navigation states
  const [adjacentIds, setAdjacentIds] = useState<{ prevId?: string; prevTitle?: string; nextId?: string; nextTitle?: string }>({});

  // Queue states
  const [queueItems, setQueueItems] = useState<any[]>([]);
  const [lastProcessedAt, setLastProcessedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const lastEmail = localStorage.getItem('last_blog_email');
    if (lastEmail) setRecipientEmail(lastEmail);
  }, []);

  useEffect(() => {
    async function loadVideo() {
      if (!id) return;
      setLoading(true);
      const [data, adj, q] = await Promise.all([
        getYoutubeVideoById(id),
        getAdjacentYoutubeVideoIdsAction(id),
        getQueueItems()
      ]);

      if (data) {
        // Decode entities for all fields to ensure consistent display and editing
        const decodedData = {
          ...data,
          title: he.decode(data.title || ''),
          summary: he.decode(data.summary || ''),
          description: he.decode(data.description || '')
        };
        setVideo(decodedData);
        setEditedTitle(decodedData.title);
        setEditedSummary(decodedData.summary);
        setEditedDescription(decodedData.description);
        setAdjacentIds(adj);
        setQueueItems(q.items);
        setLastProcessedAt(q.lastProcessedAt);
      }
      setLoading(false);
    }
    loadVideo();

    const qTimer = setInterval(async () => {
        const q = await getQueueItems();
        setQueueItems(q.items);
        setLastProcessedAt(q.lastProcessedAt);
    }, 10000);

    return () => clearInterval(qTimer);
  }, [id]);

  useEffect(() => {
    const updateCountdown = () => {
        if (!lastProcessedAt) {
            setTimeLeft(0);
            return;
        }
        const nextAllowed = new Date(lastProcessedAt).getTime() + 60000;
        const now = Date.now();
        const diff = Math.max(0, Math.ceil((nextAllowed - now) / 1000));
        setTimeLeft(diff);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [lastProcessedAt]);

  if (loading) return <SkeletonYoutubeDetail />;

  if (!video) {
    notFound();
  }

  const handleDelete = async () => {
    if (!confirm('정말로 이 기록을 삭제하시겠습니까?')) return;

    setIsDeleting(true);
    try {
      const result = await deleteYoutubeVideo(video.id);
      if (result.success) {
        showToast('삭제되었습니다.');
        router.push('/?mode=youtube');
      } else {
        showToast(`삭제 실패: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Delete error:', error);
      showToast('삭제 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(video?.url || '').then(() => {
        showToast('URL이 복사되었습니다.');
    });
  };

  const handleToggleLike = async () => {
    if (!video || isLiking) return;
    setIsLiking(true);
    const newLiked = !video.is_liked;
    try {
      const res = await toggleLikeAction('youtube', video.id, newLiked);
      if (res.success) {
        setVideo({ ...video, is_liked: newLiked });
        showToast(newLiked ? '좋아요 항목에 추가되었습니다.' : '좋아요가 취소되었습니다.');
      } else {
        showToast(res.error || '실패했습니다.', 'error');
      }
    } catch (err) {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleEditToggle = () => {
    if (isEditingMode) {
      // Cancel editing, reset to current video data
      setEditedTitle(video?.title || '');
      setEditedSummary(video?.summary || '');
      setEditedDescription(video?.description || '');
      setIsEditingMode(false);
    } else {
      // Entering edit mode: sync edited fields with current video state
      setEditedTitle(video?.title || '');
      setEditedSummary(video?.summary || '');
      setEditedDescription(video?.description || '');
      setIsEditingMode(true);
    }
  };

  const handleSave = async () => {
    if (!video) return;
    setIsSaving(true);
    try {
      const result = await updateYoutubeVideo(video.id, {
        title: editedTitle,
        thumbnail: video.thumbnail,
        duration: video.duration,
        published_at: video.published_at,
        summary: editedSummary,
        description: editedDescription,
      });

      if (result.success) {
        setVideo({
          ...video,
          title: editedTitle,
          summary: editedSummary,
          description: editedDescription,
        });
        setIsEditingMode(false);
        showToast('수정되었습니다.');
      } else {
        showToast(`수정 실패: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error('Save error:', error);
      showToast('저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendEmail = async () => {
    const email = localStorage.getItem('last_blog_email') || 'seokmin.kwon@samsung.com';
    setIsSending(true);
    try {
      const res = await sendYoutubeEmailAction(video!.id, email);
      if (res.success) {
        showToast('메일이 발송되었습니다.');
      } else {
        showToast(res.error || '발송 실패', 'error');
      }
    } catch (err) {
      showToast('이메일 발송에 실패했습니다.', 'error');
    } finally {
      setIsSending(false);
    }
  };

  const handleRetrySummary = async () => {
      if (!video) return;
      setIsRefetching(true);
      try {
          const res = await processYoutubeSummaryImmediatelyAction(video.id);
          if (res.success) {
              const updatedVideo = await getYoutubeVideoById(video.id);
              if (updatedVideo) {
                setVideo({
                    ...updatedVideo,
                    title: he.decode(updatedVideo.title || ''),
                    summary: he.decode(updatedVideo.summary || ''),
                    description: he.decode(updatedVideo.description || '')
                });
              }
              const q = await getQueueItems();
              setQueueItems(q.items);
              showToast('AI 요약이 완료되었습니다.');
          } else {
              showToast(res.error || '실패', 'error');
          }
      } finally {
          setIsRefetching(false);
      }
  };

  const handleRefetch = async () => {
    if (!video) return;
    setIsRefetching(true);
    try {
      // Refresh metadata only (includeAi: false)
      const response = await fetch('/api/youtube/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: video.url,
          includeAi: false
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to extract video info');

      // Update basic metadata, preserving existing summary/model
      const updateResult = await updateYoutubeVideo(video.id, {
        title: data.title || video.title,
        thumbnail: data.thumbnail || video.thumbnail,
        duration: data.duration || video.duration,
        published_at: data.publishDate || video.published_at,
        summary: video.summary,
        gemini_model: video.gemini_model,
        description: data.description || video.description,
      });

      if (updateResult.success) {
        setVideo({
          ...video,
          title: data.title || video.title,
          thumbnail: data.thumbnail || video.thumbnail,
          duration: data.duration || video.duration,
          published_at: data.publishDate || video.published_at,
          description: data.description || video.description,
        });

        // Also trigger immediate AI summary update
        const aiRes = await processYoutubeSummaryImmediatelyAction(video.id);
        if (aiRes.success) {
            const updatedVideo = await getYoutubeVideoById(video.id);
            if (updatedVideo) {
              setVideo({
                  ...updatedVideo,
                  title: he.decode(updatedVideo.title || ''),
                  summary: he.decode(updatedVideo.summary || ''),
                  description: he.decode(updatedVideo.description || '')
              });
            }
        }

        const q = await getQueueItems();
        setQueueItems(q.items);

        showToast('기본 정보와 AI 요약이 업데이트되었습니다.');
      } else {
        showToast(`업데이트 실패: ${updateResult.error}`, 'error');
      }
    } catch (error) {
      console.error('Refetch error:', error);
      showToast(`다시 가져오기 실패: ${error instanceof Error ? error.message : '오류가 발생했습니다.'}`, 'error');
    } finally {
      setIsRefetching(false);
    }
  };

  return (
    <div className="font-display min-h-screen pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 overflow-x-hidden">
      <Header
        onBack={() => router.push('/saved?filter=youtube')}
        showBack
        rightAction={
          <div className="flex items-center gap-1">
            {isEditingMode ? (
              <>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="text-primary font-bold px-3 py-1 rounded-full hover:bg-primary/5 transition-colors flex items-center gap-1"
                >
                  <span className={cn("material-symbols-outlined text-xl", isSaving && "animate-spin")}>
                    {isSaving ? "sync" : "save"}
                  </span>
                  저장
                </button>
                <button
                  onClick={handleEditToggle}
                  disabled={isSaving}
                  className="text-slate-500 font-bold px-3 py-1 rounded-full hover:bg-slate-100 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleEditToggle}
                  disabled={isRefetching || isDeleting}
                  className="text-primary hover:bg-primary/5 p-2 rounded-full transition-colors disabled:opacity-50"
                  title="내용 수정"
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  onClick={handleRefetch}
                  disabled={isRefetching || isDeleting}
                  className="text-primary hover:bg-primary/5 p-2 rounded-full transition-colors disabled:opacity-50"
                  title="다시 가져오기"
                >
                  <span className={cn("material-symbols-outlined", isRefetching && "animate-spin")}>sync</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isDeleting || isRefetching}
                  className="text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors disabled:opacity-50"
                  title="기록 삭제"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
              </>
            )}
          </div>
        }
      >
        <div className="flex items-center justify-center gap-1.5 min-w-0">
          <h1 className="text-xl font-bold leading-tight tracking-tight text-center truncate text-slate-900 dark:text-slate-100">
            유튜브 (저장)
          </h1>
          <button
            onClick={() => setIsGeminiModalOpen(true)}
            className="p-1 rounded-full text-primary hover:bg-primary/10 transition-colors shrink-0"
            title="Gemini 설정"
          >
            <span className="material-symbols-outlined text-xl">settings_suggest</span>
          </button>
        </div>
      </Header>

      <main className="p-4 space-y-6">
        {/* Navigation Bar */}
        {!isEditingMode && (
          <div className="flex justify-between items-center gap-2 bg-white dark:bg-slate-900/50 rounded-xl p-2 border border-slate-100 dark:border-primary/10 shadow-sm">
            <button
              onClick={() => adjacentIds.prevId && router.push(`/youtube/${adjacentIds.prevId}`)}
              disabled={!adjacentIds.prevId}
              className="flex-1 flex items-center gap-1 min-w-0 px-2 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:grayscale transition-all active:scale-95 text-left"
              title={adjacentIds.prevTitle}
            >
              <span className="material-symbols-outlined text-lg flex-shrink-0">chevron_left</span>
              <span className="flex-shrink-0">이전</span>
              {adjacentIds.prevTitle && (
                <span className="truncate text-xs font-normal text-slate-400 dark:text-slate-500 min-w-0">
                  : {adjacentIds.prevTitle}
                </span>
              )}
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
            <button
              onClick={() => adjacentIds.nextId && router.push(`/youtube/${adjacentIds.nextId}`)}
              disabled={!adjacentIds.nextId}
              className="flex-1 flex items-center justify-end gap-1 min-w-0 px-2 py-1.5 text-sm font-bold text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:grayscale transition-all active:scale-95 text-right"
              title={adjacentIds.nextTitle}
            >
              {adjacentIds.nextTitle && (
                <span className="truncate text-xs font-normal text-slate-400 dark:text-slate-500 min-w-0">
                  {adjacentIds.nextTitle} :
                </span>
              )}
              <span className="flex-shrink-0">다음</span>
              <span className="material-symbols-outlined text-lg flex-shrink-0">chevron_right</span>
            </button>
          </div>
        )}

        <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-lg border border-slate-100 dark:border-primary/10">
           {/* eslint-disable-next-line @next/next/no-img-element */}
           <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover" />
        </div>

        <div className="space-y-2">
          {isEditingMode ? (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase ml-1">제목</label>
              <textarea
                value={editedTitle}
                onChange={(e) => setEditedTitle(e.target.value)}
                className="w-full text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none resize-none min-h-[100px]"
                placeholder="제목을 입력하세요"
              />
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 leading-tight flex-1">{video.title}</h1>
              <button
                onClick={handleToggleLike}
                disabled={isLiking}
                className={cn(
                  "flex-shrink-0 p-1.5 transition-all active:scale-125 disabled:opacity-50",
                  video.is_liked ? "text-red-500" : "text-slate-300 dark:text-slate-700"
                )}
              >
                <span className={cn("material-symbols-outlined text-3xl", video.is_liked && "fill-1")}>favorite</span>
              </button>
            </div>
          )}
          <div className="flex gap-3 text-sm text-slate-500 dark:text-slate-400 font-medium">
             <span>{video.duration}</span>
             <span>•</span>
             <span>{video.published_at}</span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <a
              href={video.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary text-sm font-bold"
            >
              <span className="material-symbols-outlined text-sm">link</span>
              유튜브에서 보기
            </a>
            <button
              onClick={handleCopyUrl}
              className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-primary text-sm font-bold transition-colors"
            >
              <span className="material-symbols-outlined text-sm">content_copy</span>
              URL 복사
            </button>
            <button
              onClick={handleSendEmail}
              disabled={isSending}
              className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-primary text-sm font-bold transition-colors disabled:opacity-50"
            >
              {isSending ? (
                  <div className="size-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                  <>
                  <span className="material-symbols-outlined text-sm">mail</span>
                  메일 송부
                  </>
              )}
            </button>
          </div>
        </div>

        <section className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                   <span className="material-symbols-outlined text-primary">auto_awesome</span>
                   AI 요약 분석
                </h2>
                <div className="flex items-center gap-2">
                    {video.summary && video.gemini_model && (
                        <span className="text-[10px] font-black px-2 py-0.5 bg-primary/10 text-primary rounded-md uppercase tracking-tighter">
                            {video.gemini_model}
                        </span>
                    )}
                </div>
            </div>

            {/* AI Status Section */}
            {(() => {
                const currentQueueItem = queueItems.find(i => i.target_id === video.id && i.type === 'youtube');
                if (!currentQueueItem && video.summary) return null;

                if (currentQueueItem) {
                    if (currentQueueItem.status === 'processing') {
                        return (
                            <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3 animate-pulse">
                                <span className="material-symbols-outlined text-primary text-4xl animate-spin">sync</span>
                                <div>
                                    <p className="text-sm font-bold text-primary">AI가 내용을 분석하고 있습니다...</p>
                                    <p className="text-[11px] text-slate-400 mt-1">잠시만 기다려 주세요.</p>
                                </div>
                            </div>
                        );
                    }
                    if (currentQueueItem.status === 'pending') {
                        return (
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3">
                                <div className="relative">
                                    <span className="material-symbols-outlined text-slate-300 dark:text-slate-700 text-4xl">hourglass_empty</span>
                                    {timeLeft > 0 && (
                                        <div className="absolute -top-1 -right-1 size-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-sm">
                                            {timeLeft}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">분석 대기 중입니다</p>
                                    <p className="text-[11px] text-slate-400 mt-1">
                                        {timeLeft > 0 ? `${timeLeft}초 후 분석이 시작됩니다.` : '곧 분석이 시작됩니다.'}
                                    </p>
                                </div>
                            </div>
                        );
                    }
                    if (currentQueueItem.status === 'failed') {
                        return (
                            <div className="bg-red-50 dark:bg-red-500/5 border border-red-100 dark:border-red-900/20 rounded-2xl p-6">
                                <div className="flex items-center gap-2 text-red-500 mb-3">
                                    <span className="material-symbols-outlined text-sm">error</span>
                                    <p className="text-xs font-bold">분석 중 오류가 발생했습니다</p>
                                </div>
                                <div className="bg-white/50 dark:bg-black/20 rounded-lg p-3 mb-4 relative group">
                                    <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed break-words whitespace-pre-wrap pr-10">
                                        {currentQueueItem.error_message || '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'}
                                    </p>
                                    {currentQueueItem.error_message && (
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(currentQueueItem.error_message).then(() => {
                                                    showToast('오류 메시지가 복사되었습니다.');
                                                });
                                            }}
                                            className="absolute top-2 right-2 p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-primary rounded-lg transition-colors"
                                            title="오류 메시지 복사"
                                        >
                                            <span className="material-symbols-outlined text-sm">content_copy</span>
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={handleRetrySummary}
                                    disabled={isRefetching}
                                    className="w-full py-2.5 bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    다시 가져오기
                                </button>
                            </div>
                        );
                    }
                }

                // If no summary and no queue item
                if (!video.summary) {
                    return (
                        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-4">
                            <div className="size-16 bg-primary/5 rounded-full flex items-center justify-center">
                                <span className="material-symbols-outlined text-primary text-3xl">auto_awesome</span>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-600 dark:text-slate-300">아직 요약된 내용이 없습니다</p>
                                <p className="text-[11px] text-slate-400 mt-1">AI를 사용하여 영상의 핵심 내용을 분석해 보세요.</p>
                            </div>
                            <button
                                onClick={handleRetrySummary}
                                disabled={isRefetching}
                                className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                <span className={cn("material-symbols-outlined text-sm", isRefetching && "animate-spin")}>sync</span>
                                AI 요약 시작하기
                            </button>
                        </div>
                    );
                }

                return null;
            })()}

            {isEditingMode ? (
              <textarea
                value={editedSummary}
                onChange={(e) => setEditedSummary(e.target.value)}
                className="w-full min-h-[300px] bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none resize-y text-sm leading-relaxed"
                placeholder="AI 요약 내용을 수정하세요 (마크다운 지원)"
              />
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-100 dark:border-primary/10 prose dark:prose-invert prose-slate prose-sm max-w-none shadow-inner break-words overflow-x-hidden">
                 <ReactMarkdown
                   remarkPlugins={[remarkGfm, remarkBreaks]}
                   rehypePlugins={[rehypeRaw]}
                 >
                 {video.summary || ''}
                 </ReactMarkdown>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
               <span className="material-symbols-outlined text-slate-400">description</span>
               상세 설명
            </h2>
            {isEditingMode ? (
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="w-full min-h-[200px] bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-primary/20 focus:ring-2 focus:ring-primary/20 outline-none resize-y text-sm leading-relaxed"
                placeholder="상세 설명을 수정하세요"
              />
            ) : (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-100 dark:border-primary/10 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner break-words overflow-hidden">
                 {video.description || "설명이 없습니다."}
              </div>
            )}
          </div>
        </section>
      </main>

      <BottomNav activeTab="library" />

      <GeminiSettingsModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        category="youtube"
      />
    </div>
  );
}
