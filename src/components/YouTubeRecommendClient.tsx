'use client';

import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import { useEffect, useState, memo, useRef } from 'react';
import { saveYoutubeVideo, getGeminiModels, getGeminiPrompts, addYoutubeTab, deleteYoutubeTab, updateYoutubeTabOrder, addToQueue, sendBatchEmailAction, deleteYoutubeVideo } from '@/lib/db';
import { cn, getLongPressHandlers } from '@/lib/utils';
import { showToast } from '@/components/Toast';
import TabManagementModal from '@/components/TabManagementModal';
import GeminiSettingsModal from '@/components/GeminiSettingsModal';
import ViewModeToggle from '@/components/ViewModeToggle';
import YoutubeGrid from '@/components/YoutubeGrid';
import QueueStatus from '@/components/QueueStatus';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface RecommendedVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  url: string;
  publishedTime: string;
  viewCount: string;
  duration: string;
}

export default function YouTubeRecommendClient({
  session,
  initialTabs,
  initialSavedVideos = []
}: {
  session: any;
  initialTabs: any[];
  initialSavedVideos?: any[];
}) {
  const [videos, setVideos] = useState<RecommendedVideo[]>([]);
  const [nextContinuation, setNextContinuation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set(initialSavedVideos.map(v => v.url)));
  const [savedVideos, setSavedVideos] = useState<any[]>(initialSavedVideos);
  const [viewMode, setViewMode] = useState<'my' | 'recommend'>('recommend');

  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isProcessing = isEmailing || isDeleting;

  const router = useRouter();

  const [tabs, setTabs] = useState<any[]>(initialTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [gridCols, setGridCols] = useState<1 | 2>(2);

  // Tab Management
  const [showTabManager, setShowTabManager] = useState(false);
  const [newTabName, setNewTabName] = useState('');
  const [newTabUrl, setNewTabUrl] = useState('');
  const [isAddingTab, setIsAddingTab] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGeminiModalOpen, setIsGeminiModalOpen] = useState(false);

  useEffect(() => {
    const savedTab = localStorage.getItem('youtube_recommend_tab_v2');
    if (savedTab && tabs.some(t => t.id === savedTab)) {
      setActiveTabId(savedTab);
    } else if (tabs.length > 0) {
      setActiveTabId(tabs[0].id);
    }

    const savedCols = localStorage.getItem('youtube_grid_cols');
    if (savedCols === '1' || savedCols === '2') {
      setGridCols(parseInt(savedCols) as 1 | 2);
    }

    const savedViewMode = localStorage.getItem('youtube_view_mode');
    if (savedViewMode === 'my' || savedViewMode === 'recommend') {
      setViewMode(savedViewMode);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('youtube_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (activeTabId) {
      localStorage.setItem('youtube_recommend_tab_v2', activeTabId);
    }
  }, [activeTabId]);

  useEffect(() => {
    localStorage.setItem('youtube_grid_cols', gridCols.toString());
  }, [gridCols]);

  const fetchVideos = async (continuationToken?: string | null) => {
    if (!activeTabId) {
      setVideos([]);
      setIsLoading(false);
      setHasMore(false);
      return;
    }

    if (continuationToken) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setNextContinuation(null);
    }

    try {
      let fetchUrl = '/api/youtube/recommend';
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        fetchUrl += `?url=${encodeURIComponent(activeTab.url)}`;
        if (continuationToken) {
          fetchUrl += `&continuation=${encodeURIComponent(continuationToken)}`;
        }
      } else {
        setVideos([]);
        setIsLoading(false);
        setHasMore(false);
        return;
      }

      const res = await fetch(fetchUrl);
      const data = await res.json();

      const newVideos = data.videos || [];
      if (continuationToken) {
        setVideos(prev => {
          const existingIds = new Set(prev.map(v => v.videoId));
          const uniqueNew = newVideos.filter((v: RecommendedVideo) => !existingIds.has(v.videoId));
          return [...prev, ...uniqueNew];
        });
      } else {
        setVideos(newVideos);
      }

      setNextContinuation(data.nextContinuation || null);
      setHasMore(!!data.nextContinuation);
    } catch (err) {
      console.error(err);
      if (!continuationToken) {
        setVideos([]);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (activeTabId) {
        fetchVideos();
    }
  }, [activeTabId, tabs]);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!loadMoreRef.current || isLoading || isLoadingMore || !hasMore || !nextContinuation || viewMode !== 'recommend') return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !isLoadingMore && nextContinuation) {
        fetchVideos(nextContinuation);
      }
    }, { threshold: 0.1 });

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadMoreRef.current, isLoading, isLoadingMore, hasMore, nextContinuation, viewMode]);

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
        showToast('URL이 복사되었습니다.');
    }).catch(err => {
      console.error('Copy failed:', err);
      showToast('URL 복사에 실패했습니다.', 'error');
    });
  };

  const handleAddVideo = async (e: React.MouseEvent, video: RecommendedVideo) => {
    e.preventDefault();
    e.stopPropagation();

    if (!session) {
      showToast('로그인이 필요한 서비스입니다.', 'info');
      return;
    }

    setAddingId(video.videoId);
    try {
      const models = await getGeminiModels();
      const prompts = await getGeminiPrompts();
      const selectedModel = models.find(m => m.youtube_default)?.name || models[0]?.name || "gemini-1.5-flash";
      const selectedPrompt = prompts.find(p => p.youtube_default)?.content || prompts[0]?.content;

      const result = await saveYoutubeVideo({
        title: video.title,
        url: video.url,
        thumbnail: video.thumbnail,
        duration: video.duration,
        published_at: new Date().toISOString().split('T')[0],
        summary: '',
        description: '',
      });

      if (result.success && result.id) {
        await addToQueue('youtube', result.id, {
          url: video.url,
          model: selectedModel,
          prompt: selectedPrompt
        });
        setSavedUrls(prev => new Set([...Array.from(prev), video.url]));
        showToast('내 서재에 추가되었습니다. 요약은 잠시 후 완료됩니다.');
      } else {
        showToast(`추가 실패: ${result.error}`, 'error');
      }
    } catch (error) {
      console.error(error);
      showToast('유튜브 영상 추가에 실패했습니다.', 'error');
    } finally {
      setAddingId(null);
    }
  };

  const handleAddTab = async () => {
    if (!newTabName || !newTabUrl) return;
    setIsAddingTab(true);
    const res = await addYoutubeTab(newTabName, newTabUrl);
    if (res.success && res.id) {
      const newTab = { id: res.id, name: newTabName, url: newTabUrl, position: tabs.length };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(res.id);
      setNewTabName('');
      setNewTabUrl('');
      setShowTabManager(false);
      showToast('탭이 추가되었습니다.');
    } else {
      showToast(res.error || '탭 추가 실패', 'error');
    }
    setIsAddingTab(false);
  };

  const handleDeleteTab = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('탭을 삭제하시겠습니까?')) return;
    const res = await deleteYoutubeTab(id);
    if (res.success) {
      const remainingTabs = tabs.filter(t => t.id !== id);
      setTabs(remainingTabs);
      if (activeTabId === id) {
          setActiveTabId(remainingTabs.length > 0 ? remainingTabs[0].id : null);
      }
      showToast('탭이 삭제되었습니다.');
    } else {
      showToast(res.error || '삭제 실패', 'error');
    }
  };

  const handleTabLongPress = (id: string) => {
    setIsModalOpen(true);
  };

  const moveTab = (draggedId: string, hoverId: string) => {
    if (draggedId === hoverId) return;
    const draggedIndex = tabs.findIndex(t => t.id === draggedId);
    const hoverIndex = tabs.findIndex(t => t.id === hoverId);
    const newTabs = [...tabs];
    const [draggedTab] = newTabs.splice(draggedIndex, 1);
    newTabs.splice(hoverIndex, 0, draggedTab);
    setTabs(newTabs);
  };

  const saveTabOrder = async () => {
    const orders = tabs.map((tab, index) => ({ id: tab.id, position: index }));
    const res = await updateYoutubeTabOrder(orders);
    if (!res.success) {
      showToast(res.error || '저장 실패', 'error');
    }
  };

  return (
    <div className="font-display min-h-screen pb-24 bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100">
      <Header
        title="유튜브"
        transparent
        rightAction={
          viewMode === 'my' && isEditMode ? (
            <button
              onClick={() => { setIsEditMode(false); setSelectedIds([]); }}
              className="px-3 py-1 bg-primary text-white rounded-full text-xs font-bold mr-2"
            >
              취소
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsGeminiModalOpen(true)}
                className="text-primary p-2"
                title="Gemini 설정"
              >
                <span className="material-symbols-outlined text-2xl">settings_suggest</span>
              </button>
              <button
                onClick={() => {
                  const next = gridCols === 1 ? 2 : 1;
                  setGridCols(next);
                  localStorage.setItem('youtube_grid_cols', next.toString());
                }}
                className="text-primary p-2"
                title={gridCols === 1 ? "2열 보기" : "1열 보기"}
              >
                <span className="material-symbols-outlined text-2xl">
                  {gridCols === 1 ? 'grid_view' : 'view_stream'}
                </span>
              </button>
              <button
                onClick={() => window.location.href = '/add/youtube'}
                className="text-primary p-2"
                title="추가"
              >
                <span className="material-symbols-outlined text-2xl">add_circle</span>
              </button>
            </div>
          )
        }
      >
        <ViewModeToggle
          title="유튜브"
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      </Header>

      <main className="mt-4 px-4">
        {viewMode === 'recommend' ? (
          <>
        {/* Source Tabs */}
        <div className={cn(
          "flex items-center gap-2 mb-6 -mx-4 px-4 sticky top-[64px] bg-background-light dark:bg-background-dark z-10"
        )}>
          <div className={cn(
            "flex flex-1 overflow-x-auto no-scrollbar gap-2 py-2 flex-nowrap"
          )}>
            {tabs.map(tab => {
              const longPressHandlers = getLongPressHandlers(() => handleTabLongPress(tab.id));
              return (
              <div
                key={tab.id}
                className={cn(
                  "relative flex-shrink-0 group transition-all"
                )}
                {...longPressHandlers}
              >
                <button
                  onClick={() => {
                    if (activeTabId === tab.id) {
                      fetchVideos();
                    } else {
                      setActiveTabId(tab.id);
                    }
                  }}
                  className={cn(
                    "px-5 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
                    activeTabId === tab.id ? "bg-primary text-white shadow-md" : "bg-slate-200 dark:bg-black/30 text-slate-500 dark:text-slate-400"
                  )}
                >
                  {tab.name}
                </button>
              </div>
            );})}
          </div>
          <button
            onClick={() => setShowTabManager(!showTabManager)}
            className="flex-shrink-0 size-9 rounded-full bg-slate-200 dark:bg-black/30 text-slate-500 dark:text-slate-400 flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-xl">{showTabManager ? 'close' : 'add'}</span>
          </button>
        </div>

        {showTabManager && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-primary/10 space-y-3">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase ml-1">탭 추가</p>
            <input
              type="text"
              value={newTabName}
              onChange={(e) => setNewTabName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
              placeholder="탭 이름 (예: 언더스탠딩)"
              className="w-full rounded-xl border dark:border-primary/20 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
            />
            <input
              type="text"
              value={newTabUrl}
              onChange={(e) => setNewTabUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTab()}
              placeholder="채널 동영상 URL (예: https://m.youtube.com/@.../videos)"
              className="w-full rounded-xl border dark:border-primary/20 bg-white dark:bg-slate-900 p-3 text-sm text-slate-900 dark:text-slate-100"
            />
            <button
              onClick={handleAddTab}
              disabled={isAddingTab || !newTabName || !newTabUrl}
              className="w-full py-3 bg-primary text-white rounded-xl font-bold text-sm disabled:opacity-50"
            >
              {isAddingTab ? '추가 중...' : '탭 추가하기'}
            </button>
          </div>
        )}

        {isLoading ? (
          <div className={cn("grid gap-4", gridCols === 1 ? "grid-cols-1" : "grid-cols-2")}>
            {[...Array(6)].map((_, i) => (
              <SkeletonVideoItem key={i} cols={gridCols} />
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p>추천 영상 정보를 불러올 수 없습니다.</p>
          </div>
        ) : (
          <>
            <div className={cn("grid gap-4", gridCols === 1 ? "grid-cols-1" : "grid-cols-2")}>
              {videos.map((video) => (
                <RecommendVideoItem
                  key={video.videoId}
                  video={video}
                  cols={gridCols}
                  isLoggedIn={!!session}
                  addingId={addingId}
                  isSaved={savedUrls.has(video.url)}
                  onCopyUrl={handleCopyUrl}
                  onAdd={handleAddVideo}
                />
              ))}
            </div>

            {/* Infinite Scroll Sentinel & Spinner */}
            <div ref={loadMoreRef} className="py-6 flex justify-center items-center">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                  <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>이전 영상 더 불러오는 중...</span>
                </div>
              )}
            </div>
          </>
        )}
        </>
        ) : (
          <div className="space-y-6 pb-20">
            <QueueStatus type="youtube" />
            {!session?.user ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl text-primary">lock</span>
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">로그인이 필요합니다</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-8 px-8">유튜브 기록을 보려면 먼저 로그인해 주세요.</p>
                <Link
                  href="/login"
                  className="px-8 py-3 bg-primary text-white font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 active:scale-95 transition-all"
                >
                  로그인하기
                </Link>
              </div>
            ) : savedVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-600">
                <span className="material-symbols-outlined text-6xl mb-4">video_library</span>
                <p>아직 저장된 영상이 없습니다.</p>
                <p className="text-sm">새로운 영상을 추가해 보세요!</p>
              </div>
            ) : (
              <YoutubeGrid
                videos={savedVideos}
                viewMode={gridCols.toString() as '1' | '2'}
                isSelectionMode={isEditMode}
                selectedIds={selectedIds}
                onToggleSelection={(id) => {
                  setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
                }}
                onLongPress={(id) => {
                  if (!isEditMode) {
                    setIsEditMode(true);
                    setSelectedIds([id]);
                  }
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* Selection Mode Action Bar for My Videos */}
      {isEditMode && viewMode === 'my' && (
        <div className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-0 right-0 p-3.5 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-t border-primary/10 z-40 shadow-lg animate-in slide-in-from-bottom duration-300">
          <div className="max-w-lg mx-auto flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100 min-w-0">
              <span className="text-primary">{selectedIds.length}</span>개 선택됨
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (selectedIds.length === 0) return;
                  setIsEmailing(true);
                  try {
                    const email = localStorage.getItem('last_blog_email') || 'seokmin.kwon@samsung.com';
                    const items = selectedIds.map(id => ({ type: 'youtube' as const, id }));
                    const res = await sendBatchEmailAction(items, email);
                    if (res.success) {
                      showToast(`${selectedIds.length}개의 영상이 메일로 발송되었습니다.`);
                      setIsEditMode(false);
                      setSelectedIds([]);
                    } else {
                      showToast(res.error || '발송 실패', 'error');
                    }
                  } catch (e: any) {
                    showToast('발송 중 오류가 발생했습니다.', 'error');
                  } finally {
                    setIsEmailing(false);
                  }
                }}
                disabled={selectedIds.length === 0 || isProcessing}
                className="px-4 py-2.5 bg-amber-500 text-white font-bold rounded-xl shadow-lg shadow-amber-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
              >
                {isEmailing ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">mail</span>
                    메일
                  </>
                )}
              </button>
              <button
                onClick={async () => {
                  if (selectedIds.length === 0) return;
                  if (!confirm(`${selectedIds.length}개의 영상을 삭제하시겠습니까?`)) return;
                  setIsDeleting(true);
                  try {
                    for (const id of selectedIds) {
                      await deleteYoutubeVideo(id);
                    }
                    setSavedVideos(prev => prev.filter(v => !selectedIds.includes(v.id)));
                    showToast('삭제되었습니다.');
                    setIsEditMode(false);
                    setSelectedIds([]);
                    router.refresh();
                  } catch (e) {
                    showToast('삭제 실패', 'error');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                disabled={selectedIds.length === 0 || isProcessing}
                className="px-4 py-2.5 bg-red-500 text-white font-bold rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5 text-xs"
              >
                {isDeleting ? (
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">delete</span>
                    삭제
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav activeTab="youtube" />

      <GeminiSettingsModal
        isOpen={isGeminiModalOpen}
        onClose={() => setIsGeminiModalOpen(false)}
        category="youtube"
      />

      <TabManagementModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tabs={tabs}
        onReorder={moveTab}
        onDelete={handleDeleteTab}
        onSave={saveTabOrder}
        title="유튜브 탭 관리"
      />
    </div>
  );
}

export const SkeletonVideoItem = memo(({ cols }: { cols: 1 | 2 }) => (
  <div className={cn(
    "bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl shadow-sm p-3",
    cols === 1 ? "flex items-center gap-3" : ""
  )}>
    <div className={cn(
      "aspect-video bg-slate-100 dark:bg-slate-800 rounded-xl animate-skeleton",
      cols === 1 ? "w-36 shrink-0" : "w-full mb-3"
    )} />
    <div className="flex-1 space-y-2">
      <div className={cn(
        "bg-slate-100 dark:bg-slate-800 rounded animate-skeleton",
        cols === 1 ? "h-4 w-3/4" : "h-4 w-5/6"
      )} />
      <div className={cn(
        "bg-slate-100 dark:bg-slate-800 rounded animate-skeleton",
        cols === 1 ? "h-3 w-1/4" : "h-2 w-1/3"
      )} />
    </div>
  </div>
));

const RecommendVideoItem = memo(({ video, cols, isLoggedIn, addingId, isSaved, onCopyUrl, onAdd }: any) => {
  const longPressHandlers = getLongPressHandlers(() => onCopyUrl(video.url));

  return (
    <div
      className="group relative bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-primary/10 rounded-2xl shadow-sm hover:border-primary/20 transition-colors animate-fade-in-up"
      onContextMenu={(e) => e.preventDefault()}
      {...longPressHandlers}
    >
      <a
        href={video.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex rounded-2xl",
          cols === 1 ? "flex-row items-center p-3 gap-3" : "flex-col p-2"
        )}
      >
        <div className={cn(
          "relative aspect-video bg-slate-100 rounded-xl overflow-hidden",
          cols === 1 ? "w-36 shrink-0" : "w-full mb-3"
        )}>
          <div
            className="w-full h-full bg-center bg-no-repeat bg-cover"
            style={{ backgroundImage: `url("${video.thumbnail}")` }}
          />
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 text-white text-[9px] font-bold rounded">
            {video.duration}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start gap-2 mb-1">
            <p className={cn(
              "text-slate-900 dark:text-slate-100 leading-snug",
              cols === 1 ? "text-[13px] line-clamp-3" : "text-[13px] line-clamp-3"
            )}>{video.title}</p>

            {isLoggedIn && (
              <button
                onClick={(e) => {
                    if (isSaved) return;
                    e.preventDefault(); e.stopPropagation(); onAdd(e, video);
                }}
                disabled={addingId === video.videoId || isSaved}
                className={cn(
                  "flex-shrink-0 rounded-lg flex items-center justify-center transition-all disabled:opacity-50",
                  isSaved
                    ? "bg-slate-100 dark:bg-slate-800 text-slate-400"
                    : "bg-primary/10 text-primary hover:bg-primary hover:text-white active:scale-90",
                  cols === 1 ? "size-8" : "size-7"
                )}
                title={isSaved ? "이미 저장됨" : "내 서재에 추가"}
              >
                {addingId === video.videoId ? (
                  <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className={cn("material-symbols-outlined", cols === 1 ? "text-base" : "text-base")}>
                      {isSaved ? 'task_alt' : 'library_add'}
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className="truncate">{video.viewCount}</span>
            <span>•</span>
            <span className="truncate">{video.publishedTime}</span>
          </div>
        </div>
      </a>
    </div>
  );
});
